-- Bulk approval must honor the existing verified-region constraint per row.
-- Suppliers with an unsupported or missing region remain pending for broker review.

CREATE OR REPLACE FUNCTION public.intools_set_supplier_broker_status_bulk(p_supplier_ids uuid[],p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ids uuid[]; v_updated integer:=0; v_skipped_region integer:=0;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Bulk supplier status must be approved or rejected' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT input.id) INTO v_ids FROM unnest(COALESCE(p_supplier_ids,'{}'::uuid[])) AS input(id);
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Select 1..500 suppliers' USING ERRCODE='22023'; END IF;

  SELECT count(*) INTO v_skipped_region
  FROM public.factories
  WHERE id=ANY(v_ids) AND archived_at IS NULL AND p_status='approved'
    AND lower(trim(COALESCE(region,''))) <> ALL (ARRAY[
      'brunei','cambodia','china','hong kong','indonesia','japan','laos','macau',
      'malaysia','mongolia','myanmar','north korea','philippines','singapore',
      'south korea','taiwan','thailand','timor-leste','vietnam',
      'italy','switzerland','united kingdom'
    ]);

  WITH updated AS (
    UPDATE public.factories
    SET broker_status=p_status,
      verify_state=CASE WHEN p_status='approved' THEN 'verified'::public.verify_state ELSE 'pending'::public.verify_state END,
      broker_reviewed_by=auth.uid(),broker_reviewed_at=now(),updated_at=now()
    WHERE id=ANY(v_ids) AND archived_at IS NULL
      AND (p_status <> 'approved' OR lower(trim(COALESCE(region,''))) = ANY (ARRAY[
        'brunei','cambodia','china','hong kong','indonesia','japan','laos','macau',
        'malaysia','mongolia','myanmar','north korea','philippines','singapore',
        'south korea','taiwan','thailand','timor-leste','vietnam',
        'italy','switzerland','united kingdom'
      ]))
    RETURNING id
  ), audited AS (
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    SELECT auth.uid(),'factories',id,'verify_state_change','bulk_'||p_status FROM updated
    RETURNING id
  ) SELECT count(*) INTO v_updated FROM audited;

  RETURN jsonb_build_object('updated_count',v_updated,'skipped_region_count',v_skipped_region,'status',p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.intools_set_supplier_broker_status_bulk(uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_set_supplier_broker_status_bulk(uuid[],text) TO authenticated;
