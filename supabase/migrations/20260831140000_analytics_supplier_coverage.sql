-- Supplier coverage is an all-time operational metric, separate from the
-- selected commercial activity date range.

CREATE OR REPLACE FUNCTION public.intools_get_analytics_overview(p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end OR p_end - p_start > 366 THEN RAISE EXCEPTION 'Invalid analytics range' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.profiles WHERE role='buyer'),
    'rfqs', (SELECT count(*) FROM public.rfq_cases c WHERE c.source='workspace' AND c.created_at >= p_start AND c.created_at < p_end + 1),
    'quote_value_cents', (SELECT COALESCE(sum(q.quote_total_cents),0) FROM public.rfq_quotes q WHERE q.status IN ('published','selected') AND q.created_at >= p_start AND q.created_at < p_end + 1 AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.rfq_case_id=q.rfq_case_id AND o.status='cancelled')),
    'invoice_total_cents', (SELECT COALESCE(sum(i.total_cents),0) FROM public.invoices i WHERE i.status <> 'cancelled' AND i.created_at >= p_start AND i.created_at < p_end + 1),
    'verified_suppliers', (SELECT count(*) FROM public.factories f WHERE f.archived_at IS NULL AND f.verify_state='verified' AND f.broker_status='approved'),
    'supplier_countries', (SELECT count(DISTINCT lower(trim(f.region))) FROM public.factories f WHERE f.archived_at IS NULL AND nullif(trim(f.region),'') IS NOT NULL),
    'trend', (SELECT COALESCE(jsonb_agg(jsonb_build_object('date',d::date,'rfqs',(SELECT count(*) FROM public.rfq_cases c WHERE c.source='workspace' AND c.created_at >= d AND c.created_at < d + interval '1 day'),'invoices_cents',(SELECT COALESCE(sum(i.total_cents),0) FROM public.invoices i WHERE i.status <> 'cancelled' AND i.created_at >= d AND i.created_at < d + interval '1 day')) ORDER BY d), '[]'::jsonb) FROM generate_series(p_start::timestamptz,p_end::timestamptz,interval '1 day') d),
    'search_console_imports', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'source_type',source_type,'coverage_start',coverage_start,'coverage_end',coverage_end,'original_filename',original_filename,'row_count',row_count,'imported_at',imported_at) ORDER BY imported_at DESC),'[]'::jsonb) FROM public.intools_search_console_imports)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_get_analytics_overview(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_get_analytics_overview(date,date) TO authenticated;
