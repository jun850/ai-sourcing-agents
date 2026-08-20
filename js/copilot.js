/* Atelix Athelia — deterministic intelligence over the live catalog.
   LLM-ready: define window.ARCANA_LLM = async ({text,intent,matches}) => ({summary, matches})
   and ask() will await it, falling back to the mock engine on error/omission.
   Depends on window.ARCANA_PRODUCTS / _FACTORY_BY_NAME / _FACTORY_MAP (data.js). */
(function(){
'use strict';

const LSKEY = 'arcana_brief';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const textValue = value => String(value ?? '');

/* ---------- vocabulary ---------- */
const CATS = [
  {cat:'oem',         re:/\boem\b|private[ -]?label|cut\s*&?\s*sew|full[ -]?package|sampling|dyeing|colou?r[ -]?match/},
  {cat:'trims',       re:/\bribbon|elastic|\btape\b|\blace\b|\btrims?\b|binding|\bcord\b|grosgrain/},
  {cat:'accessories', re:/\bzipper|\bbutton|\blabels?\b|\bhook|rivet|buckle|\baccessor/},
  {cat:'yarns',       re:/\byarns?\b|\bsewing\s+thread\b|\bembroidery\s+thread\b|filament|\bply\b|\bne\s?\d/},
  {cat:'fabrics',     re:/\bfabric|jersey|twill|denim|satin|fleece|canvas|chambray|flannel|woven|\bknit|taslan|suiting|\blawn\b/},
];
const MATERIALS = [
  {k:'organic cotton',    re:/organic\s*cotton/,          comp:'organic cotton'},
  {k:'recycled polyester',re:/recycled\s*poly\w*|\brpet\b/,comp:'recycled polyester'},
  {k:'merino wool',       re:/merino/,                    comp:'merino'},
  {k:'cotton',            re:/\bcotton\b/,                comp:'cotton'},
  {k:'linen',             re:/\blinen\b/,                 comp:'linen'},
  {k:'polyester',         re:/\bpoly(ester)?\b/,          comp:'polyester'},
  {k:'nylon',             re:/\bnylon\b/,                 comp:'nylon'},
  {k:'wool',              re:/\bwool\b/,                  comp:'wool'},
  {k:'viscose',           re:/\bviscose\b|\brayon\b/,     comp:'viscose'},
  {k:'spandex',           re:/\bspandex\b|\belastane\b/,  comp:'spandex'},
  {k:'silk',              re:/\bsilk\b/,                  comp:'silk'},
];
const CERTS = [
  {k:'GOTS',      re:/\bgots\b/},
  {k:'Oeko-Tex',  re:/oeko[\s-]?tex/},
  {k:'GRS',       re:/\bgrs\b|global recycled/},
  {k:'ISO 9001',  re:/\biso\s*9001\b/},
  {k:'WRAP',      re:/\bwrap\b/},
  {k:'bluesign',  re:/bluesign/},
];
const REGIONS = ['Guangdong','Zhejiang','Jiangsu','Shandong','Tirupur','Tamil Nadu','Tokyo','China','Japan','India','Indonesia','Vietnam','Turkey','Bangladesh','Pakistan','South Korea','Taiwan','Thailand','Italy','Portugal','United States'];
const STOP = new Set('a an the for with and or of to in on need want looking source sourcing me my our i we that this fabric fabrics material materials please find get some any under over below within around about'.split(' '));

/* ---------- parse plain-English brief → structured intent ---------- */
function parse(text){
  const t = ' ' + String(text||'').toLowerCase() + ' ';
  const intent = {text:String(text||'').trim(), cat:null, materials:[], gsm:null, priceMax:null,
    moqMax:null, lowMoq:false, leadMax:null, fastLead:false, certs:[], region:null, oem:false, keywords:[]};

  for(const c of CATS){ if(c.re.test(t)){ intent.cat=c.cat; break; } }
  for(const m of MATERIALS){ if(m.re.test(t) && !intent.materials.includes(m.comp)) intent.materials.push(m.comp); }
  // organic/recycled cotton/poly shouldn't also double-count the plain fibre
  if(intent.materials.includes('organic cotton')) intent.materials = intent.materials.filter(x=>x!=='cotton');

  let m;
  if((m = t.match(/(\d{2,4})\s*(?:–|-|to)\s*(\d{2,4})\s*g(?:sm|\/?m2?)/))) intent.gsm = {min:+m[1], max:+m[2]};
  else if((m = t.match(/(\d{2,4})\s*gsm/))) { const v=+m[1]; intent.gsm={min:v-40, max:v+40, target:v}; }

  if((m = t.match(/(?:under|below|less than|max|up to|<=?|≤|cheaper than)\s*\$?\s*(\d+(?:\.\d+)?)/))) intent.priceMax=+m[1];
  else if((m = t.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:\/|per\b)/))) intent.priceMax=+m[1];

  if((m = t.match(/moq[^\d]{0,8}(\d[\d,]*)/))) intent.moqMax=+m[1].replace(/,/g,'');
  else if((m = t.match(/(?:under|below|<=?|≤|max|up to)\s*(\d[\d,]*)\s*(?:m|meters?|metres?|pcs?|pieces?|kg|units?)\b/))) intent.moqMax=+m[1].replace(/,/g,'');
  if(/\blow\s*moq\b|small\s*(?:moq|order|batch|minimum|run)|low\s*minimum/.test(t)) intent.lowMoq=true;

  if((m = t.match(/(?:lead\s*(?:time)?[^\d]{0,8}|within\s*|in\s*)(\d+)\s*days?/))) intent.leadMax=+m[1];
  if(/\bfast\b|\bquick\b|urgent|rush|short\s*lead|tight\s*deadline/.test(t)) intent.fastLead=true;

  for(const c of CERTS){ if(c.re.test(t)) intent.certs.push(c.k); }
  for(const r of REGIONS){ if(t.includes(r.toLowerCase())){ intent.region=r; break; } }
  if(/\boem\b|private[ -]?label|full[ -]?package|white[ -]?label|manufactur/.test(t)) intent.oem=true;

  intent.keywords = (String(text||'').toLowerCase().match(/[a-z][a-z-]{2,}/g)||[])
    .filter(w=>!STOP.has(w)).slice(0,12);
  return intent;
}

