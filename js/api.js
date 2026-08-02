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
    getBankAccount(){ return Promise.resolve(null); }
  };
  return;
}

const REDIRECT_LOGIN = location.origin + '/pages/login.html';
const REDIRECT_RESET = location.origin + '/pages/reset-password.html';

const API = {
  /* role: 'buyer' | 'seller'. Signup metadata is consumed by the
     handle_new_user trigger to create the profiles row. */
  async signUp({ email, password, role, companyName, country, fullName }){
    try{
      return await sb.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: REDIRECT_LOGIN,
          data: { role, company_name: companyName, country, full_name: fullName }
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
          .select('role, full_name, company_name')
          .eq('id', user.id)
          .single();
        if(error || !profile){
          return { id:user.id, email:user.email, role:'buyer', name:emailName };
        }
        return {
          id: user.id,
          email: user.email,
          role: profile.role || 'buyer',
          name: profile.company_name || profile.full_name || user.email || emailName
        };
      }catch(_){
        return { id:user.id, email:user.email, role:'buyer', name:emailName };
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
    const TYPE_LABEL = { fabric_mill:'Fabric Mill', oem_factory:'OEM Factory', trim_supplier:'Trim Supplier' };
    const [prodRes, facRes] = await Promise.all([
      sb.from('products')
        .select('sku,name,comp,spec,price,pricing_mode,unit_type,moq,badge,img,loc,category,listing_status,factories(name)')
        .eq('listing_status','active'),
      sb.from('factories').select('*')
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

      // ensure the buyer has a cart row
      let { data: cart, error: ce } = await sb.from('carts').select('id').eq('profile_id', uid).maybeSingle();
      if(ce) return { error: ce };
      if(!cart){
        const ins = await sb.from('carts').insert({ profile_id: uid }).select('id').single();
        if(ins.error) return { error: ins.error };
        cart = ins.data;
      }

      // map SKUs -> product ids, then replace the DB cart contents
      const skus = (items||[]).map(i=>i.id);
      if(!skus.length) return { error:{ message:'cart is empty' } };
      const { data: prods, error: pe } = await sb.from('products').select('id,sku').in('sku', skus);
      if(pe) return { error: pe };
      const idBySku = Object.fromEntries((prods||[]).map(p=>[p.sku, p.id]));
      const rows = (items||[]).filter(i=>idBySku[i.id]).map(i=>({ cart_id: cart.id, product_id: idBySku[i.id], qty: i.qty }));
      if(!rows.length) return { error:{ message:'no valid items in cart' } };
      await sb.from('cart_items').delete().eq('cart_id', cart.id);
      const ci = await sb.from('cart_items').insert(rows);
      if(ci.error) return { error: ci.error };

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

  async getBankAccount(){
    try{
      const { data } = await sb.from('platform_bank_accounts').select('*').eq('is_active', true).maybeSingle();
      return data || null;
    }catch(_){ return null; }
  }
};

window.ARCANA_API = API;
})();
