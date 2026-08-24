import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('data/regional-research');
fs.mkdirSync(outDir, { recursive: true });
const countries = [
  ['Indonesia', 'Indonesia supplier manufacturer OEM wholesale'],
  ['Vietnam', 'Vietnam supplier manufacturer OEM wholesale'],
  ['Malaysia', 'Malaysia supplier manufacturer OEM wholesale'],
  ['Thailand', 'Thailand supplier manufacturer OEM wholesale'],
];

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i += 1; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (c === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && n === '\n') i += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ''])));
}

const source = fs.readFileSync(path.resolve('data/normalized/suppliers_factories_import.csv'), 'utf8');
const categories = [...new Set(parseCsv(source).map((row) => String(row.tags || '').replace(/^\{|\}$/g, '').trim()).filter(Boolean))].sort();
const rows = [['queue_id','country','category','target_records','query','status','notes']];
for (const [country, prefix] of countries) {
  for (const category of categories) {
    rows.push([`${country.toLowerCase()}-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, country, category, '50', `${prefix} ${category} official website contact MOQ lead time certification`, 'pending', 'Use official sites, registries, trade associations, marketplaces, and social channels. Deduplicate before counting.']);
  }
}
const csv = rows.map((row) => row.map((v) => /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v).join(',')).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'research_queue.csv'), csv);
fs.writeFileSync(path.join(outDir, 'README.md'), `# Regional supplier research\n\nTarget: 10,000 unique companies across Indonesia, Vietnam, Malaysia, and Thailand, covering the categories represented by the existing normalized supplier cards.\n\nThe queue allocates 50 research targets per country/category combination. Records are deduplicated globally by canonical company identity and remain in tiered evidence states until review.\n\nInput for the normalizer: raw_suppliers.jsonl. Each line must contain a supplier object plus at least one https source URL. Blank facts are allowed; invented facts are not.\n`);
console.log(`Wrote ${rows.length - 1} research queue tasks across ${categories.length} categories.`);