/* ---------- resolvers over catalog data ---------- */
function factoryOf(p){
  const map = window.ARCANA_FACTORY_BY_NAME||{}, fmap = window.ARCANA_FACTORY_MAP||{};
  const fid = map[p && p.seller]; if(fid && fmap[fid]) return fmap[fid];
  // fuzzy: match on shared token (e.g. "Greenknit")
  const key = textValue(p && p.seller).toLowerCase();
  for(const f of (window.ARCANA_FACTORIES||[])){
    const fn = textValue(f && f.name).toLowerCase();
    if(key && fn && (fn.split(/\s|,/).some(w=>w.length>4 && key.includes(w)))) return f;
  }
  return null;
}
function gsmOf(p){
  const nums = (textValue(p && p.spec).match(/\d{2,4}/g)||[]).map(Number).filter(n=>n>=40 && n<=1000);
  if(!nums.length) return null;
  return {min:Math.min(...nums), max:Math.max(...nums)};
}
const moqNum = s => parseInt(String(s).replace(/[^\d]/g,''),10) || 0;
function leadDaysMax(f){ const lead=textValue(f && f.lead); if(!lead) return null; const n=(lead.match(/\d+/g)||[]).map(Number); return n.length?Math.max(...n):null; }
const matLabel = c => textValue(c).replace(/\b\w/g,x=>x.toUpperCase());

