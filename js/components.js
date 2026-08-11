/* Atelix shared layer: stores, header/footer, toast, full interaction wiring */
(function(){
'use strict';

/* ---------- path helpers ---------- */
const ROOT = document.body.dataset.root === '..'; // true inside /pages
const P  = n => ROOT ? n : 'pages/' + n;          // link to a /pages file
const HOME = ROOT ? '../index.html' : 'index.html';
const ASSET = f => (ROOT ? '../assets/' : 'assets/') + f;
const productAsset = product => {
  const image = product && product.img;
  return ASSET(image && /\.(?:avif|jpe?g|png|webp)$/i.test(image) ? image : (image || 'fabric-stack') + '.webp');
};
const factoryAsset = factory => {
  const image = factory && factory.img;
  return ASSET(image && /\.(?:avif|jpe?g|png|webp)$/i.test(image) ? image : (image || 'factory-interior') + '.webp');
};
const factoryLocation = factory => {
  const cityById={
    'F-01':'Shaoxing','F-02':'Shaoxing','F-03':'Guangzhou','F-04':'Dongguan','F-05':'Huzhou',
    'F-06':'Fukui','F-07':'Imabari','F-08':'Tokyo','F-09':'Guangzhou','F-10':'Guangzhou',
    'F-11':'Osaka','F-12':'Wakayama','F-13':'Nishiwaki'
  };
  const city=cityById[factory&&factory.id] || String(factory&&factory.loc||'').split(',')[0].trim();
  return [city,factory&&factory.region].filter(Boolean).join(', ');
};
window.ATELIX_factoryAsset=factoryAsset;
window.ATELIX_factoryLocation=factoryLocation;
window.ATELIX_productAsset=productAsset;

/* ---------- stores (localStorage, mocked backend) ---------- */
const LS = {
  get(k, d){ try{ return JSON.parse(localStorage.getItem('arcana_'+k)) ?? d }catch(_){ return d } },
  set(k, v){ localStorage.setItem('arcana_'+k, JSON.stringify(v)); }
};
const Store = {
  session(){ return LS.get('session', null); },
  login(role, name){ LS.set('session', {role, name: name||(role==='seller'?'Zhejiang Greenknit':'Jessica Smith')}); },
  logout(){
    const clear=()=>{ localStorage.removeItem('arcana_session'); };
    if(window.ARCANA_API && ARCANA_API.signOut){ return Promise.resolve(ARCANA_API.signOut()).then(clear, clear); }
    clear(); return Promise.resolve();
  },
  cart(){ return LS.get('cart', []); },
  cartCount(){ return Store.cart().length; },        // distinct SKUs (header badge)
  cartUnits(){ return Store.cart().reduce((n,i)=>n+i.qty,0); },
  addToCart(id, qty){
    qty = qty||1;
    const c = Store.cart(); const row = c.find(i=>i.id===id);
    if(row) row.qty += qty; else c.push({id, qty});
    LS.set('cart', c); syncBadges();
    pushCartItem(id, row ? row.qty : qty);
    return Store.cartCount();
  },
  setQty(id, qty){ const c=Store.cart(); const r=c.find(i=>i.id===id); if(r){ r.qty=Math.max(1,qty); LS.set('cart',c); pushCartItem(id, r.qty); } },
  remove(id){ LS.set('cart', Store.cart().filter(i=>i.id!==id)); syncBadges(); pushCartItem(id, 0); },
  clearCart(){ localStorage.removeItem('arcana_cart'); localStorage.removeItem('arcana_addons'); syncBadges(); },
  addons(){ return LS.get('addons', {qc:false, ins:false}); },
  setAddon(k,v){ const a=Store.addons(); a[k]=!!v; LS.set('addons', a); },
  // legacy entries were plain SKU strings; normalize to {id, qty} on read.
  saved(){ return LS.get('saved', []).map(x => typeof x === 'string' ? {id:x, qty:1} : x); },
  isSaved(id){ return Store.saved().some(i=>i.id===id); },
  toggleSaved(id, qty){
    const s = Store.saved(); const i = s.findIndex(x=>x.id===id);
    const on = i<0;
    if(on) s.push({id, qty: qty||1}); else s.splice(i,1);
    LS.set('saved', s); syncBadges();
    pushWishlistItem(id, on ? (qty||1) : 0);
    return on;
  },
  setSavedQty(id, qty){
    const s=Store.saved(); const r=s.find(x=>x.id===id);
    if(r){ r.qty=Math.max(1,qty); LS.set('saved',s); pushWishlistItem(id, r.qty); }
  },
  removeSaved(id){ LS.set('saved', Store.saved().filter(i=>i.id!==id)); syncBadges(); pushWishlistItem(id, 0); },
  orders(){ return LS.get('orders', []).slice().reverse(); },
  getOrder(no){ return LS.get('orders', []).find(o=>o.no===no) || null; },
  saveOrder(order){ const o=LS.get('orders', []); o.push(order); LS.set('orders', o); },
  updateOrder(no, patch){ const o=LS.get('orders', []); const r=o.find(x=>x.no===no); if(r) Object.assign(r, patch); LS.set('orders', o); return r; }
};
window.ARCANA = Store;

/* ---------- Copilot match scoping ----------
   sessionStorage, not localStorage: the "why this matched" panel on a PDP
   must only reflect the ACTUAL result set from the most recent Copilot
   search, and must evaporate the moment the user steps outside the
   Copilot-results <-> PDP loop (home, plain category browsing, cart, nav
   elsewhere) — never resurface later, never appear on a product that
   wasn't really shown as a match. Writer: category.html's run(). Reader:
   product.html's match panel. */
const COP_MATCH_KEY = 'arcana_copilot_matches';
function setCopilotMatches(list){
  try{
    const items = {};
    (list||[]).forEach(r=>{ if(r && r.p) items[r.p.id] = {score:r.score, hits:r.hits, miss:r.miss, matched:r.matched, total:r.total}; });
    sessionStorage.setItem(COP_MATCH_KEY, JSON.stringify({items}));
  }catch(_){}
}
function getCopilotMatchFor(id){
  try{
    const raw = sessionStorage.getItem(COP_MATCH_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    return (data && data.items && data.items[id]) || null;
  }catch(_){ return null; }
}
window.ARCANA_setCopilotMatches = setCopilotMatches;
window.ARCANA_getCopilotMatchFor = getCopilotMatchFor;
(function pruneCopilotMatchesIfOutsideFlow(){
  const path = location.pathname;
  const onCopilotResults = /category\.html$/.test(path) && /(^|[?&])copilot=1(&|$)/.test(location.search);
  const onPDP = /product\.html$/.test(path);
  if(!onCopilotResults && !onPDP){ try{ sessionStorage.removeItem(COP_MATCH_KEY); }catch(_){} }
})();

/* ---------- icons ---------- */
const IC = {
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  caret:'<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20s-7-4.35-9.3-8.5C1 8 2.8 5 6 5c2 0 3.2 1.2 4 2.3C10.8 6.2 12 5 14 5c3.2 0 5 3 3.3 6.5C19 15.65 12 20 12 20z"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
  seller:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21h18M5 21V9l5-3v15M14 21V9l5 3v9M9 12h.01M9 15h.01"/></svg>',
  cart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.4a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  medal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="9" r="6"/><path d="m9 14-2 7 5-3 5 3-2-7"/></svg>',
  truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6h11v11H2zM13 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  headset:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="4" height="6" rx="1.5"/><rect x="18" y="14" width="4" height="6" rx="1.5"/><path d="M20 20a4 4 0 0 1-4 3h-2"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="var(--green)" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>',
  chevR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="m9 6 6 6-6 6"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  factory:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21V9l6 3V9l6 3V6l6 3v12z"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.2"/></svg>',
  tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
  msg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>',
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 8 12 3 3 8l9 5zM3 8v8l9 5 9-5V8"/></svg>',
  bookmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
  camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 8h3.2L9 5.4A1 1 0 0 1 9.8 5h4.4a1 1 0 0 1 .8.4L16.8 8H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.4"/></svg>',
  document:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>',
  spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/><circle cx="12" cy="12" r="3"/></svg>',
};
window.ARCANA_IC = IC;

/* ---------- shared product card (single source, used on every surface) ---------- */
// Shared cards always show the catalog price. Campaign pricing is currently hidden.
const rndRating = id=>{let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))>>>0;return (4.4+(h%7)/10).toFixed(1);};
const soldOf = id=>['500+','1rb+','2rb+','5rb+','800+'][id.charCodeAt(4)%5];
/* opts: {href, shop=true, fabricSpec=false} — language + currency aware */
function cardHTML(p, opts){
  opts = opts||{};
  const tr = window.ARCANA_TR||(s=>s), t = window.ARCANA_T||(s=>s), money = window.ARCANA_money||(n=>'US$'+n.toFixed(2));
  const href = opts.href || (P('product.html')+'?id='+p.id);
  const isService = p.cat==='oem';
  const badge =
    isService ? `<span class="tbadge">${t('OEM SERVICE')}</span>` :
    p.badge==='recycle' ? `<span class="tbadge" style="background:var(--green)">${t('RECYCLED')}</span>` :
    p.badge==='oem' ? '<span class="tbadge">OEM</span>' : '';
  const nm = tr(p.name), comp = tr(p.comp), spec = tr(p.spec);
  const title = (opts.fabricSpec && p.cat==='fabrics') ? `${nm} — ${comp}, ${spec}` : `${nm} — ${comp}`;
  const priceLine = p.price>0
    ? `${t('From')} ${money(p.price)}<small>/${tr(p.unit)}</small>`
    : `<span class="tquote">${t('Contact for quote')}</span>`;
  const meta = isService
    ? `<div class="tmeta">${IC.truck} ${spec} ${t('lead')} <span class="dot">·</span> ${t('MOQ')} ${tr(p.moq)}</div>`
    : `<div class="tmeta"><span class="star">★</span> ${rndRating(p.id)} <span class="dot">·</span> ${soldOf(p.id)} ${t('sold')}</div>`;
  const shopRow = (opts.shop===false) ? '' :
    `<div class="tshop"><span class="tnm">${tr(p.seller)}</span><span class="tvf">${IC.check}</span></div>`;
  return `<a class="tcard" href="${href}">
    <div class="tthumb">${badge}<img src="${productAsset(p)}" alt="${nm}" loading="lazy"></div>
    <div class="tbody">
      <h4>${title}</h4>
      <div class="tprice">${priceLine}</div>
      ${meta}
      ${shopRow}
      <div class="tloc">${IC.pin}<span>${tr(p.loc)}</span></div>
    </div></a>`;
}
/* pages register a render fn so cards/prices re-render on language switch */
const langRenderers = [];
window.ARCANA_onLang = fn => { if(typeof fn==='function'){ langRenderers.push(fn); } };
/* attach add-to-cart handlers inside a freshly-rendered container */
function wireCards(container){
  (container||document).querySelectorAll('.tcard [data-add]').forEach(b=>b.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    Store.addToCart(b.dataset.add,parseInt(b.dataset.qty||'1',10));
    const p=window.ARCANA_PRODUCT_MAP&&window.ARCANA_PRODUCT_MAP[b.dataset.add];
    toast(`Added ${p?p.name:'item'} to cart`, {href:P('cart.html'), label:'View cart'});}));
  // Fade thumbnails in as they finish loading instead of popping in. Default
  // (no .will-fade) stays opacity:1, and both load/error add .loaded, so an
  // image can never get stuck invisible.
  (container||document).querySelectorAll('.tthumb img').forEach(img=>{
    if(img.complete) return;
    img.classList.add('will-fade');
    const done=()=>img.classList.add('loaded');
    img.addEventListener('load',done,{once:true});
    img.addEventListener('error',done,{once:true});
  });
}
window.ARCANA_card = cardHTML;
window.ARCANA_wireCards = wireCards;

