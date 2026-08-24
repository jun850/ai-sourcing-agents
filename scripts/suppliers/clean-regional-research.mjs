import fs from 'node:fs';
import path from 'node:path';

const input = path.resolve(process.argv[2] || 'data/regional-research/raw_suppliers.jsonl');
const output = path.resolve(process.argv[3] || 'data/regional-research/raw_suppliers.cleaned.jsonl');

// Explicit, stable review allowlist. Never approve suppliers by file position:
// crawler ordering can change and this import is fashion-sourcing only.
const reviewedFashionSources = new Set([
  'https://www.clothing.vn/',
  'https://www.laforbie.com/',
  'https://shengliknitting.com/',
  'https://www.dnrapparels.com/',
  'https://icmfactorydirect.com/'
]);

const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const kept = rows.filter((row) => reviewedFashionSources.has(row.website));

for (const row of kept) {
  if (row.website === 'https://icmfactorydirect.com/') {
    row.supplier_type = 'garment_manufacturer';
    row.sectors = ['Knit sportswear and apparel'];
    row.moq = '72 units';
    row.notes = 'Company-specific official site retained; source states low MOQ from 72 units. Verify current terms before publication.';
  }
}

if (kept.length !== reviewedFashionSources.size) {
  throw new Error(`Expected ${reviewedFashionSources.size} reviewed fashion suppliers, found ${kept.length}.`);
}

fs.writeFileSync(output, kept.map((row) => JSON.stringify(row)).join('\n') + '\n');
console.log(JSON.stringify({ input_rows: rows.length, kept_rows: kept.length, removed_rows: rows.length - kept.length, output }, null, 2));
