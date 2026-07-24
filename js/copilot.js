/* ARCANA Sourcing Copilot — deterministic intelligence over the live catalog.
   LLM-ready: define window.ARCANA_LLM = async ({text,intent,matches}) => ({summary, matches})
   and ask() will await it, falling back to the mock engine on error/omission.
   Depends on window.ARCANA_PRODUCTS / _FACTORY_BY_NAME / _FACTORY_MAP (data.js). */
(function(){
'use strict';

const LSKEY = 'arcana_brief';
const sleep = ms => new Promise(r=>setTimeout(r,ms));

/* ---------- vocabulary ---------- */
const CATS = [
  {cat:'oem',         re:/\boem\b|private[ -]?label|cut\s*&?\s*sew|full[ -]?package|sampling|dyeing|colou?r[ -]?match/},
  {cat:'trims',       re:/\bribbon|elastic|\btape\b|\blace\b|\btrims?\b|binding|\bcord\b|grosgrain/},
  {cat:'accessories', re:/\bzipper|\bbutton|\blabels?\b|\bhook|rivet|buckle|\baccessor/},
  {cat:'yarns',       re:/\byarns?\b|\bthread|filament|\bply\b|\bne\s?\d/},
  {cat:'fabrics',     re:/\bfabric|jersey|twill|denim|satin|fleece|canvas|chambray|flannel|woven|\bknit|taslan|suiting/},
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
const REGIONS = ['Guangdong','Zhejiang','Jiangsu','Shandong','Tirupur','Tamil Nadu','Tokyo','China','Japan','India','Vietnam','Turkey'];
const STOP = new Set('a an the for with and or of to in on need want looking source sourcing me my our i we that this fabric fabrics material materials please find get some any under over below within around about'.split(' '));

/* ---------- parse plain-English brief → structured intent ---------- */
function parse(text){
  const t = ' ' + String(text||'').toLowerCase() + ' ';
  const intent = {text:String(text||'').trim(), cat:null, materials:[], gsm:null, priceMax:null,
    moqMax:null, lowMoq:false, leadMax:null, fastLead:false, certs:[], region:null, oem:false, keywords:[]};

  for(const c of CATS){ if(c.re.test(t)){ intent.cat=c.cat; break; } }
  for(const m of MATERIALS){ if(m.re.test(t) && !intent.materials.includes(m.comp)) intent.materials.push(m.comp); }
  // organic/recycled cotton/poly shouldn't also double-count the plain fibre
  if(intent.materials.includes('organic cotton')) intent.materials = intent.materials.filter(x=>x!=='cotton'||true);

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
  const fid = map[p.seller]; if(fid && fmap[fid]) return fmap[fid];
  // fuzzy: match on shared token (e.g. "Greenknit")
  const key = (p.seller||'').toLowerCase();
  for(const f of (window.ARCANA_FACTORIES||[])){
    const fn = f.name.toLowerCase();
    if(key && fn && (fn.split(/\s|,/).some(w=>w.length>4 && key.includes(w)))) return f;
  }
  return null;
}
function gsmOf(p){
  const nums = (String(p.spec).match(/\d{2,4}/g)||[]).map(Number).filter(n=>n>=40 && n<=1000);
  if(!nums.length) return null;
  return {min:Math.min(...nums), max:Math.max(...nums)};
}
const moqNum = s => parseInt(String(s).replace(/[^\d]/g,''),10) || 0;
function leadDaysMax(f){ if(!f||!f.lead) return null; const n=(f.lead.match(/\d+/g)||[]).map(Number); return n.length?Math.max(...n):null; }
const matLabel = c => c.replace(/\b\w/g,x=>x.toUpperCase());

/* ---------- score one product against an intent ---------- */
function scoreProduct(p, intent){
  if(intent.cat && p.cat !== intent.cat) return null;
  const f = factoryOf(p);
  const hits = [], miss = [];
  let matched = 0, total = 0;
  const add = (ok, hitLabel, missLabel) => { total++; if(ok){ matched++; hits.push(hitLabel); } else if(missLabel){ miss.push(missLabel); } };

  if(intent.materials.length){
    const hit = intent.materials.find(mm => p.comp.toLowerCase().includes(mm));
    add(!!hit, `${matLabel(hit||intent.materials[0])} ✓`, `Not ${matLabel(intent.materials[0])}`);
  }
  if(intent.gsm){
    const g = gsmOf(p);
    const ok = g && g.max >= intent.gsm.min && g.min <= intent.gsm.max;
    add(!!ok, `${p.spec} in range`, `${p.spec||'GSM n/a'} vs ${intent.gsm.min}–${intent.gsm.max}`);
  }
  if(intent.priceMax != null){
    add(p.price>0 && p.price<=intent.priceMax, `$${p.price.toFixed(2)} ≤ $${intent.priceMax}`, p.price>0?`$${p.price.toFixed(2)} over budget`:`Quote only`);
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
    const has = f && f.certs && f.certs.some(fc => fc.toLowerCase().includes(c.toLowerCase()));
    add(!!has, `${c} ✓`, `No ${c} on file`);
  });
  if(intent.region){
    add(p.loc.toLowerCase().includes(intent.region.toLowerCase()), `${intent.region} ✓`, `${p.loc}`);
  }
  if(intent.oem){
    add(p.badge==='oem'||p.badge==='recycle'||p.cat==='oem', `OEM-ready`, `Non-OEM`);
  }

  // relevance from keywords + material presence (drives ranking when few hard constraints)
  const hay = (p.name+' '+p.comp+' '+p.spec).toLowerCase();
  let rel = 0;
  intent.keywords.forEach(k => { if(hay.includes(k)) rel += 1; });
  if(intent.materials.some(mm => p.comp.toLowerCase().includes(mm))) rel += 2;
  const relN = Math.min(1, rel/5);

  const verified = f ? !!f.verified : true;
  const rating = f ? f.rating : null;
  const base = total ? matched/total : 0;
  // 70% constraint satisfaction + 20% relevance + 10% trust
  let sc = Math.round((total ? base*0.7 : 0.5) * 100 + relN*20 + (verified?10:0));
  sc = Math.max(0, Math.min(100, sc));

  if(verified) hits.push(`Verified${rating?` · ${rating}★`:''}`);
  return {p, f, score:sc, hits, miss, matched, total, verified, rel};
}

/* ---------- rank whole catalog ---------- */
function match(intent, opts){
  opts = opts||{};
  const pool = opts.pool || window.ARCANA_PRODUCTS || [];
  let out = pool.map(p => scoreProduct(p, intent)).filter(Boolean);
  // when no hard constraints, keep only relevant ones so results feel intentional
  const hardConstraints = intent.materials.length || intent.gsm || intent.priceMax!=null ||
    intent.moqMax!=null || intent.lowMoq || intent.leadMax!=null || intent.certs.length || intent.region || intent.oem;
  if(!intent.cat && !hardConstraints){
    out = out.filter(r => r.rel > 0);
  }
  out.sort((a,b) => b.score - a.score || (b.f?b.f.rating:0) - (a.f?a.f.rating:0));
  return opts.limit ? out.slice(0, opts.limit) : out;
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
    return `No verified matches for that brief yet. Try relaxing one constraint — widen the price ceiling, raise the MOQ, or drop a certification — and I'll re-search.`;
  }
  const top = matches[0];
  const crit = describe(intent).slice(0,3);
  const critTxt = crit.length ? ` matching ${crit.join(', ')}` : '';
  const n = matches.length;
  return `Found ${n} verified ${n===1?'match':'matches'}${critTxt}. Top pick: ${top.p.name} from ${top.p.seller} — ${top.hits.slice(0,3).join(' · ')}.`;
}

/* ---------- ask(): the async entry point (mock now, LLM-ready) ---------- */
async function ask(text){
  const intent = parse(text);
  let matches = match(intent);
  let summary = null, provider = 'mock';
  if(typeof window.ARCANA_LLM === 'function'){
    try{
      const r = await window.ARCANA_LLM({text, intent, matches});
      if(r){ if(r.summary) summary = r.summary; if(Array.isArray(r.matches)) matches = r.matches; provider = 'llm'; }
    }catch(_){ provider = 'mock'; }
  }
  if(provider === 'mock') await sleep(480); // let the thinking/skeleton state read as real work
  if(!summary) summary = mockSummary(intent, matches);
  return {intent, matches, summary, provider};
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
  version: '1.0'
};
})();