/* ---------- "Recommended for you" — used by empty cart/wishlist states ----------
   One pick per category first (so the shelf isn't all-fabrics), then filled
   randomly up to n. Non-deterministic by design (matches how a real reco
   shelf would vary); callers should compute it once per page load, not per render. */
function pickRecommended(n){
  n = n||8;
  const pool = (window.ARCANA_PRODUCTS||[]).filter(p=>p.cat!=='oem');
  const shuffle = arr=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const byCat = {};
  pool.forEach(p=>{ (byCat[p.cat]=byCat[p.cat]||[]).push(p); });
  const picks = [];
  shuffle(Object.keys(byCat)).forEach(c=>{ if(picks.length<n) picks.push(shuffle(byCat[c])[0]); });
  shuffle(pool.filter(p=>!picks.includes(p))).forEach(p=>{ if(picks.length<n) picks.push(p); });
  return picks.slice(0,n);
}
window.ARCANA_recommended = pickRecommended;

function markSVG(color){return `<svg class="mark" viewBox="0 0 2000 2000" fill="${color||'currentColor'}" aria-hidden="true">
<path d="M672.85,1077.33c-89.31,71.09-24.4,192-22.2,196.07-5.25-1.36-179.8-48.89-165.65-217.59,2.94-35.09,21.1-70.47,49.87-99.24,162.43-162.43,469.66,21.34,393.78,208.71h0c-42.2-97.19-153.7-169.12-255.8-87.95Z"/>
<path d="M1349.35,1273.4c2.2-4.07,67.11-124.98-22.2-196.07-121.59-96.68-256.4,23.72-271.9,145.31-15.42,121.59,79.56,198.95,79.56,198.95-81.77,58.55-134.81,153.62-134.81,153.62,0,0-53.04-95.07-134.81-153.62,113.28-92.12,69.22-261.95,239.57-432.3,190.62-190.62,399.61-60.17,410.23,66.51,14.15,168.7-160.4,216.23-165.65,217.59Z"/>
<path d="M1134.7,888.48l-4.7,5.4c10.52-50.25-1.28-105.4-35.41-144.55l-94.59-108.54-94.5,108.54c-34.21,39.25-46.01,94.41-35.41,144.65l-4.79-5.5c-74.4-85.38-74.4-223.75,0-309.12l134.7-154.56,134.7,154.56c74.4,85.38,74.4,223.75,0,309.12Z"/>
</svg>`;}

function brand(){
  return `<a class="brand" href="${HOME}" aria-label="Atelix">${markSVG()}<span class="brand-name"><span class="word">Atelix</span></span></a>`;
}
const searchBox=(ph)=>`<form class="search" role="search" data-search-form>
  <label class="visually-hidden" for="site-search">Search</label>${IC.search}
  <span class="s-chip" data-img-chip hidden></span>
  <input id="site-search" name="q" placeholder="${ph}" data-i18n-ph="search.ph" autocomplete="off" spellcheck="false"
    role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="search-pop">
  <button type="button" class="s-design" data-design-match aria-label="Match a design reference" title="Match a tech pack or design reference">${IC.document}</button>
  <button type="button" class="s-cam" data-cam aria-label="Search by image" title="Search by image">${IC.camera}</button>
  <div class="s-pop" id="search-pop" role="listbox" aria-label="Search suggestions" data-search-pop hidden></div>
</form>`;

const KAT=[
  ['Fabrics','Woven · Knit · Denim · Linen · Satin · Fleece · Canvas','fabrics'],
  ['Accessories','Zippers · Buttons · Labels · Hooks · Rivets · Buckles','accessories'],
  ['Trims','Ribbons · Elastics · Tapes · Cords · Lace · Bias binding','trims'],
  ['Yarns & Threads','Cotton · Polyester · Nylon · Blended · Sewing thread','yarns'],
  ['OEM Services','Sampling · Cut & Sew · Full Package · Private Label · Bulk','oem'],
  ['Factories','Verified mills · By region · Sustainable · OEM factories','factories'],
];
const katHref=slug=>slug==='factories'?P('factories.html'):P('category.html')+'?cat='+slug;
function katPanel(){
  const items=KAT.map((c,i)=>`<button class="kat-item${i===0?' on':''}" data-kat-item="${i}"><span>${c[0]}</span>${IC.chevR}</button>`).join('');
  const panels=KAT.map((c,i)=>`<div class="kat-detail${i===0?' on':''}" data-kat-detail="${i}"><h4>${c[0]}</h4><div class="kat-subs">${c[1].split(' · ').map(s=>`<a href="${katHref(c[2])}">${s}</a>`).join('')}</div><a class="kat-all" href="${katHref(c[2])}">View all ${c[0]} ${IC.chevR}</a></div>`).join('');
  return `<div class="kat-panel" data-kat-panel hidden><div class="kat-list">${items}</div><div class="kat-details">${panels}</div></div>`;
}

