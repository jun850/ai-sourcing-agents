-- RPCs for the AI-assisted supplier routing engine.
--   * intools_rfq_routing_context   - assemble RFQ brief + evidence + eligible
--     candidate suppliers (the SQL fallback candidate set) + country profiles.
--   * intools_rfq_routing_candidates - re-validate a set of factory ids
--     (e.g. Algolia hits) against deterministic eligibility, return real facts.
--   * intools_persist_rfq_routing    - write the run ledger + upsert matches
--     without clobbering operator decisions; audit with existing action values.
--   * intools_claim_rfq_routing_jobs / intools_complete_rfq_routing_job - queue
--     drain for the RFQ-submission pre-warm scheduler (service role).
--   * intools_supplier_search_claim / _complete / _full_snapshot - Algolia sync.
--
-- Deterministic eligibility (verified + broker-approved + not archived, via
-- public.broker_factory_is_eligible) is enforced here regardless of what any
-- model or search index returns.

CREATE OR REPLACE FUNCTION public.intools_routing_guard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin or service role required' USING ERRCODE='42501';
  END IF;
END;
$$;

-- Shared candidate projection: real supplier facts only, capped strings.
CREATE OR REPLACE FUNCTION public.broker_factory_routing_json(p_factory public.factories)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'factory_id', p_factory.id,
    'name', p_factory.name,
    'type', p_factory.type::text,
    'region', p_factory.region,
    'country', initcap(btrim(coalesce(p_factory.region, ''))),
    'loc', p_factory.loc,
    'moq', p_factory.moq,
    'lead', p_factory.lead,
    'capacity', p_factory.capacity,
    'tags', to_jsonb(coalesce(p_factory.tags, ARRAY[]::text[])),
    'certs', to_jsonb(coalesce(p_factory.certs, ARRAY[]::text[])),
    'rating', p_factory.rating,
    'years', p_factory.years,
    'bio_excerpt', left(coalesce(p_factory.bio, ''), 400)
  );
$$;

