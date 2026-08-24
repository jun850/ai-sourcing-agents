import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const researchDir = path.resolve('data/regional-research');
const queuePath = path.join(researchDir, 'research_queue.csv');
const rawPath = path.join(researchDir, 'raw_suppliers.jsonl');
const candidatePath = path.join(researchDir, 'crawler_candidates.jsonl');
const statePath = path.join(researchDir, 'crawler_state.json');
const userAgent = process.env.REGIONAL_CRAWLER_USER_AGENT || 'AtelixSupplierResearch/1.0 (+https://atelix.app; public-source-research)';
const delayMs = Math.max(500, Number(process.env.REGIONAL_CRAWLER_DELAY_MS || 1800));
const timeoutMs = Math.max(5000, Number(process.env.REGIONAL_CRAWLER_TIMEOUT_MS || 15000));
const maxTasks = Number(process.env.REGIONAL_CRAWLER_MAX_TASKS || 1);
const pages = Math.max(1, Number(process.env.REGIONAL_CRAWLER_PAGES || 3));
const once = process.argv.includes('--once');
const intervalMs = Math.max(30000, Number(process.env.REGIONAL_CRAWLER_INTERVAL_MS || 300000));
const countries = new Set(['Indonesia', 'Vietnam', 'Malaysia', 'Thailand']);
fs.mkdirSync(researchDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const htmlDecode = (value) => clean(value).replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const csvEscape = (value) => { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
const slugify = (value) => clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const isMarketplace = (url) => /(^|\.)(alibaba|globalsources|indotrading|made-in-china|tradekey|go4worldbusiness|thomasnet|shopee|lazada|tokopedia)\./i.test(hostOf(url));
const validUrl = (url) => { try { const parsed = new URL(url); return parsed.protocol === 'https:' && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url); } catch { return false; } };

function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i += 1; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (c === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && n === '\n') i += 1; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return { url: response.url, text: await response.text() };
}

async function search(query, page) {
  if (process.env.SERPER_API_KEY) {
    const response = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query, page: page + 1, num: 10 }), signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Serper ${response.status}`);
    const data = await response.json();
    return (data.organic || []).map((item) => ({ url: item.link, title: item.title, snippet: item.snippet || '' })).filter((item) => validUrl(item.url));
  }
  if (process.env.BING_SEARCH_V7_KEY) {
    const endpoint = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=10&offset=${page * 10}&mkt=en-US`;
    const response = await fetch(endpoint, { headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_SEARCH_V7_KEY, 'user-agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Bing ${response.status}`);
    const data = await response.json();
    return (data.webPages?.value || []).map((item) => ({ url: item.url, title: item.name, snippet: item.snippet || '' })).filter((item) => validUrl(item.url));
  }
  let html;
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${page * 30}`, { headers: { 'user-agent': userAgent, accept: 'text/html' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`DuckDuckGo ${response.status}`);
    html = await response.text();
  } catch (duckError) {
    const response = await fetch(`https://www.google.com/search?q=${encodeURIComponent(query)}&start=${page * 10}`, { headers: { 'user-agent': userAgent, accept: 'text/html' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Search providers failed: DuckDuckGo ${duckError instanceof Error ? duckError.message : duckError}; Google ${response.status}`);
    html = await response.text();
    const googleResults = [];
    for (const match of html.matchAll(/<a href="\/url\?q=([^&"]+)[^\"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
      const url = decodeURIComponent(match[1]);
      if (validUrl(url) && hostOf(url) !== 'google.com') googleResults.push({ url, title: htmlDecode(match[2].replace(/<[^>]+>/g, '')), snippet: '' });
    }
    return [...new Map(googleResults.map((item) => [item.url, item])).values()].slice(0, 10);
  }
  const results = [];
  const pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const rawUrl = htmlDecode(match[1]); let url = rawUrl;
    try { if (url.includes('uddg=')) url = new URL(url, 'https://duckduckgo.com').searchParams.get('uddg') || url; } catch {}
    if (validUrl(url)) results.push({ url, title: htmlDecode(match[2].replace(/<[^>]+>/g, '')), snippet: htmlDecode(match[3].replace(/<[^>]+>/g, '')) });
  }
  return results;
}