/* single auth cluster: one Log in + one Sign up, or account menu when signed in */
function authCluster(){
  const s = Store.session();
  if(s) return accountMenu(s);
  return `<a class="btn-login" href="${P('login.html')}" data-i18n="auth.login">Log in</a><a class="btn-daftar" href="${P('signup.html')}" data-i18n="auth.signup">Sign up</a>`;
}
function accountMenu(s){
  const initials = s.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const av = s.avatarUrl ? `<img src="${s.avatarUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : initials;
  const dest = s.role==='seller' ? P('dashboard.html') : P('brand-owner.html');
  const roleLabel = s.role==='seller' ? 'Factory · Seller' : s.role==='admin' ? 'Atelix · Admin' : 'Brand Owner · Buyer';
  const adminLink = s.role==='admin' ? `<a role="menuitem" href="${P('admin-orders.html')}">Users &amp; orders</a>` : '';
  return `<div class="acct" data-acct>
    <button class="acct-btn" aria-haspopup="true" aria-expanded="false"><span class="acct-av">${av}</span><span class="acct-nm">${s.name.split(' ')[0]}</span>${IC.caret}</button>
    <div class="acct-pop" role="menu" hidden>
      <div class="acct-hd"><span class="acct-av">${av}</span><div><b>${s.name}</b><span>${roleLabel}</span></div></div>
      <a role="menuitem" href="${dest}">${s.role==='seller'?'Supplier dashboard':'My profile'}</a>
      ${adminLink}
      <a role="menuitem" href="${P('cart.html')}">My cart</a>
      <a role="menuitem" href="${P('wishlist.html')}">Wishlist</a>
      <button role="menuitem" data-logout>${IC.logout}<span>Log out</span></button>
    </div>
  </div>`;
}

function buildHeader(){
  const body=document.body, root=document.getElementById('hdr');
  if(!root) return;
  const s = Store.session();
  const productContext=/\/product\.html$/.test(location.pathname);
  const mobileMarketplaceSearch=body.hasAttribute('data-marketplace-search');
  const accountOrOrders=/\/(?:brand-owner|orders|order)\.html$/.test(location.pathname);
  const desktopMarketplaceSearch=!accountOrOrders;
  // seller surface = explicit data-surface, or a signed-in seller viewing their workspace
  const seller = body.dataset.surface==='seller' || (s && s.role==='seller' && body.dataset.surface!=='buyer');
  const ph = seller ? 'Search your SKUs, orders and buyers…'
                    : (body.dataset.search || 'Search fabrics, trims, accessories, factories…');
  root.className='hdr'+(mobileMarketplaceSearch?'':' no-marketplace-search');
  // seller sees a workspace strip (no buyer "sell" pitch, no cart); buyer sees the sell pitch + cart
  const topbar = seller
    ? `<div class="topbar"><div class="topbar-in">
        <span class="tb-app">${IC.seller}<span>Supplier workspace</span></span>
        <a class="tb-app" href="${HOME}">Browse the marketplace ${IC.chevR}</a>
      </div></div>`
    : '';
  const cartIcon = seller ? '' :
    `<a class="ic-link cart-ic" href="${P('cart.html')}" aria-label="Cart">${IC.cart}<span class="badge-count" data-cart-badge hidden></span></a><span class="hdr-div"></span>`;
  const mobileBack=productContext
    ? `<a class="mobile-back" href="${P('category.html')}" aria-label="Back to browse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m14 5-7 7 7 7M7 12h13"/></svg></a>`
    : '';
  if(productContext) root.dataset.context='product';
  root.innerHTML=`
  ${topbar}
  <div class="hdr-in">
    ${mobileBack}
    ${brand()}
    <button class="kat-btn" data-kat aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg><span data-i18n="nav.categories">Categories</span>${IC.caret}</button>
    ${desktopMarketplaceSearch ? searchBox(ph) : ''}
    ${cartIcon}
    ${authCluster()}
    ${katPanel()}
  </div>`;
  syncBadges();
}

/* Phone navigation is deliberately a different information architecture from
   the desktop header. Buyer browsing is a frequent, thumb-led loop; seller
   and admin work remains contextual in the compact header and page tabs. */
function buildMobileNav(){
  const path=location.pathname;
  const focused=/\/(?:login|signup|forgot-password|reset-password|checkout|order|building)\.html$/.test(path);
  const workspace=document.body.dataset.surface==='seller'||/\/(?:dashboard|admin-orders|admin-supplier)\.html$/.test(path);
  const transactional=/\/(?:cart|product)\.html$/.test(path);
  if(focused||workspace||transactional||document.querySelector('.mobile-nav')) return;
  const current=(name, routes)=>routes.some(route=>path.endsWith('/'+route)||(!ROOT&&path.endsWith(route)))?'on':'';
  const onOrders=/\/orders\.html$/.test(path);
  const onAccount=/\/brand-owner\.html$/.test(path) && !onOrders;
  const nav=document.createElement('nav');
  nav.className='mobile-nav'; nav.setAttribute('aria-label','Primary navigation');
  nav.innerHTML=`
    <a class="${current('home',['index.html'])}" href="${HOME}">${markSVG()}<span>Home</span></a>
    <a class="${current('browse',['category.html','factories.html','supplier.html'])}" href="${P('category.html')}">${IC.search}<span>Browse</span></a>
    <a class="${current('saved',['wishlist.html'])}" href="${P('wishlist.html')}">${IC.heart}<span>Saved</span></a>
    <a class="${onOrders?'on':''}" href="${P('orders.html')}">${IC.document}<span>Orders</span></a>
    <a class="${onAccount?'on':''}" href="${P('brand-owner.html')}">${IC.user}<span>Account</span></a>`;
  document.body.appendChild(nav);
  syncBadges();
}

function buildFooter(){
  const el=document.getElementById('ftr'); if(!el) return;
  const building=P('building.html');
  const helpCenter=ROOT ? '../help-center' : 'help-center';
  const soc={
    x:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h3l-7 8 8 12h-6l-5-6-5 6H2l8-9L2 2h6l4 5z"/></svg>',
    li:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 9h3v12H3zM9 9h3v2a3.5 3.5 0 0 1 3-2c3 0 4 2 4 5v7h-3v-6c0-1.5-.5-2.5-2-2.5S12 14 12 15.5V21H9z"/></svg>',
    ig:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    fb:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v6h3v-6h3l1-3h-4v-2c0-.6.4-1 1-1z"/></svg>'
  };
  el.innerHTML=`
  <footer class="site-footer"><div class="sf-in">
    <div class="sf-brand">
      <div class="sf-word">Atelix</div>
      <p data-i18n="ft.tagline">The wholesale marketplace connecting brand owners with verified fabric mills and OEM factories.</p>
    </div>
    <div class="sf-col">
      <h5 data-i18n="ft.company">Atelix</h5>
      <a href="${building}" data-i18n="ft.about">About Atelix</a>
      <a href="${building}" data-i18n="ft.careers">Careers</a>
      <a href="${building}" data-i18n="ft.blog">Blog</a>
      <a href="${building}" data-i18n="ft.b2b">B2B sourcing</a>
      <a href="${building}" data-i18n="ft.trustsafety">Trust &amp; safety</a>
    </div>
    <div class="sf-col">
      <h5 data-i18n="ft.help">Help &amp; Guides</h5>
      <a href="${helpCenter}" data-i18n="ft.helpcenter">Help center</a>
      <a href="${building}" data-i18n="ft.terms">Terms &amp; conditions</a>
      <a href="${building}" data-i18n="ft.privacy">Privacy policy</a>
      <a href="${building}" data-i18n="ft.contact">Contact us</a>
    </div>
    <div class="sf-col">
      <h5 data-i18n="ft.follow">Follow us</h5>
      <div class="sf-social"><a href="${building}" aria-label="X">${soc.x}</a><a href="${building}" aria-label="LinkedIn">${soc.li}</a><a href="${building}" aria-label="Instagram">${soc.ig}</a><a href="${building}" aria-label="Facebook">${soc.fb}</a></div>
    </div>
  </div>
  <div class="sf-bottom">
    <span>© 2026 Atelix. <span data-i18n="ft.rights">All rights reserved.</span></span>
    <div class="lang-switch" data-lang-switch role="group" aria-label="Language">
      <button data-lang="en">English</button>
      <button data-lang="ja">日本語</button>
      <button data-lang="zh">中文</button>
    </div>
  </div></footer>`;
}

/* Fire-and-forget DB write-through for a cart line, only when signed in. */
function pushCartItem(sku, qty){
  const api = window.ARCANA_API;
  if(!api || api.unavailable || !Store.session()) return;
  api.syncCartItem(sku, qty).catch(()=>{});
}

/* Fire-and-forget DB write-through for a wishlist line, only when signed in. */
function pushWishlistItem(sku, qty){
  const api = window.ARCANA_API;
  if(!api || api.unavailable || !Store.session()) return;
  api.syncWishlistItem(sku, qty).catch(()=>{});
}

/* ---------- live badges ---------- */
function syncBadges(){
  const n = Store.cartCount();
  document.querySelectorAll('[data-cart-badge]').forEach(b=>{ b.textContent=n; b.hidden = n===0; });
  const s = Store.saved().length;
  document.querySelectorAll('[data-saved-badge]').forEach(b=>{ b.textContent=s; b.hidden = s===0; });
}

/* ---------- toast ---------- */
let toastEl;
function toast(msg, action){
  if(!toastEl){ toastEl=document.createElement('div'); toastEl.className='toast-wrap'; document.body.appendChild(toastEl); }
  const t=document.createElement('div'); t.className='toast'; t.setAttribute('role','status');
  t.innerHTML=`${IC.check}<span>${msg}</span>${action?`<a href="${action.href}">${action.label}</a>`:''}`;
  toastEl.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('in'));
  setTimeout(()=>{ t.classList.remove('in'); setTimeout(()=>t.remove(),250); }, 3200);
}
window.ARCANA_toast = toast;

/* ---------- contact-by-email: shared by the OEM CTA, "Email supplier",
   "Request Sample" and "Contact Supplier" — all route to a pre-filled
   mailto instead of an in-app flow. subjectPrefix becomes
   "<subjectPrefix> - <userId>" (profile id when signed in, else "guest"). */
async function contactEmail({subjectPrefix, bodyLines}){
  const api = window.ARCANA_API;
  const profile = api && api.getSessionProfile ? await api.getSessionProfile().catch(()=>null) : null;
  const userId = profile ? profile.id : 'guest';
  const subject = `${subjectPrefix} - ${userId}`;
  const body = (bodyLines||[]).filter(Boolean).join('\n');
  location.href = `mailto:info@arcanawangsa.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
window.ARCANA_contactEmail = contactEmail;

/* ---------- floating Athelia launcher (buyer surfaces) ---------- */
function buildCopilotFab(){
  if(!window.ARCANA_Copilot) return;
  const s=Store.session();
  const seller = document.body.dataset.surface==='seller' || (s && s.role==='seller' && document.body.dataset.surface!=='buyer');
  if(seller || /login\.html|signup\.html|checkout\.html/.test(location.pathname)) return;
  const t=window.ARCANA_T||(x=>x);
  const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const SPARK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/><circle cx="12" cy="12" r="3"/></svg>';
  const EG=['Organic cotton jersey, GOTS, under $7/m, MOQ ≤ 200',
            'Recycled polyester for activewear, low MOQ, GRS certified',
            'Soft cotton jersey, light enough for a summer shirt',
            'Warm brushed wool for a winter flannel shirt'];
  const wrap=document.createElement('div'); wrap.className='cop-fab';
  wrap.innerHTML=`
    <button type="button" class="cop-fab-btn" aria-expanded="false" aria-haspopup="dialog" aria-label="${esc(t('Athelia'))}">${markSVG()}</button>
    <div class="cop-fab-panel" role="dialog" aria-label="${esc(t('Athelia'))}" hidden>
      <div class="cop-fab-pop" data-cop-pop></div>
      <form class="cop-fab-bar" data-cop-form>
        <span class="cfb-mark" aria-hidden="true">${markSVG()}</span>
        <label class="visually-hidden" for="copFabInput">${esc(t("Describe what you're sourcing…"))}</label>
        <input id="copFabInput" autocomplete="off" placeholder="${esc(t("Describe what you're sourcing…"))}">
        <button class="cfb-go" type="submit" aria-label="${esc(t('Ask Athelia'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
      </form>
    </div>`;
  document.body.appendChild(wrap);
  const btn=wrap.querySelector('.cop-fab-btn'), panel=wrap.querySelector('.cop-fab-panel');
  const pop=wrap.querySelector('[data-cop-pop]'), form=wrap.querySelector('[data-cop-form]');
  const input=form.querySelector('input');
  function renderPop(){
    const brief=window.ARCANA_Copilot.getBrief();
    let h='';
    if(brief && brief.text){
      h+=`<div class="cfp-hd">${esc(t('Recent brief'))}</div>
          <button type="button" class="cfp-row" data-eg="${esc(brief.text)}">${SPARK}<span>${esc(brief.text)}</span></button>`;
    }
    h+=`<div class="cfp-hd">${esc(t('Try asking'))}</div>`+
      EG.map(e=>`<button type="button" class="cfp-row" data-eg="${esc(e)}">${IC.search}<span>${esc(e)}</span></button>`).join('');
    pop.innerHTML=h;
  }
  function open(){ renderPop(); panel.hidden=false; wrap.dataset.open='1';
    requestAnimationFrame(()=>panel.classList.add('in'));
    btn.setAttribute('aria-expanded','true'); input.focus(); }
  function close(focusBtn){ panel.classList.remove('in'); panel.hidden=true; delete wrap.dataset.open;
    btn.setAttribute('aria-expanded','false'); if(focusBtn) btn.focus(); }
  btn.addEventListener('click',open);
  form.addEventListener('submit',e=>{ e.preventDefault();
    const v=input.value.trim(); if(!v){ input.focus(); return; }
    window.ARCANA_Copilot.setBrief(v);
    if(!window.ARCANA_requireCopilotAuth()){ close(false); return; }
    location.href=P('category.html')+'?copilot=1'; });
  pop.addEventListener('click',e=>{ const r=e.target.closest('[data-eg]');
    if(r){ input.value=r.dataset.eg; input.focus(); } });
  input.addEventListener('keydown',e=>{ if(e.key==='Escape') close(true); });
  document.addEventListener('pointerdown',e=>{ if(!wrap.hidden && !wrap.contains(e.target) && !panel.hidden) close(false); });
  window.ARCANA_onLang(()=>{ input.placeholder=t("Describe what you're sourcing…"); if(!panel.hidden) renderPop(); });
}

/* ---------- Athelia auth gate: public users get a login/signup modal
   instead of AI-matched results. Basic catalog search stays open to
   everyone — only the Athelia surface (parsed brief, ranked
   verified matches, LLM summary) is a signed-in perk. The brief is always
   saved to localStorage BEFORE the gate opens, so login.html's ?next=
   round-trip lands the user straight back on their results. */
let copilotGateEl = null;
function ensureCopilotGate(){
  if(copilotGateEl) return copilotGateEl;
  const t = window.ARCANA_T||(x=>x);
  const esc = x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const next = encodeURIComponent('category.html?copilot=1');
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay cop-gate-overlay'; wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modal-box cop-gate cop-invite" role="dialog" aria-modal="true" aria-labelledby="cgTitle" aria-describedby="cgDesc">
      <button type="button" class="cop-gate-x" data-cg-close aria-label="${esc(t('Close'))}">&times;</button>
      <div class="cop-gate-art"><img src="${ASSET('copilot-gate.webp')}" alt="" width="168" height="168" loading="lazy"></div>
      <h3 id="cgTitle">${esc(t('Sign in to use Athelia'))}</h3>
      <p id="cgDesc" class="muted">${esc(t("Athelia matches your brief against every verified SKU in the catalog and explains why. It's free for brand owners — sign in or create an account to see your ranked results."))}</p>
      <div class="modal-actions" style="justify-content:center">
        <a class="btn btn-out" href="${P('login.html')}?next=${next}">${esc(t('Log in'))}</a>
        <a class="btn btn-green" href="${P('signup.html')}">${esc(t('Sign up free'))}</a>
      </div>
      <button type="button" class="cop-gate-later" data-cg-close>${esc(t('Continue browsing without Athelia'))}</button>
    </div>`;
  document.body.appendChild(wrap);
  let closeT = null;
  const close = ()=>{
    clearTimeout(closeT);
    wrap.classList.remove('in');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    closeT = setTimeout(()=>{
      wrap.hidden = true;
      if(openTrigger && document.contains(openTrigger)) openTrigger.focus();
    }, reduce?0:180);
  };
  wrap.querySelectorAll('[data-cg-close]').forEach(b=>b.addEventListener('click',close));
  wrap.addEventListener('pointerdown',e=>{ if(e.target===wrap) close(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !wrap.hidden) close(); });
  copilotGateEl = wrap;
  return wrap;
}
let openTrigger = null;
function openCopilotGate(){
  const wrap = ensureCopilotGate();
  openTrigger = document.activeElement;
  wrap.hidden = false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>wrap.classList.add('in')));
  const focusTarget = wrap.querySelector('.btn-out');
  if(focusTarget) focusTarget.focus();
}
window.ARCANA_openCopilotGate = openCopilotGate;
/* Call at the point of Copilot submission. Returns true (proceed) when
   signed in; opens the gate and returns false otherwise. */
window.ARCANA_requireCopilotAuth = function(){
  if(Store.session()) return true;
  openCopilotGate();
  return false;
};

/* ---------- Design Match: private, session-only tech-pack analysis ---------- */
const DESIGN_MATCH_KEY='arcana_design_match';
function setDesignMatch(value){
  try{ if(value) sessionStorage.setItem(DESIGN_MATCH_KEY,JSON.stringify(value)); else sessionStorage.removeItem(DESIGN_MATCH_KEY); }catch(_){}
}
window.ARCANA_getDesignMatch=function(){ try{return JSON.parse(sessionStorage.getItem(DESIGN_MATCH_KEY)||'null');}catch(_){return null;} };
window.ARCANA_clearDesignMatch=function(){ setDesignMatch(null); };

let designMatchModal;
function ensureDesignMatchModal(){
  if(designMatchModal) return designMatchModal;
  const wrap=document.createElement('div');
  wrap.className='modal-overlay design-match-overlay'; wrap.hidden=true;
  wrap.innerHTML=`<section class="design-match-modal" role="dialog" aria-modal="true" aria-labelledby="dmTitle" aria-describedby="dmDesc">
    <button type="button" class="dm-close" data-dm-close aria-label="Close">&times;</button>
    <div class="dm-mark">${IC.document}</div>
    <h2 id="dmTitle">Match a design to verified suppliers</h2>
    <p id="dmDesc">Upload a tech pack or reference as an image or PDF. Athelia reads it into a sourcing brief, then Atelix matches OEM, fabric, and trim suppliers.</p>
    <form data-dm-form>
      <input type="file" data-dm-files accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden>
      <button type="button" class="dm-drop" data-dm-browse>
        ${IC.document}<span><b>Drop files here or browse</b><small>JPG, PNG, WebP, or PDF · up to 8 files</small></span>
      </button>
      <ul class="dm-files" data-dm-list aria-live="polite"></ul>
      <p class="dm-note">Private to this browser session. Source files are analyzed in transit and are not saved to your Atelix profile.</p>
      <div class="dm-actions"><button type="button" class="btn btn-out" data-dm-close>Cancel</button><button type="submit" class="btn btn-green" data-dm-submit disabled>Analyze design</button></div>
    </form>
  </section>`;
  document.body.appendChild(wrap); designMatchModal=wrap;
  const input=wrap.querySelector('[data-dm-files]'), list=wrap.querySelector('[data-dm-list]'), submit=wrap.querySelector('[data-dm-submit]');
  let files=[];
  const close=()=>{ wrap.classList.remove('in'); wrap.hidden=true; };
  const renderFiles=()=>{
    list.innerHTML=files.map((file,index)=>`<li><span>${IC.document}<b>${String(file.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</b><small>${(file.size/1024/1024).toFixed(file.size>1024*1024?1:0)} MB</small></span><button type="button" data-dm-remove="${index}" aria-label="Remove ${String(file.name).replace(/"/g,'')}">&times;</button></li>`).join('');
    submit.disabled=!files.length;
  };
  const accept=added=>{
    const allowed=file=>/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type);
    const invalid=added.find(file=>!allowed(file)); if(invalid){toast('Use JPG, PNG, WebP, or PDF files.');return;}
    files=[...files,...added].slice(0,8); renderFiles();
  };
  input.addEventListener('change',()=>{accept([...input.files]);input.value='';});
  wrap.querySelector('[data-dm-browse]').addEventListener('click',()=>input.click());
  wrap.querySelector('[data-dm-browse]').addEventListener('dragover',event=>{event.preventDefault();wrap.querySelector('[data-dm-browse]').classList.add('drag');});
  wrap.querySelector('[data-dm-browse]').addEventListener('dragleave',()=>wrap.querySelector('[data-dm-browse]').classList.remove('drag'));
  wrap.querySelector('[data-dm-browse]').addEventListener('drop',event=>{event.preventDefault();wrap.querySelector('[data-dm-browse]').classList.remove('drag');accept([...(event.dataTransfer&&event.dataTransfer.files||[])]);});
  list.addEventListener('click',event=>{const button=event.target.closest('[data-dm-remove]');if(button){files.splice(+button.dataset.dmRemove,1);renderFiles();}});
  wrap.querySelectorAll('[data-dm-close]').forEach(button=>button.addEventListener('click',close));
  wrap.addEventListener('pointerdown',event=>{if(event.target===wrap)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!wrap.hidden)close();});
  wrap.querySelector('[data-dm-form]').addEventListener('submit',async event=>{
    event.preventDefault(); if(!files.length) return;
    const api=window.ARCANA_API; if(!api||!api.analyzeDesign){toast('Design analysis is unavailable.');return;}
    submit.disabled=true; submit.textContent='Reading design…';
    const {data,error}=await api.analyzeDesign(files);
    submit.disabled=false; submit.textContent='Analyze design';
    if(error || !data || !data.ok){
      const reason=(data&&data.reason)||(error&&error.message)||'analysis_failed';
      const message={unsupported_file:'Use JPG, PNG, WebP, or PDF files.',file_size:'Keep each file under 25 MB and the upload under 75 MB.',unauthorized:'Please sign in before uploading a design.',analysis_unavailable:'Design analysis is temporarily unavailable.'}[reason]||'Athelia could not read those files. Try a clearer PDF or image.';
      toast(message); return;
    }
    setDesignMatch(data); files=[]; renderFiles(); close();
    location.href=P('category.html')+'?design-match=1';
  });
  return wrap;
}
window.ARCANA_openDesignMatch=function(){
  if(!Store.session()){ toast('Sign in to upload a private design reference.'); location.href=P('login.html')+'?next='+encodeURIComponent('category.html?design-match=1'); return; }
  const modal=ensureDesignMatchModal(); modal.hidden=false; requestAnimationFrame(()=>modal.classList.add('in')); modal.querySelector('[data-dm-browse]').focus();
};

