/* Atelix async data seam — thin wrapper over window.supabaseClient.
   Loaded via <script src> AFTER supabase-client.bundle.js on every page.
   Exposes window.ARCANA_API. All methods return Promises and resolve
   {data, error} shapes (mirroring supabase-js) so callers can check `error`. */
(function(){
'use strict';

const sb = window.supabaseClient;

/* Guard: if the client never loaded, expose a no-op API so pages don't crash. */
if(!sb || !sb.auth){
  console.error('[ARCANA_API] window.supabaseClient is missing — auth is disabled. '+
                'Ensure js/supabase-client.bundle.js loads before js/api.js.');
  const err = { message: 'Supabase client unavailable' };
  window.ARCANA_API = {
    unavailable: true,
    signUp(){ return Promise.resolve({ data:null, error: err }); },
    signIn(){ return Promise.resolve({ data:null, error: err }); },
    signInWithMagicLink(){ return Promise.resolve({ data:null, error: err }); },
    signOut(){ return Promise.resolve({ error: null }); },
    resetRequest(){ return Promise.resolve({ data:null, error: err }); },
    resetConfirm(){ return Promise.resolve({ data:null, error: err }); },
    getSessionProfile(){ return Promise.resolve(null); },
    onChange(){ return { data:{ subscription:{ unsubscribe(){} } } }; },
    fetchCatalog(){ return Promise.reject(err); },
    fetchCatalogPage(){ return Promise.reject(err); },
    fetchCatalogFactories(){ return Promise.reject(err); },
    getPublicProduct(){ return Promise.resolve(null); },
    getPublicFactory(){ return Promise.resolve(null); },
    placeOrder(){ return Promise.resolve({ error: err }); },
    declarePayment(){ return Promise.resolve({ error: err }); },
    getOrder(){ return Promise.resolve({ error: err }); },
    getMyOrders(){ return Promise.resolve([]); },
    getBankAccount(){ return Promise.resolve(null); },
    getCart(){ return Promise.resolve([]); },
    syncCartItem(){ return Promise.resolve({ error: err }); },
    replaceCart(){ return Promise.resolve({ error: err }); },
    getWishlist(){ return Promise.resolve([]); },
    syncWishlistItem(){ return Promise.resolve({ error: err }); },
    replaceWishlist(){ return Promise.resolve({ error: err }); },
    getRecentSearches(){ return Promise.resolve([]); },
    recordRecentSearch(){ return Promise.resolve({ error: err }); },
    getAlgoliaSearchToken(){ return Promise.resolve({ data:null, error: err }); },
    searchPrivateAlgolia(){ return Promise.resolve({ hits:[], error: err }); },
    getMyProfile(){ return Promise.resolve(null); },
    updateProfile(){ return Promise.resolve({ error: err }); },
    updateEmail(){ return Promise.resolve({ error: err }); },
    uploadImage(){ return Promise.resolve({ error: err }); },
    uploadCatalogProductImage(){ return Promise.resolve({ error: err }); },
    analyzeDesign(){ return Promise.resolve({ data:null, error: err }); },
    rematchDesign(){ return Promise.resolve({ data:null, error: err }); },
    getMyFactory(){ return Promise.resolve(null); },
    getFactoryById(){ return Promise.resolve(null); },
    getFactoryBySlug(){ return Promise.resolve(null); },
    getFactoryForAdminEntry(){ return Promise.resolve(null); },
    updateFactory(){ return Promise.resolve({ error: err }); },
    getMyProducts(){ return Promise.resolve({ error: err }); },
    createProduct(){ return Promise.resolve({ error: err }); },
    updateProduct(){ return Promise.resolve({ error: err }); },
    archiveProduct(){ return Promise.resolve({ error: err }); },
    getPriceBreaks(){ return Promise.resolve([]); },
    setPriceBreaks(){ return Promise.resolve({ error: err }); },
    getAddresses(){ return Promise.resolve([]); },
    createAddress(){ return Promise.resolve({ error: err }); },
    updateAddress(){ return Promise.resolve({ error: err }); },
    deleteAddress(){ return Promise.resolve({ error: err }); },
    setDefaultAddress(){ return Promise.resolve({ error: err }); },
    getShippingRates(){ return Promise.resolve([]); },
    getShippingQuote(){ return Promise.resolve({ quote:null, error:err }); },
    getMyConversations(){ return Promise.resolve([]); },
    getOrCreateConversation(){ return Promise.resolve({ error: err }); },
    getMessages(){ return Promise.resolve([]); },
    sendMessage(){ return Promise.resolve({ error: err }); },
    adminListOrders(){ return Promise.resolve([]); },
    adminUpdateOrderStatus(){ return Promise.resolve({ error: err }); },
    adminListUsers(){ return Promise.resolve([]); },
    adminSetFactoryVerification(){ return Promise.resolve({ error: err }); },
    adminListAudit(){ return Promise.resolve([]); },
    getPublishedContentPage(){ return Promise.resolve({ page:null, error:err }); },
    intoolsListPages(){ return Promise.resolve({ items:[], error:err }); },
    intoolsLoadPage(){ return Promise.resolve({ page:null, revisions:[], error:err }); },
    intoolsSavePage(){ return Promise.resolve({ page:null, error:err }); },
    intoolsPublishPage(){ return Promise.resolve({ page:null, error:err }); },
    intoolsRollbackPage(){ return Promise.resolve({ page:null, error:err }); },
    intoolsArchivePage(){ return Promise.resolve({ page:null, error:err }); },
    intoolsListWidgets(){ return Promise.resolve({ items:[], error:err }); },
    intoolsLoadWidget(){ return Promise.resolve({ widget:null, revisions:[], error:err }); },
    intoolsSaveWidget(){ return Promise.resolve({ widget:null, error:err }); },
    intoolsPublishWidget(){ return Promise.resolve({ widget:null, error:err }); },
    intoolsRollbackWidget(){ return Promise.resolve({ widget:null, error:err }); },
    intoolsArchiveWidget(){ return Promise.resolve({ widget:null, error:err }); },
    intoolsListMedia(){ return Promise.resolve({ items:[], error:err }); },
    intoolsSaveMedia(){ return Promise.resolve({ asset:null, error:err }); },
    intoolsArchiveMedia(){ return Promise.resolve({ asset:null, error:err }); },
    intoolsListProducts(){ return Promise.resolve({ items:[], error:err }); },
    intoolsSaveProduct(){ return Promise.resolve({ product:null, error:err }); },
    intoolsArchiveProduct(){ return Promise.resolve({ product:null, error:err }); },
    saveProductCatalogContent(){ return Promise.resolve({ product:null, error:err }); },
    intoolsListSuppliers(){ return Promise.resolve({ items:[], error:err }); },
    intoolsSaveSupplier(){ return Promise.resolve({ supplier:null, error:err }); },
    intoolsArchiveSupplier(){ return Promise.resolve({ supplier:null, error:err }); },
    saveSupplierFaqs(){ return Promise.resolve({ faqs:[], error:err }); },
    saveSupplierCatalogContent(){ return Promise.resolve({ supplier:null, error:err }); },
    intoolsListShippingRates(){ return Promise.resolve({ items:[], error:err }); },
    intoolsSaveShippingRate(){ return Promise.resolve({ rate:null, error:err }); },
    intoolsArchiveShippingRate(){ return Promise.resolve({ rate:null, error:err }); },
    intoolsListAudit(){ return Promise.resolve({ items:[], error:err }); }
  };
  return;
}

const REDIRECT_LOGIN = location.origin + '/pages/login.html';
const REDIRECT_RESET = location.origin + '/pages/reset-password.html';

/* functions-js keeps non-2xx response bodies on error.context instead of data.
   Recover the function's structured reason so the upload UI can distinguish
   authentication, file-size, catalog, and model failures. */
async function edgeResult(data, error){
  if(!error) return { data:data||null, error:null };
  const response=error.context;
  if(response && typeof response.clone==='function'){
    try{
      const payload=await response.clone().json();
      if(payload && typeof payload==='object') return { data:payload, error };
    }catch(_){}
  }
  return { data:data||null, error };
}

/* Public product contract. Product writes pass through this narrow mapper so
   callers cannot accidentally introduce ad-hoc field names or revive the
   legacy free-form `spec` blob. Database enum/check constraints remain the
   source of truth for allowed category, unit, price mode and status values. */
const PRODUCT_INPUT_FIELDS = [
  'sku','name','category','unit_type','pricing_mode','price','moq','factory_id',
  'loc','comp','description','subcategory','construction','applications','season',
  'color_family','origin_country','lead_time','handling_notes','gsm','fabric_width',
  'roll_length','style_code','listing_status','is_private','img','images','badge'
];
const PRODUCT_TEXT_FIELDS = new Set(PRODUCT_INPUT_FIELDS.filter(key=>
  !['price','moq','factory_id','is_private'].includes(key)
));
const PRODUCT_APPLICATIONS = new Set([
  'Blouson','T-shirt','Shirt','Blouse','Jacket','Coat','Pants','Shorts','Skirt',
  'Dress','Suit','Knitwear','Activewear','Underwear','Socks','Bag','Footwear',
  'Multiple apparel types'
]);
function productInput(input, { create=false }={}){
  const source=input||{}, payload={};
  PRODUCT_INPUT_FIELDS.forEach(key=>{
    if(source[key] === undefined) return;
    if(PRODUCT_TEXT_FIELDS.has(key)) payload[key]=typeof source[key]==='string' ? source[key].trim() : source[key];
    else if(key==='price') payload[key]=Number(source[key]) || 0;
    else if(key==='moq') payload[key]=source[key]===null || source[key]==='' ? null : Number(source[key]);
    else payload[key]=source[key];
  });
  if(create && (!payload.sku || !payload.name || !payload.factory_id)){
    throw new Error('sku, name, and factory_id are required');
  }
  if(payload.applications && !PRODUCT_APPLICATIONS.has(payload.applications)){
    throw new Error('applications must be a supported clothing type');
  }
  return payload;
}

const UNIT_LABEL = { pc:'pcs', m:'m', kg:'kg', package:'package', style:'style', order:'order', color:'color' };
const TYPE_LABEL = { fabric_mill:'Fabric Mill', garment_manufacturer:'Garment Manufacturer', trim_supplier:'Trim Supplier', accessories_supplier:'Accessories Supplier', yarn_supplier:'Yarn Supplier', textile_trading_company:'Textile Trading Company', material_innovator:'Material Innovator' };
const BUNDLED_PUBLIC_FACTORY_MAP={...(window.ARCANA_FACTORY_MAP||{})};
function catalogLocale(){const value=String(window.ARCANA_LANG||document.documentElement.lang||'en').toLowerCase();return value.startsWith('ja')?'ja':value.startsWith('zh')?'zh':'en';}
function localizedCopy(copy,field,fallback){const locale=catalogLocale();return copy?.[locale]?.[field]||copy?.en?.[field]||fallback||'';}
const LOCAL_CATALOG_PREVIEW=['localhost','127.0.0.1','::1'].includes(window.location.hostname);
async function localCatalogRequest(route){const response=await fetch(`/__local_catalog${route}`,{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`Local catalogue preview failed (${response.status})`);return response.json();}
function mapPublicProduct(p){
  const supplier=p.supplier||{},media=Array.isArray(p.media)?p.media:[],images=media.length?media.map(item=>item.public_url):p.images||[];
  return {
    id:p.sku,databaseId:p.id,name:localizedCopy(p.copy_i18n,'name',p.name),description:localizedCopy(p.copy_i18n,'description',p.description),copyI18n:p.copy_i18n||{},
    img:media[0]?.thumb_url||media[0]?.public_url||images[0]||p.img,images,media,faqs:p.faqs||[],
    comp:p.comp,spec:p.spec||p.specification,subcategory:p.subcategory,construction:p.construction,constructionSlug:p.construction_slug,applications:p.applications,season:p.season,color_family:p.color_family,
    origin_country:p.origin_country,lead_time:p.lead_time,handling_notes:p.handling_notes,gsm:p.gsm,fabric_width:p.fabric_width,roll_length:p.roll_length,style_code:p.style_code,
    price:Number(p.price),unit:p.unit_type,moq:p.moq!=null?`${+p.moq} ${UNIT_LABEL[p.unit_type]||p.unit_type}`:'',seller:p.supplier_name||supplier.name||'',
    factoryId:p.factory_id||supplier.id||null,factorySlug:p.supplier_slug||supplier.slug||null,supplierVerified:p.supplier_verified??supplier.verify_state==='verified',loc:p.supplier_city||supplier.loc||p.loc,country:p.supplier_region||supplier.region||'',badge:p.badge||'',cat:p.category,
    pricingMode:p.pricing_mode,catalogPrices:p.catalog_prices||{},isPrivate:p.is_private===true,options:(window.ATELIX_normalizeProductOptions||((rows)=>rows||[]))(p.product_variants||[])
  };
}
function mapPublicFactory(f){return {id:f.slug,databaseId:f.id,name:localizedCopy(f.copy_i18n,'name',f.name),type:TYPE_LABEL[f.type]||f.type,region:f.region,loc:f.loc,verified:f.verify_state==='verified',years:f.years,moq:f.moq,lead:f.lead,orders:f.orders_label,capacity:f.capacity,certs:f.certs||[],tags:f.tags||[],img:f.img,logo_img:f.logo_img,page_img:f.page_img,sales:f.sales,phone:f.phone,web:f.web,founded:f.founded,employees:f.employees,area:f.area,port:f.port,bio:localizedCopy(f.copy_i18n,'description',f.bio),copyI18n:f.copy_i18n||{},productCount:Number(f.product_count||0),taxonomy:(f.supplier_taxonomy_memberships||[]).map(item=>({l2:item.l2,l3:item.l3,isPrimary:item.is_primary===true}))};}
async function webpVariant(bitmap,maxDimension,quality){
  const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{alpha:true});context.drawImage(bitmap,0,0,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
  if(!blob||blob.type!=='image/webp')throw new Error('This browser could not create the required WebP image.');
  return {blob,width,height};
}
async function sha256Blob(blob){const bytes=await blob.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');}

/* ---- Shared cart helpers (used by placeOrder + the cart-sync methods) ---- */
async function ensureCart(uid){
  const { data: cart, error } = await sb.from('carts').select('id').eq('profile_id', uid).maybeSingle();
  if(error) return { error };
  if(cart) return { cart };
  const ins = await sb.from('carts').insert({ profile_id: uid }).select('id').single();
  if(ins.error) return { error: ins.error };
  return { cart: ins.data };
}

/* Resolve a list of SKUs to {sku: product_id}. Unknown SKUs are simply absent
   from the map, so callers can drop them. */
async function skuIdMap(skus){
  const { data: prods, error } = skus.length
    ? await sb.from('products').select('id,sku').in('sku', skus)
    : { data: [], error: null };
  if(error) return { error };
  return { map: Object.fromEntries((prods||[]).map(p=>[p.sku, p.id])) };
}

/* Replace a cart's contents with items:[{id:sku,qty,options,key,note}]. Unknown SKUs are dropped;
   returns { matched } = how many rows actually got written, so callers can tell
   "cart cleared" apart from "every SKU was invalid". */
async function writeCartRows(cartId, items){
  const { map: idBySku, error: me } = await skuIdMap((items||[]).map(i=>i.id));
  if(me) return { error: me };
  const rows = (items||[]).filter(i=>idBySku[i.id] && i.qty>0)
    .map(i=>({ cart_id: cartId, product_id: idBySku[i.id], qty: i.qty, line_key:i.key||i.id, option_selection:i.options||{}, buyer_note:typeof i.note==='string'?(i.note.trim()||null):null }));
  const del = await sb.from('cart_items').delete().eq('cart_id', cartId);
  if(del.error) return { error: del.error };
  if(rows.length){
    const ins = await sb.from('cart_items').insert(rows);
    if(ins.error) return { error: ins.error };
  }
  return { matched: rows.length };
}

/* Replace the signed-in user's wishlist with items:[{id:sku,qty}]. Same shape
   as writeCartRows but keyed straight off profile_id — a wishlist has no
   parent "cart" row. */
async function writeWishlistRows(profileId, items){
  const { map: idBySku, error: me } = await skuIdMap((items||[]).map(i=>i.id));
  if(me) return { error: me };
  const rows = (items||[]).filter(i=>idBySku[i.id] && i.qty>0)
    .map(i=>({ profile_id: profileId, product_id: idBySku[i.id], qty: i.qty }));
  const del = await sb.from('saved_items').delete().eq('profile_id', profileId);
  if(del.error) return { error: del.error };
  if(rows.length){
    const ins = await sb.from('saved_items').insert(rows);
    if(ins.error) return { error: ins.error };
  }
  return { matched: rows.length };
}

const API = {
  /* role: 'buyer' | 'seller'. factoryType (sellers only): 'fabric_mill' |
     'accessories_supplier' | 'trim_supplier' | 'yarn_supplier' |
     'garment_manufacturer'. Signup metadata is consumed by the
     handle_new_user trigger to create the profiles row, and — for sellers
     with a factoryType — a pending factories row (self-service onboarding). */
  async signUp({ email, password, role, companyName, country, fullName, factoryType }){
    try{
      return await sb.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: REDIRECT_LOGIN,
          data: { role, company_name: companyName, country, full_name: fullName, factory_type: factoryType }
        }
      });
    }catch(error){ return { data:null, error }; }
  },

  async signIn({ email, password }){
    try{
      return await sb.auth.signInWithPassword({ email, password });
    }catch(error){ return { data:null, error }; }
  },

  async signInWithMagicLink({ email, redirectTo }){
    try{
      return await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo || REDIRECT_LOGIN, shouldCreateUser: false }
      });
    }catch(error){ return { data:null, error }; }
  },

  async signOut(){
    try{
      return await sb.auth.signOut();
    }catch(error){ return { error }; }
  },

  async resetRequest(email){
    try{
      return await sb.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_RESET });
    }catch(error){ return { data:null, error }; }
  },

  async resetConfirm(newPassword){
    try{
      return await sb.auth.updateUser({ password: newPassword });
    }catch(error){ return { data:null, error }; }
  },

  /* Resolve the current signed-in profile as { id, email, role, name } or null.
     Tolerates a not-yet-created profile row (e.g. right after signup) by
     falling back to role 'buyer' and a name derived from the email. */
  async getSessionProfile(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return null;
      const user = session.user;
      const emailName = (user.email || '').split('@')[0] || user.email || 'Account';
      try{
        const { data:profile, error } = await sb
          .from('profiles')
          .select('role, full_name, company_name, avatar_url')
          .eq('id', user.id)
          .single();
        if(error || !profile){
          return { id:user.id, email:user.email, role:'buyer', name:emailName, avatarUrl:null };
        }
        return {
          id: user.id,
          email: user.email,
          role: profile.role || 'buyer',
          name: profile.company_name || profile.full_name || user.email || emailName,
          avatarUrl: profile.avatar_url || null
        };
      }catch(_){
        return { id:user.id, email:user.email, role:'buyer', name:emailName, avatarUrl:null };
      }
    }catch(_){ return null; }
  },

  onChange(cb){
    return sb.auth.onAuthStateChange((event, session)=>{ try{ cb(event, session); }catch(err){ console.error(err); } });
  },

  /* ---- Catalog reads (public, RLS: anyone can select) ----
     Returns products + factories mapped to the legacy js/data.js shape so all
     existing render code keeps working. Throws on error (caller falls back). */
  async fetchCatalogPage({category=null,construction=null,page=1,pageSize=24,locale=catalogLocale(),materials=[],country=null,regions=[],availability='all',minPrice=null,maxPrice=null,sort='recommended',supplierSlug=null}={}){
    if(LOCAL_CATALOG_PREVIEW&&(category==='fabrics'||supplierSlug)){
      const query=new URLSearchParams({category:category||'',page:String(page),page_size:String(pageSize),availability,sort});if(construction)query.set('construction',construction);if(supplierSlug)query.set('supplier',supplierSlug);
      (materials||[]).forEach(value=>query.append('material',value));if(country)query.set('country',country);(regions||[]).forEach(value=>query.append('region',value));
      if(minPrice!=null)query.set('min_price',String(minPrice));if(maxPrice!=null)query.set('max_price',String(maxPrice));
      const data=await localCatalogRequest(`/products?${query}`);return {...data,products:(data.products||[]).map(mapPublicProduct)};
    }
    const {data,error}=await sb.rpc('public_list_catalog_products',{p_category:category,p_construction_slug:construction,p_page:page,p_page_size:pageSize,p_locale:locale,p_materials:materials?.length?materials:null,p_country:country||null,p_regions:regions?.length?regions:null,p_availability:availability,p_min_price:minPrice,p_max_price:maxPrice,p_sort:sort,p_supplier_slug:supplierSlug});
    if(error) throw error;
    return {...(data||{}),products:(data?.products||[]).map(mapPublicProduct)};
  },
  async fetchCatalogFactories({locale=catalogLocale()}={}){
    if(LOCAL_CATALOG_PREVIEW){const data=await localCatalogRequest('/factories'),merged=new Map(Object.values(BUNDLED_PUBLIC_FACTORY_MAP).map(factory=>[factory.id,factory]));for(const factory of (data||[]).map(mapPublicFactory))merged.set(factory.id,factory);return [...merged.values()];}
    const {data,error}=await sb.rpc('public_list_catalog_factories',{p_locale:locale});
    if(error) throw error;
    return (data||[]).map(mapPublicFactory);
  },
  async getPublicProduct(sku,{locale=catalogLocale()}={}){
    if(LOCAL_CATALOG_PREVIEW&&/^FAB-[A-HJ-NP-Z2-9]{10}$/.test(String(sku||''))){const data=await localCatalogRequest(`/products/${encodeURIComponent(sku)}`);return mapPublicProduct(data);}
    const {data,error}=await sb.rpc('public_get_product',{p_sku:sku,p_locale:locale});
    if(error) throw error;
    return data?mapPublicProduct(data):null;
  },
  async getPublicFactory(slug,{locale=catalogLocale()}={}){
    if(LOCAL_CATALOG_PREVIEW){const data=await localCatalogRequest('/factories'),factory=(data||[]).find(item=>item.slug===slug);return factory?mapPublicFactory(factory):(BUNDLED_PUBLIC_FACTORY_MAP[slug]||null);}
    const factories=await this.fetchCatalogFactories({locale});return factories.find(factory=>factory.id===slug)||null;
  },
  async fetchCatalog(){
    if(LOCAL_CATALOG_PREVIEW){
      const [localFactories,remoteFactories]=await Promise.all([
        this.fetchCatalogFactories({locale:catalogLocale()}),
        sb.from('factories').select('*,supplier_taxonomy_memberships(l2,l3,is_primary)').eq('verify_state','verified'),
      ]);
      const factories=new Map(localFactories.map(factory=>[factory.id,factory]));
      if(!remoteFactories.error){
        for(const factory of (remoteFactories.data||[]).map(mapPublicFactory))factories.set(factory.id,factory);
      }
      return {
        products:window.ARCANA_PRODUCTS||[],
        factories:[...factories.values()],
      };
    }
    const [prodRes, facRes, usdRes, jpyRes, cnyRes] = await Promise.all([
      sb.from('products')
        .select('id,sku,name,description,copy_i18n,comp,subcategory,construction,construction_slug,applications,season,color_family,origin_country,lead_time,handling_notes,gsm,fabric_width,roll_length,style_code,price,pricing_mode,unit_type,moq,badge,img,images,loc,category,listing_status,product_variants(option_name,option_value,sort_order),factories(id,slug,name,region)')
        .eq('listing_status','active').eq('is_private',false),
      (async()=>{const result=await sb.rpc('public_list_catalog_factories',{p_locale:catalogLocale()});return result.error?sb.from('factories').select('*,supplier_taxonomy_memberships(l2,l3,is_primary)').eq('verify_state','verified'):result;})(),
      sb.rpc('catalog_public_prices',{p_currency:'USD'}),
      sb.rpc('catalog_public_prices',{p_currency:'JPY'}),
      sb.rpc('catalog_public_prices',{p_currency:'CNY'})
    ]);
    if(prodRes.error) throw prodRes.error;
    if(facRes.error)  throw facRes.error;
    for(const result of [usdRes,jpyRes,cnyRes]) if(result.error) throw result.error;
    const pricesByProduct={};
    for(const result of [usdRes,jpyRes,cnyRes]) for(const row of (result.data||[])){
      pricesByProduct[row.product_id] ||= {};
      pricesByProduct[row.product_id][row.currency]=Number(row.catalog_amount);
    }

    const factories = (facRes.data||[]).map(mapPublicFactory);
    const products = (prodRes.data||[]).map(p=>({
      id:p.sku,databaseId:p.id,name:localizedCopy(p.copy_i18n,'name',p.name),img:(p.images&&p.images[0])||p.img,images:p.images||[],description:localizedCopy(p.copy_i18n,'description',p.description),copyI18n:p.copy_i18n||{},comp:p.comp,subcategory:p.subcategory,construction:p.construction,constructionSlug:p.construction_slug,applications:p.applications,season:p.season,color_family:p.color_family,origin_country:p.origin_country,lead_time:p.lead_time,handling_notes:p.handling_notes,gsm:p.gsm,fabric_width:p.fabric_width,roll_length:p.roll_length,style_code:p.style_code,
      price: Number(p.price), unit: p.unit_type,
      moq: p.moq != null ? `${+p.moq} ${UNIT_LABEL[p.unit_type] || p.unit_type}` : '',
      seller: p.factories ? p.factories.name : '', factoryId:p.factories?.id||null, factorySlug:p.factories?.slug||null, loc: p.loc,
      country: p.factories ? p.factories.region : '',
      badge: p.badge || '', cat: p.category,
      pricingMode:p.pricing_mode, catalogPrices:pricesByProduct[p.id]||{},
      options:(window.ATELIX_normalizeProductOptions||((rows)=>rows||[]))(p.product_variants)
    }));
    return { products, factories };
  },

  /* ---- Checkout / orders ----
     placeOrder syncs the client cart into the DB cart, then calls the
     place_order RPC which recomputes every total server-side and returns the
     order_no. Requires a signed-in buyer. Item notes are written to each cart
     line and snapshotted onto the matching order item. */
  async placeOrder({ items, shipCountry, shipAddress, notes, qc, insurance }){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated', code:'not_authenticated' } };
      const uid = session.user.id;
      if(!(items||[]).length) return { error:{ message:'cart is empty' } };

      const ec = await ensureCart(uid);
      if(ec.error) return { error: ec.error };
      const wr = await writeCartRows(ec.cart.id, items);
      if(wr.error) return { error: wr.error };
      if(!wr.matched) return { error:{ message:'no valid items in cart' } };

      const { data, error } = await sb.rpc('place_order', {
        p_ship_country: shipCountry || null,
        p_ship_address: shipAddress || null,
        p_incoterms: null,
        p_notes: notes || null,
        p_qc: !!qc,
        p_insurance: !!insurance
      });
      if(error) return { error };
      return { orderNo: data };
    }catch(error){ return { error }; }
  },

  async declarePayment(orderNo){
    try{ return await sb.rpc('declare_payment', { p_order_no: orderNo }); }
    catch(error){ return { error }; }
  },

  /* Full order for the detail page: header + line snapshots + status events.
     RLS scopes it to the buyer (or fulfilling factory / admin). */
  async getOrder(orderNo){
    try{
      const { data: order, error } = await sb.from('orders').select('*').eq('order_no', orderNo).maybeSingle();
      if(error) return { error };
      if(!order) return { order: null };
      const [itemsRes, eventsRes] = await Promise.all([
        sb.from('order_items').select('*').eq('order_id', order.id),
        sb.from('order_status_events').select('*').eq('order_id', order.id).order('created_at', { ascending:true })
      ]);
      return { order, items: itemsRes.data || [], events: eventsRes.data || [] };
    }catch(error){ return { error }; }
  },

  /* Buyer's own order history, most recent first, with enough line-item detail
     to render a summary row without a second round trip per order. */
  async getMyOrders(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return [];
      const { data, error } = await sb.from('orders')
        .select('order_no, status, total, placed_at, order_items(sku_snapshot, name_snapshot, seller_snapshot, qty)')
        .eq('buyer_profile_id', session.user.id)
        .order('placed_at', { ascending:false });
      if(error) return [];
      return data || [];
    }catch(_){ return []; }
  },

  async getBankAccount(){
    try{
      const { data } = await sb.from('platform_bank_accounts').select('*').eq('is_active', true).maybeSingle();
      return data || null;
    }catch(_){ return null; }
  },

  /* ---- Cart (real-time DB sync for signed-in users) ---- */
  async getCart(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return [];
      const { data: cart } = await sb.from('carts').select('id').eq('profile_id', session.user.id).maybeSingle();
      if(!cart) return [];
      const { data: items, error } = await sb.from('cart_items').select('qty,line_key,option_selection,buyer_note,products(sku)').eq('cart_id', cart.id);
      if(error || !items) return [];
      return items.filter(i=>i.products).map(i=>({ id:i.products.sku,qty:Number(i.qty),key:i.line_key||i.products.sku,options:i.option_selection||{},note:i.buyer_note||null }));
    }catch(_){ return []; }
  },

  /* Upsert (or, at qty<=0, delete) one cart line for the signed-in user. */
  async syncCartItem(sku, qty, options={}, lineKey=sku){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const ec = await ensureCart(session.user.id);
      if(ec.error) return { error: ec.error };
      const { data: prod, error: pe } = await sb.from('products').select('id').eq('sku', sku).single();
      if(pe) return { error: pe };
      if(qty <= 0){
        const del = await sb.from('cart_items').delete().eq('cart_id', ec.cart.id).eq('line_key', lineKey);
        return { error: del.error || null };
      }
      const up = await sb.from('cart_items').upsert(
        { cart_id:ec.cart.id,product_id:prod.id,qty,line_key:lineKey,option_selection:options||{} },
        { onConflict:'cart_id,line_key' }
      );
      return { error: up.error || null };
    }catch(error){ return { error }; }
  },

  /* Bulk-replace the signed-in user's DB cart (used for the anon->login merge). */
  async replaceCart(items){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const ec = await ensureCart(session.user.id);
      if(ec.error) return { error: ec.error };
      return await writeCartRows(ec.cart.id, items);
    }catch(error){ return { error }; }
  },

  /* ---- Wishlist (real-time DB sync for signed-in users) ---- */
  async getWishlist(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return [];
      const { data, error } = await sb.from('saved_items').select('qty, created_at, products(sku)')
        .eq('profile_id', session.user.id).order('created_at', { ascending:true });
      if(error || !data) return [];
      return data.filter(i=>i.products).map(i=>({ id: i.products.sku, qty: Number(i.qty) }));
    }catch(_){ return []; }
  },

  /* Upsert (or, at qty<=0, delete) one wishlist line for the signed-in user. */
  async syncWishlistItem(sku, qty){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const { data: prod, error: pe } = await sb.from('products').select('id').eq('sku', sku).single();
      if(pe) return { error: pe };
      if(qty <= 0){
        const del = await sb.from('saved_items').delete().eq('profile_id', session.user.id).eq('product_id', prod.id);
        return { error: del.error || null };
      }
      const up = await sb.from('saved_items').upsert(
        { profile_id: session.user.id, product_id: prod.id, qty },
        { onConflict: 'profile_id,product_id' }
      );
      return { error: up.error || null };
    }catch(error){ return { error }; }
  },

  /* Bulk-replace the signed-in user's DB wishlist (used for the anon->login merge). */
  async replaceWishlist(items){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      return await writeWishlistRows(session.user.id, items);
    }catch(error){ return { error }; }
  },

  /* ---- Search history (account-level, keyword searches only) ---- */
  async getRecentSearches(limit=6){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return [];
      const { data, error } = await sb.from('search_history').select('query,last_searched_at')
        .eq('profile_id', session.user.id).order('last_searched_at',{ascending:false}).limit(Math.min(Math.max(Number(limit)||6,1),20));
      if(error || !data) return [];
      return data.map(row=>row.query).filter(Boolean);
    }catch(_){ return []; }
  },

  async recordRecentSearch(query){
    const normalized=String(query||'').trim().replace(/\s+/g,' ').toLowerCase();
    if(!normalized) return { error:null };
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const { error }=await sb.from('search_history').upsert(
        { profile_id:session.user.id, query:normalized, last_searched_at:new Date().toISOString() },
        { onConflict:'profile_id,query' }
      );
      return { error:error||null };
    }catch(error){ return { error }; }
  },

  /* Private Algolia search never uses a browser-wide key. The Edge function
     verifies the session and returns a five-minute, owner-filtered key. */
  async getAlgoliaSearchToken(scope){
    try { return await sb.functions.invoke('algolia-search-token', { body:{ scope } }); }
    catch(error){ return { data:null, error }; }
  },
  async searchPrivateAlgolia(scope, query){
    try{
      const token=await API.getAlgoliaSearchToken(scope);
      if(token.error || !token.data) return { hits:[], error:token.error||{message:'search unavailable'} };
      const { appId,indexName,apiKey }=token.data;
      const response=await fetch(`https://${appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`,{
        method:'POST', headers:{'X-Algolia-Application-Id':appId,'X-Algolia-API-Key':apiKey,'Content-Type':'application/json'},
        body:JSON.stringify({query:String(query||''),hitsPerPage:100,removeWordsIfNoResults:'none'})
      });
      if(!response.ok) throw new Error('search unavailable');
      return { hits:(await response.json()).hits||[], error:null };
    }catch(error){ return { hits:[], error }; }
  },

  /* ---- Profile (self-serve edit, avatar upload) ---- */
  async getMyProfile(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return null;
      const { data, error } = await sb.from('profiles')
        .select('id, role, full_name, company_name, country, handle, avatar_url, created_at')
        .eq('id', session.user.id).single();
      if(error || !data) return null;
      return { ...data, email: session.user.email };
    }catch(_){ return null; }
  },

  async updateProfile(patch){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const { error } = await sb.from('profiles').update(patch).eq('id', session.user.id);
      if(error && error.code === '23505') return { error:{ message:'That handle is already taken', code:'23505' } };
      return { error: error || null };
    }catch(error){ return { error }; }
  },

  async updateEmail(newEmail){
    try{ return await sb.auth.updateUser({ email: newEmail }); }
    catch(error){ return { data:null, error }; }
  },

  /* Uploads to the shared public 'uploads' bucket under <uid>/<folder>/<ts>-<name>,
     scoped writable by RLS to the signer's own uid folder regardless of destination. */
  async uploadImage(file, folder){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const path = `${session.user.id}/${folder}/${Date.now()}-${file.name}`;
      const { error } = await sb.storage.from('uploads').upload(path, file, { upsert:true });
      if(error) return { error };
      const { data } = sb.storage.from('uploads').getPublicUrl(path);
      return { url: data.publicUrl, path };
    }catch(error){ return { error }; }
  },
  async uploadCatalogProductImage(file,productId){
    try{
      if(!/^[0-9a-f-]{36}$/i.test(String(productId||'')))return {error:{message:'Save the product before adding catalogue media.'}};
      if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file?.type)||file.size>10*1024*1024)return {error:{message:'Choose a JPG, PNG, WebP, or AVIF image no larger than 10 MB.'}};
      const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}),full=await webpVariant(bitmap,1600,.80),thumb=await webpVariant(bitmap,640,.76);bitmap.close?.();
      const hash=await sha256Blob(full.blob),thumbHash=await sha256Blob(thumb.blob),base=`products/${productId}`,fullPath=`${base}/${hash}-1600.webp`,thumbPath=`${base}/${thumbHash}-640.webp`;
      const [fullUpload,thumbUpload]=await Promise.all([
        sb.storage.from('catalog-media').upload(fullPath,full.blob,{contentType:'image/webp',cacheControl:'31536000',upsert:false}),
        sb.storage.from('catalog-media').upload(thumbPath,thumb.blob,{contentType:'image/webp',cacheControl:'31536000',upsert:false})
      ]);
      for(const result of [fullUpload,thumbUpload])if(result.error&&result.error.statusCode!==409&&result.error.status!==409)return {error:result.error};
      const fullUrl=sb.storage.from('catalog-media').getPublicUrl(fullPath).data.publicUrl,thumbUrl=sb.storage.from('catalog-media').getPublicUrl(thumbPath).data.publicUrl;
      return {media:{role:'detail',public_url:fullUrl,thumb_url:thumbUrl,storage_path:fullPath,thumb_storage_path:thumbPath,width:full.width,height:full.height,bytes:full.blob.size,sha256:hash,thumb_bytes:thumb.blob.size,thumb_sha256:thumbHash,alt_i18n:{}},error:null};
    }catch(error){return {error};}
  },

  /* Design Match uploads are sent directly to the authenticated Edge Function.
     They are intentionally NOT put in the public uploads bucket: the function
     reads them in-memory and returns only Athelia's structured brief + catalog matches. */
  async analyzeDesign(files){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { data:null, error:{ message:'not authenticated', code:'unauthorized' } };
      const body=new FormData();
      (files||[]).forEach(file=>body.append('files',file));
      const { data, error }=await sb.functions.invoke('design-match',{body});
      return await edgeResult(data,error);
    }catch(error){ return { data:null, error }; }
  },

  async rematchDesign(brief){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { data:null, error:{ message:'not authenticated', code:'unauthorized' } };
      const { data, error }=await sb.functions.invoke('design-match',{body:{brief}});
      return await edgeResult(data,error);
    }catch(error){ return { data:null, error }; }
  },

  /* ---- Seller: factory + SKU CRUD (RLS scopes writes to the caller's factory) ---- */
  async getMyFactory(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return null;
      const { data, error } = await sb.from('factories').select('*').eq('owner_profile_id', session.user.id).maybeSingle();
      if(error) return null;
      if(!data)return null;
      const faqs=await sb.from('catalog_faqs').select('*').eq('factory_id',data.id).order('sort_order');
      return {...data,faqs:faqs.data||[]};
    }catch(_){ return null; }
  },

  /* Admin/public factory lookup by primary key. Admin pages use this to edit
     a supplier without impersonating the supplier account. */
  async getFactoryById(id){
    try{
      const { data, error } = await sb.from('factories').select('*').eq('id', id).maybeSingle();
      if(error) return null;
      return data || null;
    }catch(_){ return null; }
  },

  /* Resolve the public catalog slug to the database factory id used by the
     admin supplier workspace. */
  async getFactoryBySlug(slug){
    try{
      const { data, error } = await sb.from('factories').select('id').eq('slug', slug).maybeSingle();
      if(error) return null;
      return data || null;
    }catch(_){ return null; }
  },

  /* Legacy bundled catalog entries may use an internal key instead of the
     database slug. Match the public name as a safe fallback for admin links. */
  async getFactoryForAdminEntry(slug, name){
    const bySlug = await this.getFactoryBySlug(slug);
    if(bySlug) return bySlug;
    if(!name) return null;
    try{
      const { data, error } = await sb.from('factories').select('id').eq('name', name).limit(1).maybeSingle();
      if(error) return null;
      return data || null;
    }catch(_){ return null; }
  },

  async updateFactory(id, patch){
    try{ const { error } = await sb.from('factories').update(patch).eq('id', id); return { error: error||null }; }
    catch(error){ return { error }; }
  },

  async getMyProducts(factoryId){
    try{
      const { data, error } = await sb.from('products').select('*,product_variants(option_name,option_value,sort_order)').eq('factory_id', factoryId).order('created_at', { ascending:false });
      if(error) return { error };
      const products=data||[],ids=products.map(product=>product.id);
      const [mediaResult,faqResult]=ids.length?await Promise.all([sb.from('product_media').select('*').in('product_id',ids).order('position'),sb.from('catalog_faqs').select('*').in('product_id',ids).order('sort_order')]):[{data:[]},{data:[]}];
      if(mediaResult.error||faqResult.error)return {error:mediaResult.error||faqResult.error};
      return { products:products.map(product=>({...product,media:(mediaResult.data||[]).filter(media=>media.product_id===product.id),faqs:(faqResult.data||[]).filter(faq=>faq.product_id===product.id),variants:(window.ATELIX_normalizeProductOptions||((rows)=>rows||[]))(product.product_variants)})) };
    }catch(error){ return { error }; }
  },

  async getMyPrivateProducts(){
    try{
      const { data, error }=await sb.from('products').select('sku,name,comp,spec,price,pricing_mode,unit_type,moq,badge,img,images,loc,category,product_variants(option_name,option_value,sort_order),factories(name,region)').eq('listing_status','active').eq('is_private',true);
      if(error) return { products:[], error };
      const units={pc:'pcs',m:'m',kg:'kg',package:'package',style:'style',order:'order',color:'color'};
      return { products:(data||[]).map(p=>({id:p.sku,name:p.name,img:(p.images&&p.images[0])||p.img,images:p.images||[],comp:p.comp,spec:p.spec,price:Number(p.price),unit:p.unit_type,moq:p.moq!=null?`${+p.moq} ${units[p.unit_type]||p.unit_type}`:'',seller:p.factories?.name||'Atelix Sourcing',loc:p.loc,country:p.factories?.region||'',badge:p.badge||'',cat:p.category,isPrivate:true,options:(window.ATELIX_normalizeProductOptions||((rows)=>rows||[]))(p.product_variants)})), error:null };
    }catch(error){ return { products:[], error }; }
  },

  async adminSetPrivateProductAssignments(productId, emails){
    try{const { error }=await sb.rpc('admin_set_private_product_assignments',{target_product:productId,brand_emails:emails});return {error:error||null};}
    catch(error){return {error};}
  },

  async createProduct(payload){
    try{ const { data, error } = await sb.from('products').insert(productInput(payload,{create:true})).select().single(); return { product:data, error: error||null }; }
    catch(error){ return { error }; }
  },

  async updateProduct(id, patch){
    try{ const { error } = await sb.from('products').update(productInput(patch)).eq('id', id); return { error: error||null }; }
    catch(error){ return { error }; }
  },

  async archiveProduct(id){
    try{ const { error } = await sb.from('products').update({ listing_status:'archived' }).eq('id', id); return { error: error||null }; }
    catch(error){ return { error }; }
  },

  async getPriceBreaks(productId){
    try{
      const { data, error } = await sb.from('price_breaks').select('min_qty,unit_price').eq('product_id', productId).order('min_qty');
      if(error) return [];
      return (data||[]).map(b=>({ minQty:Number(b.min_qty), unitPrice:Number(b.unit_price) }));
    }catch(_){ return []; }
  },

  async setPriceBreaks(productId, breaks){
    try{
      const del = await sb.from('price_breaks').delete().eq('product_id', productId);
      if(del.error) return { error: del.error };
      const rows = (breaks||[]).filter(b=>b.minQty>0 && b.unitPrice>=0)
        .map(b=>({ product_id: productId, min_qty: b.minQty, unit_price: b.unitPrice }));
      if(!rows.length) return {};
      const ins = await sb.from('price_breaks').insert(rows);
      return { error: ins.error || null };
    }catch(error){ return { error }; }
  },

  async setProductOptions(productId, options){
    try{const {data,error}=await sb.rpc('supplier_set_product_options',{p_product_id:productId,p_options:options||[]});return {options:data||[],error:error||null};}
    catch(error){return {options:[],error};}
  },

  /* ---- Destination shipping (configured by administrators, priced server-side) ---- */
  async getShippingRates(){
    try{const {data,error}=await sb.rpc('public_list_shipping_rates');return error?[]:(data||[]);}
    catch(_){return [];}
  },

  async getShippingQuote(country){
    try{
      const {data,error}=await sb.rpc('public_shipping_quote',{p_country:country});
      if(error)return {quote:null,error};
      return {quote:Array.isArray(data)?data[0]||null:data||null,error:null};
    }catch(error){return {quote:null,error};}
  },

  /* ---- Address book (simple, no map/geocoding lookup) ---- */
  async getAddresses(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return [];
      const { data, error } = await sb.from('addresses').select('*')
        .eq('profile_id', session.user.id)
        .order('is_default', { ascending:false })
        .order('created_at', { ascending:false });
      if(error) return [];
      return data || [];
    }catch(_){ return []; }
  },

  async createAddress(payload){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const { data, error } = await sb.from('addresses')
        .insert({ ...payload, profile_id: session.user.id }).select().single();
      return { address: data, error: error || null };
    }catch(error){ return { error }; }
  },

  async updateAddress(id, patch){
    try{ const { error } = await sb.from('addresses').update(patch).eq('id', id); return { error: error||null }; }
    catch(error){ return { error }; }
  },

  async deleteAddress(id){
    try{ const { error } = await sb.from('addresses').delete().eq('id', id); return { error: error||null }; }
    catch(error){ return { error }; }
  },

  async setDefaultAddress(id){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      await sb.from('addresses').update({ is_default:false }).eq('profile_id', session.user.id);
      const { error } = await sb.from('addresses').update({ is_default:true }).eq('id', id);
      return { error: error || null };
    }catch(error){ return { error }; }
  },

  /* ---- Admin: platform-wide order management ---- */
  async adminListOrders(){
    try{ const { data, error } = await sb.rpc('admin_list_orders'); if(error) return []; return data || []; }
    catch(_){ return []; }
  },

  /* Updates status (incl. 'cancelled') + logs an order_status_events row via RPC,
     then fires the order-status-email Edge Function (best-effort — a failed email
     doesn't roll back the status change, which already succeeded server-side). */
  async adminUpdateOrderStatus(orderNo, status, note){
    try{
      const { data, error } = await sb.rpc('admin_update_order_status', {
        p_order_no: orderNo, p_status: status, p_note: note || null
      });
      if(error) return { error };
      const row = Array.isArray(data) ? data[0] : data;
      try{
        const { data:{ session } } = await sb.auth.getSession();
        await sb.functions.invoke('order-status-email', {
          body: { orderNo: row.order_no, status: row.status, buyerEmail: row.buyer_email, buyerName: row.buyer_name, total: row.total, note },
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
      }catch(_){ /* email is best-effort; status change already committed */ }
      return { order: row };
    }catch(error){ return { error }; }
  },

  async adminListUsers(){
    try{ const { data, error } = await sb.rpc('admin_list_users'); if(error) return []; return data || []; }
    catch(_){ return []; }
  },

  /* Verification changes are intentionally RPC-only so the database writes
     the audit row in the same transaction as the factory update. */
  async adminSetFactoryVerification(factoryId, verifyState){
    try{
      const { data, error } = await sb.rpc('admin_set_factory_verification', {
        p_factory_id: factoryId,
        p_verify_state: verifyState
      });
      if(error) return { error };
      return { factory: Array.isArray(data) ? data[0] : data };
    }catch(error){ return { error }; }
  },

  async adminListAudit(targetId){
    try{
      const { data, error } = await sb.rpc('admin_list_audit', { p_target_id: targetId });
      if(error) return [];
      return data || [];
    }catch(_){ return []; }
  },

  /* ---- Intools: all private methods are backed by confirmed-admin RPCs. ---- */
  async getPublishedContentPage(route, locale='en'){
    try{
      const { data, error }=await sb.rpc('public_get_content_page',{p_route:route,p_locale:locale});
      return { page:data||null, error:error||null };
    }catch(error){ return { page:null, error }; }
  },

  async intoolsListPages(){
    try{const {data,error}=await sb.rpc('intools_list_pages');return {items:data||[],error:error||null};}
    catch(error){return {items:[],error};}
  },
  async intoolsLoadPage(route){
    try{const {data,error}=await sb.rpc('intools_load_page',{p_route:route});return {page:data||null,revisions:data?.revisions||[],error:error||null};}
    catch(error){return {page:null,revisions:[],error};}
  },
  async intoolsSavePage({route,title,template='standard',document,expectedRevision=0}){
    try{const {data,error}=await sb.rpc('intools_save_page',{p_route:route,p_title:title,p_template:template,p_document:document,p_expected_revision:expectedRevision});return {page:data||null,error:error||null};}
    catch(error){return {page:null,error};}
  },
  async intoolsPublishPage(pageId,expectedRevision){
    try{const {data,error}=await sb.rpc('intools_publish_page',{p_page_id:pageId,p_expected_revision:expectedRevision});return {page:data||null,error:error||null};}
    catch(error){return {page:null,error};}
  },
  async intoolsRollbackPage(pageId,revisionNo,expectedRevision){
    try{const {data,error}=await sb.rpc('intools_rollback_page',{p_page_id:pageId,p_revision_no:revisionNo,p_expected_revision:expectedRevision});return {page:data||null,error:error||null};}
    catch(error){return {page:null,error};}
  },
  async intoolsArchivePage(pageId,expectedRevision,restore=false){
    try{const {data,error}=await sb.rpc('intools_archive_page',{p_page_id:pageId,p_expected_revision:expectedRevision,p_restore:restore});return {page:data||null,error:error||null};}
    catch(error){return {page:null,error};}
  },

  async intoolsListWidgets(){
    try{const {data,error}=await sb.rpc('intools_list_widgets');return {items:data||[],error:error||null};}
    catch(error){return {items:[],error};}
  },
  async intoolsLoadWidget(key){
    try{const {data,error}=await sb.rpc('intools_load_widget',{p_key:key});return {widget:data||null,revisions:data?.revisions||[],error:error||null};}
    catch(error){return {widget:null,revisions:[],error};}
  },
  async intoolsSaveWidget({key,type,zone,document,expectedRevision=0}){
    try{const {data,error}=await sb.rpc('intools_save_widget',{p_key:key,p_type:type,p_zone:zone,p_document:document,p_expected_revision:expectedRevision});return {widget:data||null,error:error||null};}
    catch(error){return {widget:null,error};}
  },
  async intoolsPublishWidget(widgetId,expectedRevision){
    try{const {data,error}=await sb.rpc('intools_publish_widget',{p_widget_id:widgetId,p_expected_revision:expectedRevision});return {widget:data||null,error:error||null};}
    catch(error){return {widget:null,error};}
  },
  async intoolsRollbackWidget(widgetId,revisionNo,expectedRevision){
    try{const {data,error}=await sb.rpc('intools_rollback_widget',{p_widget_id:widgetId,p_revision_no:revisionNo,p_expected_revision:expectedRevision});return {widget:data||null,error:error||null};}
    catch(error){return {widget:null,error};}
  },
  async intoolsArchiveWidget(widgetId,expectedRevision,restore=false){
    try{const {data,error}=await sb.rpc('intools_archive_widget',{p_widget_id:widgetId,p_expected_revision:expectedRevision,p_restore:restore});return {widget:data||null,error:error||null};}
    catch(error){return {widget:null,error};}
  },

  async intoolsListMedia(){
    try{const {data,error}=await sb.rpc('intools_list_media');return {items:data||[],error:error||null};}
    catch(error){return {items:[],error};}
  },
  async intoolsSaveMedia({id=null,name,path,publicUrl,mimeType,bytes,width=null,height=null,altText={},expectedUpdatedAt=null}){
    try{const {data,error}=await sb.rpc('intools_save_media',{p_id:id,p_name:name,p_path:path,p_public_url:publicUrl,p_mime_type:mimeType,p_bytes:bytes,p_width:width,p_height:height,p_alt_text:altText,p_expected_updated_at:expectedUpdatedAt});return {asset:data||null,error:error||null};}
    catch(error){return {asset:null,error};}
  },
  async intoolsArchiveMedia(id,expectedUpdatedAt,restore=false){
    try{const {data,error}=await sb.rpc('intools_archive_media',{p_id:id,p_expected_updated_at:expectedUpdatedAt,p_restore:restore});return {asset:data||null,error:error||null};}
    catch(error){return {asset:null,error};}
  },

  async intoolsListProducts(){
    try{
      const {data,error}=await sb.rpc('intools_list_products');if(error)return {items:[],error};
      const items=data||[],ids=items.map(item=>item.id);
      if(!ids.length)return {items,error:null};
      const [mediaResult,faqResult]=await Promise.all([sb.from('product_media').select('*').in('product_id',ids).order('position'),sb.from('catalog_faqs').select('*').in('product_id',ids).order('sort_order')]);
      if(mediaResult.error||faqResult.error)return {items,error:mediaResult.error||faqResult.error};
      return {items:items.map(item=>({...item,media:(mediaResult.data||[]).filter(media=>media.product_id===item.id),faqs:(faqResult.data||[]).filter(faq=>faq.product_id===item.id)})),error:null};
    }
    catch(error){return {items:[],error};}
  },
  async intoolsSaveProduct({id=null,payload,expectedUpdatedAt=null}){
    try{const {data,error}=await sb.rpc('intools_save_product_with_images',{p_product_id:id,p_payload:payload,p_expected_updated_at:expectedUpdatedAt});return {product:data||null,error:error||null};}
    catch(error){return {product:null,error};}
  },
  async intoolsArchiveProduct(id,expectedUpdatedAt,restore=false){
    try{const {data,error}=await sb.rpc('intools_archive_product',{p_product_id:id,p_expected_updated_at:expectedUpdatedAt,p_restore:restore});return {product:data||null,error:error||null};}
    catch(error){return {product:null,error};}
  },
  async saveProductCatalogContent({productId,copyI18n,constructionSlug,media=[],faqs=[]}){
    try{const {data,error}=await sb.rpc('catalog_save_product_content',{p_product_id:productId,p_copy_i18n:copyI18n,p_construction_slug:constructionSlug,p_media:media,p_faqs:faqs});return {product:data||null,error:error||null};}
    catch(error){return {product:null,error};}
  },

  async intoolsListSuppliers(){
    try{
      const {data,error}=await sb.rpc('intools_list_suppliers');if(error)return {items:[],error};
      const items=data||[],ids=items.map(item=>item.id);if(!ids.length)return {items,error:null};
      const faqs=await sb.from('catalog_faqs').select('*').in('factory_id',ids).order('sort_order');
      if(faqs.error)return {items,error:faqs.error};
      return {items:items.map(item=>({...item,faqs:(faqs.data||[]).filter(faq=>faq.factory_id===item.id)})),error:null};
    }
    catch(error){return {items:[],error};}
  },
  async intoolsSaveSupplier({id=null,payload,expectedUpdatedAt=null}){
    try{const {data,error}=await sb.rpc('intools_save_supplier_with_images',{p_supplier_id:id,p_payload:payload,p_expected_updated_at:expectedUpdatedAt});return {supplier:data||null,error:error||null};}
    catch(error){return {supplier:null,error};}
  },
  async intoolsArchiveSupplier(id,expectedUpdatedAt,restore=false){
    try{const {data,error}=await sb.rpc('intools_archive_supplier',{p_supplier_id:id,p_expected_updated_at:expectedUpdatedAt,p_restore:restore});return {supplier:data||null,error:error||null};}
    catch(error){return {supplier:null,error};}
  },
  async saveSupplierFaqs({factoryId,faqs=[]}){
    try{const {data,error}=await sb.rpc('catalog_save_supplier_faqs',{p_factory_id:factoryId,p_faqs:faqs});return {faqs:data||[],error:error||null};}
    catch(error){return {faqs:[],error};}
  },
  async saveSupplierCatalogContent({factoryId,copyI18n,faqs=[]}){
    try{const {data,error}=await sb.rpc('catalog_save_supplier_content',{p_factory_id:factoryId,p_copy_i18n:copyI18n,p_faqs:faqs});return {supplier:data||null,error:error||null};}
    catch(error){return {supplier:null,error};}
  },
  async intoolsListShippingRates(){
    try{const {data,error}=await sb.rpc('intools_list_shipping_rates');return {items:data||[],error:error||null};}
    catch(error){return {items:[],error};}
  },
  async intoolsSaveShippingRate({id=null,payload,expectedUpdatedAt=null}){
    try{const {data,error}=await sb.rpc('intools_save_shipping_rate',{p_rate_id:id,p_payload:payload,p_expected_updated_at:expectedUpdatedAt});return {rate:data||null,error:error||null};}
    catch(error){return {rate:null,error};}
  },
  async intoolsArchiveShippingRate(id,expectedUpdatedAt,restore=false){
    try{const {data,error}=await sb.rpc('intools_archive_shipping_rate',{p_rate_id:id,p_expected_updated_at:expectedUpdatedAt,p_restore:restore});return {rate:data||null,error:error||null};}
    catch(error){return {rate:null,error};}
  },
  async intoolsListAudit({targetType=null,targetId=null,limit=100}={}){
    try{const {data,error}=await sb.rpc('intools_list_audit',{p_target_type:targetType,p_target_id:targetId,p_limit:limit});return {items:data||[],error:error||null};}
    catch(error){return {items:[],error};}
  }
};

window.ARCANA_API = API;
})();