/* ---------- score one product against an intent ---------- */
function scoreProduct(p, intent){
  if(!p || typeof p !== 'object') return null;
  if(intent.cat && p.cat !== intent.cat) return null;
  const comp = textValue(p.comp), compLower = comp.toLowerCase();
  const spec = textValue(p.spec), loc = textValue(p.loc);
  const price = Number(p.price) || 0;
  const f = factoryOf(p);
  const hits = [], miss = [];
  let matched = 0, total = 0;
  const add = (ok, hitLabel, missLabel) => { total++; if(ok){ matched++; hits.push(hitLabel); } else if(missLabel){ miss.push(missLabel); } };

  if(intent.materials.length){
    const hit = intent.materials.find(mm => compLower.includes(textValue(mm).toLowerCase()));
    add(!!hit, `${matLabel(hit||intent.materials[0])} ✓`, `Not ${matLabel(intent.materials[0])}`);
  }
  if(intent.gsm){
    const g = gsmOf(p);
    const ok = g && g.max >= intent.gsm.min && g.min <= intent.gsm.max;
    add(!!ok, `${spec} in range`, `${spec||'GSM n/a'} vs ${intent.gsm.min}–${intent.gsm.max}`);
  }
  if(intent.priceMax != null){
    add(price>0 && price<=intent.priceMax, `$${price.toFixed(2)} ≤ $${intent.priceMax}`, price>0?`$${price.toFixed(2)} over budget`:`Quote only`);
  }
  if(intent.moqMax != null){
    add(moqNum(p.moq) <= intent.moqMax, `MOQ ${p.moq} ≤ ${intent.moqMax}`, `MOQ ${p.moq} over`);
  } else if(intent.lowMoq){
    add(moqNum(p.moq) <= 300, `Low MOQ · ${p.moq}`, `MOQ ${p.moq}`);
  }
  if(intent.leadMax != null){
    const l = leadDaysMax(f);
    add(l != null && l <= intent.leadMax, `Lead ≤ ${intent.leadMax}d`, l!=null?`Lead ~${l}d`:null);
  } else if(intent.fastLead){
    const l = leadDaysMax(f);
    add(l != null && l <= 14, l!=null?`Fast lead ~${l}d`:'', l!=null?`Lead ~${l}d`:null);
  }
  intent.certs.forEach(c => {
    const has = f && Array.isArray(f.certs) && f.certs.some(fc => textValue(fc).toLowerCase().includes(textValue(c).toLowerCase()));
    add(!!has, `${c} ✓`, `No ${c} on file`);
  });
  if(intent.region){
    add(loc.toLowerCase().includes(intent.region.toLowerCase()), `${intent.region} ✓`, loc);
  }
  if(intent.oem){
    add(p.badge==='oem'||p.badge==='recycle'||p.cat==='oem', `OEM-ready`, `Non-OEM`);
  }

  // relevance from keywords + material presence (drives ranking when few hard constraints)
  const hay = `${textValue(p.name)} ${comp} ${spec}`.toLowerCase();
  let rel = 0;
  intent.keywords.forEach(k => { if(hay.includes(k)) rel += 1; });
  if(intent.materials.some(mm => compLower.includes(textValue(mm).toLowerCase()))) rel += 2;
  const relN = Math.min(1, rel/5);

  const verified = f ? !!f.verified : true;
  const base = total ? matched/total : 0;
  // 70% constraint satisfaction + 20% relevance + 10% trust
  let sc = Math.round((total ? base*0.7 : 0.5) * 100 + relN*20 + (verified?10:0));
  sc = Math.max(0, Math.min(100, sc));

  if(verified) hits.push('Verified');
  return {p, f, score:sc, hits, miss, matched, total, verified, rel};
}

