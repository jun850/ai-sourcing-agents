-- ARCANA — 0006 tighten SECURITY DEFINER exposure
-- Supabase auto-grants EXECUTE to anon/authenticated on new public functions, so
-- revoke explicitly. handle_new_user is trigger-only (triggers don't need the
-- calling role to hold EXECUTE), so revoke from everyone. place_order/declare_payment
-- stay callable by authenticated (intended RPCs) but never by anon.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.place_order(text, text, text, text, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.declare_payment(text) FROM anon;

-- is_admin() is deliberately left executable: RLS policies across the schema call
-- it, and it only reveals the caller's OWN admin status (false for anon).
