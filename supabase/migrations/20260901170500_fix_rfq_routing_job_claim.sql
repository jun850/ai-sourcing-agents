-- Keep the data-modifying CTE at statement scope. Postgres rejects it when
-- nested inside the expression returned directly from PL/pgSQL.
CREATE OR REPLACE FUNCTION public.intools_claim_rfq_routing_jobs(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_token uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;

  WITH due AS (
    SELECT id FROM public.rfq_routing_jobs
    WHERE processed_at IS NULL AND (claim_expires_at IS NULL OR claim_expires_at < now()) AND attempts < 5
    ORDER BY enqueued_at
    LIMIT LEAST(GREATEST(COALESCE(p_limit,20), 1), 100)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.rfq_routing_jobs j
    SET claim_token = v_token, claim_expires_at = now() + interval '10 minutes', attempts = attempts + 1
    FROM due WHERE j.id = due.id
    RETURNING j.id, j.rfq_case_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'rfq_case_id', rfq_case_id, 'claim_token', v_token)), '[]'::jsonb)
  INTO v_result
  FROM claimed;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_claim_rfq_routing_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intools_claim_rfq_routing_jobs(integer) TO service_role;
