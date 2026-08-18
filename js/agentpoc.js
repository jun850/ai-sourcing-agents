/* Atelix Agent POC — standalone page logic. No dependency on ARCANA's
   header/footer/chrome; reuses only the pure data/matching layer
   (js/data.js, js/copilot.js) and the shared Supabase client bundle.
   Every "action" (send/cart/wishlist/pay) is simulated client-side state —
   see the surface brief for why: real facts from the deterministic catalog
   engine, LLM only ever supplies prose. */
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
  hero: $('hero'), grid: $('grid'), gridLabel: $('gridLabel'),
  transcript: $('transcript'), drafts: $('drafts'), draftsLabel: $('draftsLabel'),
  confirmations: $('confirmations'), paymentSlot: $('paymentSlot'),
  composerForm: $('composerForm'), composerInput: $('composerInput'), sendBtn: $('sendBtn'),
  approveBtn: $('approveBtn'), suggestions: $('suggestions'),
  wishlistBtn: $('wishlistBtn'), wishlistCount: $('wishlistCount'),
  cartBtn: $('cartBtn'), cartCount: $('cartCount'),
};

const state = {
  stage: 'idle', // idle -> matched -> drafting -> drafted -> sending -> sent
  intent: null,
  matches: [],
  drafts: [],
  wishlist: new Set(),
  cart: new Map(),
  lastRef: null,
};

