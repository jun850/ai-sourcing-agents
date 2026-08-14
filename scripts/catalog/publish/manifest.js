'use strict';

const crypto = require('node:crypto');
const { calculateCatalogPrice } = require('./pricing');

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA_RE = /^[a-f0-9]{64}$/;
const EMAIL_KEY_RE = /email/i;
const EMAIL_VALUE_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const CENTRAL_CONTACT = 'info@arcanawangsa.com';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function uuidFromHash(hash) {
  const chars = hash.slice(0, 32).split('');
  chars[12] = '5';
  chars[16] = ['8', '9', 'a', 'b'][parseInt(chars[16], 16) % 4];
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hasEmailKey(value) {
  if (Array.isArray(value)) return value.some(hasEmailKey);
  if (typeof value === 'string') return (value.match(EMAIL_VALUE_RE) || []).some(email => email.toLowerCase() !== CENTRAL_CONTACT);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => EMAIL_KEY_RE.test(key) || hasEmailKey(child));
}

function normalizePrice(price) {
  const calculated = calculateCatalogPrice({
    sourceAmount: price.source_amount,
    fxRate: price.fx_rate,
    currency: price.currency,
    markupBps: price.markup_bps == null ? 2000 : Number(price.markup_bps),
  });
  if (!price.source_currency || !price.fx_snapshot_id) throw new Error('Every price requires source_currency and fx_snapshot_id');
  return {
    ...price,
    currency: calculated.currency,
    source_amount: String(price.source_amount),
    source_currency: String(price.source_currency).toUpperCase(),
    fx_rate: String(price.fx_rate),
    markup_bps: calculated.markupBps,
    unrounded_amount: calculated.unroundedAmount,
    rounding_increment: calculated.roundingIncrement,
    catalog_amount: calculated.catalogAmount,
    calculation_version: price.calculation_version || 'apparelx-v1',
  };
}

function privateInputForEntity(entity, kind) {
  if (kind === 'supplier') {
    const privateContacts = entity.payload?.private_contacts || [];
    return privateContacts.length ? { private_contacts: privateContacts } : null;
  }
  const prices = (entity.payload?.prices || []).map(normalizePrice);
  const priceBreaks = (entity.payload?.price_breaks || []).map(normalizePrice);
  return prices.length || priceBreaks.length ? { prices, price_breaks: priceBreaks } : null;
}

function normalizeEntity(entity, kind) {
  if (!entity || typeof entity !== 'object' || !String(entity.source_key || '').trim()) throw new Error('Every entity requires source_key');
  const publicData = kind === 'supplier' ? entity.payload?.supplier : entity.payload?.product;
  if (!publicData || typeof publicData !== 'object') throw new Error(`Entity ${entity.source_key} requires payload.${kind}`);
  if (hasEmailKey(publicData)) throw new Error(`Entity ${entity.source_key} contains an email key in public data`);
  if (!/^https:\/\/www\.apparel-x\.com(?:\/|$)/.test(entity.payload?.source_url || '')) {
    throw new Error(`Entity ${entity.source_key} must use www.apparel-x.com source_url`);
  }
  if (kind === 'supplier') {
    const taxonomy = entity.payload.taxonomy;
    if (!Array.isArray(taxonomy) || taxonomy.filter((entry) => entry.is_primary === true).length !== 1) {
      throw new Error(`Supplier ${entity.source_key} requires exactly one primary taxonomy`);
    }
  }
  const payload = structuredClone(entity.payload);
  const privateInput = privateInputForEntity(entity, kind);
  delete payload.private_contacts;
  delete payload.prices;
  delete payload.price_breaks;
  if (kind === 'product' && privateInput) {
    if (privateInput.prices.length && !privateInput.prices.some((price) => price.currency === 'USD')) {
      throw new Error(`Product ${entity.source_key} requires a USD compatibility price`);
    }
  }
  const normalized = { source_key: String(entity.source_key), payload };
  if (privateInput) {
    normalized.private_input_sha256 = sha256(privateInput);
    if (kind === 'product') {
      normalized.price_preview = {
        prices: privateInput.prices.map(({ currency, catalog_amount, rounding_increment, markup_bps, calculation_version }) =>
          ({ currency, catalog_amount, rounding_increment, markup_bps, calculation_version })),
        price_breaks: privateInput.price_breaks.map(({ currency, min_qty, catalog_amount, rounding_increment, markup_bps, calculation_version }) =>
          ({ currency, min_qty, catalog_amount, rounding_increment, markup_bps, calculation_version })),
      };
    }
  } else if (entity.private_input_sha256) {
    if (!SHA_RE.test(entity.private_input_sha256)) throw new Error(`Invalid private input hash: ${entity.source_key}`);
    normalized.private_input_sha256 = entity.private_input_sha256;
    if (entity.price_preview) normalized.price_preview = structuredClone(entity.price_preview);
  }
  normalized.input_sha256 = sha256(normalized);
  return normalized;
}

