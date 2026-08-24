-- Surface which supplier the buyer picked directly in the Intools RFQ list,
-- so ops can see "needs an order confirmed" at a glance instead of opening
-- every case to check.

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
    'selected_factory_name', (SELECT f.name FROM public.rfq_quotes q JOIN public.factories f ON f.id = q.factory_id WHERE q.rfq_case_id = c.id AND q.status = 'selected' ORDER BY q.selected_at DESC LIMIT 1),
    'has_unpaid_invoice', (SELECT EXISTS (SELECT 1 FROM public.invoices i WHERE i.rfq_case_id = c.id AND i.status = 'sent')),
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
