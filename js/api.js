/* ARCANA async data seam — thin wrapper over window.supabaseClient.
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
    signOut(){ return Promise.resolve({ error: null }); },
    resetRequest(){ return Promise.resolve({ data:null, error: err }); },
    resetConfirm(){ return Promise.resolve({ data:null, error: err }); },
    getSessionProfile(){ return Promise.resolve(null); },
    onChange(){ return { data:{ subscription:{ unsubscribe(){} } } }; },
    fetchCatalog(){ return Promise.reject(err); },
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
    getMyProfile(){ return Promise.resolve(null); },
    updateProfile(){ return Promise.resolve({ error: err }); },
    updateEmail(){ return Promise.resolve({ error: err }); },
    uploadImage(){ return Promise.resolve({ error: err }); },
    getMyFactory(){ return Promise.resolve(null); },
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
    getMyConversations(){ return Promise.resolve([]); },
    getOrCreateConversation(){ return Promise.resolve({ error: err }); },
    getMessages(){ return Promise.resolve([]); },
    sendMessage(){ return Promise.resolve({ error: err }); },
    adminListOrders(){ return Promise.resolve([]); },
    adminUpdateOrderStatus(){ return Promise.resolve({ error: err }); },
    adminListUsers(){ return Promise.resolve([]); }
  };
  return;
}

const REDIRECT_LOGIN = location.origin + '/pages/login.html';
const REDIRECT_RESET = location.origin + '/pages/reset-password.html';

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

/* Replace a cart's contents with items:[{id:sku,qty}]. Unknown SKUs are dropped;
   returns { matched } = how many rows actually got written, so callers can tell
   "cart cleared" apart from "every SKU was invalid". */
