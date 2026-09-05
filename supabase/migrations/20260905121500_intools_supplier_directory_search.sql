-- Let Ops search the complete private supplier directory and add a vetted
-- supplier to an RFQ without changing the AI recommendation set.

CREATE OR REPLACE FUNCTION public.intools_add_rfq_supplier_match(p_case_id uuid, p_factory_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_case public.rfq_cases;
  v_factory public.factories;
  v_match public.rfq_supplier_matches;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id;
  IF v_case.id IS NULL THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_factory FROM public.factories WHERE id=p_factory_id;
  IF v_factory.id IS NULL OR v_factory.verify_state<>'verified' OR v_factory.broker_status<>'approved' OR v_factory.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Supplier is not currently eligible' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.rfq_supplier_matches(rfq_case_id,factory_id,status,eligibility,score,matched_by)
  VALUES(p_case_id,p_factory_id,'suggested',jsonb_build_object('verified',true,'broker_approved',true,'not_archived',true,'source','ops_directory_search'),0,auth.uid())
  ON CONFLICT(rfq_case_id,factory_id) DO UPDATE SET
    status=CASE WHEN public.rfq_supplier_matches.status='rejected' THEN 'suggested' ELSE public.rfq_supplier_matches.status END,
    updated_at=now()
  RETURNING * INTO v_match;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
  VALUES(auth.uid(),'rfq_cases',p_case_id,'supplier_directory_match','Added vetted supplier from private directory search',jsonb_build_object('factory_id',p_factory_id,'match_id',v_match.id));
  RETURN jsonb_build_object('id',v_match.id,'factory_id',v_match.factory_id,'status',v_match.status,'eligibility',v_match.eligibility,'score',v_match.score,'recommendation','{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.intools_add_rfq_supplier_match(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_add_rfq_supplier_match(uuid,uuid) TO authenticated;
