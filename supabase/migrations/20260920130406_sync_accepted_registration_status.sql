-- Keep the manual approval state aligned with the server-authoritative Auth
-- confirmation state. One Auth account is bound to the most recent approved
-- request for its normalized email address.
ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE public.registration_requests
  DROP CONSTRAINT IF EXISTS registration_requests_status_check;
ALTER TABLE public.registration_requests
  ADD CONSTRAINT registration_requests_status_check
  CHECK (status IN ('pending_review','approved','declined','invited','accepted'));

CREATE INDEX IF NOT EXISTS registration_requests_auth_user_idx
  ON public.registration_requests(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS registration_requests_active_email_idx
  ON public.registration_requests(lower(email), invitation_requested_at DESC, created_at DESC)
  WHERE status IN ('approved','invited','accepted');

CREATE OR REPLACE FUNCTION public.sync_confirmed_registration_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_id uuid;
BEGIN
  IF new.email_confirmed_at IS NULL THEN
    RETURN new;
  END IF;

  SELECT r.id INTO v_request_id
  FROM public.registration_requests r
  WHERE r.status IN ('approved','invited','accepted')
    AND (
      r.auth_user_id = new.id
      OR (r.auth_user_id IS NULL AND lower(r.email) = lower(new.email))
    )
  ORDER BY
    (r.auth_user_id = new.id) DESC,
    r.invitation_requested_at DESC NULLS LAST,
    r.created_at DESC
  LIMIT 1;

  IF v_request_id IS NOT NULL THEN
    UPDATE public.registration_requests
    SET status = 'accepted',
        auth_user_id = new.id,
        accepted_at = COALESCE(accepted_at, new.email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_request_id
      AND (status <> 'accepted' OR auth_user_id IS DISTINCT FROM new.id OR accepted_at IS NULL);
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_confirmed_registration_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_confirmed_registration ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_registration
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (old.email_confirmed_at IS NULL AND new.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.sync_confirmed_registration_request();

-- Repair the latest eligible request for accounts confirmed before this trigger.
WITH confirmed_requests AS (
  SELECT DISTINCT ON (u.id)
    u.id AS auth_user_id,
    u.email_confirmed_at,
    r.id AS request_id
  FROM auth.users u
  JOIN public.registration_requests r
    ON lower(r.email) = lower(u.email)
   AND r.status IN ('approved','invited','accepted')
  WHERE u.email_confirmed_at IS NOT NULL
  ORDER BY u.id, r.invitation_requested_at DESC NULLS LAST, r.created_at DESC
)
UPDATE public.registration_requests r
SET status = 'accepted',
    auth_user_id = c.auth_user_id,
    accepted_at = COALESCE(r.accepted_at, c.email_confirmed_at),
    updated_at = now()
FROM confirmed_requests c
WHERE r.id = c.request_id;

CREATE OR REPLACE FUNCTION public.intools_list_registration_requests(p_status text DEFAULT 'pending_review')
RETURNS SETOF public.registration_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending_review','approved','declined','invited','accepted') THEN
    RAISE EXCEPTION 'Invalid registration status' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT r.*
    FROM public.registration_requests r
    WHERE p_status IS NULL OR r.status = p_status
    ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_list_registration_requests(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_registration_requests(text) TO authenticated;

-- Accepted accounts remain eligible for buyer metadata and routing context.

CREATE OR REPLACE FUNCTION public.intools_get_customer_distribution()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  WITH customer_base AS (
    SELECT
      COALESCE(
        NULLIF(btrim(p.country), ''),
        NULLIF(btrim(r.country_code), ''),
        NULLIF(btrim(u.raw_user_meta_data->>'country'), ''),
        NULLIF(btrim(a.country), '')
      ) AS country,
      COALESCE(
        NULLIF(btrim(r.annual_revenue), ''),
        NULLIF(btrim(u.raw_user_meta_data->>'annual_revenue'), '')
      ) AS annual_revenue
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
      SELECT rr.country_code, rr.annual_revenue
      FROM public.registration_requests rr
      WHERE lower(rr.email) = lower(u.email)
        AND rr.status IN ('approved', 'invited', 'accepted')
      ORDER BY rr.updated_at DESC, rr.created_at DESC
      LIMIT 1
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT address.country
      FROM public.addresses address
      WHERE address.profile_id = p.id
        AND NULLIF(btrim(address.country), '') IS NOT NULL
      ORDER BY address.is_default DESC, address.created_at DESC
      LIMIT 1
    ) a ON true
    WHERE p.role = 'buyer'
  ), geography AS (
    SELECT country AS label, count(*)::integer AS customers,
      round(count(*) * 100.0 / NULLIF(sum(count(*)) OVER (), 0), 1) AS percentage
    FROM customer_base WHERE country IS NOT NULL GROUP BY country
  ), revenue_tiers AS (
    SELECT annual_revenue AS label, count(*)::integer AS customers,
      round(count(*) * 100.0 / NULLIF(sum(count(*)) OVER (), 0), 1) AS percentage
    FROM customer_base WHERE annual_revenue IS NOT NULL GROUP BY annual_revenue
  )
  SELECT jsonb_build_object(
    'customers', (SELECT count(*) FROM customer_base),
    'countries_reported', (SELECT count(country) FROM customer_base),
    'revenue_reported', (SELECT count(annual_revenue) FROM customer_base),
    'geography', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'customers', customers, 'percentage', percentage) ORDER BY customers DESC, label), '[]'::jsonb) FROM geography),
    'revenue_tiers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'customers', customers, 'percentage', percentage) ORDER BY customers DESC, label), '[]'::jsonb) FROM revenue_tiers)
  ) INTO v_result;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.intools_get_customer_distribution() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_get_customer_distribution() TO authenticated;

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
    WHERE u.id = p.id AND rr.status IN ('approved','invited','accepted')
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