async function writeCartRows(cartId, items){
  const { map: idBySku, error: me } = await skuIdMap((items||[]).map(i=>i.id));
  if(me) return { error: me };
  const rows = (items||[]).filter(i=>idBySku[i.id] && i.qty>0)
    .map(i=>({ cart_id: cartId, product_id: idBySku[i.id], qty: i.qty }));
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
  async fetchCatalog(){
    const UNIT_LABEL = { pc:'pcs', m:'m', kg:'kg', package:'package', style:'style', order:'order', color:'color' };
    const TYPE_LABEL = { fabric_mill:'Fabric Mill', garment_manufacturer:'Garment Manufacturer', trim_supplier:'Trim Supplier', accessories_supplier:'Accessories Supplier', yarn_supplier:'Yarn Supplier' };
    const [prodRes, facRes] = await Promise.all([
      sb.from('products')
        .select('sku,name,comp,spec,price,pricing_mode,unit_type,moq,badge,img,loc,category,listing_status,factories(name)')
        .eq('listing_status','active'),
      sb.from('factories').select('*').eq('verify_state','verified')
    ]);
    if(prodRes.error) throw prodRes.error;
    if(facRes.error)  throw facRes.error;

    const factories = (facRes.data||[]).map(f=>({
      id: f.slug, name: f.name, type: TYPE_LABEL[f.type] || f.type,
      region: f.region, loc: f.loc, verified: f.verify_state === 'verified',
      years: f.years, moq: f.moq, lead: f.lead,
      rating: f.rating != null ? Number(f.rating) : 0,
      orders: f.orders_label, capacity: f.capacity,
      certs: f.certs || [], tags: f.tags || [], img: f.img,
      sales: f.sales, phone: f.phone, web: f.web, founded: f.founded,
      employees: f.employees, area: f.area, port: f.port, bio: f.bio
    }));
    const products = (prodRes.data||[]).map(p=>({
      id: p.sku, name: p.name, img: p.img, comp: p.comp, spec: p.spec,
      price: Number(p.price), unit: p.unit_type,
      moq: p.moq != null ? `${+p.moq} ${UNIT_LABEL[p.unit_type] || p.unit_type}` : '',
      seller: p.factories ? p.factories.name : '', loc: p.loc,
      badge: p.badge || '', cat: p.category
    }));
    return { products, factories };
  },

  /* ---- Checkout / orders ----
     placeOrder syncs the client cart into the DB cart, then calls the
     place_order RPC which recomputes every total server-side and returns the
     order_no. Requires a signed-in buyer. items: [{ id:sku, qty }]. */
  async placeOrder({ items, shipCountry, shipAddress, incoterms, notes, qc, insurance }){
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
        p_incoterms: incoterms || null,
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
      const { data: items, error } = await sb.from('cart_items').select('qty, products(sku)').eq('cart_id', cart.id);
      if(error || !items) return [];
      return items.filter(i=>i.products).map(i=>({ id: i.products.sku, qty: Number(i.qty) }));
    }catch(_){ return []; }
  },

  /* Upsert (or, at qty<=0, delete) one cart line for the signed-in user. */
  async syncCartItem(sku, qty){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const ec = await ensureCart(session.user.id);
      if(ec.error) return { error: ec.error };
      const { data: prod, error: pe } = await sb.from('products').select('id').eq('sku', sku).single();
      if(pe) return { error: pe };
      if(qty <= 0){
        const del = await sb.from('cart_items').delete().eq('cart_id', ec.cart.id).eq('product_id', prod.id);
        return { error: del.error || null };
      }
      const up = await sb.from('cart_items').upsert(
        { cart_id: ec.cart.id, product_id: prod.id, qty },
        { onConflict: 'cart_id,product_id' }
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
      return { url: data.publicUrl };
    }catch(error){ return { error }; }
  },

  /* ---- Seller: factory + SKU CRUD (RLS scopes writes to the caller's factory) ---- */
  async getMyFactory(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return null;
      const { data, error } = await sb.from('factories').select('*').eq('owner_profile_id', session.user.id).maybeSingle();
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
      const { data, error } = await sb.from('products').select('*').eq('factory_id', factoryId).order('created_at', { ascending:false });
      if(error) return { error };
      return { products: data || [] };
    }catch(error){ return { error }; }
  },

  async createProduct(payload){
    try{ const { data, error } = await sb.from('products').insert(payload).select().single(); return { product:data, error: error||null }; }
    catch(error){ return { error }; }
  },

  async updateProduct(id, patch){
    try{ const { error } = await sb.from('products').update(patch).eq('id', id); return { error: error||null }; }
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

  /* ---- Chat (buyer<->seller, one thread per buyer+factory pair) ---- */
  async getMyConversations(){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return [];
      const uid = session.user.id;
      const { data, error } = await sb.from('conversations')
        .select('id, created_at, buyer_profile_id, factories(name, img), profiles(full_name, company_name)')
        .order('created_at', { ascending:false });
      if(error) return [];
      return (data||[]).map(c=>({
        id: c.id,
        withName: c.buyer_profile_id===uid
          ? (c.factories ? c.factories.name : 'Supplier')
          : (c.profiles ? (c.profiles.company_name || c.profiles.full_name || 'Buyer') : 'Buyer'),
        img: c.factories ? c.factories.img : null,
        createdAt: c.created_at
      }));
    }catch(_){ return []; }
  },

  /* factorySlug is the legacy window.ARCANA_FACTORY_MAP key (factories.slug),
     not the DB uuid — resolved here so callers never need the real id. */
  async getOrCreateConversation(factorySlug){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const uid = session.user.id;
      const { data: factory, error: fe } = await sb.from('factories').select('id').eq('slug', factorySlug).single();
      if(fe) return { error: fe };
      const { data: existing } = await sb.from('conversations').select('id')
        .eq('buyer_profile_id', uid).eq('factory_id', factory.id).maybeSingle();
      if(existing) return { id: existing.id };
      const { data, error } = await sb.from('conversations')
        .insert({ buyer_profile_id: uid, factory_id: factory.id }).select('id').single();
      if(error) return { error };
      return { id: data.id };
    }catch(error){ return { error }; }
  },

  async getMessages(conversationId){
    try{
      const { data, error } = await sb.from('messages').select('*')
        .eq('conversation_id', conversationId).order('created_at', { ascending:true });
      if(error) return [];
      return data || [];
    }catch(_){ return []; }
  },

  /* Inserts the message, then fires a best-effort "you have a new message"
     email to the other participant (not a reply-by-email bridge — replies
     still happen in-app; see chat-notify-email). A failed notify never blocks
     the send, which already succeeded. */
  async sendMessage(conversationId, body){
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session || !session.user) return { error:{ message:'not authenticated' } };
      const { data, error } = await sb.from('messages')
        .insert({ conversation_id: conversationId, sender_profile_id: session.user.id, body }).select().single();
      if(!error){
        try{
          await sb.functions.invoke('chat-notify-email', {
            body: { conversationId, preview: body },
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
        }catch(_){ /* best-effort */ }
      }
      return { message: data, error: error || null };
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
  }
};

window.ARCANA_API = API;
})();
