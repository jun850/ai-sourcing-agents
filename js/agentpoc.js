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

   Athelia is available to every signed-in account (subject to the shared
   per-user daily usage cap enforced in the copilot-agent function). */
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
  transcript: $('transcript'),
  composerForm: $('composerForm'), composerInput: $('composerInput'), sendBtn: $('sendBtn'),
  suggestions: $('suggestions'),
  wishlistBtn: $('wishlistBtn'), wishlistCount: $('wishlistCount'),
  cartBtn: $('cartBtn'), cartCount: $('cartCount'),
  threadList:$('threadList'), rfqList:$('rfqList'), rfqCount:$('rfqCount'), newThreadBtn:$('newThreadBtn'),
  workspaceLabel:$('workspaceLabel'), rfqReview:$('rfqReview'), rfqSelection:$('rfqSelection'),
  dispatchRfqBtn:$('dispatchRfqBtn'), saveResearchBtn:$('saveResearchBtn'),
};

const state = {
  ready: false,
  busy: false,
  history: [],      // LLM conversation: {role:'user'|'assistant', content}
  brief: '',        // accumulated sourcing text, for deterministic matching
  candidates: [],   // current deterministic matches (product objects)
  lastRef: null,    // product the conversation is currently "about"
  lastResale: null, // {amount, currency} carried across turns
  threadId:null,
  threads:[],
  rfqs:[],
  selectedRfq:null,
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
function usd(n){ return '$' + (Number(n)||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function enforceUsdReply(reply,candidates){
  const prices=(candidates||[]).map(p=>Number(p&&p.price)).filter(n=>Number.isFinite(n)&&n>0);
  return String(reply||'').replace(/(?:¥|￥|jpy|yen)\s*([\d,.]+)/gi,(_match,raw)=>{
    const quoted=Number(String(raw).replace(/,/g,''));
    const canonical=prices.find(price=>Math.abs(price-quoted)<0.0001);
    return canonical!=null ? usd(canonical) : 'USD pricing shown on the product card';
  });
}
function scrollToBottom(){ requestAnimationFrame(()=>{ window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'}); }); }
function trimCandidate(p){ return { id:p.id, name:p.name, seller:p.seller, loc:p.loc, price:p.price, unit:p.unit, moq:p.moq, spec:p.spec, comp:p.comp, certs:p.certs||[] }; }

/* ================= header badges (real counts) ================= */

function syncBadges(){
  let cart = 0, saved = 0;
  // Distinct line items, not total quantity/meters — matches Store.cartCount()
  // in components.js (the header badge everywhere else on the site).
  try{ cart = (JSON.parse(localStorage.getItem('arcana_cart')||'[]')||[]).length; }catch(_){}
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
  el.transcript.appendChild(d); persistTurn('buyer',text); scrollToBottom();
}
function renderAgentTurn(text, metadata={}){
  const turn = document.createElement('div');
  turn.className = 'apoc-agent-turn';
  const d = document.createElement('div');
  d.className = 'apoc-msg is-agent';
  d.innerHTML = `<div class="apoc-bubble">${escapeHtml(text)}</div>`;
  turn.appendChild(d);
  const productIds=Array.isArray(metadata.productIds)?metadata.productIds:[];
  const matched=productIds.map(findProduct).filter(Boolean);
  if(matched.length) turn.appendChild(productCardsNode(matched));
  if(metadata.benchmark) turn.appendChild(benchmarkNode(metadata.benchmark));
  if(Array.isArray(metadata.rfqDrafts)) turn.appendChild(rfqDraftNode(metadata.rfqDrafts));
  if(metadata.researchOffer) turn.appendChild(researchOfferNode());
  el.transcript.appendChild(turn);
  return turn;
}
function appendAgent(text, metadata={}){
  const turn=renderAgentTurn(text,metadata);
  persistTurn('agent',text,metadata); scrollToBottom();
  return turn;
}

async function persistTurn(role,content,metadata={}){
  if(!state.threadId || !window.ARCANA_API?.saveAtheliaTurn) return;
  await window.ARCANA_API.saveAtheliaTurn(state.threadId,role,content,metadata);
}

function titleFor(text){ return String(text||'New sourcing request').replace(/\s+/g,' ').trim().slice(0,52); }
function updateRoute(params={}){
  const url=new URL(location.href); url.search=''; Object.entries(params).forEach(([key,value])=>{if(value)url.searchParams.set(key,value);}); history.replaceState({},'',url);
}
function renderWorkspace(){
  el.threadList.innerHTML=state.threads.map(t=>`<button class="apoc-work-item${t.id===state.threadId?' is-selected':''}" data-thread="${escapeHtml(t.id)}"><b>${escapeHtml(t.title)}</b><small>${new Date(t.updated_at).toLocaleDateString()}</small></button>`).join('')||'<p class="apoc-sidebar-empty">Your sourcing chats will appear here.</p>';
  el.rfqList.innerHTML=state.rfqs.map(r=>`<button class="apoc-work-item" data-rfq="${escapeHtml(r.id)}"><b>${escapeHtml(r.case_no)} · ${escapeHtml(r.title)}</b><small class="apoc-status apoc-status-${escapeHtml(r.status)}">${escapeHtml(r.status.replace(/_/g,' '))}</small></button>`).join('')||'<p class="apoc-sidebar-empty">No RFQs yet.</p>';
  el.rfqCount.textContent=state.rfqs.length;
  el.threadList.querySelectorAll('[data-thread]').forEach(b=>b.addEventListener('click',()=>openThread(b.dataset.thread)));
  el.rfqList.querySelectorAll('[data-rfq]').forEach(b=>b.addEventListener('click',()=>openRfq(b.dataset.rfq)));
}
async function refreshWorkspace(){
  const api=window.ARCANA_API; if(!api) return;
  const [threads,rfqs]=await Promise.all([api.getAtheliaThreads(),api.getAtheliaCases()]); state.threads=threads; state.rfqs=rfqs; renderWorkspace();
}
async function newThread(){
  const result=await window.ARCANA_API.createAtheliaThread(); if(result.error||!result.thread) return;
  state.threadId=result.thread.id; state.history=[]; state.brief=''; state.candidates=[]; el.transcript.innerHTML=''; el.rfqReview.hidden=true;
  el.workspaceLabel.textContent=result.thread.title; updateRoute({thread:state.threadId}); await refreshWorkspace(); if(el.hero)el.hero.hidden=false; el.composerInput.focus();
}
function openThread(id){
  const thread=state.threads.find(item=>item.id===id); if(!thread)return;
  state.threadId=id; state.selectedRfq=null; state.history=[]; el.transcript.innerHTML=''; el.rfqReview.hidden=true; el.workspaceLabel.textContent=thread.title;
  (thread.athelia_thread_messages||[]).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).forEach(message=>{if(message.role==='buyer')appendUserLoaded(message.content);else appendAgentLoaded(enforceUsdReply(message.content,products()),message.metadata||{}); state.history.push({role:message.role==='buyer'?'user':'assistant',content:message.content});});
  updateRoute({thread:id}); renderWorkspace(); if(el.hero)el.hero.hidden=!!state.history.length;
}
function appendUserLoaded(text){const d=document.createElement('div');d.className='apoc-msg is-user';d.innerHTML=`<div class="apoc-bubble">${escapeHtml(text)}</div>`;el.transcript.appendChild(d);}
function appendAgentLoaded(text,metadata={}){renderAgentTurn(text,metadata);}
function openRfq(id){
  const rfq=state.rfqs.find(item=>item.id===id);if(!rfq)return; state.selectedRfq=rfq; el.workspaceLabel.textContent=`${rfq.case_no} · ${rfq.title}`; el.transcript.innerHTML=''; el.rfqReview.hidden=false;
  el.rfqReview.querySelector('#rfqReviewTitle').textContent=rfq.title;
  el.rfqReview.querySelector('#rfqReviewCopy').textContent=`${rfq.status.replace(/_/g,' ')} · ${(rfq.rfq_supplier_requests||[]).length} supplier${(rfq.rfq_supplier_requests||[]).length===1?'':'s'}`;
  el.rfqSelection.innerHTML=(rfq.rfq_supplier_requests||[]).map(item=>`<div class="apoc-rfq-row"><b>${escapeHtml(item.products?.name||'Selected product')}</b><span>${escapeHtml(item.factories?.name||'Supplier')} · ${escapeHtml(item.status.replace(/_/g,' '))}</span></div>`).join('');
  el.dispatchRfqBtn.hidden=true; el.saveResearchBtn.hidden=true; updateRoute({rfq:id});
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

function productCardsNode(list){
  const grid = document.createElement('div');
  grid.className = 'apoc-grid apoc-turn-cards';
  grid.innerHTML = list.map(cardHtml).join('');
  grid.querySelectorAll('[data-product-id]').forEach(card=>{
    const id = card.dataset.productId;
    card.querySelector('[data-wish]').addEventListener('click', e=>{ e.preventDefault(); doWishlist(id); });
    card.querySelector('[data-add]').addEventListener('click', e=>{ e.preventDefault(); doAddToCart(id, defaultQty(id)); });
  });
  return grid;
}
/* ================= inline benchmark card (real numbers) ================= */

function benchmarkCardHtml(rc){
  const bm = rc.benchmark;
  if(bm.insufficient){
    return `<div class="apoc-benchmark"><div class="apoc-bm-head">Only ${bm.n} comparable ${escapeHtml(bm.label)} SKU${bm.n===1?'':'s'} — too few to benchmark confidently.</div></div>`;
  }
  const verdictLabel = { value:'below market', typical:'in line with market', premium:'above market' }[rc.verdict] || rc.verdict;
  const shareLine = rc.perUnitShare!=null
    ? `<div class="apoc-bm-row"><span>Material cost / ${escapeHtml(rc.product.unit)}</span><b>${usd(rc.product.usd)} · ${(rc.perUnitShare*100).toFixed(1)}% of resale</b></div>`
    : '';
  return `
  <div class="apoc-benchmark" data-product-id="${escapeHtml(rc.product.id)}">
    <div class="apoc-bm-head">${escapeHtml(rc.product.name)} — <span class="apoc-bm-verdict apoc-bm-${escapeHtml(rc.verdict)}">${escapeHtml(verdictLabel)}</span></div>
    <div class="apoc-bm-grid">
      <div class="apoc-bm-row"><span>This fabric</span><b>${usd(rc.product.usd)}/${escapeHtml(rc.product.unit)}</b></div>
      <div class="apoc-bm-row"><span>Peer median (${bm.n} ${escapeHtml(bm.label)})</span><b>${usd(bm.usd.median)}</b></div>
      <div class="apoc-bm-row"><span>Peer range</span><b>${usd(bm.usd.min)}–${usd(bm.usd.max)}</b></div>
      <div class="apoc-bm-row"><span>Percentile</span><b>${rc.percentile==null?'—':rc.percentile+'th (cheaper than '+(100-rc.percentile)+'% of peers)'}</b></div>
      ${shareLine}
    </div>
    <div class="apoc-bm-actions">
      <button type="button" class="apoc-card-add" data-bm-add>Add to cart</button>
    </div>
  </div>`;
}
function benchmarkNode(rc){
  const wrap = document.createElement('div');
  wrap.innerHTML = benchmarkCardHtml(rc);
  const node = wrap.firstElementChild;
  const addBtn = node.querySelector('[data-bm-add]');
  if(addBtn) addBtn.addEventListener('click', ()=> doAddToCart(rc.product.id, defaultQty(rc.product.id)));
  return node;
}
/* ================= inline drafted inquiries ================= */

function rfqDraftNode(drafts){
  const valid = drafts.filter(d=>findProduct(d.productId));
  if(!valid.length) return document.createElement('div');
  const wrap = document.createElement('div');
  wrap.className = 'apoc-drafts apoc-rfq-turn';
  wrap.innerHTML = valid.map(d=>{
    const p = findProduct(d.productId);
    return `
    <div class="apoc-draft" data-draft-id="${escapeHtml(d.productId)}">
      <div class="apoc-draft-head"><div class="apoc-draft-to">${escapeHtml(p.seller)} <small>re: ${escapeHtml(p.name)}</small></div></div>
      <textarea data-body rows="4">${escapeHtml(d.message)}</textarea>
    </div>`;
  }).join('');
  const usable=valid.filter(d=>{const p=findProduct(d.productId);return p&&p.factoryId;});
  if(usable.length){
    const actions=document.createElement('div');
    actions.className='apoc-rfq-actions';
    actions.innerHTML='<button class="apoc-secondary" type="button" data-research>Need research instead</button><button class="apoc-primary" type="button" data-dispatch>Send selected RFQs</button>';
    wrap.appendChild(actions);
    wrap.querySelectorAll('.apoc-draft').forEach((draft,index)=>{
      const check=document.createElement('label');
      check.className='apoc-rfq-choice';
      check.innerHTML=`<input type="checkbox" data-rfq-product="${escapeHtml(draft.dataset.draftId)}" ${index===0?'checked':''}><span><b>Include this supplier</b><small>The editable inquiry above is sent only after approval.</small></span>`;
      draft.appendChild(check);
    });
    actions.querySelector('[data-dispatch]').addEventListener('click',()=>dispatchRfqFromTurn(wrap));
    actions.querySelector('[data-research]').addEventListener('click',()=>saveResearchCase());
  }
  return wrap;
}
function researchOfferNode(){
  const node=document.createElement('div');
  node.className='apoc-rfq-turn apoc-research-offer';
  node.innerHTML='<button class="apoc-secondary" type="button">Save for sourcing research</button>';
  node.querySelector('button').addEventListener('click',()=>saveResearchCase());
  return node;
}
async function dispatchRfqFromTurn(turn){
  const choices=[...turn.querySelectorAll('[data-rfq-product]:checked')].map(input=>({productId:input.dataset.rfqProduct,body:input.closest('.apoc-draft').querySelector('[data-body]').value.trim()})).filter(choice=>choice.body);
  if(!choices.length){ appendAgent('Select at least one verified supplier first.'); return; }
  const dispatch=turn.querySelector('[data-dispatch]'); if(dispatch) dispatch.disabled=true;
  const brief={text:state.brief,history:state.history.filter(item=>item.role==='user').slice(-8)};
  const title=titleFor(state.brief||choices[0].productId);
  const created=await window.ARCANA_API.createAtheliaCase({threadId:state.threadId,title,brief,status:'draft'});
  if(created.error||!created.rfq){ appendAgent('I could not prepare that RFQ. Please try again.'); if(dispatch) dispatch.disabled=false; return; }
  const requests=choices.map(choice=>{const p=findProduct(choice.productId);return {product_id:p.databaseId||p.id,body:choice.body};});
  const sent=await window.ARCANA_API.dispatchAtheliaRfq(created.rfq.id,requests);
  if(sent.error){ appendAgent('The RFQ was saved as a draft, but it was not sent. Please try again.'); if(dispatch) dispatch.disabled=false; await refreshWorkspace(); return; }
  appendAgent(`Sent ${requests.length} RFQ${requests.length===1?'':'s'} to selected suppliers. I’ll show their replies here as they arrive.`);
  turn.querySelectorAll('textarea,input,button').forEach(control=>control.disabled=true);
  await refreshWorkspace();
}
async function saveResearchCase(){
  const title=titleFor(state.brief||'Unmatched sourcing request');
  const created=await window.ARCANA_API.createAtheliaCase({threadId:state.threadId,title,brief:{text:state.brief},status:'needs_research'});
  if(created.error||!created.rfq){ appendAgent('I could not save the research request.'); return; }
  const subject=encodeURIComponent(`${created.rfq.case_no}: ${title}`),body=encodeURIComponent(`RFQ case: ${created.rfq.case_no}\n\n${state.brief}\n\nPlease help us research verified sourcing options.`);
  await refreshWorkspace(); window.location.href=`mailto:info@arcanawangsa.com?subject=${subject}&body=${body}`;
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
function doRemoveFromCart(id){
  const r = actions().removeFromCart(id);
  if(!r.ok){
    if(r.reason==='not_in_cart'){ const p=findProduct(id); const m=`${p?p.name:'That item'} isn't in your cart.`; appendAgent(m); logAgent(m); return; }
    handleActionError(r.reason); return;
  }
  state.lastRef = id;
  syncBadges();
  pushConfirmation('Removed from cart', r.product.name.split(' ').slice(0,2).join(' '));
  const msg = `Removed ${r.product.name} from your cart.`;
  appendAgent(msg); logAgent(msg);
}
function doSetQty(id, qty){
  const r = actions().setCartQty(id, qty);
  if(!r.ok){
    if(r.reason==='not_in_cart'){ doAddToCart(id, qty); return; }
    handleActionError(r.reason); return;
  }
  state.lastRef = id;
  syncBadges();
  pushConfirmation('Quantity updated', `${r.qty} ${r.product.unit||''}`.trim());
  const msg = `Updated ${r.product.name} to ${r.qty} ${r.product.unit||'units'}.`;
  appendAgent(msg); logAgent(msg);
}
function doDecreaseQty(id, amount){
  const current = actions().cartQty(id);
  if(!current){ const p=findProduct(id); const m=`${p?p.name:'That item'} isn't in your cart.`; appendAgent(m); logAgent(m); return; }
  const next = current - amount;
  if(next <= 0){ doRemoveFromCart(id); return; }
  doSetQty(id, next);
}
function doRemoveFromWishlist(id){
  if(!actions().isSaved(id)){ const p=findProduct(id); const m=`${p?p.name:'That item'} isn't on your wishlist.`; appendAgent(m); logAgent(m); return; }
  doWishlist(id); // toggles off — it's currently saved
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
// Best product match for `text` against `pool` — a full quoted product name
// wins outright (avoids two products sharing one generic word like "Wool"
// picking whichever iterates first), then loose token overlap.
function bestMatchIn(text, pool){
  const t = text.toLowerCase();
  for(const p of pool){
    const name = String(p.name||'').toLowerCase();
    if(name && t.includes(name)) return p.id;
  }
  let best = null, bestScore = 0;
  for(const p of pool){
    const tokens = [p.style_code, p.seller, ...String(p.name||'').split(/\s+/)].filter(Boolean);
    const score = tokens.filter(tok => String(tok).length>3 && t.includes(String(tok).toLowerCase())).length;
    if(score > bestScore){ bestScore = score; best = p.id; }
  }
  return best;
}
function resolveRef(text){
  const pool = state.candidates.length ? state.candidates : products().slice(0,80);
  return bestMatchIn(text, pool) || state.lastRef || (pool[0] && pool[0].id) || null;
}
function idsFromLocal(key){
  try{
    const raw = JSON.parse(localStorage.getItem(key)||'[]')||[];
    return raw.map(i=>typeof i==='string'?i:i&&i.id).filter(Boolean);
  }catch(_){ return []; }
}
// Cart/wishlist edits ("remove it", "add 10 more", "unsave that") are almost
// always about something already in that list — resolve against its real
// contents first (and if it holds exactly one item, an unnamed "it"/"that"
// unambiguously means that one) before falling back to the conversation's
// candidate pool, which can have drifted since the item was added.
function resolveAgainst(text, storageKey){
  const items = idsFromLocal(storageKey).map(findProduct).filter(Boolean);
  if(items.length){
    const hit = bestMatchIn(text, items);
    if(hit) return hit;
    if(items.length===1) return items[0].id;
  }
  return resolveRef(text);
}
function resolveCartRef(text){ return resolveAgainst(text, 'arcana_cart'); }
function resolveWishlistRef(text){ return resolveAgainst(text, 'arcana_saved'); }
function parseQty(text){
  const t = String(text||'');
  let m = t.match(/(\d[\d,]*)\s*(m|meters?|metres?|kg|units?|pcs?|pieces?)\b/i);
  if(m) return parseInt(m[1].replace(/,/g,''),10);
  // relative phrasing with no unit word: "add 10 more", "add another 25"
  m = t.match(/(\d[\d,]*)\s*(?:more|extra|additional)\b/i) || t.match(/\banother\s+(\d[\d,]*)\b/i);
  return m ? parseInt(m[1].replace(/,/g,''),10) : null;
}
function parseSetQty(text){
  const m = text.match(/\bto\s+(\d[\d,]*)\b/i) || text.match(/\bmake\s+it\s+(\d[\d,]*)\b/i);
  return m ? parseInt(m[1].replace(/,/g,''),10) : null;
}
function parseDecreaseQty(text){
  let m = text.match(/\bby\s+(\d[\d,]*)\b/i);
  if(m) return parseInt(m[1].replace(/,/g,''),10);
  m = text.match(/\btake\s+(\d[\d,]*)\s*(?:m|meters?|metres?|kg|units?|pcs?|pieces?)?\s+off\b/i);
  if(m) return parseInt(m[1].replace(/,/g,''),10);
  m = text.match(/\bremove\s+(\d[\d,]*)\s*(?:m|meters?|metres?|kg|units?|pcs?|pieces?)\b/i);
  if(m) return parseInt(m[1].replace(/,/g,''),10);
  m = text.match(/\b(\d[\d,]*)\s*(?:less|fewer)\b/i);
  if(m) return parseInt(m[1].replace(/,/g,''),10);
  m = text.match(/\bminus\s+(\d[\d,]*)\b/i);
  if(m) return parseInt(m[1].replace(/,/g,''),10);
  return null;
}
// candidate ids/names the agent's reply mentions inline, so their cards render
function referencedInReply(reply){
  const text = String(reply||'');
  const low = text.toLowerCase();
  const out = [];
  for(const p of state.candidates){
    const id = String(p.id||'');
    const idHit = id && new RegExp('\\b'+id.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')+'\\b','i').test(text);
    const name = String(p.name||'');
    const nameHit = name.length>6 && low.includes(name.toLowerCase().slice(0,20));
    if(idHit || nameHit) out.push(p.id);
  }
  return out;
}

/* ================= deterministic action turn ================= */

function handleAction(text){
  const kind = Copilot().classifyAction(text);
  if(kind === 'checkout'){ doCheckout(); return; }

  if(kind === 'qty_set'){
    const id = resolveCartRef(text);
    const qty = parseSetQty(text);
    if(!id){ const m=`Which item's quantity should I change?`; appendAgent(m); logAgent(m); return; }
    if(qty == null){ const m=`What quantity should I set it to?`; appendAgent(m); logAgent(m); return; }
    doSetQty(id, qty);
    return;
  }
  if(kind === 'qty_decrease'){
    const id = resolveCartRef(text);
    if(!id){ const m=`Which item should I reduce?`; appendAgent(m); logAgent(m); return; }
    const amount = parseDecreaseQty(text);
    if(amount == null){ const m=`By how much should I reduce it?`; appendAgent(m); logAgent(m); return; }
    doDecreaseQty(id, amount);
    return;
  }
  if(kind === 'cart_remove'){
    const id = resolveCartRef(text);
    if(!id){ const m=`Which item should I remove from your cart?`; appendAgent(m); logAgent(m); return; }
    doRemoveFromCart(id);
    return;
  }
  if(kind === 'wishlist_remove'){
    const id = resolveWishlistRef(text);
    if(!id){ const m=`Which item should I remove from your wishlist?`; appendAgent(m); logAgent(m); return; }
    doRemoveFromWishlist(id);
    return;
  }
  if(kind === 'wishlist_add'){
    const id = resolveRef(text);
    if(id) doWishlist(id); else { const m=`Which item should I save?`; appendAgent(m); logAgent(m); }
    return;
  }
  // cart_add — the default: name a new fabric, or narrow an item already on
  // screen ("add 10 more" resolves against the item the conversation is
  // currently about via resolveRef's state.lastRef fallback).
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
  if(!state.candidates.length && kind==='sourcing'){
    const msg='I could not find a verified catalogue match for that brief. I can save it for research and prepare an email to the Atelix sourcing team.';
    appendAgent(msg,{researchOffer:true}); logAgent(msg); return;
  }

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
    const reply=enforceUsdReply(payload.reply,state.candidates);
    // Show cards for every product the agent surfaced — its `show` list PLUS any
    // candidate the reply names inline (ids like "FAB-154" or the product name),
    // so a product mentioned in prose always renders an add-to-cart card.
    const showIds = Array.from(new Set([...(payload.show||[]), ...referencedInReply(reply)]));
    const show = showIds.map(findProduct).filter(Boolean);
    appendAgent(reply,{productIds:show.map(p=>p.id),benchmark:benchmark&&benchmark.benchmark&&!benchmark.benchmark.insufficient?benchmark:null}); logAgent(reply);
    if(show.length) state.lastRef = show[0].id;
    if(payload.draftFor && payload.draftFor.length) requestDrafts(payload.draftFor);
    offerActions();
  }catch(err){
    stop();
    if(err.reason === 'not_available'){ showGate('unavailable'); return; }
    if(err.reason === 'unauthorized'){ showGate('signin'); return; }
    // Honest degradation: still surface the real, deterministic data we computed.
    const msg = `I couldn't reach the model just now, but here's what the live catalog shows.`;
    const top = state.candidates.slice(0,5);
    appendAgent(msg,{productIds:top.map(p=>p.id),benchmark:benchmark&&benchmark.benchmark&&!benchmark.benchmark.insufficient?benchmark:null}); logAgent(msg);
    offerActions();
  }
}

// The buyer gets an English RFQ by default; only a language they explicitly
// name switches it — never guessed from the supplier's own country.
function detectLang(text){
  const t = String(text||'').toLowerCase();
  if(/japanese|in\s+japan\b|日本語/.test(t)) return 'ja';
  if(/chinese|mandarin|in\s+china\b|中文/.test(t)) return 'zh';
  return 'en';
}
async function requestDrafts(targetIds){
  if(!state.candidates.length) return;
  // targetIds comes from the LLM's draftFor — the specific supplier(s) the buyer
  // actually asked for, not always every candidate on screen.
  const targets = Array.isArray(targetIds) && targetIds.length
    ? targetIds.map(findProduct).filter(Boolean)
    : state.candidates.slice(0,5);
  if(!targets.length) return;
  const lastUser = state.history.filter(h=>h.role==='user').slice(-1)[0];
  const lang = detectLang((lastUser||{}).content || state.brief);
  const stop = showTyping();
  const matches = targets.slice(0,5).map(trimCandidate);
  try{
    const payload = await callAgent('draft', { brief: state.brief || (state.history[state.history.length-1]||{}).content || '', matches, lang });
    stop();
    const intro=payload.intro || 'Here are inquiry drafts for the selected suppliers. Review and send only the ones you approve.';
    appendAgent(intro,{rfqDrafts:payload.drafts||[]}); logAgent(intro);
  }catch(err){
    stop();
    if(err.reason === 'not_available'){ showGate('unavailable'); return; }
    const fallback = targets.map(p=>({ productId:p.id, message: fallbackDraft(p, lang) }));
    const m = targets.length>1
      ? `Here are inquiry drafts for each supplier — copy them into the supplier chat on each product page.`
      : `Here's an inquiry draft — copy it into the supplier chat on the product page.`;
    appendAgent(m,{rfqDrafts:fallback}); logAgent(m);
  }
}
// Kept deliberately simple: only the greeting/sign-off are localized, the
// factual body stays plain-English so specs/numbers never get mistranslated.
const RFQ_GREETING = {
  en: { hi:name=>`Hi ${name} team,`, close:`Thanks,\nAtelix buyer` },
  ja: { hi:name=>`${name} ご担当者様`, close:`よろしくお願いいたします。\nAtelix バイヤー` },
  zh: { hi:name=>`${name} 团队，您好，`, close:`谢谢，\nAtelix 采购方` },
};
function fallbackDraft(p, lang){
  const supplier = String(p.seller||'').split(/[,(]/)[0].trim();
  const g = RFQ_GREETING[lang] || RFQ_GREETING.en;
  return `${g.hi(supplier)}\n\nWe're interested in ${p.name} (${p.spec||p.comp}). Could you confirm current pricing at ${p.moq||'our target'} MOQ and lead time?\n\n${g.close}`;
}

/* ================= suggestions ================= */

function offerActions(){
  const chips = ['Is this priced fairly?', 'Add top pick to cart', 'Draft an inquiry'];
  el.suggestions.innerHTML = chips.map(c=>`<button class="apoc-chip" type="button">${escapeHtml(c)}</button>`).join('');
  el.suggestions.hidden = false;
  el.suggestions.querySelectorAll('.apoc-chip').forEach((b,i)=> b.addEventListener('click', ()=>submit(chips[i])));
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
  showReady(); await refreshWorkspace();
  const params=new URLSearchParams(location.search), requested=params.get('thread'), rfq=params.get('rfq');
  if(rfq){ openRfq(rfq); return; }
  if(requested && state.threads.some(thread=>thread.id===requested)) openThread(requested);
  else if(state.threads[0]) openThread(state.threads[0].id);
  else await newThread();
  pickupBrief();
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
  el.newThreadBtn.addEventListener('click', newThread);
  document.querySelectorAll('[data-workspace-view]').forEach(button=>button.addEventListener('click',()=>{
    const rfqs=button.dataset.workspaceView==='rfqs';
    document.querySelectorAll('[data-workspace-view]').forEach(item=>item.classList.toggle('is-active',item===button));
    el.threadList.hidden=rfqs; el.rfqList.hidden=!rfqs;
  }));
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