CREATE OR REPLACE FUNCTION public.intools_generate_rfq_supplier_matches(p_case_id uuid, p_refresh boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_result jsonb; v_category text; v_prompt text; v_buyer_country text; v_revenue text;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='22023'; END IF;
  IF p_refresh THEN
    v_category:=NULLIF(COALESCE(v_case.brief->'intake'->>'category',v_case.brief->'intake'->>'subtype'), '');
    SELECT string_agg(m.content, E'\n' ORDER BY m.created_at, m.id) INTO v_prompt
    FROM public.athelia_thread_messages m WHERE m.thread_id=v_case.thread_id AND m.role='buyer';
    SELECT p.country, rr.annual_revenue INTO v_buyer_country,v_revenue
    FROM public.profiles p LEFT JOIN LATERAL (
      SELECT annual_revenue FROM public.registration_requests rr
      JOIN auth.users u ON u.email=rr.email
      WHERE u.id=p.id AND rr.status IN ('approved','invited','accepted') ORDER BY rr.updated_at DESC LIMIT 1
    ) rr ON true WHERE p.id=v_case.buyer_profile_id;

    INSERT INTO public.rfq_supplier_matches(rfq_case_id,factory_id,status,eligibility,score,recommendation,routing_policy_version,matched_by)
    SELECT v_case.id,f.id,'suggested',
      jsonb_build_object('verified',true,'broker_approved',true,'not_archived',true,'production_type',f.type::text),
      (40 + CASE WHEN lower(COALESCE(v_category,''))=ANY(cp.categories) THEN 20 ELSE 0 END
        + CASE WHEN COALESCE(array_length(f.tags,1),0)>0 THEN 10 ELSE 0 END
        + CASE WHEN COALESCE(v_prompt,'') ~* '(low cost|lowest price|price sensitive|tight budget|cost sensitive|affordable)' THEN 10 ELSE 0 END
        + CASE WHEN NULLIF(lower(btrim(COALESCE(v_buyer_country,''))),'')=lower(cp.country) THEN 5 ELSE 0 END
        + CASE WHEN COALESCE(v_revenue,'') ~* '(under .?500k|500k)' THEN 5 ELSE 0 END)::numeric(8,3),
      jsonb_build_object('country',cp.country,'policyVersion',cp.version,'scoreComponents',jsonb_build_object(
        'productionFit',40,'categoryFit',CASE WHEN lower(COALESCE(v_category,''))=ANY(cp.categories) THEN 20 ELSE 0 END,
        'supplierEvidence',CASE WHEN COALESCE(array_length(f.tags,1),0)>0 THEN 10 ELSE 0 END,
        'explicitPriceSignal',CASE WHEN COALESCE(v_prompt,'') ~* '(low cost|lowest price|price sensitive|tight budget|cost sensitive|affordable)' THEN 10 ELSE 0 END,
        'buyerLocationTieBreaker',CASE WHEN NULLIF(lower(btrim(COALESCE(v_buyer_country,''))),'')=lower(cp.country) THEN 5 ELSE 0 END,
        'revenueContext',CASE WHEN COALESCE(v_revenue,'') ~* '(under .?500k|500k)' THEN 5 ELSE 0 END),
        'opsNote',cp.routing_note,'unknowns',jsonb_build_array('Confirm MOQ, lead time, capacity, certification, availability, and commercial terms with the supplier.')),
      cp.version,auth.uid()
    FROM public.factories f JOIN public.country_routing_policies cp ON cp.country=f.region AND cp.enabled
    WHERE f.verify_state='verified' AND f.broker_status='approved' AND f.archived_at IS NULL
      AND f.type=ANY(cp.production_types)
      AND (v_category IS NULL OR lower(v_category)=ANY(cp.categories))
      AND public.broker_factory_is_eligible(f,v_case.brief)
    ON CONFLICT(rfq_case_id,factory_id) DO UPDATE SET
      eligibility=EXCLUDED.eligibility,score=EXCLUDED.score,recommendation=EXCLUDED.recommendation,routing_policy_version=EXCLUDED.routing_policy_version,updated_at=now()
      WHERE public.rfq_supplier_matches.status='suggested';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'factory_id',m.factory_id,'status',m.status,'eligibility',m.eligibility,'score',m.score,'recommendation',m.recommendation) ORDER BY m.score DESC,m.updated_at DESC),'[]'::jsonb)
    INTO v_result FROM public.rfq_supplier_matches m WHERE m.rfq_case_id=v_case.id;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    VALUES(auth.uid(),'rfq_cases',v_case.id,CASE WHEN p_refresh THEN 'routing_refresh' ELSE 'routing_read' END,'Read deterministic country routing recommendations');
  RETURN v_result;
END;
$$;