/* ---------- smart search: intent autocomplete + image (visual) search ---------- */
/* Image cache contract: sessionStorage only (dies with the tab). A hard refresh is
   detected via Navigation Timing and clears it too, so the photo survives page-to-page
   navigation but never a reload or a closed tab. */
const IMG_KEY='arcana_imgsearch';
try{
  const nav=performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if(nav && nav.type==='reload') sessionStorage.removeItem(IMG_KEY);
}catch(_){}

/* mock swatch fingerprint per fabric asset: [hue, saturation, lightness] */
const SWATCH={
  'cotton-twill':[40,.35,.58],  linen:[45,.30,.72],       'cotton-jersey':[42,.08,.88],
  denim:[221,.45,.38],          'jersey-knit':[210,.06,.80],'nylon-taslan':[204,.30,.55],
  'wool-flannel':[220,.08,.45], 'poly-twill':[210,.12,.52], 'recycled-poly':[145,.25,.55],
  satin:[330,.25,.72],          fleece:[24,.30,.66],        chambray:[214,.38,.66]
};

function wireSearch(){
  const form=document.querySelector('[data-search-form]'); if(!form) return;
  const input=form.querySelector('input'), pop=form.querySelector('[data-search-pop]');
  const cam=form.querySelector('[data-cam]'), chip=form.querySelector('[data-img-chip]');
  if(!input||!pop) return;
  const t=window.ARCANA_T||(s=>s), tr=window.ARCANA_TR||(s=>s), money=window.ARCANA_money||(n=>'US$'+n.toFixed(2));
  const PROD=window.ARCANA_PRODUCTS||[], FACT=window.ARCANA_FACTORIES||[];
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const norm=s=>String(s||'').toLowerCase().trim();

  /* --- suggestion pool + intent scoring --- */
  const KW_EXTRA=['low moq fabrics','oem hoodie full package','oem t-shirt cut & sew','recycled polyester grs',
    'ykk zipper wholesale','denim 12 oz stretch','organic cotton jersey 180 gsm','linen blend shirting',
    'custom woven labels','wool flannel suiting','sampling package','private label packaging'];
  const POOL=[...new Set([...PROD.map(p=>p.name.toLowerCase()),...KW_EXTRA])];
  const POPULAR=['cotton twill','denim','oem full package','linen blend','recycled polyester','ykk zipper'];
  const SUP_TOKENS=['mill','mills','factory','factories','supplier','suppliers','manufacturer','works','studio',
    'house','co.','ltd','textile','dye','senshoku','garment','verified'];

  function hit(hay,q,words){
    hay=norm(hay); if(!hay) return 0; let s=0;
    if(hay.startsWith(q)) s+=3; if(hay.includes(q)) s+=2;
    for(const w of words) if(w.length>1&&hay.includes(w)) s+=1;
    return s;
  }
  const prodScore=(p,q,w)=>2*hit(p.name,q,w)+hit(p.comp,q,w)+hit(p.seller,q,w)+hit(p.cat,q,w)+hit(p.spec,q,w);
  const factScore=(f,q,w)=>2*hit(f.name,q,w)+hit(f.tags.join(' '),q,w)+hit(f.type,q,w)+hit(f.loc+' '+f.region,q,w);

  /* --- open/close --- */
  let opts=[], sel=-1, scanT=null;
  const optId=i=>'s-opt-'+i;
  function open(){ if(pop.hidden){ pop.hidden=false; requestAnimationFrame(()=>pop.classList.add('in')); input.setAttribute('aria-expanded','true'); } }
  function close(){ pop.classList.remove('in'); pop.hidden=true; sel=-1; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); }

  /* --- row templates --- */
  function mark(k,q){
    const i=q?k.indexOf(q):-1;
    if(i<0) return esc(k);
    return esc(k.slice(0,i+q.length))+'<b>'+esc(k.slice(i+q.length))+'</b>';
  }
  const kwHref=k=>P('category.html')+'?q='+encodeURIComponent(k);
  function kwRow(k,q,i){ opts.push(1); return `<a class="s-row" role="option" id="${optId(i)}" href="${kwHref(k)}">${IC.search}<span class="s-kw">${mark(k,q)}</span></a>`; }
  function supRow(f,i){ opts.push(1); return `<a class="s-row" role="option" id="${optId(i)}" href="${P('supplier.html')+'?id='+f.id}">
      <img class="s-av" src="${factoryAsset(f)}" alt="" loading="lazy">
      <span class="s-main"><span class="s-nm">${esc(tr(f.name))} ${IC.check}</span>
      <span class="s-meta">${esc(tr(f.type))} · ${esc(tr(factoryLocation(f)))} · ★ ${f.rating}</span></span>
      <span class="s-go">${IC.chevR}</span></a>`; }
  function prodRow(p,i){ opts.push(1);
    const price=p.price>0? t('From')+' '+money(p.price)+'<small>/'+esc(tr(p.unit))+'</small>' : esc(t('Contact for quote'));
    return `<a class="s-row" role="option" id="${optId(i)}" href="${P('product.html')+'?id='+p.id}">
      <img class="s-th" src="${productAsset(p)}" alt="" loading="lazy">
      <span class="s-main"><span class="s-nm">${esc(tr(p.name))}</span>
      <span class="s-meta">${esc(tr(p.comp))} · ${esc(tr(p.seller))}</span></span>
      <span class="s-pr">${price}</span></a>`; }
  function footRow(q,i){ opts.push(1); return `<a class="s-row s-foot" role="option" id="${optId(i)}" href="${kwHref(q)}">${IC.search}<span>${esc(t('See all results for'))} “${esc(q)}”</span>${IC.chevR}</a>`; }

  /* --- Athelia integration: a natural-language brief typed into the
     same search box routes to the AI-matched Copilot flow instead of a plain
     keyword listing. Single/short keyword search stays open to everyone;
     only this Copilot path is auth-gated (window.ARCANA_requireCopilotAuth). --- */
  function briefLike(qv){
    const Cop=window.ARCANA_Copilot; if(!Cop) return false;
    const intent=Cop.parse(qv);
    const words2=norm(qv).split(/\s+/).filter(Boolean);
    return !!(intent.materials.length||intent.gsm||intent.priceMax!=null||intent.moqMax!=null||
      intent.lowMoq||intent.leadMax!=null||intent.certs.length||intent.region||intent.oem||words2.length>=4);
  }
  function triggerCopilotAsk(qv){
    window.ARCANA_Copilot.setBrief(qv);
    if(!window.ARCANA_requireCopilotAuth()){ close(); return; }
    location.href=P('category.html')+'?copilot=1';
  }
  function copilotRow(qv,i){
    opts.push(1);
    return `<a class="s-row s-copilot" role="option" id="${optId(i)}" href="${P('category.html')}?copilot=1" data-cop-ask="${esc(qv)}">
      ${IC.spark}<span class="s-main"><span class="s-nm">${esc(t('Ask Athelia'))}</span>
      <span class="s-meta">${esc(t('AI-matched picks for'))} “${esc(qv)}”</span></span>${IC.chevR}</a>`;
  }

  /* --- image search --- */
  function getImg(){ try{ return JSON.parse(sessionStorage.getItem(IMG_KEY)); }catch(_){ return null; } }
  function setImg(v){
    try{ if(v) sessionStorage.setItem(IMG_KEY,JSON.stringify(v)); else sessionStorage.removeItem(IMG_KEY); }catch(_){}
    syncChip();
  }
  function phFor(key){ const L=I18N[document.documentElement.lang]||I18N.en; return L[key]||I18N.en[key]||''; }
  function syncChip(){
    const img=getImg(); if(!chip) return;
    if(img){
      chip.innerHTML=`<img src="${img.img}" alt="${esc(t('Photo'))}"><span>${esc(t('Photo'))}</span><button type="button" data-img-x aria-label="${esc(t('Remove photo'))}">×</button>`;
      chip.hidden=false; input.dataset.i18nPh='search.refine'; input.placeholder=phFor('search.refine');
    }else{
      chip.hidden=true; chip.innerHTML=''; input.dataset.i18nPh='search.ph'; input.placeholder=phFor('search.ph');
    }
  }
  function avgHSL(ctx,w,h){
    let r=0,g=0,b=0,n=0;
    try{
      const d=ctx.getImageData(0,0,w,h).data, px=w*h, stride=Math.max(1,Math.floor(px/1200));
      for(let p=0;p<px;p+=stride){ const i=p*4; r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
    }catch(_){ return [40,.2,.6]; }
    r/=255*n; g/=255*n; b/=255*n;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2; let s=0, hh=0;
    if(mx!==mn){ const dd=mx-mn; s=l>.5? dd/(2-mx-mn) : dd/(mx+mn);
      hh=(mx===r? (g-b)/dd+(g<b?6:0) : mx===g? (b-r)/dd+2 : (r-g)/dd+4)*60; }
    return [hh,s,l];
  }
  function visualMatches(img){
    const a=img.hsl||[40,.2,.6];
    const dist=b=>{
      let dh=Math.abs(a[0]-b[0]); dh=Math.min(dh,360-dh)/180;
      const wH=(a[1]<.12||b[1]<.12)? .15 : 1;      // near-gray: hue is noise
      return dh*wH*1.6 + Math.abs(a[1]-b[1])*.6 + Math.abs(a[2]-b[2])*1.2;
    };
    return PROD.filter(p=>SWATCH[p.img]).map(p=>[dist(SWATCH[p.img]),p]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]);
  }
  function visualHTML(img){
    const seen={}, ms=visualMatches(img).filter(p=>!seen[p.img]&&(seen[p.img]=1)).slice(0,6);
    let h=`<div class="s-hd" role="presentation">${esc(t('Visual matches'))} <i class="s-demo">${esc(t('demo'))}</i></div><div class="s-vgrid" role="presentation">`;
    for(const p of ms) h+=`<a class="s-vcard" href="${P('product.html')+'?id='+p.id}"><img src="${productAsset(p)}" alt="${esc(tr(p.name))}"><span class="s-vnm">${esc(tr(p.name))}</span><span class="s-vpr">${p.price>0?t('From')+' '+money(p.price)+'/'+esc(tr(p.unit)):esc(t('Quote'))}</span></a>`;
    h+=`</div><a class="s-row s-foot" role="option" id="${optId(opts.push(1)-1)}" href="${P('category.html')+'?cat=fabrics&visual=1'}">${IC.search}<span>${esc(t('See all visual matches'))}</span>${IC.chevR}</a>`;
    return h;
  }
  function camPanel(){
    pop.innerHTML=`<div class="s-drop">
      <span class="s-drop-ic">${IC.camera}</span>
      <b>${esc(t('Search by fabric photo'))}</b>
      <span class="s-drop-sub">${esc(t('Drop an image here, paste it, or'))} <button type="button" class="s-browse" data-browse>${esc(t('browse'))}</button></span>
      <span class="s-drop-note">${esc(t('Kept only for this tab — cleared on refresh or close'))}</span>
    </div>`;
    opts=[]; sel=-1; open();
  }
  function scanThenMatches(){
    const img=getImg(); if(!img) return;
    pop.innerHTML=`<div class="s-scan"><img src="${img.img}" alt=""><div><b>${esc(t('Matching your swatch…'))}</b><span>${esc(t('Comparing color and texture against verified fabrics'))}</span></div></div>`;
    opts=[]; sel=-1; open();
    clearTimeout(scanT); scanT=setTimeout(()=>{ input.focus(); render(); },750);
  }
  function process(f){
    if(!f||!/^image\//.test(f.type)){ toast(t('That file is not an image')); return; }
    const url=URL.createObjectURL(f), im=new Image();
    im.onload=()=>{
      const s=Math.min(1,256/Math.max(im.width,im.height));
      const c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(im.width*s)); c.height=Math.max(1,Math.round(im.height*s));
      const x=c.getContext('2d'); x.drawImage(im,0,0,c.width,c.height);
      URL.revokeObjectURL(url);
      let data=null; try{ data=c.toDataURL('image/jpeg',.82); }catch(_){}
      if(!data){ toast(t('Could not read that image')); return; }
      setImg({img:data,hsl:avgHSL(x,c.width,c.height),name:f.name||'photo'});
      scanThenMatches();
    };
    im.onerror=()=>{ URL.revokeObjectURL(url); toast(t('Could not read that image')); };
    im.src=url;
  }

  /* --- main render --- */
  function render(){
    clearTimeout(scanT);
    const q=norm(input.value), words=q.split(/\s+/).filter(Boolean);
    const img=getImg();
    let html=''; opts=[]; let i=0;
    if(!q){
      if(img) html+=visualHTML(img), i=opts.length;
      html+=`<div class="s-hd" role="presentation">${esc(t('Popular on Atelix'))}</div>`;
      for(const k of POPULAR) html+=kwRow(k,'',i++);
      html+=`<div class="s-hd" role="presentation">${esc(t('Verified suppliers'))}</div>`;
      for(const f of FACT.slice(0,2)) html+=supRow(f,i++);
    }else if(q.length<2){
      const kws=POOL.filter(k=>k.startsWith(q)).slice(0,6);
      for(const k of kws) html+=kwRow(k,q,i++);
      html+=footRow(q,i++);
    }else{
      if(briefLike(input.value)) html+=copilotRow(input.value.trim(),i++);
      const kws=POOL.filter(k=>k.includes(q)||words.every(w=>k.includes(w)))
        .sort((a,b)=>(b.startsWith(q)?1:0)-(a.startsWith(q)?1:0)).slice(0,4);
      const fs=FACT.map(f=>[factScore(f,q,words),f]).filter(x=>x[0]>2).sort((a,b)=>b[0]-a[0]).slice(0,3);
      const ps=PROD.map(p=>[prodScore(p,q,words),p]).filter(x=>x[0]>2).sort((a,b)=>b[0]-a[0]).slice(0,5);
      const supFirst=fs.length&&(SUP_TOKENS.some(tk=>q.includes(tk)) || (ps.length? fs[0][0]>ps[0][0] : true));
      for(const k of kws) html+=kwRow(k,q,i++);
      const secS=()=>{ if(fs.length){ html+=`<div class="s-hd" role="presentation">${esc(t('Suppliers'))}</div>`; for(const [,f] of fs) html+=supRow(f,i++); } };
      const secP=()=>{ if(ps.length){ html+=`<div class="s-hd" role="presentation">${esc(t('Products'))}</div>`; for(const [,p] of ps) html+=prodRow(p,i++); } };
      if(supFirst){ secS(); secP(); } else { secP(); secS(); }
      if(!kws.length&&!fs.length&&!ps.length)
        html+=`<div class="s-empty">${esc(t('No matches in the catalog yet'))}<span>${esc(t('Try a material, product or factory name'))}</span></div>`;
      html+=footRow(q,i++);
    }
    pop.innerHTML=html; sel=-1; input.removeAttribute('aria-activedescendant');
    open();
  }

  /* --- events --- */
  input.addEventListener('input',render);
  input.addEventListener('focus',render);
  input.addEventListener('keydown',e=>{
    if(pop.hidden){ if(e.key==='ArrowDown'){ e.preventDefault(); render(); } return; }
    const els=[...pop.querySelectorAll('[role=option]')];
    if((e.key==='ArrowDown'||e.key==='ArrowUp')&&els.length){
      e.preventDefault();
      sel=(sel+(e.key==='ArrowDown'?1:-1)+els.length)%els.length;
      els.forEach((el,j)=>el.classList.toggle('sel',j===sel));
      input.setAttribute('aria-activedescendant',els[sel].id);
      els[sel].scrollIntoView({block:'nearest'});
    }else if(e.key==='Enter'&&sel>-1&&els[sel]){
      e.preventDefault();
      if(els[sel].dataset.copAsk) triggerCopilotAsk(els[sel].dataset.copAsk);
      else location.href=els[sel].href;
    }else if(e.key==='Escape'){ close(); }
  });
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const q=input.value.trim(), img=getImg();
    if(q && !img && briefLike(q)){ triggerCopilotAsk(q); return; }
    const ps=[];
    if(q) ps.push('q='+encodeURIComponent(q));
    if(img) ps.push('visual=1');
    location.href=P('category.html')+(ps.length?'?'+ps.join('&'):'');
  });
  pop.addEventListener('click',e=>{
    const r=e.target.closest('[data-cop-ask]');
    if(r){ e.preventDefault(); triggerCopilotAsk(r.dataset.copAsk); }
  });
  if(cam) cam.addEventListener('click',()=>{ input.focus(); getImg()? render() : camPanel(); });
  const design=form.querySelector('[data-design-match]');
  if(design) design.addEventListener('click',()=>{ if(window.ARCANA_openDesignMatch) window.ARCANA_openDesignMatch(); });
  const file=document.createElement('input');
  file.type='file'; file.accept='image/*'; file.hidden=true; form.appendChild(file);
  file.addEventListener('change',()=>{ if(file.files[0]) process(file.files[0]); file.value=''; });
  form.addEventListener('click',e=>{
    const x=e.target.closest('[data-img-x]');
    if(x){ e.preventDefault(); setImg(null); input.focus(); render(); return; }
    if(e.target.closest('[data-browse]')) file.click();
  });
  input.addEventListener('paste',e=>{
    const it=[...(e.clipboardData&&e.clipboardData.items||[])].find(i=>i.kind==='file'&&/^image\//.test(i.type));
    if(it){ e.preventDefault(); process(it.getAsFile()); }
  });
  ['dragover','dragenter'].forEach(ev=>form.addEventListener(ev,e=>{
    if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')){ e.preventDefault(); form.classList.add('drag'); }
  }));
  ['dragleave','drop'].forEach(ev=>form.addEventListener(ev,()=>form.classList.remove('drag')));
  form.addEventListener('drop',e=>{
    const f=e.dataTransfer&&e.dataTransfer.files[0];
    if(f){ e.preventDefault(); process(f); }
  });
  pop.addEventListener('pointerdown',e=>e.preventDefault()); // keep input focus so row clicks land
  document.addEventListener('pointerdown',e=>{ if(!form.contains(e.target)) close(); });
  form.addEventListener('focusout',e=>{ if(!form.contains(e.relatedTarget)) close(); });

  syncChip(); // restore photo chip after cross-page navigation
}

