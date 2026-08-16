import { createClient } from '@supabase/supabase-js';

const PRODUCTION_CONFIG = {
  url: 'https://bobwfxvxzjovpgmmqsew.supabase.co',
  publishableKey: 'sb_publishable_ASo9lPieY2j2Gd7-WsareA_daIH3V3m'
};
const localHost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
const localConfig = window.ATELIX_LOCAL_SUPABASE;

// A localhost browser must never silently use the production database. The
// local server injects this public configuration only after `supabase start`
// is healthy. Edge Function secrets remain in Supabase's local runtime.
const config = localHost
  ? (localConfig?.environment === 'local' && /^http:\/\/(localhost|127\.0\.0\.1):54321$/.test(localConfig.url || '') && localConfig.publishableKey ? localConfig : null)
  : PRODUCTION_CONFIG;

if (!config) {
  console.error('[Atelix] Local Supabase is unavailable. Start it with `npx supabase start` before using localhost.');
  window.supabaseClient = null;
} else {
  window.supabaseClient = createClient(config.url, config.publishableKey);
}