/* ---------- rank whole catalog ---------- */
function match(intent, opts){
  opts = opts||{};
  const pool = opts.pool || window.ARCANA_PRODUCTS || [];
  let out = pool.map(p => scoreProduct(p, intent)).filter(Boolean);
  // An explicit brief constraint is a gate, not a "close enough" suggestion.
  // This prevents the LLM from receiving a product that it would have to
  // explain away (for example an over-budget fabric or a supplier in a
  // different requested country). If nothing clears the gates, the caller
  // enters the honest no-match/research path instead.
  const meetsHardConstraints = r => {
    const p=r.p, f=r.f, comp=textValue(p.comp).toLowerCase(), loc=`${textValue(p.loc)} ${textValue(p.country)} ${textValue(f&&f.region)} ${textValue(f&&f.loc)}`.toLowerCase();
    if(intent.materials.length && !intent.materials.some(material=>comp.includes(textValue(material).toLowerCase()))) return false;
    if(intent.gsm){ const g=gsmOf(p); if(!g || g.max<intent.gsm.min || g.min>intent.gsm.max) return false; }
    if(intent.priceMax!=null && !(Number(p.price)>0 && Number(p.price)<=intent.priceMax)) return false;
    if(intent.moqMax!=null && !(moqNum(p.moq)<=intent.moqMax)) return false;
    if(intent.lowMoq && !(moqNum(p.moq)<=300)) return false;
    if(intent.leadMax!=null){ const days=leadDaysMax(f); if(days==null || days>intent.leadMax) return false; }
    if(intent.fastLead){ const days=leadDaysMax(f); if(days==null || days>14) return false; }
    if(intent.certs.length && !intent.certs.every(cert=>f&&Array.isArray(f.certs)&&f.certs.some(value=>textValue(value).toLowerCase().includes(textValue(cert).toLowerCase())))) return false;
    if(intent.region && !loc.includes(intent.region.toLowerCase())) return false;
    if(intent.oem && !(p.cat==='oem'||p.badge==='oem')) return false;
    return true;
  };
  out = out.filter(meetsHardConstraints);
  // when no hard constraints, keep only relevant ones so results feel intentional
  const hardConstraints = intent.materials.length || intent.gsm || intent.priceMax!=null ||
    intent.moqMax!=null || intent.lowMoq || intent.leadMax!=null || intent.certs.length || intent.region || intent.oem;
  if(!intent.cat && !hardConstraints){
    out = out.filter(r => r.rel > 0);
  }
  out.sort((a,b) => b.score - a.score || String(a.p.name).localeCompare(String(b.p.name)));
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/* ---------- deterministic price benchmark / margin engine ----------
   The "safeguard": every number an agent quotes about pricing is computed
   HERE, over the live catalog (window.ARCANA_PRODUCTS, hydrated from the DB),
   never invented by the LLM. The LLM only narrates the object these return. */
const MIN_SAMPLE = 4; // below this, a "benchmark" isn't trustworthy — say so.

const fabricPriceUSD = p => Number(p && p.price) || 0;
function fabricPriceJPY(p){
  const direct = p && p.catalogPrices && Number(p.catalogPrices.JPY);
  if(Number.isFinite(direct) && direct > 0) return direct;
  if(typeof window.ATELIX_productAmount === 'function'){
    const v = Number(window.ATELIX_productAmount(p, 1, 'ja'));
    if(Number.isFinite(v) && v > 0) return v;
  }
  const fx = (window.ARCANA_FX && window.ARCANA_FX.ja) || { rate:150 };
  return fabricPriceUSD(p) * (Number(fx.rate) || 150);
}

function priceStats(nums){
  const a = nums.filter(n => Number.isFinite(n) && n > 0).sort((x,y) => x - y);
  const n = a.length;
  if(!n) return null;
  const q = f => { const i = (n-1)*f, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi]-a[lo])*(i-lo); };
  return { n, min:a[0], max:a[n-1], median:q(0.5), avg:a.reduce((s,x)=>s+x,0)/n, p25:q(0.25), p75:q(0.75) };
}

/* products comparable to the intent: same material (matched on comp) and, when
   given, same category — restricted to one unit so we never mix $/m with $/kg. */
function comparablePool(intent, unit){
  const mats = (intent && intent.materials) || [];
  return (window.ARCANA_PRODUCTS || []).filter(p => {
    if(!p || typeof p !== 'object') return false;
    if(intent && intent.cat && p.cat !== intent.cat) return false;
    if(unit && (p.unit || 'unit') !== unit) return false;
    if(mats.length){
      const comp = textValue(p.comp).toLowerCase();
      return mats.some(m => comp.includes(textValue(m).toLowerCase()));
    }
    return true;
  });
}

// comparable AND actually priced — quote-only SKUs (price 0) can't benchmark.
function pricedPool(intent, unit){
  return comparablePool(intent, unit).filter(p => fabricPriceUSD(p) > 0);
}

// dominant unit among the priced comparable set, so the benchmark is apples-to-apples
function dominantUnit(intent){
  const counts = {};
  comparablePool(intent).forEach(p => { if(fabricPriceUSD(p) <= 0) return; const u = p.unit || 'unit'; counts[u] = (counts[u]||0)+1; });
  return Object.keys(counts).sort((a,b) => counts[b] - counts[a])[0] || 'm';
}

function priceBenchmark(intent){
  const unit = dominantUnit(intent);
  const items = pricedPool(intent, unit);
  const label = (intent.materials||[]).map(matLabel).join(' / ') || (intent.cat || 'catalog');
  if(items.length < MIN_SAMPLE) return { n: items.length, unit, label, insufficient: true };
  return { n: items.length, unit, label,
    usd: priceStats(items.map(fabricPriceUSD)),
    jpy: priceStats(items.map(fabricPriceJPY)) };
}

// % of priced comparable peers priced BELOW this product (0 = cheapest, 100 = priciest)
function percentileOf(product, intent){
  const unit = product.unit || dominantUnit(intent);
  const pool = pricedPool(intent, unit);
  if(pool.length < MIN_SAMPLE) return null;
  const price = fabricPriceUSD(product);
  const below = pool.filter(p => fabricPriceUSD(p) < price).length;
  return Math.round((below / pool.length) * 100);
}

