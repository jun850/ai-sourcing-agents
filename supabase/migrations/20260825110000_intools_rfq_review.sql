-- Ops-side reads for the new Intools "RFQ review" workflow. Additive only.
-- rfq_cases has no admin RLS policy (buyer-owned by design), so these read
-- through SECURITY DEFINER the same way every other intools_* function does.

CREATE OR REPLACE FUNCTION public.intools_list_rfq_cases(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'case_no', c.case_no, 'title', c.title, 'brief', c.brief, 'status', c.status,
    'buyer_name', COALESCE(pr.company_name, pr.full_name), 'buyer_email', u.email::text,
    'match_count', (SELECT count(*) FROM public.rfq_supplier_matches m WHERE m.rfq_case_id = c.id),
    'quote_count', (SELECT count(*) FROM public.rfq_quotes q WHERE q.rfq_case_id = c.id AND q.status <> 'draft'),
    'submitted_at', c.submitted_at, 'created_at', c.created_at, 'updated_at', c.updated_at
  ) ORDER BY c.updated_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.rfq_cases c
  JOIN public.profiles pr ON pr.id = c.buyer_profile_id
  JOIN auth.users u ON u.id = c.buyer_profile_id
  WHERE c.source = 'workspace' AND (p_status IS NULL OR c.status = p_status);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_list_rfq_quotes(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id, 'status', q.status, 'unit_price_cents', q.unit_price_cents, 'moq', q.moq,
    'lead_time_days', q.lead_time_days, 'certifications', to_jsonb(q.certifications),
    'certification_note', q.certification_note, 'recommended', q.recommended, 'notes', q.notes,
    'selected_at', q.selected_at, 'factory_id', f.id, 'factory_name', f.name, 'factory_region', f.region
  ) ORDER BY q.updated_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.rfq_quotes q JOIN public.factories f ON f.id = q.factory_id
  WHERE q.rfq_case_id = p_case_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_list_rfq_cases(text), public.intools_list_rfq_quotes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_list_rfq_cases(text), public.intools_list_rfq_quotes(uuid) TO authenticated;
