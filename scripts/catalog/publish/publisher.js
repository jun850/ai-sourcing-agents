#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sha256, validateBuiltManifest } = require('./manifest');

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
}

function apiConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --apply');
  return { url, key };
}

async function request(config, endpoint, options = {}) {
  const response = await fetch(`${config.url}${endpoint}`, {
    ...options,
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${endpoint}: ${response.status} ${body.slice(0, 500)}`);
  if (!body) return null;
  try { return JSON.parse(body); } catch { return body; }
}

function verifyReleaseRevision(manifest) {
  if (!manifest.git_commit_sha) throw new Error('Production apply requires a committed git_commit_sha in the manifest');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== manifest.git_commit_sha) throw new Error(`Manifest commit ${manifest.git_commit_sha} does not match HEAD ${head}`);
  if (process.env.ATELIX_DEPLOYED_GIT_SHA !== manifest.git_commit_sha) {
    throw new Error('ATELIX_DEPLOYED_GIT_SHA must confirm the deployed production revision');
  }
}

function mediaEntries(manifest) {
  return manifest.entities.flatMap((entity) => (entity.payload.media || []).map((media) => ({ entity, media })));
}

function hydratePrivateInputs(manifest, privateSidecar) {
  const privateBySource = new Map((privateSidecar?.entities || []).map((entity) => [entity.source_key, entity]));
  if (privateSidecar && (privateSidecar.version !== 1 || privateSidecar.run_id !== manifest.run_id || privateSidecar.kind !== manifest.kind)) {
    throw new Error('Private sidecar does not match manifest');
  }
  return {
    ...manifest,
    entities: manifest.entities.map((entity) => {
      if (!entity.private_input_sha256) return entity;
      const privateEntity = privateBySource.get(entity.source_key);
      if (!privateEntity) throw new Error(`Missing private sidecar input: ${entity.source_key}`);
      const { source_key, ...privateInput } = privateEntity;
      if (sha256(privateInput) !== entity.private_input_sha256) throw new Error(`Private sidecar hash mismatch: ${source_key}`);
      return { ...entity, payload: { ...entity.payload, ...privateInput } };
    }),
  };
}

function assertSafeStoragePath(storagePath) {
  if (!storagePath || storagePath.startsWith('/') || storagePath.includes('..') || storagePath.includes('\\')) {
    throw new Error(`Unsafe storage path: ${storagePath}`);
  }
}

function sniffImage(buffer) {
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('hex') === '52494646' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (buffer.length >= 12 && ['avif', 'avis'].includes(buffer.subarray(8, 12).toString())) return 'image/avif';
  return null;
}

function verifyLocalMedia(manifest) {
  for (const { media } of mediaEntries(manifest)) {
    assertSafeStoragePath(media.storage_path);
    const localPath = path.resolve(media.local_path || '');
    const buffer = fs.readFileSync(localPath);
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    const detected = sniffImage(buffer);
    if (digest !== media.sha256) throw new Error(`Local image hash mismatch: ${localPath}`);
    if (Number(media.bytes) !== buffer.length) throw new Error(`Local image byte mismatch: ${localPath}`);
    if (!detected || detected !== media.mime_type) throw new Error(`Local image type mismatch: ${localPath}`);
  }
}

async function uploadAndVerifyMedia(config, manifest) {
  for (const { media } of mediaEntries(manifest)) {
    const localPath = path.resolve(media.local_path);
    const buffer = fs.readFileSync(localPath);
    const objectPath = media.storage_path.split('/').map(encodeURIComponent).join('/');
    await request(config, `/storage/v1/object/catalog-media/${objectPath}`, {
      method: 'POST',
      headers: { 'content-type': media.mime_type, 'x-upsert': 'true' },
      body: buffer,
    });
    const expectedUrl = `${config.url}/storage/v1/object/public/catalog-media/${objectPath}`;
    if (media.public_url !== expectedUrl) throw new Error(`Public image URL does not match storage path: ${media.public_url}`);
    const response = await fetch(media.public_url, { cache: 'no-store' });
    const publicBuffer = Buffer.from(await response.arrayBuffer());
    const publicHash = crypto.createHash('sha256').update(publicBuffer).digest('hex');
    if (!response.ok || publicHash !== media.sha256 || sniffImage(publicBuffer) !== media.mime_type) {
      throw new Error(`Public image verification failed: ${media.public_url}`);
    }
    media.upload_verified_at = new Date().toISOString();
  }
}

async function stageBatch(config, manifest) {
  const sources = await request(config, `/rest/v1/catalog_import_sources?slug=eq.${encodeURIComponent(manifest.source)}&select=id,base_url,trusted_for_auto_publish`);
  if (!Array.isArray(sources) || sources.length !== 1 || sources[0].base_url !== manifest.source_base_url || !sources[0].trusted_for_auto_publish) {
    throw new Error('Trusted source registry mismatch');
  }
  const runs = await request(config, `/rest/v1/catalog_import_runs?id=eq.${manifest.run_id}&select=id,source_id,scope,mode,status,metadata`);
  if (!runs.length) {
    await request(config, '/rest/v1/catalog_import_runs', {
      method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ id: manifest.run_id, source_id: sources[0].id, scope: manifest.scope, mode: 'sync', status: 'running',
        metadata: { complete_discovery: manifest.closes_complete_run === true } }),
    });
  } else {
    if (runs.length !== 1 || runs[0].source_id !== sources[0].id || runs[0].scope !== manifest.scope || runs[0].mode !== 'sync') throw new Error('Existing run contract mismatch');
    if (manifest.closes_complete_run && runs[0].status !== 'completed' && runs[0].metadata?.complete_discovery !== true) {
      await request(config, `/rest/v1/catalog_import_runs?id=eq.${manifest.run_id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify({ metadata: { ...(runs[0].metadata || {}), complete_discovery: true } }),
      });
    }
  }
  const storageManifest = mediaEntries(manifest).map(({ media }) => ({ storage_path: media.storage_path, sha256: media.sha256, bytes: media.bytes, public_url: media.public_url }));
  const existing = await request(config, `/rest/v1/catalog_import_batches?idempotency_key=eq.${encodeURIComponent(manifest.idempotency_key)}&select=id,manifest_sha256,status`);
  if (existing.length) {
    if (existing.length !== 1 || existing[0].id !== manifest.batch_id || existing[0].manifest_sha256 !== manifest.manifest_sha256) throw new Error('Idempotency key collision');
    if (['published', 'live_verified'].includes(existing[0].status)) return { sourceId: sources[0].id, status: existing[0].status };
    if (existing[0].status === 'failed') await request(config, `/rest/v1/catalog_import_batches?id=eq.${manifest.batch_id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify({ status: 'staged', error_message: null }),
    });
    else if (existing[0].status !== 'staged') throw new Error(`Existing batch cannot resume from status ${existing[0].status}`);
  }
  await request(config, '/rest/v1/catalog_import_batches?on_conflict=id', {
    method: 'POST', headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: manifest.batch_id, run_id: manifest.run_id, kind: manifest.kind, sequence_no: manifest.sequence_no,
      idempotency_key: manifest.idempotency_key, manifest_sha256: manifest.manifest_sha256, item_count: manifest.entities.length,
      git_commit_sha: manifest.git_commit_sha, storage_manifest: storageManifest, status: 'staged' }),
  });
  const staged = manifest.entities.map((entity) => ({ run_id: manifest.run_id, batch_id: manifest.batch_id, entity_type: manifest.kind,
    source_key: entity.source_key, state: 'publish_ready', payload: entity.payload, input_sha256: entity.input_sha256 }));
  await request(config, '/rest/v1/catalog_staged_entities?on_conflict=run_id,entity_type,source_key', {
    method: 'POST', headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(staged),
  });
  return { sourceId: sources[0].id, status: 'staged' };
}

async function finalizeAndVerify(config, manifest, stagedState) {
  const rpc = manifest.kind === 'supplier' ? 'catalog_finalize_supplier_batch' : 'catalog_finalize_product_batch';
  if (stagedState.status === 'staged') {
    try {
      await request(config, `/rest/v1/rpc/${rpc}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_run_id: manifest.run_id, p_batch_id: manifest.batch_id }),
      });
    } catch (error) {
      await request(config, `/rest/v1/catalog_import_batches?id=eq.${manifest.batch_id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', error_message: String(error.message || error).slice(0, 1000), updated_at: new Date().toISOString() }),
      }).catch(() => {});
      throw error;
    }
  }
  for (const entity of manifest.entities) {
    const identities = await request(config, `/rest/v1/catalog_source_identities?source_id=eq.${stagedState.sourceId}&source_key=eq.${encodeURIComponent(entity.source_key)}&entity_type=eq.${manifest.kind}&select=entity_id`);
    if (!Array.isArray(identities) || identities.length !== 1) throw new Error(`Production identity read-back failed: ${entity.source_key}`);
    const table = manifest.kind === 'supplier' ? 'factories' : 'products';
    const rows = await request(config, `/rest/v1/${table}?id=eq.${identities[0].entity_id}&select=id`);
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Production entity read-back failed: ${entity.source_key}`);
  }
  for (const { media } of mediaEntries(manifest)) {
    const response = await fetch(media.public_url, { cache: 'no-store' });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || crypto.createHash('sha256').update(bytes).digest('hex') !== media.sha256 || !sniffImage(bytes)) {
      throw new Error(`Live media verification failed: ${media.public_url}`);
    }
    await request(config, '/rest/v1/rpc/catalog_mark_media_live_verified', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_storage_path: media.storage_path, p_sha256: media.sha256 }),
    });
  }
  await syncAndVerifySearch(config, manifest);
  await request(config, '/rest/v1/rpc/catalog_mark_batch_live_verified', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_batch_id: manifest.batch_id, p_manifest_sha256: manifest.manifest_sha256 }),
  });
  if (manifest.closes_complete_run) {
    await request(config, '/rest/v1/rpc/catalog_close_complete_run', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_run_id: manifest.run_id }),
    });
  }
}