/* ---------- wiring ---------- */
function wire(){
  // favorites (persisted). Elements opt in via [data-fav-id]; legacy .fav without id = local toggle.
  document.querySelectorAll('.fav').forEach(f=>{
    const id=f.dataset.favId;
    if(id && Store.isSaved(id)) f.classList.add('on');
    f.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation();
      if(id){ const on=Store.toggleSaved(id); f.classList.toggle('on',on); toast(on?'Saved to your list':'Removed from list', on?{href:P('wishlist.html'), label:'View wishlist'}:undefined); }
      else f.classList.toggle('on');
    });
  });
  // add to cart
  document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',e=>{
    e.preventDefault(); e.stopPropagation();
    const id=b.dataset.add, qty=parseInt(b.dataset.qty||'1',10);
    Store.addToCart(id, qty);
    const p=window.ARCANA_PRODUCT_MAP&&window.ARCANA_PRODUCT_MAP[id];
    toast(`Added ${p?p.name:'item'} to cart`, {href:P('cart.html'), label:'View cart'});
  }));
  // simple toggle chips (visual)
  document.querySelectorAll('[data-toggle-chip]').forEach(c=>c.addEventListener('click',()=>c.classList.toggle('on')));
  // tabs
  document.querySelectorAll('[data-tabs]').forEach(g=>g.querySelectorAll('[data-tab]').forEach(t=>t.addEventListener('click',()=>{
    g.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('on'));t.classList.add('on');})));
  // qty steppers (generic)
  document.querySelectorAll('[data-qty]').forEach(q=>{const inp=q.querySelector('input');
    const dec=q.querySelector('[data-dec]'), inc=q.querySelector('[data-inc]');
    if(dec) dec.onclick=()=>{ inp.value=Math.max(1,(+inp.value||1)-1); inp.dispatchEvent(new Event('change',{bubbles:true})); };
    if(inc) inc.onclick=()=>{ inp.value=(+inp.value||1)+1; inp.dispatchEvent(new Event('change',{bubbles:true})); };});
  // oem package select
  document.querySelectorAll('[data-pkg-group]').forEach(g=>g.querySelectorAll('[data-pkg]').forEach(p=>p.addEventListener('click',()=>{
    g.querySelectorAll('[data-pkg]').forEach(x=>x.classList.remove('sel'));p.classList.add('sel');})));
  // categories mega-menu
  const katBtn=document.querySelector('[data-kat]'), katPanel=document.querySelector('[data-kat-panel]');
  if(katBtn&&katPanel){
    const close=()=>{katPanel.hidden=true;katBtn.setAttribute('aria-expanded','false');katBtn.classList.remove('open');};
    katBtn.addEventListener('click',e=>{e.stopPropagation();const open=katPanel.hidden;katPanel.hidden=!open;katBtn.setAttribute('aria-expanded',String(open));katBtn.classList.toggle('open',open);});
    katPanel.addEventListener('click',e=>e.stopPropagation());
    katPanel.querySelectorAll('[data-kat-item]').forEach(it=>{
      const sel=()=>{const i=it.dataset.katItem;
        katPanel.querySelectorAll('[data-kat-item]').forEach(x=>x.classList.toggle('on',x===it));
        katPanel.querySelectorAll('[data-kat-detail]').forEach(d=>d.classList.toggle('on',d.dataset.katDetail===i));};
      it.addEventListener('mouseenter',sel); it.addEventListener('focus',sel);
    });
    document.addEventListener('click',close);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    if(location.search.indexOf('katopen')>-1){katPanel.hidden=false;katBtn.classList.add('open');}
  }
  // account menu + auth cluster handlers (logout, saved link)
  bindAuthUI(document);
  // search submit + suggestions + image search live in wireSearch()
}

