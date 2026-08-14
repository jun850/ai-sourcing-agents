'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const { calculateCatalogPrice } = require('../pricing');
const { buildManifest, buildPrivateSidecar, validateBuiltManifest } = require('../manifest');
const { assertSafeStoragePath, deleteVerifiedLocalMedia, hydratePrivateInputs, sniffImage, verifyReleaseRevision } = require('../publisher');
const { assertApparelXMediaUrl, downloadApparelXMedia, factoryTypeFor, optimizeImage, prepareOemBatches, primarySupplierName, sourceYear, supplierCopyI18n, translationMap, uuidFromText } = require('../prepare-oem-batches');

const runId = '11111111-1111-4111-8111-111111111111';

function supplierInput() {
  return {
    run_id: runId,
    kind: 'supplier',
    sequence_no: 1,
    entities: [{
      source_key: 'supplier-1',
      payload: {
        source_url: 'https://www.apparel-x.com/business/supplier-1',
        supplier: { slug: 'supplier-1', name: 'Supplier One', type: 'garment_manufacturer' },
        taxonomy: [{ l2: 'oem', l3: 'clothing', is_primary: true, classification_evidence: 'Apparel production' }],
        private_contacts: [{ original_value: 'sales@example.test', normalized_value: 'sales@example.test' }],
      },
    }],
  };
}

test('price markup and upward rounding match locked examples', () => {
  assert.equal(calculateCatalogPrice({ sourceAmount: '5.31', fxRate: '1', currency: 'USD' }).catalogAmount, '6.40');
  assert.equal(calculateCatalogPrice({ sourceAmount: '1008', fxRate: '1', currency: 'JPY' }).catalogAmount, '1300');
  assert.equal(calculateCatalogPrice({ sourceAmount: '1120', fxRate: '1', currency: 'JPY' }).catalogAmount, '1400');
  assert.equal(calculateCatalogPrice({ sourceAmount: '5', fxRate: '1', currency: 'USD' }).catalogAmount, '6.00');
});

test('manifest IDs and hashes are stable and validate', () => {
  const first = buildManifest(supplierInput());
  const second = buildManifest(supplierInput());
  assert.deepEqual(first, second);
  assert.equal(validateBuiltManifest(first).manifest_sha256, first.manifest_sha256);
});

test('public supplier data rejects email keys but private contacts are allowed', () => {
  const input = supplierInput();
  const allowed = buildManifest(input);
  assert.equal(allowed.entities.length, 1);
  assert.doesNotMatch(JSON.stringify(allowed), /sales@example\.test/);
  const hydrated = hydratePrivateInputs(allowed, buildPrivateSidecar(input));
  assert.equal(hydrated.entities[0].payload.private_contacts[0].normalized_value, 'sales@example.test');
  const rejected = supplierInput();
  rejected.entities[0].payload.supplier.contactEmail = 'sales@example.test';
  assert.throws(() => buildManifest(rejected), /email key/);
  const hiddenInBio = supplierInput();
  hiddenInBio.entities[0].payload.supplier.bio = 'Contact sales@example.test';
  assert.throws(() => buildManifest(hiddenInBio), /email key/);
});

test('manifest enforces the ApparelX www domain and batch cap', () => {
  const badDomain = supplierInput();
  badDomain.entities[0].payload.source_url = 'https://vn.apparelx.com/business/supplier-1';
  assert.throws(() => buildManifest(badDomain), /www\.apparel-x\.com/);
  const tooMany = supplierInput();
  tooMany.entities = Array.from({ length: 51 }, (_, index) => ({ ...tooMany.entities[0], source_key: `supplier-${index}` }));
  assert.throws(() => buildManifest(tooMany), /1\.\.50/);
});

test('product manifests calculate prices and missing prices remain quote-only inputs', () => {
  const base = {
    run_id: runId, kind: 'product', sequence_no: 2,
    entities: [{ source_key: 'p-1', payload: { source_url: 'https://www.apparel-x.com/item/p-1', supplier_source_key: 'supplier-1',
      product: { sku: 'P-1', name: 'Fabric', unit_type: 'm', category: 'fabrics' }, prices: [] } }],
  };
  assert.equal(buildManifest(base).entities[0].payload.prices, undefined);
  base.entities[0].payload.prices = [{ currency: 'USD', source_amount: '5.31', source_currency: 'USD', fx_rate: '1', fx_snapshot_id: 'same-currency' }];
  const manifest = buildManifest(base);
  assert.equal(manifest.entities[0].price_preview.prices[0].catalog_amount, '6.40');
  assert.doesNotMatch(JSON.stringify(manifest), /source_amount/);
  assert.equal(hydratePrivateInputs(manifest, buildPrivateSidecar(base)).entities[0].payload.prices[0].source_amount, '5.31');
});

test('storage paths reject traversal and image sniffing rejects HTML', () => {
  assert.doesNotThrow(() => assertSafeStoragePath('apparelx/product/hash.webp'));
  assert.throws(() => assertSafeStoragePath('../secret'));
  assert.equal(sniffImage(Buffer.from('<html>error</html>')), null);
  assert.equal(sniffImage(Buffer.from('89504e470d0a1a0a', 'hex')), 'image/png');
});

