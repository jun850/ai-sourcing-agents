import fs from 'node:fs/promises';
import path from 'node:path';
import {
  APPARELX_ORIGIN, businessApiUrl, clean, contactRows, extractApparelxProfileContacts, extractContacts, isCanonicalApparelx, makerApiUrl,
  makerListUrl, normalizeBusiness, normalizeMaker, officialPageMatchesMaker, sha256, toCsv,
} from './apparelx-makerlist-core.mjs';

const outputDir = path.resolve(process.argv[2] || `artifacts/apparelx-makerlist-${new Date().toISOString().slice(0, 10)}`);
const delayMs = Math.max(500, Number(process.env.APPARELX_CRAWLER_DELAY_MS || 1200));
const timeoutMs = Math.max(5_000, Number(process.env.APPARELX_CRAWLER_TIMEOUT_MS || 20_000));
const maxFallbacks = Math.max(0, Number(process.env.APPARELX_CRAWLER_MAX_FALLBACKS || 0));
const concurrency = Math.min(3, Math.max(1, Number(process.env.APPARELX_CRAWLER_CONCURRENCY || 1)));
const maxCandidates = Math.min(3, Math.max(1, Number(process.env.APPARELX_CRAWLER_MAX_CANDIDATES || 1)));
const allowWebFallback = process.env.APPARELX_CRAWLER_WEB_FALLBACK !== '0';
const userAgent = process.env.APPARELX_CRAWLER_USER_AGENT || 'AtelixSupplierResearch/1.0 (+https://atelix.app; public-source-research)';
const checkpointPath = path.join(outputDir, 'checkpoint.json');
const enrichedPath = path.join(outputDir, 'enriched-by-maker-code.json');
const rawDir = path.join(outputDir, 'raw');
const observedAt = new Date().toISOString();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchText = async (url) => {
  const response = await fetch(url, { headers: { 'user-agent': userAgent, accept: 'text/html,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return { url: response.url, text: await response.text() };
};
const validExternalUrl = (url) => { try { const parsed = new URL(url); return parsed.protocol === 'https:' && !/(^|\.)(apparel-x\.com|google\.com|bing\.com|duckduckgo\.com)$/i.test(parsed.hostname); } catch { return false; } };

async function search(query) {
  if (process.env.SERPER_API_KEY) {
    const response = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ q: query, num: 5 }), signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Serper ${response.status}`);
    return (await response.json()).organic?.map((item) => item.link).filter(validExternalUrl) || [];
  }
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`DuckDuckGo ${response.status}`);
    const html = await response.text();
    const results = [...html.matchAll(/class="result__a"[^>]+href="([^"]+)"/g)].map((match) => new URL(match[1], 'https://duckduckgo.com').searchParams.get('uddg') || match[1]).filter(validExternalUrl);
    if (results.length) return results;
  } catch { /* Google is the public fallback when DuckDuckGo is unavailable. */ }
  const response = await fetch(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Google ${response.status}`);
  const html = await response.text();
  return [...html.matchAll(/href="\/url\?q=([^&"]+)/g)].map((match) => decodeURIComponent(match[1])).filter(validExternalUrl);
}

