-- ============================================================================
-- ARCANA — 0013 Sourcing Copilot usage tracking
-- One row per profile, reset daily. Writes only happen server-side (the
-- copilot-ask Edge Function, via the service role key) through the RPC below —
-- there are no client INSERT/UPDATE policies, only a self-read SELECT policy
-- so the UI can show "N of 30 searches used" without an extra round trip.
-- ============================================================================

CREATE TABLE public.copilot_usage (
  profile_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_date   date NOT NULL DEFAULT current_date,
  call_count   integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS copilot_usage_select_self ON public.copilot_usage;
CREATE POLICY copilot_usage_select_self ON public.copilot_usage
  FOR SELECT USING (profile_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for anon/authenticated: the service-role
-- key (used only inside the copilot-ask Edge Function) bypasses RLS entirely,
-- so all writes are funneled through increment_copilot_usage() below.

-- Atomically bump today's usage (or start a fresh day) and return the new
-- totals, so the Edge Function can enforce the cap without a read-then-write
-- race between concurrent requests from the same user.
CREATE OR REPLACE FUNCTION public.increment_copilot_usage(p_profile_id uuid, p_tokens integer)
RETURNS TABLE(call_count integer, total_tokens integer, usage_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.copilot_usage AS cu (profile_id, usage_date, call_count, total_tokens)
  VALUES (p_profile_id, current_date, 1, GREATEST(p_tokens, 0))
  ON CONFLICT (profile_id) DO UPDATE SET
    call_count   = CASE WHEN cu.usage_date = current_date THEN cu.call_count + 1 ELSE 1 END,
    total_tokens = CASE WHEN cu.usage_date = current_date THEN cu.total_tokens + GREATEST(p_tokens, 0) ELSE GREATEST(p_tokens, 0) END,
    usage_date   = current_date,
    updated_at   = now()
  RETURNING cu.call_count, cu.total_tokens, cu.usage_date;
END;
$$;

-- Supabase auto-grants EXECUTE on new functions to anon/authenticated; revoke
-- so only the service-role Edge Function can call it (mirrors 0006's pattern).
REVOKE EXECUTE ON FUNCTION public.increment_copilot_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
