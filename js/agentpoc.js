/* Athelia — the live, signed-in Atelix sourcing agent.

   The LLM (OpenRouter, via the copilot-agent Edge Function) is the brain: it
   reads the whole conversation, understands follow-ups that narrow an earlier
   request, writes the reply, and chooses which real products to show. The
   deterministic engine in js/copilot.js is the grounding: it searches the LIVE
   catalog and computes every price/stat, so the LLM never invents a product,
   price, or number — it may only reference the candidates it is handed.

   Every action is REAL — ATELIX_agentActions writes to the signed-in buyer's
   actual cart/wishlist (components.js -> api.js -> Supabase). Payment is never
   silent: "buy" hands off to the real checkout page.

   Chat structure per turn: user prompt -> LLM reply -> (optional) inline list
   of real product cards or drafted supplier messages. Add-to-cart works from
   the prompt ("add the denim to cart") or the button on any card.

   Athelia is in limited preview — front-end allowlist here, enforced for real
   in the copilot-agent function. */
(function(){
'use strict';

const ALLOWED_EMAILS = ['jun@arcanawangsa.com'];
function isAllowedEmail(email){ return ALLOWED_EMAILS.includes(String(email||'').trim().toLowerCase()); }

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
  transcript: $('transcript'),
  composerForm: $('composerForm'), composerInput: $('composerInput'), sendBtn: $('sendBtn'),
  approveBtn: $('approveBtn'), suggestions: $('suggestions'),
  wishlistBtn: $('wishlistBtn'), wishlistCount: $('wishlistCount'),
  cartBtn: $('cartBtn'), cartCount: $('cartCount'),
};

const state = {
  ready: false,
  busy: false,
  history: [],      // LLM conversation: {role:'user'|'assistant', content}
  brief: '',        // accumulated sourcing text, for deterministic matching
  candidates: [],   // current deterministic matches (product objects)
  lastRef: null,    // product the conversation is currently "about"
  lastResale: null, // {amount, currency} carried across turns
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
function trimCandidate(p){ return { id:p.id, name:p.name, seller:p.seller, loc:p.loc, price:p.price, unit:p.unit, moq:p.moq, spec:p.spec, comp:p.comp, certs:p.certs||[] }; }

/* ================= header badges (real counts) ================= */

function syncBadges(){
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

/* ================= transcript primitives ================= */

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
  document.getElementById('confirmations').prepend(d);
  setTimeout(()=>{ d.style.transition='opacity .4s'; d.style.opacity='0'; setTimeout(()=>d.remove(), 420); }, 4200);
}

/* ================= inline product cards ================= */

function cardHtml(p){
  const certs = (p.certs||[]).slice(0,3).map(c=>`<span class="apoc-cert">${escapeHtml(c)}</span>`).join('');
  const saved = actions() && actions().isSaved(p.id);
  return `
  <article class="apoc-card" data-product-id="${escapeHtml(p.id)}">
    <div class="apoc-card-media">
      <img src="${productAsset(p)}" alt="${escapeHtml(p.name)}" loading="lazy">
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

function appendCards(list){
  if(!list.length) return;
  const grid = document.createElement('div');
  grid.className = 'apoc-grid apoc-turn-cards';
  grid.innerHTML = list.map(cardHtml).join('');
  el.transcript.appendChild(grid);
  grid.querySelectorAll('[data-product-id]').forEach(card=>{
    const id = card.dataset.productId;
    card.querySelector('[data-wish]').addEventListener('click', e=>{ e.preventDefault(); doWishlist(id); });
    card.querySelector('[data-add]').addEventListener('click', e=>{ e.preventDefault(); doAddToCart(id, defaultQty(id)); });
  });
  scrollToBottom();
}

/* ================= inline benchmark card (real numbers) ================= */

function benchmarkCardHtml(rc){
  const bm = rc.benchmark;
  if(bm.insufficient){
    return `<div class="apoc-benchmark"><div class="apoc-bm-head">Only ${bm.n} comparable ${escapeHtml(bm.label)} SKU${bm.n===1?'':'s'} — too few to benchmark confidently.</div></div>`;
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
    </div>
  </div>`;
}
function appendBenchmark(rc){
  const wrap = document.createElement('div');
  wrap.innerHTML = benchmarkCardHtml(rc);
  const node = wrap.firstElementChild;
  el.transcript.appendChild(node);
  const addBtn = node.querySelector('[data-bm-add]');
  if(addBtn) addBtn.addEventListener('click', ()=> doAddToCart(rc.product.id, defaultQty(rc.product.id)));
  scrollToBottom();
}

/* ================= inline drafted inquiries ================= */

function appendDrafts(drafts){
  const valid = drafts.filter(d=>findProduct(d.productId));
  if(!valid.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'apoc-drafts';
  wrap.innerHTML = valid.map(d=>{
    const p = findProduct(d.productId);
    return `
    <div class="apoc-draft" data-draft-id="${escapeHtml(d.productId)}">
      <div class="apoc-draft-head"><div class="apoc-draft-to">${escapeHtml(p.seller)} <small>re: ${escapeHtml(p.name)}</small></div></div>
      <textarea data-body rows="4">${escapeHtml(d.message)}</textarea>
    </div>`;
  }).join('');
  el.transcript.appendChild(wrap);
  scrollToBottom();
}

/* ================= real actions ================= */

function defaultQty(id){
  const p = findProduct(id);
  if(!p) return 1;
  const m = String(p.moq||'').match(/\d[\d,]*/);
  return m ? parseInt(m[0].replace(/,/g,''),10) : 1;
}
function logAgent(text){ state.history.push({ role:'assistant', content:text }); }

function doAddToCart(id, qty){
  const r = actions().addToCart(id, qty);
  if(!r.ok){ handleActionError(r.reason); return; }
  state.lastRef = id;
  syncBadges();
  pushConfirmation('Added to cart', `${r.qty} ${r.product.unit||''}`.trim());
  const msg = `Added ${r.product.name} (${r.qty} ${r.product.unit||'units'}) to your cart. Say "check out" when you're ready to review and pay.`;
  appendAgent(msg); logAgent(msg);
}
function doWishlist(id){
  const r = actions().toggleSaved(id, defaultQty(id));
  if(!r.ok){ handleActionError(r.reason); return; }
  state.lastRef = id;
  syncBadges();
  document.querySelectorAll(`[data-product-id="${cssEscape(id)}"] [data-wish]`).forEach(b=>b.classList.toggle('is-saved', r.saved));
  const msg = r.saved ? `Saved ${r.product.name} to your wishlist.` : `Removed ${r.product.name} from your wishlist.`;
  if(r.saved) pushConfirmation('Saved to wishlist', r.product.name.split(' ').slice(0,2).join(' '));
  appendAgent(msg); logAgent(msg);
}
function doCheckout(){
  const r = actions().goToCheckout();
  if(!r.ok){
    if(r.reason==='empty_cart'){ const m=`Your cart is empty — add a fabric first, then I'll take you to checkout.`; appendAgent(m); logAgent(m); return; }
    handleActionError(r.reason); return;
  }
  const m = `Opening checkout — review your order and confirm payment there.`; appendAgent(m); logAgent(m);
}
function handleActionError(reason){
  if(reason==='not_logged_in'){ showGate('signin'); return; }
  const m = reason==='not_found' ? `I couldn't find that item in the catalog. Which product did you mean?` : `That action didn't go through. Try again in a moment.`;
  appendAgent(m); logAgent(m);
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
  if(error || !payload || !payload.ok){
    const reason = (payload && payload.reason) || 'agent_unavailable';
    const err = new Error(reason); err.reason = reason; throw err;
  }
  return payload;
}

/* ================= pricing helpers ================= */

function parseResale(text){
  const t = String(text||'');
  let m = t.match(/(?:¥|jpy|yen)\s*([\d,]+)/i) || t.match(/([\d,]+)\s*(?:yen|jpy|¥)/i);
  if(m) return { amount: parseInt(m[1].replace(/,/g,''),10), currency:'JPY' };
  m = t.match(/\$\s*([\d,]+(?:\.\d+)?)/) || t.match(/([\d,]+(?:\.\d+)?)\s*(?:usd|dollars?)/i);
  if(m) return { amount: parseFloat(m[1].replace(/,/g,'')), currency:'USD' };
  return null;
}
function resolveRef(text){
  const t = text.toLowerCase();
  const pool = state.candidates.length ? state.candidates : products().slice(0,80);
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

/* ================= deterministic action turn ================= */

function handleAction(text){
  const t = text.toLowerCase();
  if(/\b(check\s*out|checkout|proceed to (checkout|pay)|pay now|place (the )?order|buy it now)\b/.test(t)){ doCheckout(); return; }
  if(/\bwishlist|save (it|this|that)\b/.test(t)){
    const id = resolveRef(text);
    if(id) doWishlist(id); else { const m=`Which item should I save?`; appendAgent(m); logAgent(m); }
    return;
  }
  const id = resolveRef(text);
  if(!id){ const m=`Which fabric should I add — name it or search for one first.`; appendAgent(m); logAgent(m); return; }
  doAddToCart(id, parseQty(text) || defaultQty(id));
}

/* ================= LLM-driven chat turn ================= */

async function handleChat(text){
  const C = Copilot();
  const kind = C.classify(text);
  // Sourcing turns accumulate the running brief so follow-ups narrow, not reset.
  if(kind === 'sourcing') state.brief = (state.brief ? state.brief + ' · ' : '') + text;
  const matchText = state.brief || text;
  const intent = C.parse(matchText);
  const ranked = C.match(intent, {limit:8});
  state.candidates = ranked.map(r=>r.p);

  // Compute a real benchmark when the buyer is asking about price.
  let benchmark = null;
  if(kind === 'pricing'){
    const target = (resolveRef(text) && findProduct(resolveRef(text))) || (state.candidates[0]);
    if(target){
      const resale = parseResale(text) || state.lastResale;
      if(resale) state.lastResale = resale;
      benchmark = C.resaleContext({ product: target, intent: C.parse(`${target.comp} ${target.name}`), resaleAmount: resale && resale.amount, resaleCurrency: resale && resale.currency });
      state.lastRef = target.id;
    }
  }

  const stop = showTyping();
  try{
    const payload = await callAgent('chat', {
      messages: state.history,
      candidates: state.candidates.map(trimCandidate),
      benchmark,
    });
    stop();
    appendAgent(payload.reply); logAgent(payload.reply);
    if(benchmark && benchmark.benchmark && !benchmark.benchmark.insufficient) appendBenchmark(benchmark);
    const show = (payload.show||[]).map(findProduct).filter(Boolean);
    if(show.length){ appendCards(show); state.lastRef = show[0].id; }
    if(payload.drafts) requestDrafts();
    offerActions();
  }catch(err){
    stop();
    if(err.reason === 'not_available'){ showGate('unavailable'); return; }
    if(err.reason === 'unauthorized'){ showGate('signin'); return; }
    // Honest degradation: still surface the real, deterministic data we computed.
    const msg = `I couldn't reach the model just now, but here's what the live catalog shows.`;
    appendAgent(msg); logAgent(msg);
    if(benchmark && benchmark.benchmark && !benchmark.benchmark.insufficient) appendBenchmark(benchmark);
    const top = state.candidates.slice(0,5);
    if(top.length) appendCards(top);
    offerActions();
  }
}

async function requestDrafts(){
  if(!state.candidates.length) return;
  const stop = showTyping();
  const matches = state.candidates.slice(0,5).map(trimCandidate);
  try{
    const payload = await callAgent('draft', { brief: state.brief || (state.history[state.history.length-1]||{}).content || '', matches });
    stop();
    if(payload.intro){ appendAgent(payload.intro); logAgent(payload.intro); }
    appendDrafts(payload.drafts||[]);
  }catch(err){
    stop();
    if(err.reason === 'not_available'){ showGate('unavailable'); return; }
    const fallback = state.candidates.slice(0,5).map(p=>({ productId:p.id, message: fallbackDraft(p) }));
    const m = `Here are inquiry drafts for each supplier — copy them into the supplier chat on each product page.`;
    appendAgent(m); logAgent(m);
    appendDrafts(fallback);
  }
}
function fallbackDraft(p){
  const supplier = String(p.seller||'').split(/[,(]/)[0].trim();
  return `Hi ${supplier} team,\n\nWe're interested in ${p.name} (${p.spec||p.comp}). Could you confirm current pricing at ${p.moq||'our target'} MOQ and lead time?\n\nThanks,\nAtelix buyer`;
}

/* ================= suggestions ================= */

function offerActions(){
  const chips = ['Is this priced fairly?', 'Add top pick to cart', 'Draft an inquiry'];
  el.suggestions.innerHTML = chips.map(c=>`<button class="apoc-chip" type="button">${escapeHtml(c)}</button>`).join('');
  el.suggestions.hidden = false;
  el.suggestions.querySelectorAll('.apoc-chip').forEach((b,i)=> b.addEventListener('click', ()=>submit(chips[i])));
  el.approveBtn.classList.toggle('is-visible', state.candidates.length>0);
}

/* ================= main turn router ================= */

function submit(text){
  text = String(text||'').trim();
  if(!text || !state.ready || state.busy) return;
  state.busy = true;
  appendUser(text);
  state.history.push({ role:'user', content:text });
  el.composerInput.value = '';
  el.sendBtn.disabled = true;
  if(el.hero) el.hero.hidden = true;

  const done = () => { state.busy = false; };
  const kind = Copilot().classify(text);
  if(kind === 'action'){ Promise.resolve(handleAction(text)).finally(done); return; }
  handleChat(text).finally(done);
}

/* ================= auth + allowlist gate ================= */

function showGate(mode){
  if(el.hero) el.hero.hidden = true;
  el.gate.hidden = false;
  el.composerInput.disabled = true;
  el.sendBtn.disabled = true;
  state.ready = false;
  const title = el.gate.querySelector('h2');
  const desc = el.gate.querySelector('p');
  if(mode === 'unavailable'){
    if(title) title.textContent = 'Athelia is in limited preview';
    if(desc) desc.textContent = "Athelia isn't available on your account yet. We're rolling it out gradually.";
    el.gateLogin.hidden = true;
  } else {
    if(title) title.textContent = 'Sign in to use Athelia';
    if(desc) desc.textContent = "Athelia benchmarks live prices and acts on your real cart and wishlist, so it's for signed-in buyers.";
    el.gateLogin.hidden = false;
    el.gateLogin.setAttribute('href', `../pages/login.html?next=${encodeURIComponent('/agentpoc')}`);
  }
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
  let profile = null;
  if(api && api.getSessionProfile){
    try{ profile = await api.getSessionProfile(); }catch(_){}
  }
  if(!profile){ showGate('signin'); return; }
  if(!isAllowedEmail(profile.email)){ showGate('unavailable'); return; }
  showReady(); pickupBrief();
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
  el.composerInput.addEventListener('input', ()=>{ el.sendBtn.disabled = !el.composerInput.value.trim() || !state.ready || state.busy; });
  document.querySelectorAll('.apoc-example').forEach(b=> b.addEventListener('click', ()=>submit(b.dataset.example)));
  el.approveBtn.addEventListener('click', ()=>{
    const id = state.lastRef || (state.candidates[0] && state.candidates[0].id);
    if(id) doAddToCart(id, defaultQty(id));
  });
  el.cartBtn.addEventListener('click', ()=>{ if(actions() && actions().isLoggedIn()) location.href = '../pages/cart.html'; });
  el.wishlistBtn.addEventListener('click', ()=>{ if(actions() && actions().isLoggedIn()) location.href = '../pages/wishlist.html'; });

  const boot = () => {
    if(!window.ARCANA_Copilot || !window.ATELIX_agentActions){ setTimeout(boot, 60); return; }
    checkAuthAndInit();
  };
  boot();
  setTimeout(()=>{ if(state.ready) syncBadges(); }, 800);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
