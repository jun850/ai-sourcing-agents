-- One atomic daily allowance shared by Athelia Copilot and Design Match.
-- Calls are reserved before invoking the model so concurrent requests cannot
-- bypass the cap. Token totals are recorded separately after a response.

CREATE OR REPLACE FUNCTION public.reserve_athelia_usage(
  p_profile_id uuid,
  p_max_calls integer
)
RETURNS TABLE(allowed boolean, call_count integer, total_tokens integer, usage_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved public.copilot_usage%ROWTYPE;
BEGIN
  INSERT INTO public.copilot_usage AS cu
    (profile_id, usage_date, call_count, total_tokens)
  VALUES (p_profile_id, current_date, 1, 0)
  ON CONFLICT (profile_id) DO UPDATE SET
    call_count = CASE WHEN cu.usage_date = current_date THEN cu.call_count + 1 ELSE 1 END,
    total_tokens = CASE WHEN cu.usage_date = current_date THEN cu.total_tokens ELSE 0 END,
    usage_date = current_date,
    updated_at = now()
  WHERE cu.usage_date <> current_date OR cu.call_count < GREATEST(p_max_calls, 1)
  RETURNING cu.* INTO reserved;

  IF reserved.profile_id IS NOT NULL THEN
    RETURN QUERY SELECT true, reserved.call_count, reserved.total_tokens, reserved.usage_date;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT false, cu.call_count, cu.total_tokens, cu.usage_date
  FROM public.copilot_usage cu
  WHERE cu.profile_id = p_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_athelia_tokens(
  p_profile_id uuid,
  p_tokens integer
)
RETURNS TABLE(call_count integer, total_tokens integer, usage_date date)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.copilot_usage AS cu
  SET total_tokens = cu.total_tokens + GREATEST(p_tokens, 0),
      updated_at = now()
  WHERE cu.profile_id = p_profile_id
    AND cu.usage_date = current_date
  RETURNING cu.call_count, cu.total_tokens, cu.usage_date;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_athelia_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_athelia_tokens(uuid, integer) FROM PUBLIC, anon, authenticated;
