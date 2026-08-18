/* Athelia — the live, signed-in Atelix sourcing agent.
   Repurposed from the public agentpoc demo: now logged-in only, backed by the
   deterministic engine in js/copilot.js (every price/stat is computed over the
   live catalog, never invented by the LLM), and every action is REAL —
   ATELIX_agentActions writes to the signed-in buyer's actual cart/wishlist
   (js/components.js -> js/api.js -> Supabase). Payment is never silent: "buy"
   hands off to the real checkout page.

   Layers:
   - ARCANA_Copilot (copilot.js): parse, match, classify, priceBenchmark,
     resaleContext — the deterministic facts.
   - ATELIX_agentActions (components.js): isLoggedIn, addToCart, toggleSaved,
     goToCheckout — the real, session-gated actions.
   - copilot-agent Edge Function: narrates the deterministic objects and drafts
     supplier inquiries. Prose only, never numbers of its own. */
(function(){
'use strict';

function asset(f){ return '../assets/' + f; }
function resolveAsset(value, fallback){
  const image = String(value||'').trim();
  if(!image) return asset(fallback + '.webp');
  if(/^(?:https?:|data:|blob:|\/|\.\.?\/)/i.test(image)) return image;
  return asset(/\.(?:avif|jpe?g|png|webp|gif|svg)$/i.test(image) ? image : image + '.webp');
}
function productAsset(p){ return resolveAsset(p && p.img, 'fabric-stack'); }

const $ = id => document.getElementById(id);
const el = {
  hero: $('hero'), gate: $('gate'), gateLogin: $('gateLogin'),
  grid: $('grid'), gridLabel: $('gridLabel'),
  benchmarkSlot: $('benchmarkSlot'),
  transcript: $('transcript'), drafts: $('drafts'), draftsLabel: $('draftsLabel'),
  confirmations: $('confirmations'),
  composerForm: $('composerForm'), composerInput: $('composerInput'), sendBtn: $('sendBtn'),
  approveBtn: $('approveBtn'), suggestions: $('suggestions'),
  wishlistBtn: $('wishlistBtn'), wishlistCount: $('wishlistCount'),
  cartBtn: $('cartBtn'), cartCount: $('cartCount'),
};

const state = {
  ready: false,
  matches: [],
  drafts: [],
  lastRef: null,      // last product the conversation is "about"
  lastResale: null,   // {amount, currency} carried across turns
};

/* ================= helpers ================= */

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function cssEscape(s){ return String(s).replace(/["\\]/g, '\\$&'); }
function products(){ return window.ARCANA_PRODUCTS || []; }
function findProduct(id){ return products().find(p=>p.id===id) || null; }
function Copilot(){ return window.ARCANA_Copilot; }
function actions(){ return window.ATELIX_agentActions; }
function jpy(n){ return '¥' + Math.round(Number(n)||0).toLocaleString('ja-JP'); }
function usd(n){ return '$' + (Number(n)||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function scrollToBottom(){ requestAnimationFrame(()=>{ window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'}); }); }

/* ================= header badges (real counts) ================= */

function syncBadges(){
  const a = actions();
  // Read real counts straight from the live Store via the header the site keeps in LS.
  let cart = 0, saved = 0;
  try{ cart = (JSON.parse(localStorage.getItem('arcana_cart')||'[]')||[]).reduce((n,i)=>n+(Number(i.qty)||0),0); }catch(_){}
  try{ saved = (JSON.parse(localStorage.getItem('arcana_saved')||'[]')||[]).length; }catch(_){}
  el.cartCount.textContent = cart;
  el.cartCount.classList.toggle('is-visible', cart>0);
  el.cartBtn.classList.toggle('is-active', cart>0);
  el.wishlistCount.textContent = saved;
  el.wishlistCount.classList.toggle('is-visible', saved>0);
  el.wishlistBtn.classList.toggle('is-active', saved>0);
}

/* ================= rendering: product cards ================= */

function cardHtml(p){
  const certs = (p.certs||[]).slice(0,3).map(c=>`<span class="apoc-cert">${escapeHtml(c)}</span>`).join('');
  const saved = actions() && actions().isSaved(p.id);
  return `
  <article class="apoc-card" data-product-id="${escapeHtml(p.id)}">
    <div class="apoc-card-media">
      <img src="${productAsset(p)}" alt="${escapeHtml(p.name)}" loading="lazy">
      <span class="apoc-agent-badge" data-badge></span>
      <button class="apoc-heart${saved?' is-saved':''}" type="button" data-wish aria-label="Save to wishlist">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.8 4.6c-1.8-1.5-4.4-1.3-6 .4L12 7.8l-2.8-2.8c-1.6-1.7-4.2-1.9-6-.4-2 1.7-2.1 4.8-.3 6.6l8.4 8.6c.4.4 1 .4 1.4 0l8.4-8.6c1.8-1.8 1.7-4.9-.3-6.6z"/></svg>
      </button>
    </div>
    <div class="apoc-card-body">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="apoc-card-meta">${escapeHtml(p.spec||p.comp||'')}</div>
      <div class="apoc-card-row">
        <span class="apoc-price">${usd(p.price)}<small>/${escapeHtml(p.unit||'unit')}</small></span>
        <span class="apoc-seller">${escapeHtml(p.seller||'')}</span>
      </div>
      ${certs ? `<div class="apoc-certs">${certs}</div>` : ''}
      <button class="apoc-card-add" type="button" data-add aria-label="Add ${escapeHtml(p.name)} to cart">Add to cart</button>
    </div>
  </article>`;
}

function renderGrid(list){
  el.grid.innerHTML = list.map(p=>cardHtml(p)).join('');
  el.gridLabel.hidden = false;
  el.grid.querySelectorAll('[data-product-id]').forEach(card=>{
    const id = card.dataset.productId;
    card.querySelector('[data-wish]').addEventListener('click', e=>{ e.preventDefault(); doWishlist(id); });
    card.querySelector('[data-add]').addEventListener('click', e=>{ e.preventDefault(); doAddToCart(id, defaultQty(id)); });
  });
}

function badgeProducts(ids, label){
  ids.forEach((id,i)=>setTimeout(()=>{
    const card = el.grid.querySelector(`[data-product-id="${cssEscape(id)}"]`);
    if(!card) return;
    card.classList.add('is-targeted');
    const b = card.querySelector('[data-badge]');
    b.innerHTML = `<span class="apoc-dot"></span>${escapeHtml(label||'Athelia')}`;
    b.classList.add('is-visible');
  }, i*140));
}

/* ================= transcript ================= */

function appendUser(text){
  const d = document.createElement('div');
  d.className = 'apoc-msg is-user';
  d.innerHTML = `<div class="apoc-bubble">${escapeHtml(text)}</div>`;
  el.transcript.appendChild(d); scrollToBottom();
}
function appendAgent(text){
  const d = document.createElement('div');
  d.className = 'apoc-msg is-agent';
  d.innerHTML = `<div class="apoc-bubble">${escapeHtml(text)}</div>`;
  el.transcript.appendChild(d); scrollToBottom();
  return d;
}
function showTyping(){
  const d = document.createElement('div');
  d.className = 'apoc-msg is-agent';
  d.innerHTML = `<div class="apoc-typing"><span></span><span></span><span></span></div>`;
  el.transcript.appendChild(d); scrollToBottom();
  return ()=>d.remove();
}
function pushConfirmation(text, meta){
  const d = document.createElement('div');
  d.className = 'apoc-pill';
  d.innerHTML = `<span class="apoc-dot"></span><span>${escapeHtml(text)}</span>${meta?`<span class="apoc-pill-meta">${escapeHtml(meta)}</span>`:''}`;
  el.confirmations.prepend(d);
  setTimeout(()=>{ d.style.transition='opacity .4s'; d.style.opacity='0'; setTimeout(()=>d.remove(), 420); }, 4200);
}

/* ================= real actions ================= */

function defaultQty(id){
  const p = findProduct(id);
  if(!p) return 1;
  const m = String(p.moq||'').match(/\d[\d,]*/);
  return m ? parseInt(m[0].replace(/,/g,''),10) : 1;
}

function doAddToCart(id, qty){
  const r = actions().addToCart(id, qty);
  if(!r.ok){ handleActionError(r.reason); return; }
  state.lastRef = id;
  syncBadges();
  const card = el.grid.querySelector(`[data-product-id="${cssEscape(id)}"]`);
  if(card){ const b=card.querySelector('[data-add]'); b.textContent='Added ✓'; b.classList.add('is-done'); setTimeout(()=>{ b.textContent='Add to cart'; b.classList.remove('is-done'); }, 1800); }
  pushConfirmation('Added to cart', `${r.qty} ${r.product.unit||''}`.trim());
  appendAgent(`Added ${r.product.name} (${r.qty} ${r.product.unit||'units'}) to your cart. Say "check out" when you're ready to review and pay.`);
}

function doWishlist(id){
  const r = actions().toggleSaved(id, defaultQty(id));
  if(!r.ok){ handleActionError(r.reason); return; }
  state.lastRef = id;
  syncBadges();
  const card = el.grid.querySelector(`[data-product-id="${cssEscape(id)}"]`);
  if(card) card.querySelector('[data-wish]').classList.toggle('is-saved', r.saved);
  if(r.saved){ pushConfirmation('Saved to wishlist', r.product.name.split(' ').slice(0,2).join(' ')); appendAgent(`Saved ${r.product.name} to your wishlist.`); }
  else appendAgent(`Removed ${r.product.name} from your wishlist.`);
}

function doCheckout(){
  const r = actions().goToCheckout();
  if(!r.ok){
    if(r.reason==='empty_cart'){ appendAgent(`Your cart is empty — add a fabric first, then I'll take you to checkout.`); return; }
    handleActionError(r.reason); return;
  }
  appendAgent(`Opening checkout — review your order and confirm payment there.`);
}

function handleActionError(reason){
  if(reason==='not_logged_in'){ showGate(); appendAgent(`Please sign in first — I act on your real account.`); return; }
  if(reason==='not_found'){ appendAgent(`I couldn't find that item in the catalog. Which product did you mean?`); return; }
  appendAgent(`That action didn't go through. Try again in a moment.`);
}

/* ================= edge function bridge (authenticated copilot-agent) ================= */

async function callAgent(mode, body){
  const sb = window.supabaseClient;
  if(!sb || !sb.functions) throw new Error('no_client');
  const { data, error } = await sb.functions.invoke('copilot-agent', { body: Object.assign({mode}, body) });
  let payload = data;
  if(error && error.context && typeof error.context.clone === 'function'){
    try{ payload = await error.context.clone().json(); }catch(_){}
  }
  if(error || !payload || !payload.ok) throw new Error((payload && payload.reason) || 'agent_unavailable');
  return payload;
}

/* ================= pricing / benchmark turn ================= */

// pull a resale figure out of the text, e.g. "¥30,000 a piece", "sell at 30000 yen"
function parseResale(text){
  const t = String(text||'');
  let m = t.match(/(?:¥|jpy|yen)\s*([\d,]+)/i) || t.match(/([\d,]+)\s*(?:yen|jpy|¥)/i);
  if(m) return { amount: parseInt(m[1].replace(/,/g,''),10), currency:'JPY' };
  m = t.match(/\$\s*([\d,]+(?:\.\d+)?)/) || t.match(/([\d,]+(?:\.\d+)?)\s*(?:usd|dollars?)/i);
  if(m) return { amount: parseFloat(m[1].replace(/,/g,'')), currency:'USD' };
  return null;
}

function benchmarkCardHtml(rc){
  const bm = rc.benchmark;
  if(bm.insufficient){
    return `<div class="apoc-benchmark"><div class="apoc-bm-head">Not enough comparable ${escapeHtml(bm.label)} to benchmark (${bm.n} SKU${bm.n===1?'':'s'}).</div></div>`;
  }
  const verdictLabel = { value:'below market', typical:'in line with market', premium:'above market' }[rc.verdict] || rc.verdict;
  const shareLine = rc.perUnitShare!=null
    ? `<div class="apoc-bm-row"><span>Material cost / ${escapeHtml(rc.product.unit)}</span><b>${jpy(rc.product.jpy)} · ${(rc.perUnitShare*100).toFixed(1)}% of ${jpy(rc.resaleJPY)} resale</b></div>`
    : '';
  return `
  <div class="apoc-benchmark" data-product-id="${escapeHtml(rc.product.id)}">
    <div class="apoc-bm-head">${escapeHtml(rc.product.name)} — <span class="apoc-bm-verdict apoc-bm-${escapeHtml(rc.verdict)}">${escapeHtml(verdictLabel)}</span></div>
    <div class="apoc-bm-grid">
      <div class="apoc-bm-row"><span>This fabric</span><b>${usd(rc.product.usd)} · ${jpy(rc.product.jpy)}/${escapeHtml(rc.product.unit)}</b></div>
      <div class="apoc-bm-row"><span>Peer median (${bm.n} ${escapeHtml(bm.label)})</span><b>${usd(bm.usd.median)} · ${jpy(bm.jpy.median)}</b></div>
      <div class="apoc-bm-row"><span>Peer range</span><b>${usd(bm.usd.min)}–${usd(bm.usd.max)}</b></div>
      <div class="apoc-bm-row"><span>Percentile</span><b>${rc.percentile==null?'—':rc.percentile+'th (cheaper than '+(100-rc.percentile)+'% of peers)'}</b></div>
      ${shareLine}
    </div>
    <div class="apoc-bm-actions">
      <button type="button" class="apoc-card-add" data-bm-add>Add to cart</button>
      <button type="button" class="apoc-chip" data-bm-cheaper>Show cheaper ${escapeHtml(bm.label)}</button>
    </div>
  </div>`;
}

function renderBenchmark(rc){
  el.benchmarkSlot.innerHTML = benchmarkCardHtml(rc);
  const node = el.benchmarkSlot.querySelector('.apoc-benchmark');
  if(!node) return;
  const addBtn = node.querySelector('[data-bm-add]');
  if(addBtn) addBtn.addEventListener('click', ()=> doAddToCart(rc.product.id, defaultQty(rc.product.id)));
  const cheaperBtn = node.querySelector('[data-bm-cheaper]');
  if(cheaperBtn) cheaperBtn.addEventListener('click', ()=> showCheaper(rc));
}

function showCheaper(rc){
  const intent = Copilot().parse(rc.benchmark.label);
  const unit = rc.product.unit;
  const cheaper = products()
    .filter(p => (p.unit||'unit')===unit && Number(p.price)>0 && Number(p.price) < rc.product.usd)
    .filter(p => { const c=String(p.comp||'').toLowerCase(); return (intent.materials||[]).some(m=>c.includes(String(m).toLowerCase())); })
    .sort((a,b)=>a.price-b.price).slice(0,5);
  if(!cheaper.length){ appendAgent(`Nothing verified comes in cheaper than this for ${rc.benchmark.label} right now.`); return; }
  state.matches = cheaper.map(p=>({p}));
  renderGrid(cheaper);
  badgeProducts(cheaper.map(p=>p.id), 'Cheaper');
  appendAgent(`Here ${cheaper.length===1?'is':'are'} ${cheaper.length} verified ${rc.benchmark.label} option${cheaper.length===1?'':'s'} priced below it.`);
}

// resolve which product a pricing question is about
function resolveTargetForPricing(text, intent){
  // explicit reference by name/code/seller
  const ref = resolveRef(text);
  if(ref && findProduct(ref)) return findProduct(ref);
  // else best current match, else run a fresh match on the brief
  if(state.matches.length) return state.matches[0].p;
  const ranked = Copilot().match(intent, {limit:1});
  return ranked.length ? ranked[0].p : null;
}

async function handlePricing(text){
  const C = Copilot();
  const intent = C.parse(text);
  const target = resolveTargetForPricing(text, intent);
  if(!target){ appendAgent(`Tell me which fabric — a name, style code, or "the organic cotton drill" — and I'll benchmark its price.`); return; }
  state.lastRef = target.id;
  const resale = parseResale(text) || state.lastResale;
  if(resale) state.lastResale = resale;

  const rc = C.resaleContext({ product: target, intent, resaleAmount: resale && resale.amount, resaleCurrency: resale && resale.currency });
  renderBenchmark(rc);

  const stop = showTyping();
  try{
    const payload = await callAgent('benchmark', { question: text.slice(0,400), data: rc });
    stop();
    appendAgent(payload.answer);
  }catch(_){
    stop();
    appendAgent(fallbackBenchmarkNarration(rc));
  }
  offerActions();
}

function fallbackBenchmarkNarration(rc){
  const bm = rc.benchmark;
  if(bm.insufficient) return `I only have ${bm.n} comparable ${bm.label} SKU${bm.n===1?'':'s'} in the catalog — too few to benchmark confidently. Ask me to source more options instead.`;
  const verdict = { value:'below the market', typical:'right around the market', premium:'above the market' }[rc.verdict] || rc.verdict;
  let s = `${rc.product.name} is ${usd(rc.product.usd)}/${rc.product.unit} — ${verdict}. Peers (${bm.n} verified ${bm.label}) run ${usd(bm.usd.min)}–${usd(bm.usd.max)}, median ${usd(bm.usd.median)}; this sits at the ${rc.percentile}th percentile.`;
  if(rc.perUnitShare!=null) s += ` At ${jpy(rc.resaleJPY)} resale, one ${rc.product.unit} of fabric is ${(rc.perUnitShare*100).toFixed(1)}% of the piece price (material cost per ${rc.product.unit}, not full margin).`;
  return s;
}

/* ================= sourcing turn ================= */

async function handleSourcing(text){
  const C = Copilot();
  const intent = C.parse(text);
  const ranked = C.match(intent, {limit:5});
  if(!ranked.length){ appendAgent(`No verified matches for that yet — try relaxing a constraint (price, MOQ, or certification).`); return; }
  state.matches = ranked;
  state.lastRef = ranked[0].p.id;
  renderGrid(ranked.map(r=>r.p));
  badgeProducts(ranked.map(r=>r.p.id), 'Athelia');
  const top = ranked[0];
  appendAgent(`Found ${ranked.length} verified match${ranked.length===1?'':'es'}. Top pick: ${top.p.name} from ${top.p.seller} — ${(top.hits||[]).slice(0,2).join(' · ')}. Add any to your cart, ask if a price is fair, or say "draft an inquiry".`);
  offerActions();
}

/* ================= draft inquiries (optional aid, no fake send) ================= */

async function handleDraft(text){
  if(!state.matches.length){ appendAgent(`Search for a fabric first, then I'll draft an inquiry to its supplier.`); return; }
  const stop = showTyping();
  const matches = state.matches.slice(0,5).map(m=>({ id:m.p.id, name:m.p.name, seller:m.p.seller, loc:m.p.loc, price:m.p.price, unit:m.p.unit, moq:m.p.moq, spec:m.p.spec, comp:m.p.comp, certs:m.p.certs||[] }));
  try{
    const payload = await callAgent('draft', { brief: (Copilot().getBrief() && Copilot().getBrief().text) || text, matches });
    stop();
    appendAgent(payload.intro || `Drafted inquiries you can send from each product page.`);
    renderDrafts((payload.drafts||[]).filter(d=>findProduct(d.productId)));
  }catch(_){
    stop();
    const fallback = state.matches.slice(0,5).map(m=>({ productId:m.p.id, message: fallbackDraft(m.p, text) }));
    appendAgent(`Here are inquiry drafts for each supplier — copy them into the supplier chat on each product page.`);
    renderDrafts(fallback);
  }
}
function fallbackDraft(p, brief){
  const supplier = String(p.seller||'').split(/[,(]/)[0].trim();
  return `Hi ${supplier} team,\n\nWe're interested in ${p.name} (${p.spec||p.comp}). Could you confirm current pricing at ${p.moq||'our target'} MOQ and lead time?\n\nThanks,\nAtelix buyer`;
}
function renderDrafts(drafts){
  el.drafts.innerHTML = drafts.map(d=>{
    const p = findProduct(d.productId); if(!p) return '';
    return `
    <div class="apoc-draft" data-draft-id="${escapeHtml(d.productId)}">
      <div class="apoc-draft-head"><div class="apoc-draft-to">${escapeHtml(p.seller)} <small>re: ${escapeHtml(p.name)}</small></div></div>
      <textarea data-body rows="4">${escapeHtml(d.message)}</textarea>
    </div>`;
  }).join('');
  el.draftsLabel.hidden = drafts.length===0;
}

/* ================= action turn (typed) ================= */

function resolveRef(text){
  const t = text.toLowerCase();
  const pool = state.matches.length ? state.matches.map(m=>m.p) : products().slice(0,80);
  for(const p of pool){
    const tokens = [p.style_code, p.seller, ...String(p.name||'').split(/\s+/)].filter(Boolean);
    if(tokens.some(tok => String(tok).length>3 && t.includes(String(tok).toLowerCase()))) return p.id;
  }
  return state.lastRef || (pool[0] && pool[0].id) || null;
}
function parseQty(text){
  const m = text.match(/(\d[\d,]*)\s*(m|meters?|metres?|kg|units?|pcs?|pieces?)\b/i);
  return m ? parseInt(m[1].replace(/,/g,''),10) : null;
}

function handleAction(text){
  const t = text.toLowerCase();
  if(/\b(check\s*out|checkout|proceed to (checkout|pay)|pay now|place (the )?order|buy it now)\b/.test(t)){ doCheckout(); return; }
  if(/\bwishlist|save (it|this|that)\b/.test(t)){
    const id = resolveRef(text); if(id) doWishlist(id); else appendAgent(`Which item should I save?`); return;
  }
  // default action = add to cart
  const id = resolveRef(text);
  if(!id){ appendAgent(`Which fabric should I add — name it or search first.`); return; }
  doAddToCart(id, parseQty(text) || defaultQty(id));
}

/* ================= suggestions ================= */

function offerActions(){
  const chips = ['Is this priced fairly?', 'Add top pick to cart', 'Draft an inquiry'];
  el.suggestions.innerHTML = chips.map(c=>`<button class="apoc-chip" type="button">${escapeHtml(c)}</button>`).join('');
  el.suggestions.hidden = false;
  el.suggestions.querySelectorAll('.apoc-chip').forEach((b,i)=> b.addEventListener('click', ()=>submit(chips[i])));
  el.approveBtn.classList.toggle('is-visible', state.matches.length>0);
}

/* ================= main turn router ================= */

function submit(text){
  text = String(text||'').trim();
  if(!text || !state.ready) return;
  appendUser(text);
  el.composerInput.value = '';
  el.sendBtn.disabled = true;
  if(el.hero) el.hero.hidden = true;

  const kind = Copilot().classify(text);
  if(kind === 'action'){ handleAction(text); return; }
  if(kind === 'pricing'){ handlePricing(text); return; }
  // "draft" is a sourcing sub-intent
  if(/\bdraft\b|\binquir|\bmessage the supplier|\breach out\b/i.test(text)){ handleDraft(text); return; }
  handleSourcing(text);
}

/* ================= auth gate ================= */

function showGate(){
  if(el.hero) el.hero.hidden = true;
  el.gate.hidden = false;
  el.composerInput.disabled = true;
  el.sendBtn.disabled = true;
  state.ready = false;
  const next = encodeURIComponent('/agentpoc');
  el.gateLogin.setAttribute('href', `../pages/login.html?next=${next}`);
}
function showReady(){
  el.gate.hidden = true;
  if(el.hero) el.hero.hidden = false;
  el.composerInput.disabled = false;
  state.ready = true;
  syncBadges();
}

async function checkAuthAndInit(){
  const api = window.ARCANA_API;
  let loggedIn = false;
  if(api && api.getSessionProfile){
    try{ loggedIn = !!(await api.getSessionProfile()); }catch(_){}
  }
  if(!loggedIn && actions()) loggedIn = actions().isLoggedIn();
  if(loggedIn){ showReady(); pickupBrief(); } else showGate();
}

// A brief handed off from the site-wide Athelia FAB: run it, then clear it.
function pickupBrief(){
  const C = Copilot();
  const brief = C && C.getBrief && C.getBrief();
  if(brief && brief.text){ C.clearBrief(); submit(brief.text); }
}

/* ================= wiring ================= */

function init(){
  el.composerForm.addEventListener('submit', e=>{ e.preventDefault(); submit(el.composerInput.value); });
  el.composerInput.addEventListener('input', ()=>{ el.sendBtn.disabled = !el.composerInput.value.trim() || !state.ready; });
  document.querySelectorAll('.apoc-example').forEach(b=> b.addEventListener('click', ()=>submit(b.dataset.example)));
  el.approveBtn.addEventListener('click', ()=>{
    const top = state.matches[0];
    if(top) doAddToCart(top.p.id, defaultQty(top.p.id));
  });
  el.cartBtn.addEventListener('click', ()=>{ if(actions() && actions().isLoggedIn()) location.href = '../pages/cart.html'; });
  el.wishlistBtn.addEventListener('click', ()=>{ if(actions() && actions().isLoggedIn()) location.href = '../pages/wishlist.html'; });

  // Wait for the shared layer (session bootstrap + catalog hydration) to settle.
  const boot = () => {
    if(!window.ARCANA_Copilot || !window.ATELIX_agentActions){ setTimeout(boot, 60); return; }
    checkAuthAndInit();
  };
  boot();
  // Re-check once the async catalog/session has had a beat to land.
  setTimeout(()=>{ if(state.ready) syncBadges(); }, 800);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