function jsonLd(html) {
  const values = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { values.push(JSON.parse(match[1])); } catch {}
  }
  return values.flatMap((value) => Array.isArray(value) ? value : [value]);
}
function extractPage(page, task, source) {
  const html = page.text;
  const text = clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' '));
  const structured = jsonLd(html).find((item) => item && typeof item === 'object' && (item.name || item.address || item.telephone || item.email)) || {};
  const address = structured.address && typeof structured.address === 'object' ? structured.address : {};
  const emailMatches = [...new Set((`${structured.email || ''} ${text}`.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((v) => v.toLowerCase()))].filter((v) => !/example\.|sentry|wixpress|schema\.org/.test(v));
  const phoneMatches = [...new Set((`${structured.telephone || ''} ${text}`.match(/(?:\+|00)[0-9][0-9 ()-]{7,}[0-9]|\b0[0-9][0-9 ()-]{7,}[0-9]/g) || []).map(clean))].slice(0, 5);
  const socialUrls = [...new Set((html.match(/https?:\/\/(?:www\.)?(?:instagram|facebook|linkedin|youtube|tiktok)\.com\/[A-Za-z0-9._/?=&%-]+/gi) || []).map((v) => v.replace(/["'<>].*$/, '')))].slice(0, 10);
  const city = clean(address.addressLocality || address.addressRegion || extractCity(text, task.country));
  const title = clean(structured.name || source.title || task.category);
  const companyName = title.replace(/\s*[|–—-]\s*(official|home|homepage|contact|manufacturer|supplier).*$/i, '').replace(/\s+[-|]\s+[^-|]{1,40}$/i, '').trim();
  const certificates = [...new Set((text.match(/\b(?:ISO\s*\d{4,5}(?::\d{4})?|GMP|HACCP|BRCGS|WRAP|OEKO[- ]?TEX|GOTS|SA8000|HALAL|CPKB|FDA|CE|FSC|RCS|GRS)\b/gi) || []).map(clean))].slice(0, 20);
  const moqMatch = text.match(/(?:MOQ|minimum order quantity)[^\d]{0,80}([\d,.]+\s*(?:units?|pcs?|pieces?|kg|sets?|dozen)?)/i);
  const leadMatch = text.match(/(?:lead time|production time|turnaround)[^\d]{0,60}([\d-]+\s*(?:days?|weeks?))/i);
  const orderMatch = text.match(/([\d,.]+\+?)\s*(?:orders|transactions|units sold|orders completed)/i);
  const officialSignals = /\b(?:manufacturer|factory|OEM|ODM|production|manufacturing|contact us)\b/i.test(text);
  const evidenceTier = isMarketplace(page.url) ? 'marketplace_only' : officialSignals ? 'unresolved' : 'unresolved';
  return { name: companyName || source.title || hostOf(page.url), country: task.country, city, supplier_type: typeFor(task.category), sectors: [task.category], capabilities: extractCapabilities(text), website: page.url, phone: phoneMatches[0] || '', email: emailMatches[0] || '', languages: [], moq: moqMatch ? clean(moqMatch[1]) : '', lead_time: leadMatch ? clean(leadMatch[1]) : '', certifications: certificates, order_count: orderMatch ? clean(orderMatch[1]) : '', order_count_unit: orderMatch ? 'public web claim' : '', order_count_source: orderMatch ? page.url : '', order_count_as_of: orderMatch ? new Date().toISOString().slice(0, 10) : '', social_urls: socialUrls, marketplace_urls: isMarketplace(page.url) ? [page.url] : [], evidence_tier: evidenceTier, source_urls: [page.url], source_records: [{ url: page.url, type: isMarketplace(page.url) ? 'marketplace_listing' : 'company_page_candidate', value: `${source.title || ''} ${source.snippet || ''}`.trim(), observed_at: new Date().toISOString().slice(0, 10) }], last_checked: new Date().toISOString().slice(0, 10), notes: city ? '' : 'City not found in structured address or recognized page text; retained as crawler candidate only.' };
}
function extractCity(text, country) {
  const cities = { Indonesia: ['Jakarta','Bandung','Surabaya','Tangerang','Semarang','Denpasar','Tabanan','Bekasi','Yogyakarta'], Vietnam: ['Ho Chi Minh City','Hanoi','Da Nang','Hai Phong','Binh Duong','Dong Nai','Tra Vinh','Nam Dinh'], Malaysia: ['Kuala Lumpur','Penang','George Town','Butterworth','Johor Bahru','Klang','Shah Alam','Batu Pahat','Sungai Buloh','Perai'], Thailand: ['Bangkok','Samut Prakan','Nonthaburi','Chon Buri','Chiang Mai','Nakhon Pathom','Pathum Thani'] };
  return (cities[country] || []).find((city) => new RegExp(`\\b${city.replace(/ /g, '\\s+')}\\b`, 'i').test(text)) || '';
}
function extractCapabilities(text) { return [...new Set((text.match(/\b(?:OEM|ODM|CMT|OBM|private label|custom formulation|contract manufacturing|wholesale|export|R&D|research and development)\b/gi) || []).map((v) => v.toUpperCase() === 'R&D' ? 'R&D' : v))].slice(0, 12); }
function typeFor(category) { if (/fabric|textile|yarn|shirt/i.test(category)) return 'fabric_mill'; if (/trim|button|zipper|packaging/i.test(category)) return 'accessories_supplier'; if (/beauty|cosmetic|bioactive|skincare|health/i.test(category)) return 'material_innovator'; return 'garment_manufacturer'; }

function readState() { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return { processedTasks: {}, seenUrls: {}, discovered: 0, accepted: 0, errors: [], last_activity: null }; } }
function writeState(state) { fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n'); }
function appendJsonl(file, value) { fs.appendFileSync(file, JSON.stringify(value) + '\n'); }

async function processTask(task, state) {
  const discovered = [];
  for (let page = 0; page < pages; page += 1) {
    const results = await search(task.query, page);
    for (const result of results) {
      if (state.seenUrls[result.url]) continue;
      state.seenUrls[result.url] = true;
      const candidate = { queue_id: task.queue_id, country: task.country, category: task.category, source: result, discovered_at: new Date().toISOString() };
      try {
        const pageData = await fetchText(result.url);
        const supplier = extractPage(pageData, task, result);
        candidate.supplier = supplier;
        if (supplier.city) { appendJsonl(rawPath, supplier); state.accepted += 1; } else appendJsonl(candidatePath, candidate);
      } catch (error) { candidate.error = error instanceof Error ? error.message : String(error); appendJsonl(candidatePath, candidate); }
      discovered.push(candidate); state.discovered += 1; await sleep(delayMs);
    }
    await sleep(delayMs);
  }
  if (!discovered.length) throw new Error('No search results returned. Configure SERPER_API_KEY or BING_SEARCH_V7_KEY, or retry when the public search provider is reachable.');
  return discovered.length;
}

async function runOnce() {
  if (!fs.existsSync(queuePath)) throw new Error(`Queue not found: ${queuePath}`);
  const tasks = parseCsv(fs.readFileSync(queuePath, 'utf8'));
  const state = readState();
  const pending = tasks.filter((task) => task.status === 'pending' && (!state.processedTasks[task.queue_id] || state.processedTasks[task.queue_id].status === 'error'));
  let processed = 0;
  for (const task of pending.slice(0, maxTasks)) {
    try { const count = await processTask(task, state); state.processedTasks[task.queue_id] = { status: 'searched', candidates: count, completed_at: new Date().toISOString() }; processed += 1; }
    catch (error) { state.errors = [...(state.errors || []), { queue_id: task.queue_id, message: error instanceof Error ? error.message : String(error), at: new Date().toISOString() }].slice(-100); state.processedTasks[task.queue_id] = { status: 'error', error: String(error), completed_at: new Date().toISOString() }; }
    state.last_task = task.queue_id; state.last_activity = new Date().toISOString(); writeState(state);
  }
  state.last_run = new Date().toISOString(); state.pending_tasks = tasks.filter((task) => !state.processedTasks[task.queue_id] || state.processedTasks[task.queue_id].status === 'error').length; writeState(state);
  console.log(JSON.stringify({ processed_tasks: processed, pending_tasks: state.pending_tasks, discovered: state.discovered, accepted_candidates: state.accepted, last_activity: state.last_activity }, null, 2));
}

async function main() { do { await runOnce(); if (!once) await sleep(intervalMs); } while (!once); }
main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
