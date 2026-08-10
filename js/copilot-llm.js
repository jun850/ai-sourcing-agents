/* Atelix Copilot LLM bridge — wires window.ARCANA_LLM (the extension point
   copilot.js's ask() already awaits) to the copilot-ask Supabase Edge
   Function, which holds the Gemini key server-side and enforces the 30
   call / 128k token daily cap. Only ever reached for a signed-in session —
   Copilot's entry points are auth-gated in components.js — but the Edge
   Function independently re-checks the JWT and the cap, so this is UX, not
   the real gate. On any failure ask() falls back to the deterministic
   mock summary; matches themselves always come from the free client-side
   engine, never from the LLM. */
(function(){
'use strict';

function trimMatches(matches){
  return (matches||[]).slice(0, 8).map(r=>({
    name: r && r.p && r.p.name,
    seller: r && r.p && r.p.seller,
    score: r && r.score,
    hits: (r && r.hits || []).slice(0, 4),
    miss: (r && r.miss || []).slice(0, 2)
  }));
}

window.ARCANA_LLM = async function({text, intent, matches}){
  const sb = window.supabaseClient;
  if(!sb || !sb.functions) return null; // client unavailable -> ask() falls back to mock silently

  const { data, error } = await sb.functions.invoke('copilot-ask', {
    body: { text: String(text||'').slice(0,400), intent, matches: trimMatches(matches) }
  });
  if(error) throw error;
  if(!data || !data.ok){
    const err = new Error((data && data.reason) || 'copilot_unavailable');
    err.code = data && data.reason;
    err.usage = data && data.usage;
    throw err;
  }
  return { summary: data.summary, usage: data.usage };
};
})();
