-- Admin-only analytics: authoritative operational aggregates plus manually imported
-- Search Console snapshots. Browser code may not write commercial state.
ALTER TABLE public.rfq_quotes ADD COLUMN IF NOT EXISTS quote_total_cents integer CHECK (quote_total_cents >= 0);

CREATE TABLE IF NOT EXISTS public.intools_search_console_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('chart','countries','devices','filters','pages','queries','search_appearance')),
  coverage_start date,
  coverage_end date,
  original_filename text NOT NULL CHECK (char_length(btrim(original_filename)) BETWEEN 1 AND 255),
  headers jsonb NOT NULL CHECK (jsonb_typeof(headers)='array'),
  rows jsonb NOT NULL CHECK (jsonb_typeof(rows)='array'),
  row_count integer NOT NULL CHECK (row_count >= 0),
  imported_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.intools_search_console_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY intools_search_console_imports_admin ON public.intools_search_console_imports FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.intools_import_search_console_csv(p_source_type text, p_filename text, p_headers jsonb, p_rows jsonb, p_coverage_start date DEFAULT NULL, p_coverage_end date DEFAULT NULL)
RETURNS public.intools_search_console_imports LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_import public.intools_search_console_imports;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_source_type NOT IN ('chart','countries','devices','filters','pages','queries','search_appearance') OR jsonb_typeof(p_headers) <> 'array' OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Invalid Search Console import' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.intools_search_console_imports(source_type,coverage_start,coverage_end,original_filename,headers,rows,row_count,imported_by)
  VALUES(p_source_type,p_coverage_start,p_coverage_end,btrim(p_filename),p_headers,p_rows,jsonb_array_length(p_rows),auth.uid()) RETURNING * INTO v_import;
  RETURN v_import;
END;
$$;

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
    'trend', (SELECT COALESCE(jsonb_agg(jsonb_build_object('date',d::date,'rfqs',(SELECT count(*) FROM public.rfq_cases c WHERE c.source='workspace' AND c.created_at >= d AND c.created_at < d + interval '1 day'),'invoices_cents',(SELECT COALESCE(sum(i.total_cents),0) FROM public.invoices i WHERE i.status <> 'cancelled' AND i.created_at >= d AND i.created_at < d + interval '1 day')) ORDER BY d), '[]'::jsonb) FROM generate_series(p_start::timestamptz,p_end::timestamptz,interval '1 day') d),
    'search_console_imports', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'source_type',source_type,'coverage_start',coverage_start,'coverage_end',coverage_end,'original_filename',original_filename,'row_count',row_count,'imported_at',imported_at) ORDER BY imported_at DESC),'[]'::jsonb) FROM public.intools_search_console_imports)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION public.intools_set_rfq_quote_total(p_quote_id uuid, p_quote_total_cents integer)
RETURNS public.rfq_quotes LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_quote public.rfq_quotes;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_quote_total_cents IS NULL OR p_quote_total_cents <= 0 THEN RAISE EXCEPTION 'Quote total must be positive' USING ERRCODE='22023'; END IF;
  UPDATE public.rfq_quotes SET quote_total_cents=p_quote_total_cents WHERE id=p_quote_id AND status='draft' RETURNING * INTO v_quote;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found or no longer editable' USING ERRCODE='42501'; END IF;
  RETURN v_quote;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_list_rfq_quotes(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id, 'status', q.status, 'unit_price_cents', q.unit_price_cents,
    'quote_total_cents', q.quote_total_cents, 'moq', q.moq,
    'lead_time_days', q.lead_time_days, 'certifications', to_jsonb(q.certifications),
    'certification_note', q.certification_note, 'recommended', q.recommended,
    'notes', q.notes, 'selected_at', q.selected_at, 'factory_id', f.id,
    'factory_name', f.name, 'factory_region', f.region
  ) ORDER BY q.updated_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.rfq_quotes q JOIN public.factories f ON f.id = q.factory_id
  WHERE q.rfq_case_id = p_case_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.intools_import_search_console_csv(text,text,jsonb,jsonb,date,date), public.intools_get_analytics_overview(date,date), public.intools_set_rfq_quote_total(uuid,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intools_list_rfq_quotes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_import_search_console_csv(text,text,jsonb,jsonb,date,date), public.intools_get_analytics_overview(date,date), public.intools_set_rfq_quote_total(uuid,integer), public.intools_list_rfq_quotes(uuid) TO authenticated;