CREATE OR REPLACE FUNCTION public.intools_rfq_routing_context(p_case_id uuid, p_candidate_limit integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE
  v_case public.rfq_cases;
  v_limit integer := LEAST(GREATEST(COALESCE(p_candidate_limit, 60), 10), 150);
  v_buyer_country text; v_buyer_revenue text;
  v_candidates jsonb; v_candidate_count integer;
BEGIN
  PERFORM public.intools_routing_guard();
  SELECT * INTO v_case FROM public.rfq_cases WHERE id = p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='22023'; END IF;

  SELECT p.country, rr.annual_revenue INTO v_buyer_country, v_buyer_revenue
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT annual_revenue FROM public.registration_requests rr
    JOIN auth.users u ON u.email = rr.email
    WHERE u.id = p.id AND rr.status IN ('approved','invited')
    ORDER BY rr.updated_at DESC LIMIT 1
  ) rr ON true
  WHERE p.id = v_case.buyer_profile_id;

  SELECT COUNT(*)::integer INTO v_candidate_count
  FROM public.factories f
  WHERE f.verify_state = 'verified' AND f.broker_status = 'approved' AND f.archived_at IS NULL
    AND public.broker_factory_is_eligible(f, v_case.brief);

  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'rating')::numeric DESC NULLS LAST), '[]'::jsonb) INTO v_candidates
  FROM (
    SELECT public.broker_factory_routing_json(f) AS c
    FROM public.factories f
    WHERE f.verify_state = 'verified' AND f.broker_status = 'approved' AND f.archived_at IS NULL
      AND public.broker_factory_is_eligible(f, v_case.brief)
    ORDER BY f.rating DESC NULLS LAST, f.updated_at DESC
    LIMIT v_limit
  ) q;

  RETURN jsonb_build_object(
    'rfq', jsonb_build_object(
      'id', v_case.id, 'case_no', v_case.case_no, 'title', v_case.title,
      'brief', v_case.brief, 'intake', v_case.brief->'intake', 'status', v_case.status,
      'buyer_country', v_buyer_country, 'buyer_revenue', v_buyer_revenue),
    'buyer_prompt', COALESCE((
      SELECT left(string_agg(m.content, E'\n' ORDER BY m.created_at, m.id), 6000)
      FROM public.athelia_thread_messages m
      WHERE m.thread_id = v_case.thread_id AND m.role = 'buyer'), ''),
    'reference_facts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('field_key', field_key, 'value', value, 'confidence', confidence)
             ORDER BY created_at DESC)
      FROM public.rfq_reference_facts
      WHERE rfq_case_id = v_case.id AND confidence IN ('high','medium')), '[]'::jsonb),
    'bom_lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('component', component, 'specification', specification,
             'color_finish', color_finish, 'quantity_unit', quantity_unit) ORDER BY created_at)
      FROM public.rfq_reference_bom_lines WHERE rfq_case_id = v_case.id), '[]'::jsonb),
    'attachment_excerpts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', original_name, 'text', left(extracted_text, 4000)) ORDER BY created_at)
      FROM (
        SELECT original_name, extracted_text, created_at FROM public.rfq_attachments
        WHERE rfq_case_id = v_case.id AND extraction_status = 'ready' AND extracted_text IS NOT NULL
        ORDER BY created_at DESC LIMIT 5
      ) a), '[]'::jsonb),
    'existing_matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('factory_id', factory_id, 'status', status))
      FROM public.rfq_supplier_matches WHERE rfq_case_id = v_case.id), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'factory_id', m.factory_id, 'status', m.status,
        'eligibility', m.eligibility, 'score', m.score, 'recommendation', m.recommendation)
        ORDER BY (CASE m.status WHEN 'selected' THEN 0 WHEN 'approved' THEN 1 WHEN 'suggested' THEN 2 ELSE 3 END),
                 m.score DESC, m.updated_at DESC)
      FROM public.rfq_supplier_matches m WHERE m.rfq_case_id = v_case.id), '[]'::jsonb),
    'last_run', (
      SELECT jsonb_build_object('created_at', created_at, 'engine', engine,
             'routing_engine_version', routing_engine_version, 'policy_version', policy_version)
      FROM public.rfq_routing_runs WHERE rfq_case_id = v_case.id
      ORDER BY created_at DESC LIMIT 1),
    'country_profiles', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.fallback_rank)
      FROM public.supplier_routing_country_profiles p WHERE p.enabled), '[]'::jsonb),
    'policy_version', COALESCE((SELECT MAX(version) FROM public.supplier_routing_country_profiles WHERE enabled), 1),
    'candidates', v_candidates,
    'candidate_count', v_candidate_count,
    'candidates_truncated', (v_candidate_count > v_limit)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_rfq_routing_candidates(p_case_id uuid, p_factory_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_case public.rfq_cases;
BEGIN
  PERFORM public.intools_routing_guard();
  SELECT * INTO v_case FROM public.rfq_cases WHERE id = p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='22023'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(public.broker_factory_routing_json(f) ORDER BY f.rating DESC NULLS LAST)
    FROM public.factories f
    WHERE f.id = ANY(COALESCE(p_factory_ids, ARRAY[]::uuid[]))
      AND f.verify_state = 'verified' AND f.broker_status = 'approved' AND f.archived_at IS NULL
      AND public.broker_factory_is_eligible(f, v_case.brief)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_persist_rfq_routing(p_case_id uuid, p_mode text, p_run jsonb, p_matches jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_case public.rfq_cases;
  v_actor uuid := auth.uid();
  v_ids uuid[];
  v_elem jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.intools_routing_guard();
  IF p_mode NOT IN ('ensure','refresh') THEN RAISE EXCEPTION 'invalid mode' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='22023'; END IF;

  INSERT INTO public.rfq_routing_runs(
    rfq_case_id, mode, engine, retrieval_source, provider, model, input_tokens, output_tokens,
    reported_cost, latency_ms, candidate_count, returned_count, fallback_reason,
    routing_engine_version, policy_version, prompt_hash, signals, created_by)
  VALUES (
    p_case_id, p_mode,
    COALESCE(p_run->>'engine','deterministic'),
    COALESCE(p_run->>'retrievalSource','sql_fallback'),
    p_run->>'provider', p_run->>'model',
    NULLIF(p_run->>'inputTokens','')::integer, NULLIF(p_run->>'outputTokens','')::integer,
    NULLIF(p_run->>'reportedCost','')::numeric, NULLIF(p_run->>'latencyMs','')::integer,
    COALESCE(NULLIF(p_run->>'candidateCount','')::integer, 0),
    COALESCE(NULLIF(p_run->>'returnedCount','')::integer, 0),
    p_run->>'fallbackReason',
    COALESCE(NULLIF(p_run->>'routingEngineVersion','')::integer, 1),
    NULLIF(p_run->>'policyVersion','')::integer,
    p_run->>'promptHash',
    COALESCE(p_run->'signals','{}'::jsonb),
    v_actor);

  SELECT COALESCE(array_agg((e->>'factory_id')::uuid), ARRAY[]::uuid[]) INTO v_ids
  FROM jsonb_array_elements(COALESCE(p_matches,'[]'::jsonb)) e;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_matches,'[]'::jsonb))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = (v_elem->>'factory_id')::uuid
        AND f.verify_state = 'verified' AND f.broker_status = 'approved' AND f.archived_at IS NULL
        AND public.broker_factory_is_eligible(f, v_case.brief)
    ) THEN CONTINUE; END IF;

    INSERT INTO public.rfq_supplier_matches(
      rfq_case_id, factory_id, status, eligibility, score, recommendation, routing_policy_version, matched_by)
    VALUES (
      p_case_id, (v_elem->>'factory_id')::uuid, 'suggested',
      COALESCE(v_elem->'eligibility','{}'::jsonb),
      COALESCE(NULLIF(v_elem->>'score','')::numeric, 0),
      COALESCE(v_elem->'recommendation','{}'::jsonb),
      NULLIF(p_run->>'policyVersion','')::integer,
      v_actor)
    ON CONFLICT (rfq_case_id, factory_id) DO UPDATE SET
      eligibility = EXCLUDED.eligibility, score = EXCLUDED.score,
      recommendation = EXCLUDED.recommendation,
      routing_policy_version = EXCLUDED.routing_policy_version, updated_at = now()
    WHERE public.rfq_supplier_matches.status = 'suggested';
  END LOOP;

  IF p_mode = 'refresh' THEN
    DELETE FROM public.rfq_supplier_matches
    WHERE rfq_case_id = p_case_id AND status = 'suggested' AND NOT (factory_id = ANY(v_ids));
  END IF;

  -- admin_audit_log.admin_id is NOT NULL; the scheduler path (service role,
  -- auth.uid() IS NULL) is fully recorded by the rfq_routing_runs row instead.
  IF v_actor IS NOT NULL THEN
    INSERT INTO public.admin_audit_log(admin_id, target_table, target_id, action, summary)
    VALUES (v_actor, 'rfq_cases', p_case_id,
      CASE WHEN p_mode = 'refresh' THEN 'routing_refresh' ELSE 'routing_read' END,
      'AI supplier routing ' || p_mode || ' - engine ' || COALESCE(p_run->>'engine','deterministic'));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id, 'factory_id', m.factory_id, 'status', m.status,
    'eligibility', m.eligibility, 'score', m.score, 'recommendation', m.recommendation)
    ORDER BY (CASE m.status WHEN 'selected' THEN 0 WHEN 'approved' THEN 1 WHEN 'suggested' THEN 2 ELSE 3 END),
             m.score DESC, m.updated_at DESC), '[]'::jsonb)
  INTO v_result FROM public.rfq_supplier_matches m WHERE m.rfq_case_id = p_case_id;
  RETURN v_result;