/* ---------- auth cluster binding + Supabase session bridge ---------- */
function bindAuthUI(scope){
  scope = scope || document;
  scope.querySelectorAll('[data-acct]').forEach(a=>{
    const btn=a.querySelector('.acct-btn'), pop=a.querySelector('.acct-pop');
    if(!btn||!pop) return;
    btn.addEventListener('click',e=>{e.stopPropagation(); const open=pop.hidden; pop.hidden=!open; btn.setAttribute('aria-expanded',String(open));});
    document.addEventListener('click',()=>{ if(!pop.hidden){pop.hidden=true; btn.setAttribute('aria-expanded','false');} });
  });
  scope.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click',e=>{
    e.preventDefault();
    Promise.resolve(Store.logout()).then(()=>{ location.href=HOME; });
  }));
}

/* Re-render ONLY the header auth cluster (login/signup <-> account menu) in place,
   preserving search, categories, cart and their bound handlers. */
function refreshAuth(){
  const hdrIn=document.querySelector('.hdr-in'); if(!hdrIn) return;
  hdrIn.querySelectorAll('.btn-login,.btn-daftar,.acct').forEach(n=>n.remove());
  const panel=hdrIn.querySelector('[data-kat-panel]');
  const tmp=document.createElement('div'); tmp.innerHTML=authCluster();
  const added=[...tmp.childNodes];
  added.forEach(n=>hdrIn.insertBefore(n, panel));
  // localize freshly-inserted nodes to the active language
  const lang=document.documentElement.lang||'en', d=I18N[lang]||I18N.en;
  added.forEach(n=>{
    if(n.nodeType!==1) return;
    if(n.dataset && n.dataset.i18n){ const v=d[n.dataset.i18n]; if(v!=null) n.textContent=v; }
    n.querySelectorAll && n.querySelectorAll('[data-i18n]').forEach(el=>{const v=d[el.dataset.i18n]; if(v!=null) el.textContent=v;});
  });
  bindAuthUI(hdrIn);
  syncBadges();
}

/* Bridge Supabase's async session into the synchronous arcana_session mirror
   the header renders off, then re-render the auth cluster. */