test('verified local media deletion is idempotent for duplicate references', () => {
  const directory = fs.mkdtempSync(path.resolve(process.cwd(), '.catalog-delete-test-'));
  const target = path.join(directory, 'same.webp');
  fs.writeFileSync(target, Buffer.from('test'));
  const media = { local_path: target, storage_path: 'apparelx/supplier/same.webp' };
  assert.doesNotThrow(() => deleteVerifiedLocalMedia({ entities: [{ payload: { media: [media, { ...media }] } }] }));
  assert.equal(fs.existsSync(target), false);
  fs.rmdirSync(directory);
});

test('production revision gate rejects manifests without a commit', () => {
  assert.throws(() => verifyReleaseRevision({ git_commit_sha: null }), /committed git_commit_sha/);
});

test('migration includes private contact, batch cap, and public-safe price contracts', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../../supabase/migrations/20260814123000_catalog_import_pipeline.sql'), 'utf8');
  assert.match(sql, /supplier_source_contacts[\s\S]*outreach_allowed boolean NOT NULL DEFAULT false CHECK \(outreach_allowed=false\)/);
  assert.match(sql, /item_count integer NOT NULL DEFAULT 0 CHECK \(item_count BETWEEN 0 AND 50\)/);
  assert.match(sql, /catalog_finalize_product_batch/);
  assert.match(sql, /catalog_finalize_supplier_batch/);
  assert.match(sql, /REVOKE ALL ON public\.catalog_import_sources[\s\S]*public\.supplier_source_contacts/);
  assert.doesNotMatch(sql.match(/CREATE OR REPLACE FUNCTION public\.catalog_public_prices[\s\S]*?\$\$;/)[0], /source_amount|supplier_source_contacts/);
});

test('OEM media validation permits only the exact ApparelX HTTPS host', () => {
  assert.equal(assertApparelXMediaUrl('https://www.apparel-x.com/img/a.png').hostname, 'www.apparel-x.com');
  for (const url of ['http://www.apparel-x.com/a.jpg','https://vn.apparelx.com/a.jpg','https://apparel-x.com/a.jpg','https://www.apparel-x.com.evil.test/a.jpg']) {
    assert.throws(() => assertApparelXMediaUrl(url), /Refusing non-ApparelX/);
  }
});

test('OEM downloader rejects redirects away from ApparelX', async () => {
  const fakeFetch = async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/image.jpg' } });
  await assert.rejects(() => downloadApparelXMedia('https://www.apparel-x.com/image.jpg', fakeFetch), /Refusing non-ApparelX/);
});

test('OEM optimizer emits bounded WebP and preserves alpha', async () => {
  const source = await sharp({ create: { width: 2400, height: 1200, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } }).png().toBuffer();
  const result = await optimizeImage(source, 'business_photo');
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 2000 && metadata.height <= 2000);
  assert.equal(metadata.hasAlpha, true);
});

test('OEM helpers are deterministic and do not estimate unknown years', () => {
  assert.equal(uuidFromText('same'), uuidFromText('same'));
  assert.equal(sourceYear('1990年4月'), 1990);
  assert.equal(sourceYear('unknown'), null);
  assert.equal(translationMap({ 'apparelx:x': { en: { name: 'X' } } }).get('apparelx:x').en.name, 'X');
});

test('translation schema accepts direct en/ja/zh and maps copy_i18n', () => {
  const locales = translationMap({ translations: [{ id: 'apparelx:x', en: { name: 'English X' }, ja: { name: '日本語X' }, zh: { name: '中文X' } }] }).get('apparelx:x');
  assert.equal(locales.en.name, 'English X');
  assert.equal(supplierCopyI18n({ name: '原文', description: '説明' }, locales).zh.name, '中文X');
});

test('English supplier name is primary with source Japanese fallback', () => {
  const supplier = { name: '株式会社テスト' };
  assert.equal(primarySupplierName(supplier, { en: { name: 'Test Co.' } }), 'Test Co.');
  assert.equal(primarySupplierName(supplier, {}), '株式会社テスト');
});

test('factory type follows trims and yarns L2 taxonomy', () => {
  assert.equal(factoryTypeFor({ taxonomy: { primary: { l2: 'trims', l3: 'simple-trims' } } }), 'trim_supplier');
  assert.equal(factoryTypeFor({ taxonomy: { primary: { l2: 'yarns', l3: 'spun-yarn' } } }), 'yarn_supplier');
  assert.equal(factoryTypeFor({ taxonomy: { primary: { l2: 'oem', l3: 'clothing' } } }), 'garment_manufacturer');
});

test('normalized OEM artifacts prepare one sanitized private-linked batch', async () => {
  const result = await prepareOemBatches({
    runDir: path.resolve(__dirname, '../../../../data/catalog-runs/apparelx-oem-20260814'),
    mediaCache: path.resolve(__dirname, '../../../../data/apparel-x-oem'),
    build: false,
  });
  assert.equal(result.supplierCount, 35);
  assert.equal(result.batchCount, 1);
  assert.equal(result.emailCount, 21);
  const publicJson = JSON.stringify(result.batches[0].manifest);
  assert.doesNotMatch(publicJson, /private_contacts|source_amount/);
  assert.deepEqual([...new Set([...publicJson.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase()))], ['info@arcanawangsa.com']);
  const missing = result.batches[0].manifest.entities.find((entity) => entity.payload.missing_fields.includes('moq'));
  assert.equal(missing.payload.supplier.moq, null);
  assert.equal(missing.payload.display_fallback, 'Contact supplier');
  assert.ok(missing.payload.supplier.copy_i18n.ja.name);
  assert.equal(missing.payload.locales, undefined);
});