/* Frame a fabric's price against a resale price. Deliberately NOT a gross-margin
   claim: with no per-garment fabric usage we only compute the material cost of
   ONE priced unit (e.g. 1 m) as a share of one piece's resale price, plus where
   the fabric sits vs. peers. resaleCurrency defaults to JPY. */
function resaleContext(opts){
  opts = opts || {};
  const product = opts.product; if(!product) return null;
  const intent = opts.intent || parse(`${textValue(product.comp)} ${textValue(product.name)}`);
  const benchmark = priceBenchmark(intent);
  const pct = percentileOf(product, intent);
  const fx = (window.ARCANA_FX && window.ARCANA_FX.ja) || { rate:150 };
  let resaleJPY = Number(opts.resaleAmount) || 0;
  const cur = String(opts.resaleCurrency || 'JPY').toUpperCase();
  if(cur === 'USD') resaleJPY = resaleJPY * (Number(fx.rate) || 150);
  const fabricJPY = fabricPriceJPY(product);
  const fabricUSD = fabricPriceUSD(product);
  let verdict = 'typical';
  if(pct != null){ if(pct >= 75) verdict = 'premium'; else if(pct <= 30) verdict = 'value'; }
  return {
    product: { id: product.id, name: product.name, seller: product.seller, unit: product.unit || 'unit', usd: fabricUSD, jpy: fabricJPY },
    benchmark, percentile: pct, verdict,
    resaleJPY: resaleJPY || null,
    // material cost of ONE priced unit vs one piece's resale price (labelled per-unit, not margin)
    perUnitShare: (resaleJPY > 0) ? fabricJPY / resaleJPY : null
  };
}

/* ---------- classify a turn: what does the user want? ---------- */
// Each sub-intent is its own regex so a chained follow-up ("add 10 more",
// "remove it", "make it 200") routes to the deterministic action handler
// instead of falling through to the LLM chat turn, which can only narrate —
// it has no way to actually mutate the cart/wishlist.
const UNIT_RE = '(?:m|meters?|metres?|kg|units?|pcs?|pieces?)';
const CHECKOUT_RE = /\b(check\s*out|checkout|proceed\s+to\s+(?:checkout|pay)|pay\s+now|place\s+(?:the\s+)?order|buy\s+it\s+now|purchase)\b/i;
const QTY_SET_RE = /\b(?:set|change|update)\s+(?:the\s+)?(?:qty|quantity)\b[\s\S]{0,40}?\bto\s+(\d[\d,]*)\b|\bmake\s+it\s+(\d[\d,]*)\b|\b(?:decrease|reduce)\b[\s\S]{0,40}?\bto\s+(\d[\d,]*)\b/i;
const QTY_DECREASE_RE = new RegExp(`\\b(decrease|reduce)\\b|\\btake\\s+\\d[\\d,]*\\s*${UNIT_RE}?\\s+off\\b|\\bremove\\s+\\d[\\d,]*\\s*${UNIT_RE}\\b|\\b\\d[\\d,]*\\s*(?:less|fewer)\\b|\\bminus\\s+\\d`, 'i');
const CART_REMOVE_RE = /\b(?:remove|delete|take)\b(?:(?!\bfrom\b|\bout\b)[\s\S]){0,40}?(?:\bfrom\s+(?:my\s+)?(?:cart|basket)\b|\bout\s+of\s+(?:my\s+)?cart\b)|\b(?:empty|clear)\s+(?:my\s+)?cart\b/i;
const WISHLIST_REMOVE_RE = /\bunsave\b|\b(?:remove|delete)\b(?:(?!\bfrom\b)[\s\S]){0,40}?\bfrom\s+(?:my\s+)?wishlist\b/i;
const WISHLIST_ADD_RE = /\bsave\s+(?:this|it|that)\b|\bwishlist\s+(?:this|it|that)\b|\bsave(?:\s+\w+){0,4}\s+to\s+(?:my\s+)?wishlist\b/i;
const CART_ADD_RE = new RegExp(`\\badd(?:\\s+\\w+){0,6}\\s+(?:to\\s+)?(?:cart|basket|wishlist)\\b|\\bput(?:\\s+\\w+){0,4}\\s+in(?:to)?\\s+(?:my\\s+)?cart\\b|\\badd\\s+(?:\\d[\\d,]*\\s*${UNIT_RE}?\\s*)?(?:more|another|extra|additional)\\b|\\badd\\s+\\d[\\d,]*\\s*${UNIT_RE}\\b|\\bbuy\\s+(?:it|this|now)\\b`, 'i');

