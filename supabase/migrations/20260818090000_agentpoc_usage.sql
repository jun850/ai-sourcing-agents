-- ============================================================================
-- Atelix — agentpoc global usage cap
-- The /agentpoc demo page is public and unauthenticated (a pitch artifact,
-- not a logged-in feature), so its Edge Function (agentpoc-ask) cannot use
-- the per-profile cap that guards copilot-ask (0013_copilot_usage.sql +
-- 20260811133000_shared_athelia_usage_limit.sql). This is the same pattern,
-- collapsed to a single global row instead of one row per profile, so an
-- unauthenticated public endpoint can't become an open OpenRouter spend
-- spigot. Writes only happen server-side via the service role key inside
-- the Edge Function — there are no client INSERT/UPDATE/SELECT policies.
-- ============================================================================

CREATE TABLE public.agentpoc_usage (
  id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  usage_date   date NOT NULL DEFAULT current_date,
  call_count   integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agentpoc_usage ENABLE ROW LEVEL SECURITY;
-- No policies at all: anon/authenticated get zero access: the service-role
-- key (used only inside the agentpoc-ask Edge Function) bypasses RLS.

-- Atomically reserve one call against today's global cap, resetting the
-- counters on a new day. Mirrors reserve_athelia_usage's shape but keyed
-- globally (single row, id=1) instead of per profile.
CREATE OR REPLACE FUNCTION public.reserve_agentpoc_usage(p_max_calls integer)
RETURNS TABLE(allowed boolean, call_count integer, total_tokens integer, usage_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved public.agentpoc_usage%ROWTYPE;
BEGIN
  INSERT INTO public.agentpoc_usage AS au (id, usage_date, call_count, total_tokens)
  VALUES (1, current_date, 1, 0)
  ON CONFLICT (id) DO UPDATE SET
    call_count = CASE WHEN au.usage_date = current_date THEN au.call_count + 1 ELSE 1 END,
    total_tokens = CASE WHEN au.usage_date = current_date THEN au.total_tokens ELSE 0 END,
    usage_date = current_date,
    updated_at = now()
  WHERE au.usage_date <> current_date OR au.call_count < GREATEST(p_max_calls, 1)
  RETURNING au.* INTO reserved;

  IF reserved.id IS NOT NULL THEN
    RETURN QUERY SELECT true, reserved.call_count, reserved.total_tokens, reserved.usage_date;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT false, au.call_count, au.total_tokens, au.usage_date
  FROM public.agentpoc_usage au
  WHERE au.id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_agentpoc_tokens(p_tokens integer)
RETURNS TABLE(call_count integer, total_tokens integer, usage_date date)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.agentpoc_usage AS au
  SET total_tokens = au.total_tokens + GREATEST(p_tokens, 0),
      updated_at = now()
  WHERE au.id = 1
    AND au.usage_date = current_date
  RETURNING au.call_count, au.total_tokens, au.usage_date;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_agentpoc_usage(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_agentpoc_tokens(integer) FROM PUBLIC, anon, authenticated;
