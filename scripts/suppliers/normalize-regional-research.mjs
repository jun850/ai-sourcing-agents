import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2] || 'data/regional-research/raw_suppliers.jsonl';
const outDir = path.resolve(process.argv[3] || 'data/regional-research/normalized');
const countries = new Set(['Indonesia', 'Vietnam', 'Malaysia', 'Thailand']);
const tiers = new Set(['official_company', 'corroborated_marketplace', 'marketplace_only', 'unresolved']);
const classifications = new Set(['Top Company', 'Rising Star', 'Family Owned']);
const allowedTypes = new Set(['fabric_mill', 'oem_factory', 'garment_manufacturer', 'trim_supplier', 'accessories_supplier', 'yarn_supplier', 'textile_trading_company', 'material_innovator']);
fs.mkdirSync(outDir, { recursive: true });

const clean = (value) => value == null ? '' : String(value).trim();
const list = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value).split(/[|;]/).map((v) => v.trim()).filter(Boolean);
const slugify = (value) => clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const identity = (row) => `${clean(row.country).toLowerCase()}::${slugify(row.canonical_name || row.name)}`;
const esc = (value) => { const s = clean(value); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
const writeCsv = (file, headers, rows) => fs.writeFileSync(path.join(outDir, file), [headers, ...rows].map((row) => row.map(esc).join(',')).join('\n') + '\n');
const tierRank = { official_company: 4, corroborated_marketplace: 3, marketplace_only: 2, unresolved: 1 };

if (!fs.existsSync(input)) {
  fs.writeFileSync(input, '');
  console.error(`Input file not found; created empty research input at ${input}.`);
  process.exit(2);
}
const raw = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return { value: JSON.parse(line), line: index + 1 }; } catch { return { error: 'invalid_json', line: index + 1 }; }
});
const rejected = [], grouped = new Map();
for (const item of raw) {
  if (item.error) { rejected.push([item.line, item.error, '']); continue; }
  const row = item.value || {};
  const errors = [];
  if (!clean(row.name)) errors.push('name required');
  if (!countries.has(clean(row.country))) errors.push('country must be Indonesia, Vietnam, Malaysia, or Thailand');
  if (!clean(row.city)) errors.push('city required for canonical supplier row');
  if (!tiers.has(clean(row.evidence_tier))) errors.push('invalid evidence_tier');
  if (row.classification_label && !classifications.has(clean(row.classification_label))) errors.push('unsupported classification_label');
  if (row.supplier_type && !allowedTypes.has(clean(row.supplier_type))) errors.push('invalid supplier_type');
  const sources = list(row.source_urls || row.source_url);
  if (!sources.length || sources.some((url) => !/^https:\/\//i.test(url))) errors.push('at least one https source URL required');
  if (errors.length) { rejected.push([item.line, errors.join('; '), clean(row.name)]); continue; }
  const normalized = {
    slug: slugify(`${row.country}-${row.canonical_name || row.name}`), name: clean(row.name), local_name: clean(row.local_name), country: clean(row.country), city: clean(row.city), additional_cities: list(row.additional_cities), supplier_type: clean(row.supplier_type) === 'oem_factory' ? 'garment_manufacturer' : clean(row.supplier_type) || 'garment_manufacturer', sectors: list(row.sectors), capabilities: list(row.capabilities), website: clean(row.website), phone: clean(row.phone), email: clean(row.email), languages: list(row.languages), moq: clean(row.moq), lead_time: clean(row.lead_time), certifications: list(row.certifications), order_count: clean(row.order_count), order_count_unit: clean(row.order_count_unit), order_count_source: clean(row.order_count_source), order_count_as_of: clean(row.order_count_as_of), social_urls: list(row.social_urls), marketplace_urls: list(row.marketplace_urls), classification_label: clean(row.classification_label), evidence_tier: clean(row.evidence_tier), contact_status: row.email || row.phone ? 'public_contact_found' : 'not_found_in_checked_sources', source_urls: sources, last_checked: clean(row.last_checked) || '2026-08-24', notes: clean(row.notes), source_records: Array.isArray(row.source_records) ? row.source_records : []
  };
  const key = identity(normalized), existing = grouped.get(key);
  if (!existing || tierRank[normalized.evidence_tier] > tierRank[existing.evidence_tier]) grouped.set(key, normalized);
  else if (existing) {
    for (const field of ['website','phone','email','moq','lead_time','order_count','order_count_unit','order_count_source','order_count_as_of','classification_label']) if (!existing[field] && normalized[field]) existing[field] = normalized[field];
    for (const field of ['additional_cities','sectors','capabilities','languages','certifications','social_urls','marketplace_urls','source_urls']) existing[field] = [...new Set([...(existing[field] || []), ...(normalized[field] || [])])];
    existing.source_records = [...existing.source_records, ...normalized.source_records];
  }
}
const rows = [...grouped.values()].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
const coreHeaders = ['slug','name','local_name','country','city','additional_cities','supplier_type','sectors','capabilities','website','phone','email','languages','moq','lead_time','certifications','order_count','order_count_unit','order_count_source','order_count_as_of','social_urls','marketplace_urls','classification_label','evidence_tier','contact_status','source_count','source_urls','last_checked','verify_state','notes'];
writeCsv('regional_suppliers_normalized.csv', coreHeaders, rows.map((r) => [r.slug,r.name,r.local_name,r.country,r.city,r.additional_cities.join('|'),r.supplier_type,r.sectors.join('|'),r.capabilities.join('|'),r.website,r.phone,r.email,r.languages.join('|'),r.moq,r.lead_time,r.certifications.join('|'),r.order_count,r.order_count_unit,r.order_count_source,r.order_count_as_of,r.social_urls.join('|'),r.marketplace_urls.join('|'),r.classification_label,r.evidence_tier,r.contact_status,r.source_urls.length,r.source_urls.join('|'),r.last_checked,'pending',r.notes]));
writeCsv('regional_supplier_contacts.csv', ['supplier_slug','supplier_name','country','city','email','phone','website','social_urls','marketplace_urls','languages','contact_status'], rows.map((r) => [r.slug,r.name,r.country,r.city,r.email,r.phone,r.website,r.social_urls.join('|'),r.marketplace_urls.join('|'),r.languages.join('|'),r.contact_status]));
writeCsv('regional_supplier_evidence.csv', ['supplier_slug','supplier_name','country','city','evidence_tier','source_url','source_type','source_value','observed_at','notes'], rows.flatMap((r) => r.source_records.length ? r.source_records.map((s) => [r.slug,r.name,r.country,r.city,r.evidence_tier,clean(s.url) || r.source_urls[0],clean(s.type),clean(s.value),clean(s.observed_at) || r.last_checked,clean(s.notes)]) : r.source_urls.map((url) => [r.slug,r.name,r.country,r.city,r.evidence_tier,url,'web','','',r.notes])));
writeCsv('rejected_rows.csv', ['input_line','reason','name'], rejected);
const batchDir = path.join(outDir, 'import_batches'); fs.mkdirSync(batchDir, { recursive: true });
rows.forEach((r, index) => {
  const batch = Math.floor(index / 50) + 1, file = path.join(batchDir, `batch-${String(batch).padStart(4, '0')}.jsonl`);
  const payload = { source_system: 'regional_web', source_record_id: r.slug, source_url: r.source_urls[0], supplier: { slug: r.slug, name: r.name, type: r.supplier_type, region: r.country, city: r.city, loc: r.city, verify_state: 'pending', moq: r.moq || null, lead: r.lead_time || null, certs: r.certifications, tags: [...new Set([...r.sectors, ...r.capabilities])], phone: r.phone || null, web: r.website || null, bio: r.notes || null }, provenance: r.source_urls.map((url) => ({ field_name: 'supplier', source_url: url, value_origin: 'source', observed_at: r.last_checked })) };
  fs.appendFileSync(file, JSON.stringify(payload) + '\n');
});
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ input, generated_at: new Date().toISOString(), input_rows: raw.length, accepted_unique_companies: rows.length, rejected_rows: rejected.length, batches: Math.ceil(rows.length / 50), countries: Object.fromEntries([...countries].map((country) => [country, rows.filter((r) => r.country === country).length])) }, null, 2) + '\n');
console.log(JSON.stringify({ accepted: rows.length, rejected: rejected.length, batches: Math.ceil(rows.length / 50), outDir }, null, 2));