function bootstrapSession(){
  const api=window.ARCANA_API;
  if(!api || !api.getSessionProfile) return;
  const sync=()=>api.getSessionProfile().then(profile=>{
    if(profile){
      LS.set('session',{role:profile.role, name:profile.name, avatarUrl:profile.avatarUrl||null});
      mergeCartOnce(profile.id).catch(()=>{});
      mergeSavedOnce(profile.id).catch(()=>{});
    } else{
      localStorage.removeItem('arcana_session');
    }
    refreshAuth();
  }).catch(()=>{});
  sync();
  if(api.onChange){
    api.onChange((event, session)=>{
      if(event==='SIGNED_OUT' || !session){ localStorage.removeItem('arcana_session'); refreshAuth(); return; }
      sync();
    });
  }
}

/* Pull the signed-in user's DB cart into the LS mirror. The first time for a
   given uid this session, also push up any pre-login (anon) local items so
   they merge into the account cart instead of being lost. */
async function mergeCartOnce(uid){
  const api=window.ARCANA_API;
  if(!api || !api.getCart) return;
  const flag = 'arcana_cart_merged_'+uid;
  const dbItems = await api.getCart();
  if(localStorage.getItem(flag)){
    LS.set('cart', dbItems); syncBadges();
    return;
  }
  const map = new Map(dbItems.map(i=>[i.id, {...i}]));
  Store.cart().forEach(li=>{
    if(map.has(li.id)) map.get(li.id).qty += li.qty;
    else map.set(li.id, {...li});
  });
  const merged = Array.from(map.values());
  if(merged.length) await api.replaceCart(merged);
  LS.set('cart', merged);
  localStorage.setItem(flag, '1');
  syncBadges();
}

/* Pull the signed-in user's DB wishlist into the LS mirror. The first time for
   a given uid this session, also push up any pre-login (anon) local saves so
   they merge into the account wishlist instead of being lost. Unlike the cart,
   overlapping items keep the DB's qty rather than summing — a saved quantity
   isn't additive the way cart units are. */
async function mergeSavedOnce(uid){
  const api=window.ARCANA_API;
  if(!api || !api.getWishlist) return;
  const flag = 'arcana_saved_merged_'+uid;
  const dbItems = await api.getWishlist();
  if(localStorage.getItem(flag)){
    LS.set('saved', dbItems); syncBadges();
    return;
  }
  const map = new Map(dbItems.map(i=>[i.id, {...i}]));
  Store.saved().forEach(li=>{ if(!map.has(li.id)) map.set(li.id, {...li}); });
  const merged = Array.from(map.values());
  if(merged.length) await api.replaceWishlist(merged);
  LS.set('saved', merged);
  localStorage.setItem(flag, '1');
  syncBadges();
}

/* ---------- i18n (EN default · JA · ZH) ---------- */
const I18N={
  en:{
    'nav.categories':'Categories','search.ph':'Search fabrics, trims, accessories, factories…','search.refine':'Add keywords to refine your photo search…','auth.login':'Log in','auth.signup':'Sign up',
    'tb.sell':'Sell on Atelix — reach 50,000+ verified buyers','tb.about':'About','tb.help':'Help','tb.saved':'Saved',
    'ft.tagline':'The wholesale marketplace connecting brand owners with verified fabric mills and OEM factories.',
    'ft.company':'Atelix','ft.about':'About Atelix','ft.careers':'Careers','ft.blog':'Blog','ft.b2b':'B2B sourcing','ft.trustsafety':'Trust & safety',
    'ft.buy':'Buy','ft.sourcing':'Sourcing guide','ft.payments':'Payments','ft.shipping':'Shipping','ft.protection':'Buyer protection',
    'ft.sell':'Sell','ft.sellon':'Sell on Atelix','ft.dashboard':'Supplier dashboard',
    'ft.help':'Help & Guides','ft.helpcenter':'Help center','ft.terms':'Terms & conditions','ft.privacy':'Privacy policy','ft.contact':'Contact us',
    'ft.follow':'Follow us','ft.rights':'All rights reserved.',
    'home.curated':'Curated for you','home.viewall':'View all products','home.tab.all':'All','home.tab.fabrics':'Fabrics','home.tab.accessories':'Accessories','home.tab.trims':'Trims',
    'hero.btag1':'NEW SEASON SOURCING','hero.h1':'The wholesale marketplace for your next collection','hero.p1':'Quality materials and trusted, verified factories — built for brand owners.','hero.cta1':'Start sourcing',
    'hero.btag2':'LIMITED · 11.11 SALE','hero.h2':'Up to 50% off verified fabrics & OEM','hero.p2':'Stock your next collection for less — from mills you can trust.','hero.cta2':'Shop the sale',
    'home.popcat':'Popular Categories','home.popcatdesc':'Wovens, knits, denim, trims and full-package OEM — sourced from verified mills.','home.explore':'Explore now',
    'home.quickreq':'Quick sourcing request','home.browseall':'Browse all','home.material':'Material','home.quantity':'Quantity','home.qtyph':'e.g. 500 m','home.note':'Note','home.notetip':"Tell us the characteristics you need: composition, GSM/weight, color, certifications, MOQ flexibility, lead time, or anything else. We'll get back to you.",'home.noteph':'e.g. GOTS-certified organic cotton, 180gsm, natural undyed, flexible MOQ','home.getquotes':'Get quotes',
    'quick.fabrics':'Fabrics','quick.trims':'Trims','quick.oem':'OEM',
    'pill.fabrics':'Fabrics','pill.accessories':'Accessories','pill.trims':'Trims','pill.yarns':'Yarns & Threads','pill.oem':'OEM Services','pill.factories':'Factories',
    'promo.title':'Mega Sourcing Sale — up to 50% off verified fabrics & OEM','promo.shopnow':'Shop now',
    'mat.cotton':'Cotton','mat.linen':'Linen','mat.polyester':'Polyester','mat.wool':'Wool','mat.nylon':'Nylon',
    'cat.filters':'Filters','cat.reset':'Reset','cat.oemavail':'OEM availability','cat.all':'All','cat.oemAvailable':'OEM available','cat.nonoem':'Non-OEM',
    'cat.material':'Material','cat.price':'Price (US$ / unit)','cat.certs':'Certifications','cat.sort':'Sort','cat.verified':'verified suppliers',
    'sort.rec':'Recommended','sort.new':'Newest','sort.moq':'MOQ: Low','sort.price':'Price: Low',
    'noun.fabrics':'fabric options','noun.accessories':'accessory options','noun.trims':'trim options','noun.yarns':'yarn & thread options','noun.oem':'service packages',
    'seo.h1':'Wholesale Fabric & Garment Sourcing for Fashion Brands',
    'seo.p1':'Atelix is the B2B marketplace where apparel brand owners source premium fabrics, trims, accessories and full-package OEM services directly from verified mills and factories. Compare woven and knit fabrics — cotton twill, linen blends, organic cotton jersey, denim, satin and recycled polyester — on composition, GSM, minimum order quantity and lead time, then request quotes or add to cart and pay securely. Every supplier is identity, license and capability verified, so you can commit budget with confidence.',
    'seo.h2':'Source from verified factories across Asia and beyond',
    'seo.p2':'Connect with fabric mills and OEM factories in key manufacturing regions — Zhejiang, Guangdong, Jiangsu and Shandong in China, plus partners in Japan, India, Vietnam and Turkey. Whether you need low-MOQ sampling, private-label production, custom color matching or bulk manufacturing with in-line quality control, Atelix’s OEM service packages take your collection from yarn to finished garment. Secure payments via T/T and PayPal, transparent trade terms and global shipping to 120+ countries keep sourcing organized and under control.'
  },
  ja:{
    'nav.categories':'カテゴリー','search.ph':'生地・付属品・工場を検索…','search.refine':'キーワードで写真検索を絞り込む…','auth.login':'ログイン','auth.signup':'新規登録',
    'tb.sell':'Atelixで販売 — 5万社以上の認証バイヤーへ','tb.about':'会社概要','tb.help':'ヘルプ','tb.saved':'保存済み',
    'ft.tagline':'ブランドオーナーと認証済みの生地工場・OEM工場をつなぐ卸売マーケットプレイス。',
    'ft.company':'Atelix','ft.about':'Atelixについて','ft.careers':'採用情報','ft.blog':'ブログ','ft.b2b':'B2B調達','ft.trustsafety':'安全性と信頼',
    'ft.buy':'購入','ft.sourcing':'調達ガイド','ft.payments':'お支払い','ft.shipping':'配送','ft.protection':'バイヤー保護',
    'ft.sell':'販売','ft.sellon':'Atelixで販売','ft.dashboard':'サプライヤー管理画面',
    'ft.help':'ヘルプ・ガイド','ft.helpcenter':'ヘルプセンター','ft.terms':'利用規約','ft.privacy':'プライバシーポリシー','ft.contact':'お問い合わせ',
    'ft.follow':'フォローする','ft.rights':'無断転載を禁じます。',
    'home.curated':'あなたへのおすすめ','home.viewall':'すべての商品を見る','home.tab.all':'すべて','home.tab.fabrics':'生地','home.tab.accessories':'付属品','home.tab.trims':'トリム',
    'hero.btag1':'新シーズン調達','hero.h1':'次のコレクションのための卸売マーケットプレイス','hero.p1':'高品質な素材と信頼できる認証工場 — ブランドオーナーのために。','hero.cta1':'調達を始める',
    'hero.btag2':'期間限定 · 11.11セール','hero.h2':'認証生地・OEMが最大50%オフ','hero.p2':'次のコレクションをお得に — 信頼できる工場から。','hero.cta2':'セールを見る',
    'home.popcat':'人気カテゴリー','home.popcatdesc':'織物・ニット・デニム・トリム・フルパッケージOEM — 認証工場から。','home.explore':'今すぐ見る',
    'home.quickreq':'クイック見積り依頼','home.browseall':'すべて見る','home.material':'素材','home.quantity':'数量','home.qtyph':'例: 500 m','home.note':'備考','home.notetip':'組成、目付(GSM)、色、認証、最低発注数量の柔軟性、リードタイムなど、必要な特性をお知らせください。担当者よりご連絡いたします。','home.noteph':'例: GOTS認証オーガニックコットン、180gsm、無染色、MOQ相談可','home.getquotes':'見積りを取得',
    'quick.fabrics':'生地','quick.trims':'トリム','quick.oem':'OEM',
    'pill.fabrics':'生地','pill.accessories':'付属品','pill.trims':'トリム','pill.yarns':'糸・スレッド','pill.oem':'OEMサービス','pill.factories':'工場',
    'promo.title':'メガ調達セール — 認証生地・OEMが最大50%オフ','promo.shopnow':'今すぐ購入',
    'mat.cotton':'綿','mat.linen':'リネン','mat.polyester':'ポリエステル','mat.wool':'ウール','mat.nylon':'ナイロン',
    'cat.filters':'絞り込み','cat.reset':'リセット','cat.oemavail':'OEM対応','cat.all':'すべて','cat.oemAvailable':'OEM対応あり','cat.nonoem':'非OEM',
    'cat.material':'素材','cat.price':'価格 (¥ / 単位)','cat.certs':'認証','cat.sort':'並び替え','cat.verified':'認証サプライヤー',
    'sort.rec':'おすすめ','sort.new':'新着','sort.moq':'最小ロット: 少','sort.price':'価格: 安い',
    'noun.fabrics':'生地','noun.accessories':'付属品','noun.trims':'トリム','noun.yarns':'糸・スレッド','noun.oem':'サービスパッケージ',
    'seo.h1':'ファッションブランドのための生地・縫製の卸売調達',
    'seo.p1':'Atelixは、アパレルブランドが認証済みの工場から高品質な生地・付属品・OEMサービスを直接調達できるB2Bマーケットプレイスです。組成・目付(GSM)・最小ロット・納期で比較し、見積依頼またはカートに追加して安全に決済できます。すべてのサプライヤーは本人・ライセンス・生産能力が認証済みです。',
    'seo.h2':'アジアを中心とした認証工場から調達',
    'seo.p2':'中国の浙江・広東・江蘇・山東をはじめ、日本・インド・ベトナム・トルコの工場と直接つながります。小ロットのサンプリングからプライベートラベル、カラーマッチング、量産まで、AtelixのOEMパッケージが糸から完成品まで対応。T/T・PayPalによる安全な決済と120カ国以上への配送で、調達をシンプルに。'
  },
  zh:{
    'nav.categories':'分类','search.ph':'搜索面料、辅料、工厂…','search.refine':'输入关键词细化图片搜索…','auth.login':'登录','auth.signup':'注册',
    'tb.sell':'在 Atelix 上销售 — 触达 5 万+ 认证买家','tb.about':'关于','tb.help':'帮助','tb.saved':'收藏',
    'ft.tagline':'连接品牌方与认证面料厂及 OEM 工厂的批发采购平台。',
    'ft.company':'Atelix','ft.about':'关于 Atelix','ft.careers':'招聘','ft.blog':'博客','ft.b2b':'B2B 采购','ft.trustsafety':'信任与安全',
    'ft.buy':'采购','ft.sourcing':'采购指南','ft.payments':'支付','ft.shipping':'物流','ft.protection':'买家保障',
    'ft.sell':'销售','ft.sellon':'在 Atelix 上销售','ft.dashboard':'供应商后台',
    'ft.help':'帮助与指南','ft.helpcenter':'帮助中心','ft.terms':'服务条款','ft.privacy':'隐私政策','ft.contact':'联系我们',
    'ft.follow':'关注我们','ft.rights':'版权所有。',
    'home.curated':'为你精选','home.viewall':'查看全部商品','home.tab.all':'全部','home.tab.fabrics':'面料','home.tab.accessories':'辅料','home.tab.trims':'织带',
    'hero.btag1':'新季采购','hero.h1':'为你的下一个系列而生的批发采购平台','hero.p1':'优质材料与可信认证工厂 — 为品牌方打造。','hero.cta1':'开始采购',
    'hero.btag2':'限时 · 11.11 大促','hero.h2':'认证面料与OEM低至5折','hero.p2':'以更低成本备货下一季 — 来自可信工厂。','hero.cta2':'抢购大促',
    'home.popcat':'热门类目','home.popcatdesc':'梭织、针织、牛仔、织带及全包OEM — 来自认证工厂。','home.explore':'立即探索',
    'home.quickreq':'快速询价','home.browseall':'查看全部','home.material':'材料','home.quantity':'数量','home.qtyph':'例如 500 m','home.note':'备注','home.notetip':'请告诉我们您需要的特性：成分、克重(GSM)、颜色、认证、起订量灵活性、交货期等。我们会尽快与您联系。','home.noteph':'例如：GOTS认证有机棉，180gsm，本色未染，起订量可协商','home.getquotes':'获取报价',
    'quick.fabrics':'面料','quick.trims':'织带','quick.oem':'OEM',
    'pill.fabrics':'面料','pill.accessories':'辅料','pill.trims':'织带','pill.yarns':'纱线与缝纫线','pill.oem':'OEM服务','pill.factories':'工厂',
    'promo.title':'超级采购大促 — 认证面料与OEM低至5折','promo.shopnow':'立即抢购',
    'mat.cotton':'棉','mat.linen':'亚麻','mat.polyester':'涤纶','mat.wool':'羊毛','mat.nylon':'锦纶',
    'cat.filters':'筛选','cat.reset':'重置','cat.oemavail':'OEM 可选','cat.all':'全部','cat.oemAvailable':'支持 OEM','cat.nonoem':'非 OEM',
    'cat.material':'材料','cat.price':'价格 (¥ / 单位)','cat.certs':'认证','cat.sort':'排序','cat.verified':'认证供应商',
    'sort.rec':'推荐','sort.new':'最新','sort.moq':'起订量: 低','sort.price':'价格: 低',
    'noun.fabrics':'面料','noun.accessories':'辅料','noun.trims':'织带','noun.yarns':'纱线与缝纫线','noun.oem':'服务套餐',
    'seo.h1':'面向时尚品牌的面料与成衣批发采购',
    'seo.p1':'Atelix 是一个 B2B 采购平台，品牌方可直接向认证工厂采购优质面料、辅料及全包 OEM 服务。按成分、克重(GSM)、起订量与交期进行比较，然后索取报价或加入购物车并安全支付。每家供应商均通过身份、资质与产能认证，让你放心下单。',
    'seo.h2':'从亚洲及全球认证工厂采购',
    'seo.p2':'连接中国浙江、广东、江苏、山东等制造重镇，以及日本、印度、越南和土耳其的合作工厂。无论是小起订量打样、贴牌生产、定制配色，还是带在线质检的批量生产，Atelix 的 OEM 套餐都能让你的系列从纱线到成衣一站完成。T/T 与 PayPal 安全支付、透明贸易条款、覆盖 120+ 国家的物流，让采购井然有序。'
  }
};
function applyLang(lang){
  if(!I18N[lang]) lang='en';
  try{localStorage.setItem('arcana_lang',lang);}catch(_){}
  document.documentElement.lang=lang;
  const d=I18N[lang];
  document.querySelectorAll('[data-i18n]').forEach(el=>{const v=d[el.dataset.i18n];if(v!=null)el.textContent=v;});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{const v=d[el.dataset.i18nPh];if(v!=null)el.setAttribute('placeholder',v);});
  document.querySelectorAll('[data-lang-label]').forEach(el=>el.textContent={en:'EN',ja:'日本語',zh:'中文'}[lang]);
  document.querySelectorAll('[data-lang-switch] button').forEach(b=>b.classList.toggle('on',b.dataset.lang===lang));
  // re-render dynamic content (product cards, prices, specs) in the new language
  langRenderers.forEach(fn=>{ try{ fn(lang); }catch(err){ console.error(err); } });
}
window.ARCANA_setLang=applyLang;
function wireLang(){
  document.querySelectorAll('[data-lang-switch] button').forEach(b=>b.addEventListener('click',()=>applyLang(b.dataset.lang)));
  const cyc=document.querySelector('[data-lang-cycle]');
  if(cyc) cyc.addEventListener('click',()=>{const o=['en','ja','zh'];const c=document.documentElement.lang||'en';applyLang(o[(o.indexOf(c)+1)%o.length]);});
  let saved='en'; try{saved=localStorage.getItem('arcana_lang')||'en';}catch(_){}
  const q=new URLSearchParams(location.search).get('lang'); if(q&&I18N[q])saved=q;
  applyLang(saved);
}

