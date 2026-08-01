import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bobwfxvxzjovpgmmqsew.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ASo9lPieY2j2Gd7-WsareA_daIH3V3m';

window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
