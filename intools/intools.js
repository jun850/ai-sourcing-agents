(function(){
  'use strict';

  const MIN_WIDTH=1024;
  const LOCK_MS=15*60*1000;
  const LOCK_KEY='atelix_intools_browser_lock_v1';
  const FAIL_KEY='atelix_intools_failed_logins_v1';
  const root=document.getElementById('intoolsRoot');
  const mobileBlock=document.querySelector('[data-intools-mobile-block]');
  const localHost=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const qaAuth=localHost ? new URLSearchParams(location.search).get('qa-auth') : null;
  const allowedTags=new Set(['P','H2','H3','STRONG','EM','U','A','UL','OL','LI','BR']);
  let api=null;
  let currentProfile=null;
  let currentView='dashboard';
  let editorLanguage='en';
  let cache={pages:[],widgets:[],products:[],suppliers:[],media:[],history:[]};
  let methodWarnings=new Set();

  const esc=(value)=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state=(value)=>document.body.dataset.intoolsState=value;
  const valueOf=(response,key)=>response && response.error ? [] : (Array.isArray(response)?response:(response && (response[key]||response.items||response.data))||[]);
  const titleCase=(s)=>String(s||'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const statusBadge=(s)=>`<span class="badge badge-${esc(String(s||'draft').toLowerCase())}">${esc(titleCase(s||'draft'))}</span>`;
  const options=(items,current)=>items.map(([value,label])=>`<option value="${esc(value)}"${String(value)===String(current)?' selected':''}>${esc(label)}</option>`).join('');
  const dateTimeValue=value=>value?String(value).slice(0,16):'';
  const isArchived=item=>Boolean(item?.archived_at)||(item?.listing_status||item?.status)==='archived';
  const altTextValue=value=>value&&typeof value==='object'?(value.en||value.ja||value.zh||''):(value||'');

  function setMobileBlocked(){
    state('mobile-blocked');
    root.replaceChildren();
    mobileBlock.hidden=false;
  }

  function boot(){
    if(window.innerWidth<MIN_WIDTH){setMobileBlocked();return;}
    mobileBlock.hidden=true;
    state('desktop');
    if(isLocked()){renderLocked();return;}
    if(qaAuth){bootQa(qaAuth);return;}
    loadScript('../js/supabase-client.bundle.js').then(()=>loadScript('../js/api.js')).then(()=>{
      api=decorateApi(window.ARCANA_API);
      return resolveSession();
    }).catch(()=>renderLogin('Authentication service is unavailable. Try again shortly.'));
  }

  function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}

  function bootQa(mode){
    if(mode==='locked'){renderLocked();return;}
    if(mode==='admin'){
      currentProfile={id:'qa-admin',email:'jun@arcanawangsa.com',name:'Jun',role:'admin'};
      api=qaApi();
      renderShell();
      return;
    }
    if(mode==='non-admin'){renderUnavailable();return;}
    renderLogin();
  }

  async function resolveSession(){
    if(!api || api.unavailable){renderLogin('Authentication service is unavailable. Try again shortly.');return;}
    try{
      const context=await callFirst(['adminGetIntoolsContext','adminGetContext']);
      if(context.available){
        const data=context.result?.data||context.result;
        if(data && data.profile) currentProfile=data.profile;
        if(data && data.authorized===false){renderUnavailable();return;}
        if(data && data.authorized){renderShell();return;}
      }
      const profile=await api.getSessionProfile();
      if(!profile){renderLogin();return;}
      if(profile.role!=='admin'){renderUnavailable();return;}
      currentProfile=profile;
      renderShell();
    }catch(_){renderLogin('We could not verify this session. Try again.');}
  }

  function authScreen(title,body){
    return `<main class="auth-screen"><section class="auth-panel"><div class="auth-mark" aria-hidden="true">A</div><h1>${esc(title)}</h1><p>${esc(body)}</p><div data-auth-content></div></section></main>`;
  }

  function renderLogin(message=''){
    state('login');
    root.innerHTML=authScreen('Atelix Intools','Sign in with an authorized administrator account.');
    const box=root.querySelector('[data-auth-content]');
    box.innerHTML=`${message?`<p class="form-error" role="alert">${esc(message)}</p>`:''}<form data-login-form novalidate><label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label><label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label><button class="btn btn-primary btn-block" type="submit">Sign in with password</button><button class="btn btn-secondary btn-block" type="button" data-magic-link>Email me a magic link</button></form>`;
    box.querySelector('form').addEventListener('submit',submitLogin);
    box.querySelector('[data-magic-link]').addEventListener('click',sendMagicLink);
  }

  async function submitLogin(event){
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('button');
    const email=form.email.value.trim(),password=form.password.value;
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!password){renderLogin('Enter a valid email and password.');return;}
    button.disabled=true;button.textContent='Signing in…';
    if(qaAuth==='guest'){
      recordFailure();
      if(localStorage.getItem(LOCK_KEY)) renderLocked(); else renderLogin('Incorrect email or password.');
      return;
    }
    try{
      const result=await api.signIn({email,password});
      if(result?.error){recordFailure();if(localStorage.getItem(LOCK_KEY))renderLocked();else renderLogin('Incorrect email or password.');return;}
      const profile=await api.getSessionProfile();
      if(!profile || profile.role!=='admin'){await api.signOut?.();renderUnavailable();return;}
      currentProfile=profile;
      localStorage.removeItem(FAIL_KEY);renderShell();
    }catch(_){recordFailure();if(localStorage.getItem(LOCK_KEY))renderLocked();else renderLogin('Incorrect email or password.');}
  }

  async function sendMagicLink(){
    const form=root.querySelector('[data-login-form]'),button=form.querySelector('[data-magic-link]'),email=form.email.value.trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){renderLogin('Enter a valid administrator email.');return;}
    button.disabled=true;button.textContent='Sending magic link…';
    try{
      const result=await api.signInWithMagicLink({email,redirectTo:`${location.origin}/intools/dashboard`});
      if(result?.error)throw result.error;
      state('magic-sent');root.innerHTML=authScreen('Check your email',`We sent a secure sign-in link to ${email}.`);
    }catch(error){renderLogin(error?.message||'Could not send the magic link. Try again.');}
  }
  function recordFailure(){const count=Number(localStorage.getItem(FAIL_KEY)||0)+1;localStorage.setItem(FAIL_KEY,String(count));if(count>=3)lockBrowser();}
  function isLocked(){const lockedAt=Number(localStorage.getItem(LOCK_KEY)||0);if(!lockedAt)return false;if(Date.now()-lockedAt<LOCK_MS)return true;localStorage.removeItem(LOCK_KEY);localStorage.removeItem(FAIL_KEY);return false;}
  function lockBrowser(){localStorage.setItem(LOCK_KEY,String(Date.now()));}
  function renderLocked(){state('locked');root.innerHTML=authScreen('Temporarily unavailable','Too many sign-in attempts. Try again in 15 minutes.');}
  function renderUnavailable(){state('unauthorized');root.innerHTML=`<main class="unavailable-screen"><section class="unavailable-panel"><div class="auth-mark" aria-hidden="true">A</div><h1>Page unavailable</h1><p>This page could not be found.</p><a class="btn btn-secondary" href="../index.html">Return to Atelix</a></section></main>`;}

  function qaApi(){
    const pages=[
      {id:'privacy',route:'/privacy',title:'Privacy policy',template:'policy',status:'published',updated_at:'2026-08-12T10:30:00Z',current_revision:4,content:{en:{title:'Privacy policy',body:'<p>How Atelix collects and protects marketplace data.</p>'},ja:{title:'プライバシーポリシー',body:'<p>Atelixによるデータ保護について。</p>'},zh:{title:'隐私政策',body:'<p>Atelix 如何保护市场 data.</p>'}}},
      {id:'trust',route:'/trust-safety',title:'Trust & safety',template:'article',status:'draft',updated_at:'2026-08-13T03:15:00Z',current_revision:2,content:{en:{title:'Trust & safety',body:'<p>Standards for secure sourcing.</p>'},ja:{title:'信頼と安全',body:'<p>安全な調達の基準。</p>'},zh:{title:'信任与安全',body:'<p>安全采购标准。</p>'}}}
    ];
    const widgets=[{id:'widget-1',key:'supplier-discount',name:'New supplier discount',type:'discount',zone:'managed_page_before_content',status:'draft',style_preset:'brass',target_type:'route',target_value:'/privacy',current_revision:3,starts_at:'2026-08-14T00:00',content:{en:{headline:'Supplier offer',body:'Review this supplier.'},ja:{headline:'サプライヤーオファー',body:'このサプライヤーをご覧ください。'},zh:{headline:'供应商优惠',body:'查看此供应商。'}}}];
    const products=[{id:'p1',sku:'ATL-COT-104',name:'Organic Cotton Twill',factory_id:'f1',supplier_name:'Mori Textile',category:'fabrics',price:8.4,moq:120,listing_status:'active',unit_type:'kg',pricing_mode:'quote',applications:'Dress',brand_emails:['buyer@example.com'],updated_at:'2026-08-13T02:00:00Z'}];
    const suppliers=[{id:'f1',slug:'mori-textile',name:'Mori Textile',type:'trim_supplier',region:'Osaka, Japan',verify_state:'pending',bio:'Specialist textile supplier.',sales:'sales@example.com',web:'https://example.com',tags:['Weaving'],certs:['GOTS'],product_count:18,updated_at:'2026-08-11T09:00:00Z'}];
    const media=[{id:'m1',name:'cotton-twill.jpg',url:'../assets/atelix-beta-source-box.webp',alt_text:{en:'Folded cotton twill fabric'},mime_type:'image/webp',updated_at:'2026-08-13T04:00:00Z'}];
    const history=[{id:'h1',entity_type:'page',entity_name:'Privacy policy',action:'published',actor_email:'jun@arcanawangsa.com',created_at:'2026-08-12T10:30:00Z',revision:4}];
    return {
      adminListContentPages:async()=>({pages}),adminListWidgets:async()=>({widgets}),adminListProducts:async()=>({products}),adminListSuppliers:async()=>({suppliers}),adminListMedia:async()=>({media}),adminListAudit:async()=>history,
      adminSaveContentPage:async(payload)=>({page:{...payload,updated_at:new Date().toISOString()}}),adminPublishContentPage:async()=>({}),adminRollbackContentPage:async()=>({}),
      adminSaveWidget:async(payload)=>({widget:payload}),adminArchiveWidget:async()=>({}),adminSaveProduct:async(payload)=>({product:payload}),adminArchiveProduct:async()=>({}),adminRestoreProduct:async()=>({}),adminSaveSupplier:async(payload)=>({supplier:payload}),adminArchiveSupplier:async()=>({}),adminRestoreSupplier:async()=>({}),adminUploadMedia:async()=>({}),adminArchiveMedia:async()=>({}),signOut:async()=>({})
    };
  }

  function decorateApi(source){
    if(!source)return source;
    const alias=(legacy,modern,transform=(...args)=>args)=>{if(typeof source[legacy]!=='function'&&typeof source[modern]==='function')source[legacy]=(...args)=>source[modern](...transform(...args));};
    alias('adminListContentPages','intoolsListPages');alias('adminListWidgets','intoolsListWidgets');alias('adminListProducts','intoolsListProducts');alias('adminListSuppliers','intoolsListSuppliers');alias('adminListMedia','intoolsListMedia');alias('adminListContentAudit','intoolsListAudit',()=>[{}]);
    alias('adminSaveContentPage','intoolsSavePage',payload=>[{route:payload.route,title:payload.content?.en?.title||'',template:payload.template,document:{locales:payload.content,seo:{en:{title:payload.seo_title,description:payload.seo_description},ja:{title:payload.seo_title,description:payload.seo_description},zh:{title:payload.seo_title,description:payload.seo_description}}},expectedRevision:payload.expected_revision}]);
    alias('adminPublishContentPage','intoolsPublishPage');alias('adminRollbackContentPage','intoolsRollbackPage',(id,revision)=>[id,Math.max(1,Number(revision||2)-1),revision]);
    if(typeof source.adminSaveWidget!=='function'&&typeof source.intoolsSaveWidget==='function')source.adminSaveWidget=async payload=>{const saved=await source.intoolsSaveWidget({key:payload.key||payload.id||payload.name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),type:payload.type,zone:payload.zone,document:{locales:payload.content,settings:{name:payload.name,style_preset:payload.style_preset,image_url:payload.image_url,alt_text:payload.alt_text,order:0},targeting:{type:'route',value:payload.target_value,routes:[payload.target_value]},schedule:{starts_at:payload.starts_at,ends_at:payload.ends_at}},expectedRevision:payload.expected_revision});if(!saved.error&&payload.status==='published')return source.intoolsPublishWidget(saved.widget?.id||payload.id,saved.widget?.current_revision||payload.expected_revision);return saved;};
    alias('adminSaveProduct','intoolsSaveProduct',payload=>[{id:payload.id||null,payload:Object.fromEntries(Object.entries(payload).filter(([key])=>!['id','updated_at'].includes(key))),expectedUpdatedAt:payload.updated_at||null}]);
    alias('adminArchiveProduct','intoolsArchiveProduct',(id,updatedAt)=>[id,updatedAt||null,false]);alias('adminRestoreProduct','intoolsArchiveProduct',(id,updatedAt)=>[id,updatedAt||null,true]);
    alias('adminSaveSupplier','intoolsSaveSupplier',payload=>[{id:payload.id||null,payload:Object.fromEntries(Object.entries(payload).filter(([key])=>!['id','updated_at'].includes(key))),expectedUpdatedAt:payload.updated_at||null}]);
    alias('adminArchiveSupplier','intoolsArchiveSupplier',(id,updatedAt)=>[id,updatedAt||null,false]);alias('adminRestoreSupplier','intoolsArchiveSupplier',(id,updatedAt)=>[id,updatedAt||null,true]);
    alias('adminArchiveMedia','intoolsArchiveMedia',(id,updatedAt,restore=false)=>[id,updatedAt||null,restore]);
    if(typeof source.adminUploadMedia!=='function'&&typeof source.intoolsSaveMedia==='function')source.adminUploadMedia=async(file,meta)=>{const uploaded=typeof source.uploadImage==='function'?await source.uploadImage(file,'intools'):{};if(uploaded?.error)return uploaded;return source.intoolsSaveMedia({id:null,name:meta.name,path:uploaded?.path||`intools/${file.name}`,publicUrl:uploaded?.url||'',mimeType:file.type,bytes:file.size,width:null,height:null,altText:{en:meta.alt_text,ja:'',zh:''},expectedUpdatedAt:null});};
    return source;
  }

  function renderShell(){
    state('desktop');
    root.innerHTML=`<div class="intools" data-intools-shell>
      <header class="topbar"><div class="brand"><span class="brand-mark">A</span><span>Atelix <small>Intools</small></span></div><div class="crumb">Intools <span aria-hidden="true">/</span> <strong data-crumb>Dashboard</strong></div><div class="top-actions"><span class="environment">ADMIN</span><span class="admin-name">${esc(currentProfile?.email||'Administrator')}</span><button class="btn btn-quiet" data-signout>Sign out</button></div></header>
      <aside class="sidebar"><nav class="nav" aria-label="Intools"><button data-view="dashboard"><span class="nav-symbol">⌂</span>Dashboard</button><button data-view="pages"><span class="nav-symbol">▤</span>Pages</button><button data-view="widgets"><span class="nav-symbol">▦</span>Widgets</button><button data-view="products"><span class="nav-symbol">◇</span>Products</button><button data-view="suppliers"><span class="nav-symbol">⌘</span>Suppliers</button><button data-view="media"><span class="nav-symbol">▧</span>Media</button><button data-view="history"><span class="nav-symbol">↺</span>History</button></nav><div class="sidebar-foot">Desktop administration workspace<br>Atelix marketplace</div></aside>
      <main class="workspace"><div class="workspace-inner" data-workspace></div></main>
      <div class="toast-region" aria-live="polite" data-toasts></div>
      <dialog class="confirm" data-confirm><div class="confirm-body"><h2 data-confirm-title>Confirm action</h2><p data-confirm-copy></p></div><div class="confirm-actions"><button class="btn btn-secondary" value="cancel">Cancel</button><button class="btn btn-primary" value="confirm" data-confirm-action>Confirm</button></div></dialog>
    </div>`;
    root.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
    root.querySelector('[data-signout]').addEventListener('click',signOut);
    navigate('dashboard');
  }

  async function signOut(){try{await api?.signOut?.();}finally{currentProfile=null;renderLogin();}}

  function navigate(view){
    currentView=view;
    root.querySelectorAll('[data-view]').forEach(btn=>{if(btn.dataset.view===view)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});
    root.querySelector('[data-crumb]').textContent=titleCase(view);
    renderLoading();
    loadView(view).catch(error=>renderError(error));
  }

  function workspace(){return root.querySelector('[data-workspace]');}
  function renderLoading(){workspace().innerHTML=`<div class="page-head"><div><h1>${esc(titleCase(currentView))}</h1><p>Loading workspace data…</p></div></div><div class="panel" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;}
  function renderError(error){workspace().innerHTML=`<div class="page-head"><div><h1>${esc(titleCase(currentView))}</h1><p>We could not load this view.</p></div><button class="btn btn-secondary" data-retry>Retry</button></div><div class="notice notice-danger" role="alert"><span>!</span><div><strong>Loading failed</strong><p>${esc(error?.message||'Check the connection and try again.')}</p></div></div>`;workspace().querySelector('[data-retry]').onclick=()=>navigate(currentView);}

  async function loadView(view){
    if(view==='dashboard')return renderDashboard();
    if(view==='pages')return renderPages();
    if(view==='widgets')return renderWidgets();
    if(view==='products')return renderProducts();
    if(view==='suppliers')return renderSuppliers();
    if(view==='media')return renderMedia();
    if(view==='history')return renderHistory();
  }

  async function callFirst(names,...args){
    const name=names.find(candidate=>typeof api?.[candidate]==='function');
    if(!name){names.forEach(n=>methodWarnings.add(n));return {available:false,result:null};}
    const result=await api[name](...args);
    if(result?.error)throw Object.assign(new Error(result.error.message||'Request failed'),{code:result.error.code,response:result});
    return {available:true,result};
  }

  function unavailableNotice(){return methodWarnings.size?`<div class="notice notice-info"><span>i</span><div><strong>Connected in limited mode</strong><p>Some Intools services are not available in this environment yet.</p></div></div>`:'';}
  function fmtDate(value){if(!value)return '—';try{return new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch(_){return String(value);}}

  async function loadAll(){
    const results=await Promise.all([
      callFirst(['intoolsListPages','adminListContentPages','adminListPages']),callFirst(['intoolsListWidgets','adminListWidgets']),callFirst(['intoolsListProducts','adminListProducts','adminListAllProducts']),callFirst(['intoolsListSuppliers','adminListSuppliers','adminListFactories']),callFirst(['intoolsListMedia','adminListMedia','adminListMediaAssets']),callFirst(['intoolsListAudit','adminListContentAudit','adminListAudit'],{})
    ]);
    cache.pages=valueOf(results[0].result,'pages');cache.widgets=valueOf(results[1].result,'widgets');cache.products=valueOf(results[2].result,'products');cache.suppliers=valueOf(results[3].result,'suppliers');cache.media=valueOf(results[4].result,'media');cache.history=valueOf(results[5].result,'history');
  }

  async function renderDashboard(){
    await loadAll();
    const drafts=cache.pages.filter(x=>x.status==='draft').length+cache.widgets.filter(x=>x.status==='draft').length;
    workspace().innerHTML=`<div class="page-head"><div><h1>Dashboard</h1><p>Review marketplace content, catalog health, and recent publishing activity.</p></div></div>${unavailableNotice()}<div class="metrics"><div class="metric"><span>Managed pages</span><strong>${cache.pages.length}</strong></div><div class="metric"><span>Active products</span><strong>${cache.products.filter(x=>(x.listing_status||x.status)==='active').length}</strong></div><div class="metric"><span>Suppliers</span><strong>${cache.suppliers.length}</strong></div><div class="metric"><span>Draft changes</span><strong>${drafts}</strong></div></div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>Recent activity</h2><button class="btn btn-quiet" data-go-history>View history</button></div><div class="panel-body">${activityRows(cache.history.slice(0,6))}</div></section><section class="panel"><div class="panel-head"><h2>Needs attention</h2></div><div class="panel-body"><div class="quick-list"><div class="quick-row"><span>▤</span><div><b>${drafts} unpublished changes</b><small>Review drafts before publishing</small></div></div><div class="quick-row"><span>◇</span><div><b>${cache.products.filter(x=>(x.listing_status||x.status)==='draft').length} draft SKUs</b><small>Complete catalog data</small></div></div><div class="quick-row"><span>⌘</span><div><b>${cache.suppliers.filter(x=>(x.verify_state||x.status)==='pending').length} pending suppliers</b><small>Verification requires review</small></div></div></div></div></section></div>`;
    workspace().querySelector('[data-go-history]').onclick=()=>navigate('history');
  }

  function activityRows(rows){return rows.length?`<div class="quick-list">${rows.map(row=>`<div class="quick-row"><span>↺</span><div><b>${esc(titleCase(row.action||'updated'))} ${esc(row.entity_name||row.target_name||row.entity_type||'item')}</b><small>${esc(row.actor_email||row.actor||'Administrator')} · ${esc(fmtDate(row.created_at))}</small></div>${row.revision?`<span class="badge">v${esc(row.revision)}</span>`:''}</div>`).join('')}</div>`:`<div class="empty"><div class="empty-symbol">↺</div><h2>No activity yet</h2><p>Published revisions and catalog changes will appear here.</p></div>`;}

  function listHead(title,description,action,label){return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${action?`<button class="btn btn-primary" data-primary-action>${esc(label)}</button>`:''}</div>`;}
  function tableEmpty(symbol,title,copy,action=''){return `<div class="empty"><div class="empty-symbol">${symbol}</div><h2>${esc(title)}</h2><p>${esc(copy)}</p>${action?`<button class="btn btn-primary" data-empty-action>${esc(action)}</button>`:''}</div>`;}

  async function renderPages(){
    const r=await callFirst(['intoolsListPages','adminListContentPages','adminListPages']);cache.pages=valueOf(r.result,'pages');
    workspace().innerHTML=`${listHead('Pages','Manage localized copy, SEO fields, drafts, publishing, and rollback.',true,'New page')}<div class="toolbar"><label class="search"><span class="sr-only"></span><input data-filter placeholder="Search pages or routes" aria-label="Search pages"></label><select data-status aria-label="Filter status"><option value="">All statuses</option><option>draft</option><option>published</option><option>archived</option></select></div>${unavailableNotice()}<section class="panel" data-list>${pagesTable(cache.pages)}</section>`;
    bindListFilters('pages',pagesTable,['title','route']);
    workspace().querySelector('[data-primary-action]').onclick=()=>openPageEditor();
    bindRowActions('page',openPageEditor);
  }

  function pagesTable(rows){return rows.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Page</th><th>Route</th><th>Status</th><th>Revision</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(p=>`<tr><td><span class="table-primary">${esc(p.title||p.name||p.content?.en?.title||'Untitled')}</span></td><td>${esc(p.route||'—')}</td><td>${statusBadge(p.status)}</td><td>v${esc(p.current_revision||p.revision||p.version||1)}</td><td>${esc(fmtDate(p.updated_at))}</td><td><div class="row-actions"><button class="btn btn-quiet" data-edit-id="${esc(p.id)}">Edit</button></div></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('▤','No managed pages','Add an existing Atelix route to begin managing its content.','New page');}

  async function openPageEditor(page={}){
    if(page.route&&typeof api?.intoolsLoadPage==='function'){
      try{const loaded=await api.intoolsLoadPage(page.route);if(!loaded?.error&&loaded?.page)page={...page,...loaded.page,revisions:loaded.revisions||[]};}catch(_){}
    }
    editorLanguage='en';
    const content=page.content||page.locales||page.document?.locales||{};const blank={title:'',body:''};['en','ja','zh'].forEach(l=>content[l]=content[l]||{...blank});
    const seo=page.document?.seo?.en||{};
    openDrawer('Edit page',page.route||'New managed route',`<form data-editor-form><div class="panel"><div class="form-section"><div class="form-grid"><label class="field"><span>Route</span><input name="route" value="${esc(page.route||'')}" placeholder="/privacy" required></label><label class="field"><span>Template</span><select name="template">${options([['article','Article'],['policy','Policy'],['landing','Landing']],page.template||'article')}</select></label></div></div><div class="form-section"><div class="lang-tabs" role="tablist">${langButtons()}</div><div data-locales>${['en','ja','zh'].map(l=>pageLocaleFields(l,content[l])).join('')}</div></div><div class="form-section"><h2>Search metadata</h2><div class="form-grid"><label class="field field-wide"><span>SEO title</span><input name="seo_title" maxlength="60" value="${esc(page.seo_title||seo.title||'')}"></label><label class="field field-wide"><span>SEO description</span><textarea name="seo_description" maxlength="160">${esc(page.seo_description||seo.description||'')}</textarea></label></div></div></div></form>`,pageActions(page));
    bindLanguageTabs();bindRichEditor();bindPagePreview();
    root.querySelector('[data-save]').onclick=()=>savePage(page,false);root.querySelector('[data-publish]')?.addEventListener('click',()=>savePage(page,true));root.querySelector('[data-rollback]')?.addEventListener('click',()=>confirmAction('Roll back this page?','A new revision will be created from the previous published version.','Roll back',()=>rollbackPage(page)));root.querySelector('[data-archive-page]')?.addEventListener('click',()=>confirmAction('Archive this page?','The published revision will stop rendering; history will be retained.','Archive',()=>archivePage(page)));
  }

  function langButtons(){return ['en','ja','zh'].map((l,i)=>`<button type="button" role="tab" data-lang="${l}" aria-selected="${i===0}">${l.toUpperCase()}</button>`).join('');}
  function pageLocaleFields(lang,data){return `<section data-locale="${lang}" ${lang!=='en'?'hidden':''}><label class="field"><span>Page title</span><input name="title_${lang}" value="${esc(data.title||'')}" required></label><span class="field-label">Body content</span><div class="rich-toolbar" role="toolbar" aria-label="Text formatting"><select data-format-block aria-label="Text style"><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select><button type="button" data-command="bold" aria-label="Bold"><b>B</b></button><button type="button" data-command="italic" aria-label="Italic"><i>I</i></button><button type="button" data-command="underline" aria-label="Underline"><u>U</u></button><button type="button" data-command="insertUnorderedList" aria-label="Bulleted list">• List</button><button type="button" data-command="insertOrderedList" aria-label="Numbered list">1. List</button><button type="button" data-link aria-label="Add link">Link</button></div><div class="rich-editor" contenteditable="true" data-rich="${lang}" data-placeholder="Write ${lang.toUpperCase()} page content…">${sanitizeHtml(data.body||'')}</div></section>`;}
  function pageActions(page){return `<div><button class="btn btn-secondary" data-close>Cancel</button>${page.id?`<button class="btn btn-secondary" data-rollback>Rollback</button><button class="btn btn-danger" data-archive-page>Archive</button>`:''}</div><div><button class="btn btn-secondary" data-save>Save draft</button><button class="btn btn-primary" data-publish>Publish</button></div>`;}

  function bindLanguageTabs(){root.querySelectorAll('[data-lang]').forEach(btn=>btn.onclick=()=>{editorLanguage=btn.dataset.lang;root.querySelectorAll('[data-lang]').forEach(x=>x.setAttribute('aria-selected',String(x===btn)));root.querySelectorAll('[data-locale]').forEach(x=>x.hidden=x.dataset.locale!==editorLanguage);updatePreview();});}
  function bindRichEditor(){root.querySelectorAll('[data-command]').forEach(btn=>btn.onclick=()=>{document.execCommand(btn.dataset.command,false,null);btn.closest('.form-section').querySelector(`[data-rich="${editorLanguage}"]`)?.focus();updatePreview();});root.querySelectorAll('[data-format-block]').forEach(sel=>sel.onchange=()=>{document.execCommand('formatBlock',false,sel.value);updatePreview();});root.querySelectorAll('[data-link]').forEach(btn=>btn.onclick=()=>{const url=prompt('Enter an HTTPS, email, or Atelix link');if(url&&safeUrl(url)){document.execCommand('createLink',false,url);updatePreview();}});root.querySelectorAll('[data-rich], [name^="title_"]').forEach(el=>el.addEventListener('input',updatePreview));}
  function bindPagePreview(){const drawer=root.querySelector('.drawer-panel');const pane=document.createElement('section');pane.className='preview-pane panel';pane.innerHTML=`<div class="preview-toolbar"><strong>Public preview</strong><div class="preview-tabs"><button type="button" data-size="desktop" aria-selected="true">Desktop</button><button type="button" data-size="tablet">Tablet</button><button type="button" data-size="mobile">Mobile</button></div></div><div class="preview-stage"><div class="preview-frame" data-preview-frame data-size="desktop"><article class="preview-doc"><h1 data-preview-title></h1><div data-preview-body></div></article></div></div>`;const body=drawer.querySelector('.drawer-body');body.classList.add('editor-layout');body.appendChild(pane);pane.querySelectorAll('[data-size]').forEach(btn=>btn.onclick=()=>{pane.querySelectorAll('[data-size]').forEach(x=>x.setAttribute('aria-selected',String(x===btn)));pane.querySelector('[data-preview-frame]').dataset.size=btn.dataset.size;});updatePreview();}
  function updatePreview(){const pane=root.querySelector('.preview-pane');if(!pane)return;const title=root.querySelector(`[name="title_${editorLanguage}"]`)?.value||'Untitled page';const body=root.querySelector(`[data-rich="${editorLanguage}"]`)?.innerHTML||'<p>Page content preview</p>';pane.querySelector('[data-preview-title]').textContent=title;pane.querySelector('[data-preview-body]').innerHTML=sanitizeHtml(body);}

  function pagePayload(page){const form=root.querySelector('[data-editor-form]');const content={};['en','ja','zh'].forEach(lang=>{content[lang]={title:form[`title_${lang}`].value.trim(),body:sanitizeHtml(root.querySelector(`[data-rich="${lang}"]`).innerHTML)};});return {id:page.id||null,route:form.route.value.trim(),template:form.template.value,seo_title:form.seo_title.value.trim(),seo_description:form.seo_description.value.trim(),content,expected_revision:page.current_revision||page.revision_no||page.revision||page.version||0};}
  async function savePage(page,publish){
    const payload=pagePayload(page);if(!payload.route.startsWith('/')||!['en','ja','zh'].every(l=>payload.content[l].title&&stripHtml(payload.content[l].body))){toast('Complete the route and all three languages.',true);return;}
    try{const save=await callFirst(['adminSaveContentPage','adminUpsertPage'],payload);if(!save.available){toast('Page saving is not available in this environment.',true);return;}const saved=save.result?.page||save.result?.data||{...page,...payload};if(publish){await confirmAction('Publish this revision?','The current draft will become visible on its registered route.','Publish',async()=>{await callFirst(['adminPublishContentPage','adminPublishPage'],saved.id||page.id,saved.current_revision||saved.revision_no||payload.expected_revision);closeDrawer();toast('Page published.');navigate('pages');});}else{closeDrawer();toast('Draft saved.');navigate('pages');}}catch(error){handleMutationError(error);}
  }
  async function rollbackPage(page){const current=page.current_revision||page.revision_no||page.revision||page.version||1;try{await callFirst(['intoolsRollbackPage'],page.id,Math.max(1,current-1),current);closeDrawer();toast('Previous revision restored.');navigate('pages');}catch(error){handleMutationError(error);}}
  async function archivePage(page){try{const r=await callFirst(['intoolsArchivePage'],page.id,page.current_revision||page.revision_no||page.revision||page.version||null,false);if(!r.available){toast('Page archiving is not available.',true);return;}closeDrawer();toast('Page archived.');navigate('pages');}catch(error){handleMutationError(error);}}

  async function renderWidgets(){const r=await callFirst(['adminListWidgets']);cache.widgets=valueOf(r.result,'widgets');workspace().innerHTML=`${listHead('Widgets','Position and style registered promotional widgets without changing product prices.',true,'New widget')}<div class="toolbar"><label class="search"><input data-filter placeholder="Search widgets" aria-label="Search widgets"></label><select data-status aria-label="Filter status"><option value="">All statuses</option><option>draft</option><option>published</option><option>archived</option></select></div>${unavailableNotice()}<section class="panel" data-list>${widgetsTable(cache.widgets)}</section>`;bindListFilters('widgets',widgetsTable,['name','type','zone']);workspace().querySelector('[data-primary-action]').onclick=()=>openWidgetEditor();bindRowActions('widget',openWidgetEditor);}
  function widgetsTable(rows){return rows.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Widget</th><th>Type</th><th>Placement</th><th>Target</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(w=>`<tr><td class="table-primary">${esc(w.name||'Untitled widget')}</td><td>${esc(titleCase(w.type))}</td><td>${esc(titleCase(w.zone))}</td><td>${esc(titleCase(w.target_type||'route'))}</td><td>${statusBadge(w.status)}</td><td><div class="row-actions"><button class="btn btn-quiet" data-edit-id="${esc(w.id)}">Edit</button></div></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('▦','No widgets configured','Create a widget inside an approved page zone.','New widget');}
  async function openWidgetEditor(widget={}){if((widget.key||widget.id)&&typeof api?.intoolsLoadWidget==='function'){try{const loaded=await api.intoolsLoadWidget(widget.key||widget.id);if(!loaded?.error&&loaded?.widget)widget={...widget,...loaded.widget,revisions:loaded.revisions||[]};}catch(_){}}const doc=widget.document||{},copy=widget.content||doc.locales||{},targeting=doc.targeting||{};widget={...doc.settings,...doc.schedule,...targeting,target_value:targeting.value||targeting.routes?.[0],...widget};openDrawer('Edit widget',widget.name||'New registered widget',`<form data-editor-form><div class="panel"><div class="form-section"><h2>Configuration</h2><div class="form-grid"><label class="field"><span>Internal name</span><input name="name" value="${esc(widget.name||'')}" required></label><label class="field"><span>Widget type</span><select name="type">${options([['discount','Discount'],['announcement','Announcement'],['image_callout','Image callout']],widget.type||'discount')}</select></label><label class="field"><span>Approved zone</span><select name="zone">${options([['managed_page_before_content','Managed page · before content']],widget.zone||'managed_page_before_content')}</select></label><label class="field"><span>Style preset</span><select name="style_preset">${options([['forest','Forest'],['brass','Brass'],['neutral','Neutral']],widget.style_preset||'forest')}</select></label><label class="field"><span>Target</span><select name="target_type">${options([['route','Route']],'route')}</select></label><label class="field"><span>Target route</span><input name="target_value" value="${esc(widget.target_value||'/')}" placeholder="/privacy" required></label><label class="field"><span>Starts</span><input name="starts_at" type="datetime-local" value="${esc(dateTimeValue(widget.starts_at))}"></label><label class="field"><span>Ends</span><input name="ends_at" type="datetime-local" value="${esc(dateTimeValue(widget.ends_at))}"></label><label class="field field-wide"><span>CTA destination</span><input name="cta_url" value="${esc(copy.en?.cta_url||'')}" placeholder="https://atelix.app/categories"></label><label class="field field-wide"><span>Image URL</span><input name="image_url" type="url" value="${esc(widget.image_url||'')}"></label><label class="field field-wide"><span>Image alt text</span><input name="alt_text" value="${esc(widget.alt_text||'')}"></label></div></div><div class="form-section"><div class="lang-tabs" role="tablist">${langButtons()}</div><div data-locales>${['en','ja','zh'].map((l,i)=>`<section data-locale="${l}" ${i?'hidden':''}><div class="form-grid"><label class="field field-wide"><span>Headline</span><input name="headline_${l}" value="${esc(copy[l]?.headline||'')}" required></label><label class="field field-wide"><span>Body</span><textarea name="body_${l}" required>${esc(copy[l]?.body||'')}</textarea></label><label class="field"><span>CTA label</span><input name="cta_label_${l}" value="${esc(copy[l]?.cta_label||'')}"></label><label class="field"><span>Discount label</span><input name="discount_label_${l}" value="${esc(copy[l]?.discount_label||'')}"></label></div></section>`).join('')}</div></div></div></form>`,`<div><button class="btn btn-secondary" data-close>Cancel</button>${widget.id?'<button class="btn btn-secondary" data-widget-rollback>Rollback</button><button class="btn btn-danger" data-archive>Archive</button>':''}</div><div><button class="btn btn-secondary" data-save>Save draft</button><button class="btn btn-primary" data-publish>Publish</button></div>`);bindLanguageTabs();root.querySelector('[data-save]').onclick=()=>saveWidget(widget,false);root.querySelector('[data-publish]').onclick=()=>saveWidget(widget,true);root.querySelector('[data-widget-rollback]')?.addEventListener('click',()=>confirmAction('Roll back this widget?','A new draft will be created from the previous revision.','Roll back',async()=>{const revision=widget.current_revision||widget.revision_no||widget.revision;await callFirst(['intoolsRollbackWidget'],widget.id,Math.max(1,Number(revision||2)-1),revision);closeDrawer();toast('Widget revision restored.');navigate('widgets');}));root.querySelector('[data-archive]')?.addEventListener('click',()=>confirmAction('Archive this widget?','It will stop rendering on public pages.','Archive',()=>archiveEntity('widget',widget)));}
  async function saveWidget(widget,publish){const form=root.querySelector('[data-editor-form]');const content={};['en','ja','zh'].forEach(l=>content[l]={headline:form[`headline_${l}`].value.trim(),body:form[`body_${l}`].value.trim(),cta_label:form[`cta_label_${l}`].value.trim(),cta_url:form.cta_url.value.trim(),discount_label:form[`discount_label_${l}`].value.trim()});if(!form.name.value.trim()||!Object.values(content).every(x=>x.headline&&x.body)){toast('Complete the widget name and all languages.',true);return;}if(form.cta_url.value.trim()&&!safeUrl(form.cta_url.value.trim())){toast('Use a valid HTTPS, email, or Atelix CTA destination.',true);return;}const payload={id:widget.id||null,name:form.name.value.trim(),type:form.type.value,zone:form.zone.value,style_preset:form.style_preset.value,target_type:'route',target_value:form.target_value.value.trim(),starts_at:form.starts_at.value||null,ends_at:form.ends_at.value||null,image_url:form.image_url.value.trim(),alt_text:form.alt_text.value.trim(),content,status:publish?'published':'draft',expected_revision:widget.current_revision||widget.revision_no||widget.revision||0};try{const r=await callFirst(['adminSaveWidget','adminUpsertWidget'],payload);if(!r.available){toast('Widget saving is not available.',true);return;}closeDrawer();toast(publish?'Widget published.':'Widget draft saved.');navigate('widgets');}catch(error){handleMutationError(error);}}

  async function renderProducts(){const r=await callFirst(['adminListProducts','adminListAllProducts']);cache.products=valueOf(r.result,'products');workspace().innerHTML=`${listHead('Products','Manage SKU identity, structured specifications, pricing, visibility, and assignments.',true,'New product')}<div class="toolbar"><label class="search"><input data-filter placeholder="Search SKU or product" aria-label="Search products"></label><select data-status aria-label="Filter status"><option value="">All statuses</option><option value="active">active</option><option value="draft">draft</option><option value="archived">archived</option></select></div>${unavailableNotice()}<section class="panel" data-list>${productsTable(cache.products)}</section>`;bindListFilters('products',productsTable,['sku','name','supplier_name']);workspace().querySelector('[data-primary-action]').onclick=()=>openProductEditor();bindRowActions('product',openProductEditor);}
  function productsTable(rows){return rows.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>SKU</th><th>Product</th><th>Supplier</th><th>Category</th><th>Price</th><th>MOQ</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(p=>`<tr><td class="table-primary">${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(p.supplier_name||p.factory_name||p.factory_id||'—')}</td><td>${esc(p.category||'—')}</td><td>${p.price!=null?`$${esc(Number(p.price).toFixed(2))}`:'—'}</td><td>${esc(p.moq??'—')}</td><td>${statusBadge(p.listing_status||p.status)}</td><td><div class="row-actions"><button class="btn btn-quiet" data-edit-id="${esc(p.id)}">Edit</button></div></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('◇','No products found','Create the first controlled SKU record.','New product');}
  function openProductEditor(product={}){openDrawer('Edit product',product.sku||'New SKU',entityForm('product',product),entityActions(product));bindEntityActions('product',product);}
  function entityForm(type,item){
    if(type==='product'){
      const applications=['Multiple apparel types','Blouson','T-shirt','Shirt','Blouse','Jacket','Coat','Pants','Shorts','Skirt','Dress','Suit','Knitwear','Activewear','Underwear','Socks','Bag','Footwear'].map(value=>[value,value]);
      const assignments=item.brand_emails||item.private_assignments||[];
      return `<form data-editor-form><div class="panel"><div class="form-section"><h2>SKU identity</h2><div class="form-grid"><label class="field"><span>SKU</span><input name="sku" value="${esc(item.sku||'')}" required></label><label class="field"><span>Product name</span><input name="name" value="${esc(item.name||'')}" required></label><label class="field"><span>Supplier ID</span><input name="factory_id" value="${esc(item.factory_id||'')}" required></label><label class="field"><span>Category</span><select name="category">${options([['fabrics','Fabrics'],['accessories','Accessories'],['trims','Trims'],['yarns','Yarns'],['oem','OEM service']],item.category||'fabrics')}</select></label><label class="field"><span>Listing status</span><select name="listing_status">${options([['draft','Draft'],['active','Active'],['archived','Archived']],item.listing_status||'draft')}</select></label><label class="field"><span>Applications</span><select name="applications">${options(applications,item.applications||'Multiple apparel types')}</select></label></div></div><div class="form-section"><h2>Specifications and pricing</h2><div class="form-grid"><label class="field field-wide"><span>Description</span><textarea name="description">${esc(item.description||'')}</textarea></label><label class="field"><span>Composition</span><input name="comp" value="${esc(item.comp||'')}"></label><label class="field"><span>GSM</span><input name="gsm" inputmode="numeric" value="${esc(item.gsm||'')}"></label><label class="field"><span>Unit price (USD)</span><input name="price" type="number" min="0" step="0.01" value="${esc(item.price??'0')}"></label><label class="field"><span>MOQ</span><input name="moq" type="number" min="0" value="${esc(item.moq??'')}"></label><label class="field"><span>Unit</span><select name="unit_type">${options([['m','Meter'],['kg','Kilogram'],['pc','Piece'],['package','Package'],['style','Style'],['order','Order'],['color','Color']],item.unit_type||'m')}</select></label><label class="field"><span>Pricing mode</span><select name="pricing_mode">${options([['fixed','Fixed'],['quote','Quote only']],item.pricing_mode||'fixed')}</select></label></div></div><div class="form-section"><h2>Media and access</h2><div class="form-grid"><label class="field field-wide"><span>Image URL</span><input name="img" type="url" value="${esc(item.img||'')}"></label><label class="field field-wide"><span>Private buyer emails</span><textarea name="private_assignments" placeholder="buyer@example.com, sourcing@example.com">${esc(Array.isArray(assignments)?assignments.join(', '):assignments)}</textarea></label></div></div></div></form>`;
    }
    const capabilities=item.tags||item.capabilities||[];
    const certifications=item.certs||item.certifications||[];
    return `<form data-editor-form><div class="panel"><div class="form-section"><h2>Supplier identity</h2><div class="form-grid"><label class="field"><span>Supplier name</span><input name="name" value="${esc(item.name||'')}" required></label><label class="field"><span>Slug</span><input name="slug" value="${esc(item.slug||'')}" required></label><label class="field"><span>Supplier type</span><select name="type">${options([['fabric_mill','Fabric mill'],['accessories_supplier','Accessories supplier'],['trim_supplier','Trim supplier'],['yarn_supplier','Yarn supplier'],['garment_manufacturer','Garment manufacturer'],['textile_trading_company','Textile trading company'],['material_innovator','Material innovator']],item.type||'fabric_mill')}</select></label><label class="field"><span>Location</span><input name="loc" value="${esc(item.loc||item.region||'')}"></label><label class="field"><span>Verification</span><select name="verify_state">${options([['unverified','Unverified'],['pending','Pending'],['verified','Verified']],item.verify_state||'unverified')}</select></label><label class="field field-wide"><span>Profile description</span><textarea name="description">${esc(item.bio||item.description||'')}</textarea></label><label class="field"><span>Contact email</span><input name="contact_email" type="email" value="${esc(item.sales||item.contact_email||'')}"></label><label class="field"><span>Website</span><input name="website" type="url" value="${esc(item.web||item.website||'')}"></label><label class="field field-wide"><span>Capabilities</span><textarea name="capabilities" placeholder="Weaving, dyeing, finishing">${esc(Array.isArray(capabilities)?capabilities.join(', '):capabilities)}</textarea></label><label class="field field-wide"><span>Certifications</span><textarea name="certifications" placeholder="GOTS, OEKO-TEX">${esc(Array.isArray(certifications)?certifications.join(', '):certifications)}</textarea></label><label class="field field-wide"><span>Profile image URL</span><input name="image_url" type="url" value="${esc(item.img||item.image_url||'')}"></label></div></div></div></form>`;
  }
  function entityActions(item){const archived=isArchived(item);return `<div><button class="btn btn-secondary" data-close>Cancel</button>${item.id?`<button class="btn ${archived?'btn-secondary':'btn-danger'}" data-archive>${archived?'Restore':'Archive'}</button>`:''}</div><div><button class="btn btn-primary" data-save>Save changes</button></div>`;}
  function bindEntityActions(type,item){root.querySelector('[data-save]').onclick=()=>saveEntity(type,item);root.querySelector('[data-archive]')?.addEventListener('click',()=>{const archived=isArchived(item);confirmAction(`${archived?'Restore':'Archive'} this ${type}?`,archived?'The record will return to its previous working state.':'Public visibility will be removed. Data and history will be retained.',archived?'Restore':'Archive',()=>archiveEntity(type,item,archived));});}
  async function saveEntity(type,item){
    const form=root.querySelector('[data-editor-form]');
    const values=Object.fromEntries(new FormData(form).entries());
    let payload;
    if(type==='product'){
      const brandEmails=values.private_assignments.split(',').map(x=>x.trim()).filter(Boolean);
      payload={...values,id:item.id||null,updated_at:item.updated_at||null,price:values.price===''?0:Number(values.price),moq:values.moq===''?null:Number(values.moq),gsm:values.gsm||'',brand_emails:brandEmails,is_private:brandEmails.length>0};
      delete payload.private_assignments;
    }else{
      payload={id:item.id||null,updated_at:item.updated_at||null,slug:values.slug,name:values.name,type:values.type,loc:values.loc,region:values.loc,verify_state:values.verify_state,bio:values.description,web:values.website,sales:values.contact_email,tags:values.capabilities.split(',').map(x=>x.trim()).filter(Boolean),certs:values.certifications.split(',').map(x=>x.trim()).filter(Boolean),img:values.image_url};
    }
    try{const names=type==='product'?['adminSaveProduct','adminUpsertProduct']:['adminSaveSupplier','adminUpsertSupplier','adminSaveFactory'];const r=await callFirst(names,payload);if(!r.available){toast(`${titleCase(type)} saving is not available.`,true);return;}closeDrawer();toast(`${titleCase(type)} saved.`);navigate(type==='product'?'products':'suppliers');}catch(error){handleMutationError(error);}
  }
  async function archiveEntity(type,record,restore=false){try{const item=typeof record==='object'?record:(type==='widget'?cache.widgets.find(x=>String(x.id)===String(record)):{id:record});const names=type==='widget'?['intoolsArchiveWidget','adminArchiveWidget']:type==='product'?(restore?['adminRestoreProduct']:['adminArchiveProduct']):(restore?['adminRestoreSupplier','adminRestoreFactory']:['adminArchiveSupplier','adminArchiveFactory']);const args=type==='widget'?[item.id,item.current_revision||item.revision_no||item.revision||null,restore]:[item.id,item.updated_at||null];const r=await callFirst(names,...args);if(!r.available){toast('This action is not available.',true);return;}closeDrawer();toast(`${titleCase(type)} ${restore?'restored':'archived'}.`);navigate(type==='widget'?'widgets':`${type}s`);}catch(error){handleMutationError(error);}}

  async function renderSuppliers(){const r=await callFirst(['adminListSuppliers','adminListFactories']);cache.suppliers=valueOf(r.result,'suppliers');workspace().innerHTML=`${listHead('Suppliers','Manage identity, verification, capabilities, certifications, media, and linked SKUs.',true,'New supplier')}<div class="toolbar"><label class="search"><input data-filter placeholder="Search suppliers" aria-label="Search suppliers"></label><select data-status aria-label="Filter status"><option value="">All states</option><option value="verified">verified</option><option value="pending">pending</option><option value="unverified">unverified</option><option value="archived">archived</option></select></div>${unavailableNotice()}<section class="panel" data-list>${suppliersTable(cache.suppliers)}</section>`;bindListFilters('suppliers',suppliersTable,['name','region','loc']);workspace().querySelector('[data-primary-action]').onclick=()=>openSupplierEditor();bindRowActions('supplier',openSupplierEditor);}
  function suppliersTable(rows){return rows.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Supplier</th><th>Location</th><th>Verification</th><th>Products</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(s=>`<tr><td class="table-primary">${esc(s.name)}</td><td>${esc(s.loc||s.region||'—')}</td><td>${statusBadge(isArchived(s)?'archived':s.verify_state||s.status)}</td><td>${esc(s.product_count??'—')}</td><td>${esc(fmtDate(s.updated_at))}</td><td><div class="row-actions"><button class="btn btn-quiet" data-edit-id="${esc(s.id)}">Edit</button></div></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('⌘','No suppliers found','Add a supplier profile and connect its catalog.','New supplier');}
  function openSupplierEditor(supplier={}){openDrawer('Edit supplier',supplier.name||'New supplier',entityForm('supplier',supplier),entityActions(supplier));bindEntityActions('supplier',supplier);}

  async function renderMedia(){const r=await callFirst(['adminListMedia','adminListMediaAssets']);cache.media=valueOf(r.result,'media');workspace().innerHTML=`${listHead('Media','Upload reusable images with descriptive alt text for pages, widgets, and catalog records.',true,'Upload image')}${unavailableNotice()}<section class="panel">${cache.media.length?`<div class="media-grid">${cache.media.map(m=>`<article class="media-item"><img src="${esc(m.url||m.public_url||'')}" alt="${esc(altTextValue(m.alt_text))}" loading="lazy"><b title="${esc(m.name||m.filename)}">${esc(m.name||m.filename||'Untitled asset')}</b><small>${esc(m.size||m.mime_type||'Image')} · ${isArchived(m)?'Archived':'Active'}</small><button class="btn btn-quiet" data-media-archive="${esc(m.id)}">${isArchived(m)?'Restore':'Archive'}</button></article>`).join('')}</div>`:tableEmpty('▧','No media uploaded','Upload an image and add meaningful alternative text.','Upload image')}</section>`;workspace().querySelector('[data-primary-action]').onclick=openMediaUpload;workspace().querySelector('[data-empty-action]')?.addEventListener('click',openMediaUpload);workspace().querySelectorAll('[data-media-archive]').forEach(button=>button.onclick=()=>{const item=cache.media.find(media=>String(media.id)===button.dataset.mediaArchive);confirmAction(`${isArchived(item)?'Restore':'Archive'} this image?`,'The stored file remains recoverable and its history is retained.',isArchived(item)?'Restore':'Archive',async()=>{await callFirst(['adminArchiveMedia'],item.id,item.updated_at,isArchived(item));toast(`Image ${isArchived(item)?'restored':'archived'}.`);navigate('media');});});}
  function openMediaUpload(){openDrawer('Upload image','Add a reusable Intools media asset.',`<form data-editor-form><div class="panel"><div class="form-section"><label class="field"><span>Image file</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label><label class="field"><span>Asset name</span><input name="name" required></label><label class="field"><span>Alternative text</span><textarea name="alt_text" required></textarea></label></div></div></form>`,`<div><button class="btn btn-secondary" data-close>Cancel</button></div><div><button class="btn btn-primary" data-save>Upload image</button></div>`);root.querySelector('[data-save]').onclick=uploadMedia;}
  async function uploadMedia(){const form=root.querySelector('[data-editor-form]'),file=form.file.files[0];if(!file||!form.alt_text.value.trim()){toast('Choose an image and add alternative text.',true);return;}if(file.size>8*1024*1024){toast('Images must be 8 MB or smaller.',true);return;}try{const r=await callFirst(['adminUploadMedia','adminUploadMediaAsset'],file,{name:form.name.value.trim(),alt_text:form.alt_text.value.trim()});if(!r.available){toast('Media upload is not available.',true);return;}closeDrawer();toast('Image uploaded.');navigate('media');}catch(error){handleMutationError(error);}}

  async function renderHistory(){const r=await callFirst(['adminListContentAudit','adminListAudit']);cache.history=valueOf(r.result,'history');workspace().innerHTML=`${listHead('History','Review immutable content, catalog, and supplier actions.')} ${unavailableNotice()}<section class="panel">${cache.history.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>Item</th><th>Action</th><th>Revision</th><th>Administrator</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${cache.history.map(h=>`<tr><td>${esc(fmtDate(h.created_at))}</td><td><span class="table-primary">${esc(h.entity_name||h.target_name||h.entity_type||'Record')}</span><span class="table-secondary">${esc(titleCase(h.entity_type||h.target_type||''))}</span></td><td>${statusBadge(h.action||'updated')}</td><td>${h.revision?`v${esc(h.revision)}`:'—'}</td><td>${esc(h.actor_email||h.actor||'—')}</td><td><div class="row-actions">${h.entity_type==='page'&&h.revision?`<button class="btn btn-quiet" data-history-rollback="${esc(h.id)}">Restore</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('↺','No history yet','Publishing and catalog actions will be recorded here.')}</section>`;workspace().querySelectorAll('[data-history-rollback]').forEach(btn=>btn.onclick=()=>{const item=cache.history.find(x=>String(x.id)===btn.dataset.historyRollback);confirmAction('Restore this revision?','Restoring creates a new revision and preserves the complete history.','Restore',async()=>{await callFirst(['adminRollbackContentPage','adminRollbackPage'],item.entity_id||item.target_id,item.revision);toast('Revision restored.');navigate('history');});});}

  function bindListFilters(type,renderer,keys){const input=workspace().querySelector('[data-filter]'),status=workspace().querySelector('[data-status]');const run=()=>{const q=input.value.trim().toLowerCase(),s=status.value.toLowerCase();const rows=cache[type].filter(item=>(!q||keys.some(k=>String(item[k]||'').toLowerCase().includes(q)))&&(!s||String(isArchived(item)?'archived':item.status||item.listing_status||item.verify_state||'').toLowerCase()===s));workspace().querySelector('[data-list]').innerHTML=renderer(rows);bindRowActions(type.slice(0,-1),type==='pages'?openPageEditor:type==='widgets'?openWidgetEditor:type==='products'?openProductEditor:openSupplierEditor);};input.addEventListener('input',run);status.addEventListener('change',run);workspace().querySelector('[data-empty-action]')?.addEventListener('click',()=>workspace().querySelector('[data-primary-action]')?.click());}
  function bindRowActions(type,handler){root.querySelectorAll('[data-edit-id]').forEach(btn=>btn.onclick=()=>{const collection=cache[type==='page'?'pages':type==='widget'?'widgets':`${type}s`];handler(collection.find(item=>String(item.id)===btn.dataset.editId)||{});});root.querySelector('[data-empty-action]')?.addEventListener('click',()=>handler());}

  function openDrawer(title,subtitle,body,footer){const wrap=document.createElement('div');wrap.className='drawer';wrap.setAttribute('data-drawer','');wrap.innerHTML=`<section class="drawer-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="drawer-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-btn" data-close aria-label="Close">×</button></header><div class="drawer-body">${body}</div><footer class="drawer-foot">${footer}</footer></section>`;root.querySelector('.intools').appendChild(wrap);wrap.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=closeDrawer);wrap.addEventListener('mousedown',event=>{if(event.target===wrap)closeDrawer();});wrap.querySelector('input,select,textarea,button')?.focus();}
  function closeDrawer(){root.querySelector('[data-drawer]')?.remove();}
  function confirmAction(title,copy,label,action){const dialog=root.querySelector('[data-confirm]');dialog.querySelector('[data-confirm-title]').textContent=title;dialog.querySelector('[data-confirm-copy]').textContent=copy;const cancel=dialog.querySelector('[value="cancel"]'),confirm=dialog.querySelector('[data-confirm-action]');confirm.textContent=label;return new Promise(resolve=>{const finish=async yes=>{cancel.onclick=null;confirm.onclick=null;dialog.close();if(yes){try{await action();resolve(true);}catch(error){handleMutationError(error);resolve(false);}}else resolve(false);};cancel.onclick=()=>finish(false);confirm.onclick=()=>finish(true);dialog.showModal();});}
  function toast(message,isError=false){const el=document.createElement('div');el.className=`toast${isError?' toast-error':''}`;el.textContent=message;root.querySelector('[data-toasts]')?.appendChild(el);setTimeout(()=>el.remove(),4000);}
  function handleMutationError(error){if(['conflict','revision_conflict','23505'].includes(error?.code)){toast('This record changed elsewhere. Reload it before saving.',true);}else toast(error?.message||'The change could not be saved.',true);}

  function safeUrl(url){try{const parsed=new URL(url,location.origin);return parsed.origin===location.origin||parsed.protocol==='https:'||parsed.protocol==='mailto:';}catch(_){return false;}}
  function sanitizeHtml(html){const doc=new DOMParser().parseFromString(`<body>${html||''}</body>`,'text/html');const clean=node=>{[...node.childNodes].forEach(child=>{if(child.nodeType===Node.COMMENT_NODE){child.remove();return;}if(child.nodeType!==Node.ELEMENT_NODE)return clean(child);if(!allowedTags.has(child.tagName)){const frag=doc.createDocumentFragment();while(child.firstChild)frag.appendChild(child.firstChild);child.replaceWith(frag);clean(node);return;}const href=child.tagName==='A'?child.getAttribute('href'):null;[...child.attributes].forEach(attr=>child.removeAttribute(attr.name));if(child.tagName==='A'&&href&&safeUrl(href)){child.setAttribute('href',href);child.setAttribute('rel','noopener noreferrer');}clean(child);});};clean(doc.body);return doc.body.innerHTML;}
  function stripHtml(html){return new DOMParser().parseFromString(html||'','text/html').body.textContent.trim();}

  addEventListener('resize',()=>{if(innerWidth<MIN_WIDTH)setMobileBlocked();else if(document.body.dataset.intoolsState==='mobile-blocked')boot();});
  boot();
})();