// Returns the specific action the buyer wants, or null for a sourcing/chat turn.
// Checked most-specific-first so e.g. "decrease X to 50" (a set) doesn't get
// caught by the looser "decrease" (a relative decrement) pattern.
function classifyAction(text){
  const t = String(text || '');
  if(CHECKOUT_RE.test(t)) return 'checkout';
  if(QTY_SET_RE.test(t)) return 'qty_set';
  if(QTY_DECREASE_RE.test(t)) return 'qty_decrease';
  if(CART_REMOVE_RE.test(t)) return 'cart_remove';
  if(WISHLIST_REMOVE_RE.test(t)) return 'wishlist_remove';
  if(WISHLIST_ADD_RE.test(t)) return 'wishlist_add';
  if(CART_ADD_RE.test(t)) return 'cart_add';
  return null;
}
const PRICING_RE = /\b(too\s+much|over-?pay|overpaying|paying\s+too|is\s+this\s+(?:price|expensive|cheap|worth)|fair\s+price|market\s+(?:rate|price)|benchmark|average\s+price|compare\s+price|price\s+compar|margin|resell|resale|sell\s+(?:it|this|these)?\s*(?:for|at)|worth\s+it|am\s+i\s+(?:paying|getting))\b/i;
function classify(text){
  const t = String(text || '');
  if(classifyAction(t)) return 'action';
  if(PRICING_RE.test(t)) return 'pricing';
  return 'sourcing';
}

/* ---------- human-readable brief chips ---------- */
function describe(intent){
  const c = [];
  if(intent.materials.length) c.push(intent.materials.map(matLabel).join(' / '));
  if(intent.cat) c.push({fabrics:'Fabrics',accessories:'Accessories',trims:'Trims',yarns:'Yarns',oem:'OEM'}[intent.cat]);
  if(intent.gsm) c.push(`${intent.gsm.min}–${intent.gsm.max} GSM`);
  if(intent.priceMax != null) c.push(`≤ $${intent.priceMax}/unit`);
  if(intent.moqMax != null) c.push(`MOQ ≤ ${intent.moqMax}`);
  else if(intent.lowMoq) c.push('Low MOQ');
  if(intent.leadMax != null) c.push(`Lead ≤ ${intent.leadMax}d`);
  else if(intent.fastLead) c.push('Fast lead');
  intent.certs.forEach(x => c.push(x));
  if(intent.region) c.push(intent.region);
  if(intent.oem) c.push('OEM-ready');
  return c;
}

function mockSummary(intent, matches){
  if(!matches.length){
    return `No verified matches for that brief yet. Our sourcing team can look beyond the current catalog for you.`;
  }
  const top = matches[0];
  if(top.score<72){
    return `I found only close options for that brief. Review them, or send the request to our sourcing team for an exact match.`;
  }
  const crit = describe(intent).slice(0,3);
  const critTxt = crit.length ? ` matching ${crit.join(', ')}` : '';
  const n = matches.length;
  return `Found ${n} verified ${n===1?'match':'matches'}${critTxt}. Top pick: ${top.p.name} from ${top.p.seller} — ${top.hits.slice(0,3).join(' · ')}.`;
}

/* ---------- ask(): the async entry point (mock now, LLM-ready) ---------- */
async function ask(text){
  const intent = parse(text);
  let matches = match(intent);
  let summary = null, provider = 'mock', meta = null;
  if(typeof window.ARCANA_LLM === 'function'){
    try{
      const r = await window.ARCANA_LLM({text, intent, matches});
      if(r){ if(r.summary) summary = r.summary; if(Array.isArray(r.matches)) matches = r.matches; provider = 'llm'; if(r.usage) meta = {usage:r.usage}; }
    }catch(err){ provider = 'mock'; if(err && err.code) meta = {code:err.code, usage:err.usage||null}; }
  }
  if(provider === 'mock') await sleep(480); // let the thinking/skeleton state read as real work
  if(!summary) summary = mockSummary(intent, matches);
  return {intent, matches, summary, provider, meta};
}

