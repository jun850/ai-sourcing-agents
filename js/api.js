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
    onChange(){ return { data:{ subscription:{ unsubscribe(){} } } }; }
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
  }
};

window.ARCANA_API = API;
})();