END;
$$;

-- RFQ-submission pre-warm queue drain (service role, called by the scheduler).
CREATE OR REPLACE FUNCTION public.intools_claim_rfq_routing_jobs(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_token uuid := gen_random_uuid();
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((
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
    SELECT jsonb_agg(jsonb_build_object('id', id, 'rfq_case_id', rfq_case_id, 'claim_token', v_token)) FROM claimed
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_complete_rfq_routing_job(p_id uuid, p_claim_token uuid, p_status text, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  UPDATE public.rfq_routing_jobs SET
    processed_at = CASE WHEN p_status = 'done' THEN now() ELSE processed_at END,
    claim_token = NULL, claim_expires_at = NULL,
    last_error = left(p_error, 1000)
  WHERE id = p_id AND claim_token = p_claim_token;
END;
$$;

-- Algolia supplier-index sync helpers (service role).
CREATE OR REPLACE FUNCTION public.intools_supplier_search_claim(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((
    WITH due AS (
      SELECT o.id, o.factory_id, o.op FROM public.supplier_search_outbox o
      WHERE o.processed_at IS NULL AND o.attempts < 5
      ORDER BY o.enqueued_at
      LIMIT LEAST(GREATEST(COALESCE(p_limit,200), 1), 500)
      FOR UPDATE SKIP LOCKED
    )
    SELECT jsonb_agg(jsonb_build_object(
      'id', due.id, 'factory_id', due.factory_id, 'op', due.op,
      'record', CASE WHEN due.op = 'upsert' THEN (
        SELECT public.broker_factory_routing_json(f)
               || jsonb_build_object('objectID', f.id::text)
               || COALESCE((
                    SELECT jsonb_build_object(
                      'price_tiers', to_jsonb(p.price_tiers), 'quality_tiers', to_jsonb(p.quality_tiers),
                      'complexity_tiers', to_jsonb(p.complexity_tiers), 'premium_curation', p.premium_curation,
                      'fast_lead_time', p.fast_lead_time, 'low_moq', p.low_moq, 'fallback_rank', p.fallback_rank)
                    FROM public.supplier_routing_country_profiles p
                    WHERE lower(p.country) = lower(btrim(f.region))
                  ), '{}'::jsonb)
        FROM public.factories f
        WHERE f.id = due.factory_id
          AND f.verify_state = 'verified' AND f.broker_status = 'approved' AND f.archived_at IS NULL
          AND public.broker_factory_is_eligible(f, '{}'::jsonb)
      ) ELSE NULL END))
    FROM due
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_supplier_search_complete(p_done uuid[], p_failed uuid[], p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  UPDATE public.supplier_search_outbox SET processed_at = now(), last_error = NULL
  WHERE id = ANY(COALESCE(p_done, ARRAY[]::uuid[]));
  UPDATE public.supplier_search_outbox SET attempts = attempts + 1, last_error = left(p_error, 1000)
  WHERE id = ANY(COALESCE(p_failed, ARRAY[]::uuid[]));
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_supplier_search_full_snapshot(p_after uuid DEFAULT NULL, p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin or service role required' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
      public.broker_factory_routing_json(f)
      || jsonb_build_object('objectID', f.id::text)
      || COALESCE((
           SELECT jsonb_build_object(
             'price_tiers', to_jsonb(p.price_tiers), 'quality_tiers', to_jsonb(p.quality_tiers),
             'complexity_tiers', to_jsonb(p.complexity_tiers), 'premium_curation', p.premium_curation,
             'fast_lead_time', p.fast_lead_time, 'low_moq', p.low_moq, 'fallback_rank', p.fallback_rank)
           FROM public.supplier_routing_country_profiles p
           WHERE lower(p.country) = lower(btrim(f.region))
         ), '{}'::jsonb)
      ORDER BY f.id)
    FROM (
      SELECT f.* FROM public.factories f
      WHERE f.verify_state = 'verified' AND f.broker_status = 'approved' AND f.archived_at IS NULL
        AND public.broker_factory_is_eligible(f, '{}'::jsonb)
        AND (p_after IS NULL OR f.id > p_after)
      ORDER BY f.id
      LIMIT LEAST(GREATEST(COALESCE(p_limit,500), 1), 1000)
    ) f
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.intools_routing_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broker_factory_routing_json(public.factories) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intools_rfq_routing_context(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intools_rfq_routing_candidates(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intools_persist_rfq_routing(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intools_claim_rfq_routing_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intools_complete_rfq_routing_job(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intools_supplier_search_claim(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intools_supplier_search_complete(uuid[], uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intools_supplier_search_full_snapshot(uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.intools_rfq_routing_context(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intools_rfq_routing_candidates(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intools_persist_rfq_routing(uuid, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intools_supplier_search_full_snapshot(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intools_claim_rfq_routing_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.intools_complete_rfq_routing_job(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.intools_supplier_search_claim(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.intools_supplier_search_complete(uuid[], uuid[], text) TO service_role;