/* ---------- brief persistence ---------- */
function getBrief(){ try{ return JSON.parse(localStorage.getItem(LSKEY)) || null; }catch(_){ return null; } }
function setBrief(text){ try{ localStorage.setItem(LSKEY, JSON.stringify({text:String(text||'').trim(), ts:Date.now()})); }catch(_){}}
function clearBrief(){ try{ localStorage.removeItem(LSKEY); }catch(_){}}

/* ---------- seller side: demand signals + listing drafter ---------- */
function supplierSKUs(sellerMatch){
  const rx = sellerMatch instanceof RegExp ? sellerMatch : new RegExp(sellerMatch,'i');
  return (window.ARCANA_PRODUCTS||[]).filter(p => rx.test(p.seller));
}
// how well the logged-in supplier can serve a buyer brief, judged against their own SKUs
function demandMatch(briefText, sellerMatch){
  const intent = parse(briefText);
  const pool = supplierSKUs(sellerMatch);
  const ranked = match(intent, {pool});
  const best = ranked[0];
  const sc = best ? best.score : 0;
  let status, reason;
  if(sc >= 72){ status='fulfil'; reason = `You list a strong match (${best.p.name}).`; }
  else if(sc >= 45){ status='partial'; reason = best ? `Partial — ${best.p.name} misses ${(best.miss[0]||'some specs')}.` : 'Partial fit.'; }
  else { status='gap'; reason = `Gap — no matching SKU in your catalog yet.`; }
  return {intent, status, reason, best, score:sc};
}
// recent buyer briefs (mock demand stream)
const DEMAND = [
  {text:'Organic cotton jersey, GOTS, under $7/m, MOQ ≤ 200', when:'2h ago', buyers:3},
  {text:'Recycled polyester for activewear, low MOQ, GRS certified', when:'5h ago', buyers:2},
  {text:'Linen blend woven, 150cm, lead under 14 days', when:'Yesterday', buyers:4},
  {text:'Cotton twill 250–350 gsm, OEM-ready, Zhejiang', when:'Yesterday', buyers:2},
  {text:'Merino wool yarn 2/28, Oeko-Tex, small batch', when:'2 days ago', buyers:1},
];
function demandStream(){ return DEMAND.slice(); }

// NL → structured SKU draft (deterministic)
function draftListing(text){
  const intent = parse(text);
  const cat = intent.cat || (intent.materials.length ? 'fabrics' : 'fabrics');
  const mat = intent.materials[0] ? matLabel(intent.materials[0]) : '';
  const gsm = intent.gsm ? (intent.gsm.target ? `${intent.gsm.target} GSM` : `${intent.gsm.min}–${intent.gsm.max} GSM`) : '';
  // name: material + fabric type keyword if present
  const typeWord = (String(text).match(/twill|jersey|denim|satin|fleece|canvas|chambray|flannel|woven|knit|taslan|suiting|poplin|ribbon|elastic|lace|tape|yarn|thread|zipper|button|label/i)||[''])[0];
  const name = [mat, typeWord && typeWord[0].toUpperCase()+typeWord.slice(1).toLowerCase()].filter(Boolean).join(' ') || 'New SKU';
  const suggestedCerts = intent.certs.slice();
  if(!suggestedCerts.length){
    if(/organic/.test(text)) suggestedCerts.push('GOTS');
    if(/recycl/i.test(text)) suggestedCerts.push('GRS');
    suggestedCerts.push('Oeko-Tex');
  }
  return {
    name,
    category: {fabrics:'Fabrics',accessories:'Accessories',trims:'Trims',yarns:'Yarns & Threads',oem:'OEM Services'}[cat],
    composition: mat ? (mat==='Cotton'?'100% Cotton':mat) : '—',
    spec: gsm || '—',
    moq: intent.moqMax ? `${intent.moqMax} m` : (intent.lowMoq ? '150 m' : '500 m'),
    price: intent.priceMax != null ? intent.priceMax : null,
    oem: intent.oem || cat==='oem',
    certs: [...new Set(suggestedCerts)],
    intent
  };
}

window.ARCANA_Copilot = {
  parse, match, describe, ask, mockSummary,
  getBrief, setBrief, clearBrief,
  scoreProduct, factoryOf,
  demandStream, demandMatch, draftListing,
  classify, classifyAction, priceBenchmark, percentileOf, resaleContext,
  fabricPriceJPY, fabricPriceUSD,
  version: '1.1'
};
})();