async function enrichOfficialContact(row, { skipApparelx = false } = {}) {
  if (!skipApparelx) {
    try {
      const profile = await fetchText(row.source_url);
      if (isCanonicalApparelx(profile.url)) {
        const apparelx = extractApparelxProfileContacts(profile.text, profile.url, observedAt);
        if (apparelx.contacts.length) return { ...row, supplier: { ...row.supplier, web: /^https:\/\//.test(apparelx.website) ? apparelx.website : null, phone: apparelx.contacts.find((contact) => contact.contact_type === 'phone')?.original_value || null }, private_contacts: apparelx.contacts, provenance: [...row.provenance, { field_name: 'contact', source_url: profile.url, value_origin: 'source', observed_at: observedAt }] };
      }
    } catch { /* A missing ApparelX profile remains eligible for public-web fallback. */ }
  }
  if (!allowWebFallback) return row;
  const outline = row.source.business_outline ? ` ${row.source.business_outline}` : '';
  const results = await search(`${row.supplier.name}${outline} official contact`).catch(() => []);
  for (const candidate of results.slice(0, maxCandidates)) {
    await wait(delayMs);
    try {
      const page = await fetchText(candidate);
      if (!validExternalUrl(page.url) || !officialPageMatchesMaker(page.text, row.supplier.name)) continue;
      const contacts = contactRows(extractContacts(page.text), page.url, observedAt);
      if (contacts.length) return { ...row, supplier: { ...row.supplier, web: page.url, phone: contacts.find((contact) => contact.contact_type === 'phone')?.original_value || null }, private_contacts: contacts, provenance: [...row.provenance, { field_name: 'contact', source_url: page.url, value_origin: 'source', observed_at: observedAt }] };
    } catch { /* Candidate failures remain in the run report, not supplier facts. */ }
  }
  return row;
}

function importPayload(row) {
  return { source_system: row.source_system, source_record_id: row.source_record_id, source_url: row.source_url, supplier: row.supplier, private_contacts: row.private_contacts, provenance: row.provenance };
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });
  const checkpoint = await fs.readFile(checkpointPath, 'utf8').then(JSON.parse).catch(() => ({ completed_codes: [], web_completed_codes: [] }));
  checkpoint.web_completed_codes ||= [];
  const enrichedByCode = await fs.readFile(enrichedPath, 'utf8').then(JSON.parse).catch(() => ({}));
  const listPage = await fetchText(makerListUrl);
  if (!isCanonicalApparelx(listPage.url)) throw new Error('Maker list redirected outside canonical ApparelX.');
  const makerIndex = await fetchText(makerApiUrl);
  if (!isCanonicalApparelx(makerIndex.url)) throw new Error('Maker API redirected outside canonical ApparelX.');
  const makers = JSON.parse(makerIndex.text);
  if (!Array.isArray(makers) || !makers.length) throw new Error('Maker API did not return a non-empty JSON array.');
  const businesses = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchText(businessApiUrl(page));
    if (!isCanonicalApparelx(response.url)) throw new Error('Business API redirected outside canonical ApparelX.');
    const records = JSON.parse(response.text);
    if (!Array.isArray(records)) throw new Error('Business API did not return an array.');
    businesses.push(...records);
    if (records.length < 100) break;
    await wait(delayMs);
  }
  await fs.writeFile(path.join(rawDir, 'makerlist.html'), listPage.text);
  await fs.writeFile(path.join(rawDir, 'makers.json'), JSON.stringify(makers, null, 2) + '\n');
  await fs.writeFile(path.join(rawDir, 'businesses.json'), JSON.stringify(businesses, null, 2) + '\n');
  const makerIndexRows = makers.map((maker) => {
    try { return normalizeMaker(maker, observedAt); } catch { return null; }
  }).filter(Boolean);
  const rejected = [];
  const rows = [];
  for (const business of businesses) {
    try { rows.push(normalizeBusiness(business, observedAt)); } catch (error) { rejected.push({ business, error: error instanceof Error ? error.message : String(error) }); }
  }
  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.source_record_id)) rejected.push({ maker: row.source, error: `Duplicate ApparelX maker code ${row.source_record_id}` });
    else seen.set(row.source_record_id, row);
  }
  const normalized = [...seen.values()];
  for (let index = 0; index < normalized.length; index += 1) {
    const enriched = enrichedByCode[normalized[index].source_record_id];
    if (enriched?.private_contacts) normalized[index] = { ...normalized[index], ...enriched, source: normalized[index].source };
  }
  const pending = allowWebFallback
    ? normalized.filter((row) => !row.private_contacts.length && !checkpoint.web_completed_codes.includes(row.source_record_id))
    : normalized.filter((row) => !checkpoint.completed_codes.includes(row.source_record_id));
  const candidates = pending.slice(0, maxFallbacks);
  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const group = candidates.slice(offset, offset + concurrency);
    const resolved = await Promise.all(group.map((row) => enrichOfficialContact(row, { skipApparelx: allowWebFallback && checkpoint.completed_codes.includes(row.source_record_id) })));
    for (const row of resolved) {
      const index = normalized.findIndex((candidate) => candidate.source_record_id === row.source_record_id);
      normalized[index] = row;
      enrichedByCode[row.source_record_id] = { supplier: row.supplier, private_contacts: row.private_contacts, provenance: row.provenance };
      checkpoint.completed_codes = [...new Set([...checkpoint.completed_codes, row.source_record_id])];
      if (allowWebFallback) checkpoint.web_completed_codes = [...new Set([...checkpoint.web_completed_codes, row.source_record_id])];
    }
    await fs.writeFile(enrichedPath, JSON.stringify(enrichedByCode, null, 2) + '\n');
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
    if (offset + concurrency < candidates.length) await wait(delayMs);
  }
  const importable = normalized.filter((row) => row.private_contacts.length > 0);
  const supplierHeaders = ['source_system','source_record_id','name','company','business_outline','supplier_type','region','city','source_url','official_website','contact_available','contact_count','observed_at','verify_state'];
  await fs.writeFile(path.join(outputDir, 'apparelx_manufacturers_normalized.csv'), toCsv(supplierHeaders, normalized.map((row) => [row.source_system,row.source_record_id,row.supplier.name,row.source.company,row.source.business_outline,row.supplier.type,row.supplier.region,row.supplier.loc,row.source_url,row.supplier.web,row.private_contacts.length ? 'yes' : 'no',row.private_contacts.length,observedAt,'pending'])));
  await fs.writeFile(path.join(outputDir, 'apparelx_maker_index.csv'), toCsv(supplierHeaders, makerIndexRows.map((row) => [row.source_system,row.source_record_id,row.supplier.name,row.source.company,row.source.business_outline,row.supplier.type,row.supplier.region,row.supplier.loc,row.source_url,row.supplier.web,'no',0,observedAt,'pending'])));
  await fs.writeFile(path.join(outputDir, 'apparelx_manufacturer_contacts_private.csv'), toCsv(['source_record_id','supplier_name','contact_type','normalized_value','source_url','validation_status','observed_at'], normalized.flatMap((row) => row.private_contacts.map((contact) => [row.source_record_id,row.supplier.name,contact.contact_type,contact.normalized_value,contact.source_url,contact.validation_status,observedAt]))));
  await fs.writeFile(path.join(outputDir, 'rejected_rows.json'), JSON.stringify(rejected, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'normalized.jsonl'), normalized.map((row) => JSON.stringify(importPayload(row))).join('\n') + '\n');
  await fs.mkdir(path.join(outputDir, 'import_batches'), { recursive: true });
  for (let index = 0; index < importable.length; index += 50) await fs.writeFile(path.join(outputDir, 'import_batches', `batch-${String(index / 50 + 1).padStart(4, '0')}.jsonl`), importable.slice(index, index + 50).map((row) => JSON.stringify(importPayload(row))).join('\n') + '\n');
  const report = { source: { list_page: makerListUrl, maker_index_api: makerApiUrl, business_api: businessApiUrl(1), business_api_sha256: sha256(JSON.stringify(businesses)) }, observed_at: observedAt, maker_index_listed: makers.length, total_listed: businesses.length, normalized: normalized.length, rejected: rejected.length, contact_backed: importable.length, fallback_attempted: allowWebFallback ? candidates.length : 0, remaining_fallbacks: allowWebFallback ? Math.max(0, pending.length - maxFallbacks) : normalized.filter((row) => !row.private_contacts.length).length, concurrency, max_candidates_per_maker: maxCandidates, import_state: 'pending_review_only' };
  await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ outputDir, ...report }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
