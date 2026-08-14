#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { buildManifest, buildPrivateSidecar, stableStringify } = require('./manifest');

const DEFAULT_RUN_DIR = 'data/catalog-runs/apparelx-oem-20260814';
const DEFAULT_MEDIA_CACHE = 'data/apparel-x-oem';
const DEFAULT_SUPABASE_URL = 'https://bobwfxvxzjovpgmmqsew.supabase.co';
const CENTRAL_CONTACT = 'info@arcanawangsa.com';

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeImmutable(filePath, content, options = {}) {
  if (fs.existsSync(filePath)) {
    if (fs.readFileSync(filePath, 'utf8') !== content) throw new Error(`Immutable output collision: ${filePath}`);
    return false;
  }
  fs.writeFileSync(filePath, content, { flag: 'wx', ...options });
  return true;
}

function uuidFromText(value) {
  const bytes = crypto.createHash('sha256').update(String(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertApparelXMediaUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.apparel-x.com' || parsed.port || parsed.username || parsed.password) {
    throw new Error(`Refusing non-ApparelX media URL: ${value}`);
  }
  return parsed;
}

async function downloadApparelXMedia(url, fetchImpl = fetch) {
  let current = assertApparelXMediaUrl(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchImpl(current, { redirect: 'manual', headers: { accept: 'image/avif,image/webp,image/*' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Media redirect missing Location: ${current}`);
      current = assertApparelXMediaUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) throw new Error(`Media download failed ${response.status}: ${current}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || String(response.headers.get('content-type') || '').toLowerCase().startsWith('text/html')) {
      throw new Error(`Media response is empty or HTML: ${current}`);
    }
    return bytes;
  }
  throw new Error(`Too many redirects for media: ${url}`);
}

async function optimizeImage(input, kind) {
  const isLogo = kind === 'logo';
  const maxDimension = isLogo ? 1024 : 2000;
  const targetBytes = isLogo ? 250 * 1024 : 1024 * 1024;
  let result;
  let quality = 84;
  for (const candidate of [84, 82, 80, 78]) {
    quality = candidate;
    result = await sharp(input, { failOn: 'error', limitInputPixels: 268402689 })
      .rotate()
      .toColourspace('srgb')
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: candidate, alphaQuality: 90, smartSubsample: true, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (result.data.length <= targetBytes) break;
  }
  const verified = await sharp(result.data).metadata();
  if (verified.format !== 'webp' || !verified.width || !verified.height || verified.width > maxDimension || verified.height > maxDimension) {
    throw new Error('Optimized image failed WebP/dimension verification');
  }
  return { buffer: result.data, width: verified.width, height: verified.height, hasAlpha: Boolean(verified.hasAlpha), quality };
}

function translationMap(document) {
  if (!document) return new Map();
  const values = Array.isArray(document) ? document : Array.isArray(document.translations) ? document.translations : Array.isArray(document.suppliers) ? document.suppliers : null;
  if (values) return new Map(values.map((item) => [item.supplierId || item.id, item.locales || item.translations ||
    Object.fromEntries(['en','ja','zh'].filter((locale) => item[locale] && typeof item[locale] === 'object').map((locale) => [locale,item[locale]]))]));
  return new Map(Object.entries(document).filter(([key]) => key !== 'metadata').map(([key, value]) => [key, value.locales || value]));
}

function factoryTypeFor(supplier) {
  const l2 = String(supplier.taxonomy?.primary?.l2 || '').toLowerCase();
  if (l2 === 'trims') return 'trim_supplier';
  if (l2 === 'yarns') return 'yarn_supplier';
  return supplier.taxonomy?.primary?.l3 === 'accessories' ? 'accessories_supplier' : 'garment_manufacturer';
}

function primarySupplierName(supplier, locales) {
  return nullable(locales?.en?.name) || supplier.name;
}

function supplierCopyI18n(supplier, locales) {
  const copy = structuredClone(locales || {});
  copy.ja = {
    ...(copy.ja || {}),
    name: nullable(copy.ja?.name) || supplier.name,
    description: nullable(copy.ja?.description) || nullable(supplier.description || supplier.businessOutline || supplier.sellingPoints),
  };
  return copy;
}

function nullable(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function sourceYear(value) {
  const match = nullable(value)?.match(/(?:^|\D)((?:18|19|20)\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function provenanceFor(supplier, sourceRecord) {
  const observedAt = sourceRecord.crawledAt;
  const sourceUrl = sourceRecord.sourceUrl;
  const fields = {
    name: supplier.name,
    type: supplier.supplierType,
    loc: supplier.address,
    web: supplier.website,
    moq: supplier.moq,
    lead: supplier.leadTime,
    capacity: supplier.capacity,
    certs: supplier.certifications,
    sales: supplier.annualSales,
    employees: supplier.employeeCount,
    founded: sourceYear(supplier.establishedDate),
    bio: supplier.description || supplier.businessOutline || supplier.sellingPoints,
  };
  return Object.entries(fields).filter(([, value]) => value != null).map(([field_name, source_value]) => ({
    field_name, source_url: sourceUrl, source_value, value_origin: 'source', observed_at: observedAt,
  }));
}

function taxonomyFor(sourceRecord) {
  const classification = sourceRecord.classification;
  if (!classification || classification.status !== 'classified' || !Array.isArray(classification.memberships)) {
    throw new Error(`Supplier ${sourceRecord.supplierId} has no publishable taxonomy`);
  }
  return classification.memberships.map((membership) => ({
    l2: membership.l2,
    l3: membership.l3,
    is_primary: Boolean(membership.isPrimary),
    classification_method: classification.method === 'human' ? 'human' : 'rule',
    classification_evidence: membership.evidence?.excerpt || membership.evidence?.term || classification.reason || 'Curated ApparelX source evidence',
    source_url: sourceRecord.sourceUrl,
  }));
}

function privateEmailsFor(supplierId, contacts) {
  return contacts.filter((contact) => contact.supplierId === supplierId && contact.contactType === 'email').map((contact) => {
    if (contact.outreachAllowed !== false || contact.publicVisibility !== false || contact.usageStatus !== 'documented_only') {
      throw new Error(`Private contact policy mismatch: ${supplierId}`);
    }
    return {
      original_value: contact.originalValue,
      normalized_value: String(contact.normalizedValue).trim().toLowerCase(),
      source_url: contact.sourceUrl,
      source_location: contact.sourceField,
      crawled_at: contact.crawledAt,
      validation_status: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.normalizedValue) ? 'syntax_valid' : 'invalid',
    };
  });
}

async function prepareMedia({ supplier, sourceRecord, mediaRecords, runDir, mediaCache, supabaseUrl, build }) {
  const matches = mediaRecords.filter((media) => media.supplierId === supplier.id);
  const prepared = [];
  let pageAssigned = false;
  for (const media of matches) {
    assertApparelXMediaUrl(media.sourceUrl);
    const cachedPath = path.resolve(mediaCache, media.localPath);
    let input;
    if (fs.existsSync(cachedPath)) input = fs.readFileSync(cachedPath);
    else if (build) input = await downloadApparelXMedia(media.sourceUrl);
    else {
      prepared.push({ asset_id: media.assetId, source_url: media.sourceUrl, status: 'would_download' });
      continue;
    }
    if (!build) {
      const metadata = await sharp(input).metadata();
      if (!metadata.format || !metadata.width || !metadata.height) throw new Error(`Unreadable cached media: ${cachedPath}`);
      prepared.push({ asset_id: media.assetId, source_url: media.sourceUrl, status: 'would_optimize', input_bytes: input.length });
      continue;
    }
    const optimized = await optimizeImage(input, media.kind);
    const digest = crypto.createHash('sha256').update(optimized.buffer).digest('hex');
    const sourceKey = sourceRecord.sourceId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const storagePath = `apparelx/suppliers/${sourceKey}/${digest}.webp`;
    const localPath = path.join(runDir, 'media-tmp', 'optimized', `${digest}.webp`);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    if (fs.existsSync(localPath)) {
      const existingHash = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
      if (existingHash !== digest) throw new Error(`Content-addressed media collision: ${localPath}`);
    } else fs.writeFileSync(localPath, optimized.buffer, { flag: 'wx' });
    let role = 'gallery';
    if (media.kind === 'logo') role = 'logo';
    else if (!pageAssigned) { role = 'page'; pageAssigned = true; }
    prepared.push({
      role,
      source_url: media.sourceUrl,
      storage_path: storagePath,
      public_url: `${supabaseUrl}/storage/v1/object/public/catalog-media/${storagePath}`,
      local_path: path.relative(process.cwd(), localPath),
      sha256: digest,
      mime_type: 'image/webp',
      bytes: optimized.buffer.length,
      width: optimized.width,
      height: optimized.height,
      has_alpha: optimized.hasAlpha,
      optimization_quality: optimized.quality,
    });
  }
  return prepared;
}

function localeReadiness(locales) {
  return Object.fromEntries(['en', 'ja', 'zh'].map((locale) => [locale, Boolean(locales?.[locale] && Object.keys(locales[locale]).length)]));
}

async function prepareOemBatches(options) {
  const runDir = path.resolve(options.runDir || DEFAULT_RUN_DIR);
  const publicDocument = readJson(path.join(runDir, 'public-suppliers.json'));
  const privateDocument = readJson(path.join(runDir, 'private-supplier-sources.json'));
  const translations = options.translations && fs.existsSync(path.resolve(options.translations)) ? translationMap(readJson(options.translations)) : new Map();
  if (publicDocument.metadata?.sourceHost !== 'www.apparel-x.com' || privateDocument.metadata?.sourceHost !== 'www.apparel-x.com') throw new Error('OEM source host must be www.apparel-x.com');
  if (!Array.isArray(publicDocument.suppliers) || !Array.isArray(privateDocument.sourceRecords)) throw new Error('OEM input schema is invalid');
  if (publicDocument.suppliers.length !== privateDocument.sourceRecords.length) throw new Error('Public/private supplier count mismatch');
  const sourceBySupplier = new Map(privateDocument.sourceRecords.map((record) => [record.supplierId, record]));
  const batchSize = Number(options.batchSize || 50);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('batchSize must be 1..50');
  const supabaseUrl = String(options.supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) throw new Error('supabaseUrl must be an https://*.supabase.co origin');
  const runId = options.runId || uuidFromText(`apparelx-oem:${publicDocument.metadata.contentHash}`);
  const entities = [];
  const mediaReport = [];
  for (const supplier of publicDocument.suppliers) {
    if (supplier.contactCta?.destination !== CENTRAL_CONTACT || supplier.contactCta?.href !== `mailto:${CENTRAL_CONTACT}`) throw new Error(`Central contact mismatch: ${supplier.id}`);
    const sourceRecord = sourceBySupplier.get(supplier.id);
    if (!sourceRecord) throw new Error(`Missing source record: ${supplier.id}`);
    const media = await prepareMedia({ supplier, sourceRecord, mediaRecords: privateDocument.media || [], runDir,
      mediaCache: path.resolve(options.mediaCache || DEFAULT_MEDIA_CACHE), supabaseUrl, build: Boolean(options.build) });
    mediaReport.push(...media.map((item) => ({ supplier_id: supplier.id, ...item })));
    const uploadedMedia = media.filter((item) => item.storage_path);
    const logo = uploadedMedia.find((item) => item.role === 'logo')?.public_url || null;
    const page = uploadedMedia.find((item) => item.role === 'page')?.public_url || null;
    const locales = translations.get(supplier.id) || {};
    const copyI18n = supplierCopyI18n(supplier, locales);
    const readiness = localeReadiness(copyI18n);
    if (options.build && !['en', 'ja', 'zh'].every((locale) => readiness[locale])) {
      throw new Error(`Supplier ${supplier.id} requires complete en/ja/zh copy before verified publication`);
    }
    const missingFields = ['moq','leadTime','capacity','certifications','price'].filter((field) => supplier[field] == null);
    entities.push({
      source_key: sourceRecord.sourceId,
      payload: {
        source_url: sourceRecord.sourceUrl,
        supplier: {
          slug: supplier.slug,
          name: primarySupplierName(supplier, locales),
          type: factoryTypeFor(supplier),
          region: nullable(supplier.country),
          loc: nullable(supplier.address),
          verify_state: 'verified',
          moq: nullable(supplier.moq),
          lead: nullable(supplier.leadTime),
          capacity: nullable(supplier.capacity),
          certs: Array.isArray(supplier.certifications) ? supplier.certifications : [],
          tags: [...new Set([...(supplier.tags || []), ...(supplier.partnerTags || [])])],
          sales: null,
          web: nullable(supplier.website),
          founded: sourceYear(supplier.establishedDate),
          employees: nullable(supplier.employeeCount),
          bio: nullable(locales?.en?.description) || nullable(supplier.description || supplier.businessOutline || supplier.sellingPoints),
          img: page || logo,
          logo_img: logo,
          page_img: page,
          copy_i18n: copyI18n,
          contact_cta: { label: 'Contact supplier', destination: CENTRAL_CONTACT, href: `mailto:${CENTRAL_CONTACT}` },
        },
        taxonomy: taxonomyFor(sourceRecord),
        locale_readiness: readiness,
        missing_fields: missingFields,
        display_fallback: 'Contact supplier',
        private_contacts: privateEmailsFor(supplier.id, privateDocument.privateContacts || []),
        media: uploadedMedia,
        provenance: provenanceFor(supplier, sourceRecord),
      },
    });
  }
  const batches = [];
  for (let offset = 0; offset < entities.length; offset += batchSize) {
    const input = { run_id: runId, source: 'apparelx', source_base_url: 'https://www.apparel-x.com', scope: 'oem', kind: 'supplier',
      sequence_no: batches.length + 1, closes_complete_run: offset + batchSize >= entities.length,
      git_commit_sha: options.gitCommitSha || null, entities: entities.slice(offset, offset + batchSize) };
    batches.push({ manifest: buildManifest(input), privateSidecar: buildPrivateSidecar(input) });
  }
  return { runId, supplierCount: entities.length, batchCount: batches.length, batches, mediaReport,
    emailCount: (privateDocument.privateContacts || []).filter((contact) => contact.contactType === 'email').length };
}

async function main() {
  const build = process.argv.includes('--build');
  const replaceGenerated = process.argv.includes('--replace-generated');
  if (build && process.argv.includes('--dry-run')) throw new Error('Choose either --build or --dry-run');
  const runDir = argValue('--run-dir', DEFAULT_RUN_DIR);
  const result = await prepareOemBatches({
    runDir,
    mediaCache: argValue('--media-cache', DEFAULT_MEDIA_CACHE),
    translations: argValue('--translations'),
    supabaseUrl: argValue('--supabase-url', process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL),
    runId: argValue('--run-id'),
    gitCommitSha: argValue('--git-commit-sha'),
    batchSize: Number(argValue('--batch-size', '50')),
    build,
  });
  if (build) {
    const outputDir = path.resolve(runDir, 'publisher');
    const privateDir = path.resolve(runDir, 'private-publisher');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
    result.batches.forEach(({ manifest, privateSidecar }, index) => {
      const number = String(index + 1).padStart(3, '0');
      const manifestPath = path.join(outputDir, `supplier-batch-${number}.manifest.json`);
      const privatePath = path.join(privateDir, `supplier-batch-${number}.private.json`);
      if (replaceGenerated) {
        fs.writeFileSync(manifestPath, `${stableStringify(manifest)}\n`);
        fs.writeFileSync(privatePath, `${stableStringify(privateSidecar)}\n`, { mode: 0o600 });
      } else {
        writeImmutable(manifestPath, `${stableStringify(manifest)}\n`);
        writeImmutable(privatePath, `${stableStringify(privateSidecar)}\n`, { mode: 0o600 });
      }
    });
    const report = {
      run_id: result.runId,
      supplier_count: result.supplierCount,
      batch_count: result.batchCount,
      documented_private_email_count: result.emailCount,
      media_count: result.mediaReport.length,
      optimized_media_count: result.mediaReport.filter((item) => item.storage_path).length,
      generated_at: publicDocumentDate(runDir),
      publication_performed: false,
    };
    fs.writeFileSync(path.join(outputDir, 'preparation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(`${build ? 'BUILD' : 'DRY RUN'} OK run=${result.runId} suppliers=${result.supplierCount} batches=${result.batchCount} media=${result.mediaReport.length} private_emails=${result.emailCount} published=0\n`);
}

function publicDocumentDate(runDir) {
  return readJson(path.join(path.resolve(runDir), 'public-suppliers.json')).metadata?.sourceCrawledAt || null;
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });

module.exports = { assertApparelXMediaUrl, downloadApparelXMedia, factoryTypeFor, optimizeImage, prepareOemBatches, primarySupplierName, sourceYear, supplierCopyI18n, translationMap, uuidFromText, writeImmutable };