/* ================= helpers ================= */

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function cssEscape(s){ return String(s).replace(/["\\]/g, '\\$&'); }
function findProduct(id){ return (window.ARCANA_PRODUCTS||[]).find(p=>p.id===id); }
function fmtMoney(n){ return Number(n||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function fmtPrice(p){ return '$' + fmtMoney(p.price) + '<small>/' + escapeHtml(p.unit||'unit') + '</small>'; }
function scrollToBottom(){ requestAnimationFrame(()=>{ window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'}); }); }

/* ================= rendering ================= */

function cardHtml(m){
  const p = m.p;
  const certs = (p.certs||[]).slice(0,3).map(c=>`<span class="apoc-cert">${escapeHtml(c)}</span>`).join('');
  return `
  <article class="apoc-card" data-product-id="${escapeHtml(p.id)}">
    <div class="apoc-card-media">
      <img src="${productAsset(p)}" alt="${escapeHtml(p.name)}" loading="lazy">
      <span class="apoc-agent-badge" data-badge></span>
      <button class="apoc-heart" type="button" data-wish aria-label="Save to wishlist">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.8 4.6c-1.8-1.5-4.4-1.3-6 .4L12 7.8l-2.8-2.8c-1.6-1.7-4.2-1.9-6-.4-2 1.7-2.1 4.8-.3 6.6l8.4 8.6c.4.4 1 .4 1.4 0l8.4-8.6c1.8-1.8 1.7-4.9-.3-6.6z"/></svg>
      </button>
    </div>
    <div class="apoc-card-body">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="apoc-card-meta">${escapeHtml(p.spec||p.comp||'')}</div>
      <div class="apoc-card-row">
        <span class="apoc-price">${fmtPrice(p)}</span>
        <span class="apoc-seller">${escapeHtml(p.seller||'')}</span>
      </div>
      ${certs ? `<div class="apoc-certs">${certs}</div>` : ''}
    </div>
  </article>`;
}

function renderGrid(matches){
  el.grid.innerHTML = matches.map(cardHtml).join('');
  el.gridLabel.hidden = false;
  el.grid.querySelectorAll('[data-wish]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      const card = btn.closest('[data-product-id]');
      toggleWishlist(card.dataset.productId, true);
    });
  });
}

function setHeroHidden(hidden){ el.hero.classList.toggle('is-hidden', hidden); }

function badgeProducts(ids, opts){
  opts = opts || {};
  ids.forEach((id, i)=>{
    setTimeout(()=>{
      const card = el.grid.querySelector(`[data-product-id="${cssEscape(id)}"]`);
      if(!card) return;
      card.classList.add('is-targeted');
      const badge = card.querySelector('[data-badge]');
      badge.innerHTML = `<span class="apoc-dot"></span>${escapeHtml(opts.label||'Agent')}`;
      badge.classList.toggle('is-working', !!opts.working);
      badge.classList.add('is-visible');
    }, i * 160);
  });
}

function appendUserMessage(text){
  const div = document.createElement('div');
  div.className = 'apoc-msg is-user';
  div.innerHTML = `<div class="apoc-bubble">${escapeHtml(text)}</div>`;
  el.transcript.appendChild(div);
  scrollToBottom();
}
function appendAgentMessage(text){
  const div = document.createElement('div');
  div.className = 'apoc-msg is-agent';
  div.innerHTML = `<div class="apoc-bubble">${escapeHtml(text)}</div>`;
  el.transcript.appendChild(div);
  scrollToBottom();
}
function showTyping(){
  const div = document.createElement('div');
  div.className = 'apoc-msg is-agent';
  div.innerHTML = `<div class="apoc-typing"><span></span><span></span><span></span></div>`;
  el.transcript.appendChild(div);
  scrollToBottom();
  return () => { div.remove(); };
}

function pushConfirmation(text, meta){
  const div = document.createElement('div');
  div.className = 'apoc-pill';
  div.innerHTML = `<span class="apoc-dot"></span><span>${escapeHtml(text)}</span>${meta?`<span class="apoc-pill-meta">${escapeHtml(meta)}</span>`:''}`;
  el.confirmations.prepend(div);
}

function draftCardHtml(d, p){
  return `
  <div class="apoc-draft" data-draft-id="${escapeHtml(d.productId)}">
    <div class="apoc-draft-head">
      <div class="apoc-draft-to">${escapeHtml(p.seller)} <small>re: ${escapeHtml(p.name)}</small></div>
      <div class="apoc-draft-status" data-status>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
        Sent
      </div>
    </div>
    <textarea data-body rows="4">${escapeHtml(d.message)}</textarea>
  </div>`;
}

function renderDrafts(drafts){
  el.drafts.innerHTML = drafts.map(d=>{
    const p = findProduct(d.productId);
    return p ? draftCardHtml(d, p) : '';
  }).join('');
  el.draftsLabel.hidden = false;
  el.drafts.querySelectorAll('[data-draft-id]').forEach(node=>{
    const id = node.dataset.draftId;
    node.querySelector('[data-body]').addEventListener('input', (e)=>{
      const d = state.drafts.find(x=>x.productId===id);
      if(d) d.message = e.target.value;
    });
  });
}

function markDraftsSent(){
  [...el.drafts.querySelectorAll('[data-draft-id]')].forEach((card, i)=>{
    setTimeout(()=>{
      card.classList.add('is-sent');
      card.querySelector('[data-status]').classList.add('is-visible');
    }, i * 260);
  });
}

function updateSuggestions(){
  let chips = [];
  if(state.stage === 'drafted'){
    chips = ['Send to suppliers', 'Make the tone firmer', 'Ask about samples first'];
  } else if(state.stage === 'sent'){
    const top = state.matches[0];
    const shortName = top ? top.p.name.split(' ').slice(0,2).join(' ') : 'the top match';
    chips = [`Add ${shortName} to cart`, 'Wishlist the top match', 'Watch it for a price drop'];
  }
  el.suggestions.innerHTML = chips.map(c=>`<button class="apoc-chip" type="button">${escapeHtml(c)}</button>`).join('');
  el.suggestions.hidden = chips.length === 0;
  el.suggestions.querySelectorAll('.apoc-chip').forEach((btn,i)=>{
    btn.addEventListener('click', ()=> handleComposerSubmit(chips[i]));
  });
}

/* ================= search ================= */

function resetForNewSearch(){
  el.drafts.innerHTML = '';
  el.draftsLabel.hidden = true;
  el.approveBtn.classList.remove('is-visible');
  state.drafts = [];
}

function runSearch(text){
  const Copilot = window.ARCANA_Copilot;
  if(!Copilot){ appendAgentMessage('Catalog engine failed to load — refresh and try again.'); return; }
  resetForNewSearch();
  const intent = Copilot.parse(text);
  const matches = Copilot.match(intent, {limit:5});
  state.intent = intent;
  state.matches = matches;
  state.stage = 'matched';
  state.lastRef = matches[0] ? matches[0].p.id : null;

  setHeroHidden(true);
  renderGrid(matches);
  updateSuggestions();

  if(!matches.length){
    appendAgentMessage('No verified matches for that brief yet — try relaxing a constraint (price, MOQ, or certification).');
    state.stage = 'idle';
    return;
  }

  const top = matches[0];
  appendAgentMessage(`Found ${matches.length} verified match${matches.length===1?'':'es'}. Top pick: ${top.p.name} from ${top.p.seller} — ${(top.hits||[]).slice(0,2).join(' · ')}.`);
  badgeProducts(matches.map(m=>m.p.id), {label:'Agent', working:true});

  requestDrafts(text, intent, matches);
}

/* ================= LLM bridge (agentpoc-ask) with deterministic fallback ================= */

function trimMatchesForLLM(matches){
  return matches.slice(0,5).map(m=>({
    id: m.p.id, name: m.p.name, seller: m.p.seller, loc: m.p.loc,
    price: m.p.price, unit: m.p.unit, moq: m.p.moq, spec: m.p.spec, comp: m.p.comp,
    certs: m.p.certs||[], hits: (m.hits||[]).slice(0,4)
  }));
}
function trimIntent(intent){
  return { cat: intent.cat, materials: intent.materials, priceMax: intent.priceMax, moqMax: intent.moqMax, certs: intent.certs, region: intent.region };
}

async function callAgentAsk(mode, body){
  const sb = window.supabaseClient;
  if(!sb || !sb.functions) throw new Error('no_client');
  const { data, error } = await sb.functions.invoke('agentpoc-ask', { body: Object.assign({mode}, body) });
  let payload = data;
  if(error && error.context && typeof error.context.clone === 'function'){
    try{ payload = await error.context.clone().json(); }catch(_){}
  }
  if(error || !payload || !payload.ok){
    throw new Error((payload && payload.reason) || 'agent_unavailable');
  }
  return payload;
}

function fallbackRationale(intent, matches){
  const Copilot = window.ARCANA_Copilot;
  return Copilot ? Copilot.mockSummary(intent, matches) : 'Here are the closest verified matches for that brief.';
}
function fallbackDraft(p, brief){
  const supplier = String(p.seller||'').split(/[,(]/)[0].trim();
  return `Hi ${supplier} team,\n\nWe're sourcing ${p.name} (${p.spec||p.comp}) — ${brief.trim()}. Could you confirm current pricing at ${p.moq||'our target'} MOQ, and lead time?\n\nThanks,\nAtelix buyer`;
}

async function requestDrafts(brief, intent, matches){
  state.stage = 'drafting';
  const stopTyping = showTyping();
  try{
    const payload = await callAgentAsk('draft', { brief, intent: trimIntent(intent), matches: trimMatchesForLLM(matches) });
    stopTyping();
    appendAgentMessage(payload.intro || fallbackRationale(intent, matches));
    const drafts = (payload.drafts||[]).filter(d=>findProduct(d.productId));
    finishDrafting(drafts.length ? drafts : matches.map(m=>({ productId:m.p.id, message: fallbackDraft(m.p, brief) })));
  }catch(err){
    stopTyping();
    appendAgentMessage(fallbackRationale(intent, matches) + " I've drafted outreach to each supplier below — review and edit before sending.");
    finishDrafting(matches.map(m=>({ productId:m.p.id, message: fallbackDraft(m.p, brief) })));
  }
}

function finishDrafting(drafts){
  state.drafts = drafts;
  state.stage = 'drafted';
  renderDrafts(drafts);
  el.approveBtn.classList.add('is-visible');
  updateSuggestions();
  appendAgentMessage('Send these as-is, tell me what to change, or send to suppliers when ready.');
}

async function requestRevision(instruction){
  const stopTyping = showTyping();
  try{
    const payload = await callAgentAsk('revise', {
      instruction,
      brief: state.intent && state.intent.text,
      drafts: state.drafts.map(d=>({productId:d.productId, message:d.message})),
      matches: trimMatchesForLLM(state.matches),
    });
    stopTyping();
    (payload.drafts||[]).forEach(u=>{
      const d = state.drafts.find(x=>x.productId===u.productId);
      if(d) d.message = u.message;
    });
    renderDrafts(state.drafts);
    appendAgentMessage(payload.intro || 'Updated all drafts.');
  }catch(err){
    stopTyping();
    appendAgentMessage("Couldn't reach the drafting model just now — you can still edit each message directly above, or try again in a moment.");
  }
}

/* ================= approve / send ================= */

function approveAndSend(){
  if(state.stage !== 'drafted' || !state.drafts.length) return;
  state.stage = 'sending';
  el.approveBtn.classList.remove('is-visible');
  el.suggestions.hidden = true;
  appendUserMessage('Send to suppliers');
  const stopTyping = showTyping();
  setTimeout(()=>{
    stopTyping();
    markDraftsSent();
    state.drafts.forEach(d=>d.sent = true);
    state.stage = 'sent';
    pushConfirmation(`${state.drafts.length} RFQs sent`, 'awaiting quotes');
    appendAgentMessage(`Sent ${state.drafts.length} RFQs. I'll let you know as suppliers reply — you can also ask me to add a favorite to your cart, wishlist it, or take a deposit.`);
    updateSuggestions();
  }, 900 + state.drafts.length * 260);
}

/* ================= cart / wishlist / payment (simulated) ================= */

function toggleWishlist(id, force){
  const p = findProduct(id);
  if(!p) return false;
  const had = state.wishlist.has(id);
  const on = force===undefined ? !had : true;
  if(on) state.wishlist.add(id); else state.wishlist.delete(id);
  el.wishlistCount.textContent = state.wishlist.size;
  el.wishlistCount.classList.toggle('is-visible', state.wishlist.size>0);
  el.wishlistBtn.classList.toggle('is-active', state.wishlist.size>0);
  const card = el.grid.querySelector(`[data-product-id="${cssEscape(id)}"]`);
  if(card) card.querySelector('[data-wish]').classList.toggle('is-saved', on);
  return on;
}

function addToCart(id, qty){
  if(!findProduct(id)) return;
  state.cart.set(id, (state.cart.get(id)||0) + (qty||1));
  const count = [...state.cart.values()].reduce((a,b)=>a+b,0);
  el.cartCount.textContent = count;
  el.cartCount.classList.toggle('is-visible', count>0);
  el.cartBtn.classList.toggle('is-active', count>0);
}

function simulatePayment(id, amount){
  const p = findProduct(id);
  if(!p) return;
  const div = document.createElement('div');
  div.className = 'apoc-payment';
  div.innerHTML = `<div class="apoc-pay-amount">Processing…</div><div class="apoc-pay-meta">${escapeHtml(p.name)}</div>`;
  el.paymentSlot.appendChild(div);
  setTimeout(()=>{
    div.innerHTML = `
      <div class="apoc-pay-amount">$${fmtMoney(amount)} paid</div>
      <div class="apoc-pay-meta">${escapeHtml(p.name)} · ${escapeHtml(p.seller)}</div>
      <div class="apoc-pay-card">Visa •••• 4242 · receipt sent</div>`;
    pushConfirmation('Payment complete', '$' + fmtMoney(amount));
  }, 1000);
}

/* ================= intent routing for free-text turns ================= */

function resolveRef(text){
  const t = text.toLowerCase();
  const pool = state.matches.length ? state.matches.map(m=>m.p) : (window.ARCANA_PRODUCTS||[]).slice(0,50);
  for(const p of pool){
    const tokens = [p.style_code, p.seller, ...String(p.name).split(/\s+/)].filter(Boolean);
    if(tokens.some(tok => String(tok).length>3 && t.includes(String(tok).toLowerCase()))) return p.id;
  }
  return state.lastRef || (pool[0] && pool[0].id) || null;
}
function parseQty(text){
  const m = text.match(/(\d[\d,]*)\s*(m|meters?|metres?|kg|units?|pcs?)\b/i);
  return m ? parseInt(m[1].replace(/,/g,''),10) : null;
}

const APPROVE_RE = /\b(yes please|yes,? do it|go ahead|send (it|them)( now)?|approve|looks good,? send|ship it)\b/i;
const CART_RE = /\badd\b.*\bcart\b|\bcart\b.*\badd\b/i;
const WISH_RE = /\bwishlist\b|\bsave (it|this)\b|\bfavorite\b/i;
const PAY_RE = /\bpay\b|\bcharge\b|\bdeposit\b|\bcheckout\b/i;
const WATCH_RE = /\bwatch\b.*\bprice\b|\bnotify me\b|\btext me\b|\balert me\b/i;

function handleComposerSubmit(text){
  text = String(text||'').trim();
  if(!text) return;
  appendUserMessage(text);
  el.composerInput.value = '';
  el.sendBtn.disabled = true;

  if(APPROVE_RE.test(text) && state.stage==='drafted'){ approveAndSend(); return; }

  if(CART_RE.test(text)){
    const id = resolveRef(text), qty = parseQty(text) || 1;
    if(id){ addToCart(id, qty); const p=findProduct(id);
      setTimeout(()=>{ appendAgentMessage(`Added ${p.name} to cart (qty ${qty}). Simulated — nothing charged yet.`); pushConfirmation('Added to cart', p.name); }, 500);
    } else appendAgentMessage('Which item should I add to cart?');
    return;
  }
  if(WISH_RE.test(text)){
    const id = resolveRef(text);
    if(id){ const on = toggleWishlist(id, true); const p=findProduct(id);
      setTimeout(()=>{ appendAgentMessage(`${on?'Saved':'Removed'} ${p.name} ${on?'to':'from'} your wishlist.`); if(on) pushConfirmation('Wishlisted', p.name); }, 450);
    } else appendAgentMessage('Which item should I save?');
    return;
  }
  if(PAY_RE.test(text)){
    const id = resolveRef(text);
    if(id){
      const p = findProduct(id), qty = parseQty(text) || 100;
      const amount = Math.round(p.price * Math.min(qty, 500) * 100)/100;
      setTimeout(()=> simulatePayment(id, amount), 300);
    } else appendAgentMessage('Which order should I take payment for?');
    return;
  }
  if(WATCH_RE.test(text)){
    const id = resolveRef(text), p = id ? findProduct(id) : null;
    setTimeout(()=>{
      appendAgentMessage(`Watching ${p?p.name:'that item'} for a price drop — I'll text you.`);
      pushConfirmation('Watcher set', 'SMS');
    }, 450);
    return;
  }

  if(state.stage==='idle' || state.stage==='sent'){ setTimeout(()=>runSearch(text), 200); return; }
  if(state.stage==='drafted'){ requestRevision(text); return; }
  setTimeout(()=>appendAgentMessage('One moment — still working on the last step.'), 300);
}

/* ================= wiring ================= */

function init(){
  el.composerForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    handleComposerSubmit(el.composerInput.value);
  });
  el.composerInput.addEventListener('input', ()=>{
    el.sendBtn.disabled = !el.composerInput.value.trim();
  });
  document.querySelectorAll('.apoc-example').forEach(btn=>{
    btn.addEventListener('click', ()=> handleComposerSubmit(btn.dataset.example));
  });
  el.approveBtn.addEventListener('click', approveAndSend);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