// demo seed: ?seed=cart pre-fills a couple items (for previews)
if(location.search.indexOf('seed=cart')>-1 && !Store.cart().length){ Store.addToCart('FAB-100',300); Store.addToCart('FAB-101',150); Store.addToCart('FAB-102',500); }

/* ---------- catalog hydration: Supabase is the production source of truth.
   Bundled data.js remains an offline fallback only if the live read fails. ---- */
function catalogLoadBar(show){
  let b=document.getElementById('arcanaLoadBar');
  if(show){
    if(!b){ b=document.createElement('div'); b.id='arcanaLoadBar';
      b.style.cssText='position:fixed;top:0;left:0;height:2px;width:100%;z-index:9999;'+
        'background:var(--brass,#b0863c);transform:scaleX(0);transform-origin:left;'+
        'transition:transform .4s ease,opacity .3s ease'; document.body.appendChild(b); }
    requestAnimationFrame(()=>{ b.style.opacity='1'; b.style.transform='scaleX(0.75)'; });
  } else if(b){ b.style.transform='scaleX(1)'; b.style.opacity='0'; setTimeout(()=>b.remove(),350); }
}
async function hydrateCatalog(){
  if(!(window.ARCANA_API && ARCANA_API.fetchCatalog)) return;
  catalogLoadBar(true);
  try{
    const { products, factories } = await ARCANA_API.fetchCatalog();
    if(products&&products.length){
      window.ARCANA_PRODUCTS=products;
      window.ARCANA_PRODUCT_MAP=Object.fromEntries(products.map(product=>[product.id,product]));
    }
    if(factories&&factories.length){
      window.ARCANA_FACTORIES=factories;
      window.ARCANA_FACTORY_MAP=Object.fromEntries(factories.map(factory=>[factory.id,factory]));
      window.ARCANA_FACTORY_BY_NAME=Object.fromEntries(factories.map(factory=>[factory.name,factory.id]));
    }
    if(window.ATELIX_refreshCatalogStats) window.ATELIX_refreshCatalogStats();
  }catch(err){
    console.warn('[Atelix] live catalog unavailable — using bundled data.js', err && err.message);
  }finally{ catalogLoadBar(false); }
}

document.addEventListener('DOMContentLoaded',()=>{
  const viewport=document.querySelector('meta[name="viewport"]');
  if(viewport&&!/viewport-fit/.test(viewport.content)) viewport.content+=', viewport-fit=cover';
  buildHeader();buildFooter();buildMobileNav();wire();wireSearch();buildCopilotFab();bootstrapSession();
});
document.addEventListener('DOMContentLoaded', async ()=>{
  // Pages that render catalog data opt in with <body data-catalog> so the live
  // read completes before ARCANA_PAGE runs. Other pages render immediately.
  if(document.body.hasAttribute('data-catalog')) await hydrateCatalog();
  if(window.ARCANA_PAGE) try{window.ARCANA_PAGE({P,ASSET,Store,IC,toast});}catch(err){console.error(err);}
  wireLang();
});
})();
