'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { CONTACT_EMAIL, TAXONOMY, normalizeManifest } = require('../oem/normalize');

const ROOT = path.resolve(__dirname, '../../..');
const INPUT_FILE = path.join(ROOT, 'data/apparel-x-oem/factories.json');
const FIXTURE_FILE = path.join(__dirname, 'fixtures/oem-suppliers.json');
const CLI = path.join(ROOT, 'scripts/catalog/oem/cli.js');

function input() {
  return JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
}

function fixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'));
}

function supplier(result, sourceId) {
  return result.publicManifest.suppliers.find(value => value.id === `apparelx:${sourceId.toLowerCase()}`);
}

test('normalizes all 35 records deterministically', () => {
  const first = normalizeManifest(input());
  const second = normalizeManifest(input());
  assert.deepEqual(first, second);
  assert.equal(first.publicManifest.metadata.supplierCount, 35);
  assert.equal(first.report.readyCount, 35);
  assert.equal(first.report.reviewRequiredCount, 0);
  assert.equal(first.report.privateEmailCount, 21);
  assert.equal(first.report.mediaCount, 90);
});

test('assigns evidence-backed primary and secondary current taxonomy memberships', () => {
  const result = normalizeManifest(input());
  assert.deepEqual(supplier(result, '5DYI').taxonomy.primary, { l2: 'oem', l3: 'clothing' });
  assert.deepEqual(supplier(result, 'CANAL').taxonomy.primary, { l2: 'oem', l3: 'accessories' });
  assert.deepEqual(supplier(result, 'DONGS').taxonomy.primary, { l2: 'trims', l3: 'simple-trims' });
  assert.ok(supplier(result, 'DONGS').taxonomy.memberships.some(value => value.l2 === 'yarns' && value.l3 === 'cotton'));
  assert.ok(supplier(result, 'GMLEAJ').taxonomy.memberships.some(value => value.l2 === 'oem' && value.l3 === 'accessories'));

  for (const value of result.publicManifest.suppliers) {
    for (const item of value.taxonomy.memberships) {
      assert.ok(TAXONOMY[item.l2] && TAXONOMY[item.l2].includes(item.l3), `${value.id}: unsupported ${item.l2}/${item.l3}`);
    }
    if (value.taxonomy.status === 'classified') {
      assert.equal(value.taxonomy.memberships.filter(item => item.isPrimary).length, 1);
    }
  }
});

test('classifies supported viscose yarn and multi-capability OEM suppliers', () => {
  const result = normalizeManifest(input());
  assert.deepEqual(supplier(result, 'IG6').taxonomy.primary, { l2: 'yarns', l3: 'viscose' });
  assert.deepEqual(supplier(result, 'LWBGGK').taxonomy.primary, { l2: 'oem', l3: 'clothing' });
  assert.ok(supplier(result, 'LWBGGK').taxonomy.memberships.some(value => value.l2 === 'oem' && value.l3 === 'socks'));
  assert.ok(supplier(result, 'LWBGGK').taxonomy.memberships.some(value => value.l2 === 'oem' && value.l3 === 'accessories'));
  const reviews = result.privateManifest.sourceRecords.filter(value => value.classification.status === 'review_required');
  assert.equal(reviews.length, 0);
});

test('fails closed for unmapped suppliers and rejects non-canonical source hosts', () => {
  const source = fixture();
  const result = normalizeManifest(source);
  assert.deepEqual(supplier(result, 'CANAL').taxonomy.primary, { l2: 'oem', l3: 'accessories' });
  assert.equal(supplier(result, 'UNMAPPED').publicationStatus, 'review_required');
  assert.equal(supplier(result, 'UNMAPPED').taxonomy.primary, null);

  source.metadata.sourceHost = 'vn.apparelx.com';
  assert.throws(() => normalizeManifest(source), /Unsupported source host/);
});

test('keeps source contacts private and uses only the central public CTA', () => {
  const result = normalizeManifest(input());
  const publicJson = JSON.stringify(result.publicManifest).toLowerCase();
  for (const contact of result.privateManifest.privateContacts.filter(value => value.contactType === 'email')) {
    assert.equal(contact.usageStatus, 'documented_only');
    assert.equal(contact.outreachAllowed, false);
    assert.equal(contact.publicVisibility, false);
    assert.ok(!publicJson.includes(contact.normalizedValue));
  }
  for (const value of result.publicManifest.suppliers) {
    assert.equal(value.contactCta.destination, CONTACT_EMAIL);
    assert.equal(value.contactCta.href, `mailto:${CONTACT_EMAIL}`);
    assert.ok(!Object.hasOwn(value, 'email'));
    assert.ok(!Object.hasOwn(value, 'phone'));
    assert.ok(!Object.hasOwn(value, 'fax'));
  }
});

test('represents missing factual fields as null', () => {
  const result = normalizeManifest(input());
  const value = supplier(result, '333z8');
  assert.equal(value.capital, null);
  assert.equal(value.establishedDate, null);
  assert.equal(value.moq, null);
  assert.equal(value.leadTime, null);
  assert.equal(value.capacity, null);
  assert.equal(value.certifications, null);
  assert.equal(value.price, null);
});

test('CLI supports help, dry-run/report, and separate exclusive output manifests', () => {
  const help = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--dry-run/);
  assert.match(help.stdout, /--output-dir/);

  const dryRun = spawnSync(process.execPath, [CLI, '--dry-run', '--report'], { encoding: 'utf8' });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).supplierCount, 35);

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelix-oem-normalize-'));
  try {
    const write = spawnSync(process.execPath, [CLI, '--output-dir', outputDir], { encoding: 'utf8' });
    assert.equal(write.status, 0, write.stderr);
    const publicFile = path.join(outputDir, 'public-suppliers.json');
    const privateFile = path.join(outputDir, 'private-supplier-sources.json');
    const reportFile = path.join(outputDir, 'normalization-report.json');
    assert.ok(fs.existsSync(publicFile));
    assert.ok(fs.existsSync(privateFile));
    assert.ok(fs.existsSync(reportFile));
    const publicJson = JSON.stringify(JSON.parse(fs.readFileSync(publicFile, 'utf8')));
    const privateJson = JSON.stringify(JSON.parse(fs.readFileSync(privateFile, 'utf8')));
    const documentedSourceEmails = [...privateJson.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
      .map((match) => match[0].toLowerCase())
      .filter((email) => email !== 'info@arcanawangsa.com');
    assert.ok(documentedSourceEmails.length > 0);
    assert.ok(documentedSourceEmails.every((email) => !publicJson.includes(email)));

    const overwrite = spawnSync(process.execPath, [CLI, '--output-dir', outputDir], { encoding: 'utf8' });
    assert.notEqual(overwrite.status, 0);
    assert.match(overwrite.stderr, /Refusing to overwrite existing manifest/);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
