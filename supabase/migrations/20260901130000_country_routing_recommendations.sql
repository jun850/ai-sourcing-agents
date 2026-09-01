-- Deterministic, private country routing for the broker-led RFQ workflow.
-- Country policy is an Ops-maintained routing aid, never a supplier or price claim.

CREATE TABLE IF NOT EXISTS public.country_routing_policies (
  country text PRIMARY KEY CHECK (country IN ('China','Indonesia','Japan','Malaysia','Vietnam')),
  enabled boolean NOT NULL DEFAULT true,
  categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  production_types public.factory_type[] NOT NULL DEFAULT ARRAY[]::public.factory_type[],
  routing_note text NOT NULL CHECK (char_length(btrim(routing_note)) BETWEEN 1 AND 1000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.country_routing_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS country_routing_policies_admin_all ON public.country_routing_policies;
CREATE POLICY country_routing_policies_admin_all ON public.country_routing_policies FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

INSERT INTO public.country_routing_policies(country,categories,production_types,routing_note)
VALUES
  ('China',ARRAY['apparel','fabric','trims_labels','packaging','bags_accessories'],ARRAY['garment_manufacturer','fabric_mill','trim_supplier','accessories_supplier','textile_trading_company']::public.factory_type[],'Use only supplier-record evidence; current quotes decide price.'),
  ('Indonesia',ARRAY['apparel','beauty_personal_care'],ARRAY['garment_manufacturer','material_innovator']::public.factory_type[],'Use only supplier-record evidence; location is a soft internal tie-breaker.'),
  ('Japan',ARRAY['apparel','fabric','bags_accessories','trims_labels'],ARRAY['garment_manufacturer','fabric_mill','accessories_supplier','trim_supplier','textile_trading_company']::public.factory_type[],'Use only supplier-record evidence; current quotes decide price.'),
  ('Malaysia',ARRAY['apparel','fabric','beauty_personal_care'],ARRAY['garment_manufacturer','fabric_mill','material_innovator']::public.factory_type[],'Use only supplier-record evidence; location is a soft internal tie-breaker.'),
  ('Vietnam',ARRAY['apparel'],ARRAY['garment_manufacturer','material_innovator']::public.factory_type[],'Use only supplier-record evidence; current quotes decide price.')
ON CONFLICT (country) DO NOTHING;

ALTER TABLE public.rfq_supplier_matches
  ADD COLUMN IF NOT EXISTS recommendation jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(recommendation)='object'),
  ADD COLUMN IF NOT EXISTS routing_policy_version integer;

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
      WHERE u.id=p.id AND rr.status IN ('approved','invited') ORDER BY rr.updated_at DESC LIMIT 1
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

REVOKE ALL ON public.country_routing_policies FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intools_generate_rfq_supplier_matches(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_generate_rfq_supplier_matches(uuid,boolean) TO authenticated;