function buildPrivateSidecar(input) {
  const entities = (input.entities || []).map((entity) => {
    const privateInput = privateInputForEntity(entity, input.kind);
    return privateInput ? { source_key: String(entity.source_key), ...privateInput } : null;
  }).filter(Boolean).sort((a, b) => a.source_key.localeCompare(b.source_key));
  return { version: 1, run_id: input.run_id, kind: input.kind, entities };
}

function buildManifest(input) {
  if (!input || typeof input !== 'object') throw new Error('Manifest input must be an object');
  const kind = input.kind;
  if (!['supplier', 'product'].includes(kind)) throw new Error('kind must be supplier or product');
  if (!UUID_RE.test(input.run_id || '')) throw new Error('run_id must be a UUID');
  if (!Number.isInteger(input.sequence_no) || input.sequence_no < 1) throw new Error('sequence_no must be a positive integer');
  if (!Array.isArray(input.entities) || input.entities.length < 1 || input.entities.length > 50) throw new Error('A batch must contain 1..50 entities');
  if (new Set(input.entities.map((entity) => entity.source_key)).size !== input.entities.length) throw new Error('source_key values must be unique per batch');

  const base = {
    version: 1,
    source: input.source || 'apparelx',
    source_base_url: input.source_base_url || 'https://www.apparel-x.com',
    run_id: input.run_id,
    scope: input.scope || (kind === 'supplier' ? 'oem' : 'fabrics'),
    kind,
    sequence_no: input.sequence_no,
    closes_complete_run: input.closes_complete_run === true,
    git_commit_sha: input.git_commit_sha || null,
    entities: input.entities.map((entity) => normalizeEntity(entity, kind)).sort((a, b) => a.source_key.localeCompare(b.source_key)),
  };
  if (base.source !== 'apparelx' || base.source_base_url !== 'https://www.apparel-x.com') throw new Error('This publisher currently accepts ApparelX www domain only');
  if (base.git_commit_sha && !/^[a-f0-9]{40}$/.test(base.git_commit_sha)) throw new Error('git_commit_sha must be a full lowercase SHA');
  const manifestHash = sha256(base);
  return {
    ...base,
    batch_id: uuidFromHash(manifestHash),
    idempotency_key: `catalog:${manifestHash}`,
    manifest_sha256: manifestHash,
  };
}

function validateBuiltManifest(manifest) {
  const rebuilt = buildManifest(manifest);
  if (manifest.batch_id !== rebuilt.batch_id || manifest.idempotency_key !== rebuilt.idempotency_key || manifest.manifest_sha256 !== rebuilt.manifest_sha256) {
    throw new Error('Manifest IDs or hash do not match its canonical content');
  }
  for (const entity of manifest.entities) {
    if (!SHA_RE.test(entity.input_sha256) || entity.input_sha256 !== rebuilt.entities.find((item) => item.source_key === entity.source_key)?.input_sha256) {
      throw new Error(`Entity hash mismatch: ${entity.source_key}`);
    }
  }
  return rebuilt;
}

module.exports = { buildManifest, buildPrivateSidecar, hasEmailKey, sha256, stableStringify, validateBuiltManifest };