async function syncAndVerifySearch(config, manifest) {
  const sync = await request(config, '/functions/v1/algolia-sync', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'process_queue', limit: 500 }),
  });
  if (!sync?.ok || Number(sync.failed || 0) > 0) throw new Error(`Algolia queue processing failed: ${JSON.stringify(sync)}`);
  const publicConfig = await request(config, '/functions/v1/algolia-public-config');
  const index = manifest.kind === 'supplier' ? publicConfig?.indices?.factories : publicConfig?.indices?.products;
  if (!publicConfig?.appId || !publicConfig?.apiKey || !index) throw new Error('Algolia public configuration is incomplete');
  for (const entity of manifest.entities) {
    const objectId = manifest.kind === 'supplier' ? entity.payload.supplier.slug : entity.payload.product.sku;
    const response = await fetch(`https://${publicConfig.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}/${encodeURIComponent(objectId)}`, {
      headers: { 'X-Algolia-Application-Id': publicConfig.appId, 'X-Algolia-API-Key': publicConfig.apiKey }, cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Algolia production read-back failed: ${objectId} (${response.status})`);
    const record = await response.json();
    if (record.objectID !== objectId) throw new Error(`Algolia object mismatch: ${objectId}`);
  }
}

function deleteVerifiedLocalMedia(manifest) {
  const workspace = `${fs.realpathSync(process.cwd())}${path.sep}`;
  const targets = new Set();
  for (const { media } of mediaEntries(manifest)) {
    const target = fs.realpathSync(path.resolve(media.local_path));
    if (!target.startsWith(workspace) || target === workspace.slice(0, -1)) throw new Error(`Refusing to delete media outside workspace: ${target}`);
    targets.add(target);
  }
  for (const target of targets) fs.unlinkSync(target);
}

async function main() {
  const manifestPath = argValue('--manifest');
  const privatePath = argValue('--private-input');
  const apply = process.argv.includes('--apply');
  const deleteLocal = process.argv.includes('--delete-local-after-verify');
  if (!manifestPath) throw new Error('Usage: node publisher.js --manifest batch.json [--private-input batch-private.json] [--apply] [--delete-local-after-verify]');
  if (deleteLocal && !apply) throw new Error('--delete-local-after-verify requires --apply');
  if (privatePath && !path.resolve(privatePath).startsWith(`${path.resolve('data/catalog-runs')}${path.sep}`)) {
    throw new Error('Private sidecars must be read from gitignored data/catalog-runs/');
  }
  const publicManifest = validateBuiltManifest(JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')));
  const privateSidecar = privatePath ? JSON.parse(fs.readFileSync(path.resolve(privatePath), 'utf8')) : null;
  const manifest = hydratePrivateInputs(publicManifest, privateSidecar);
  verifyLocalMedia(manifest);
  if (!apply) {
    process.stdout.write(`DRY RUN OK ${manifest.batch_id} ${manifest.kind} ${manifest.entities.length} items ${mediaEntries(manifest).length} images\n`);
    return;
  }
  const config = apiConfig();
  verifyReleaseRevision(manifest);
  await uploadAndVerifyMedia(config, manifest);
  const stagedState = await stageBatch(config, manifest);
  if (stagedState.status !== 'live_verified') await finalizeAndVerify(config, manifest, stagedState);
  else {
    await syncAndVerifySearch(config, manifest);
    if (manifest.closes_complete_run) await request(config, '/rest/v1/rpc/catalog_close_complete_run', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_run_id: manifest.run_id }),
    });
  }
  if (deleteLocal) deleteVerifiedLocalMedia(manifest);
  process.stdout.write(`LIVE VERIFIED ${manifest.batch_id}${deleteLocal ? ' local images deleted' : ''}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });

module.exports = { assertSafeStoragePath, deleteVerifiedLocalMedia, hydratePrivateInputs, mediaEntries, sniffImage, syncAndVerifySearch, verifyLocalMedia, verifyReleaseRevision };
