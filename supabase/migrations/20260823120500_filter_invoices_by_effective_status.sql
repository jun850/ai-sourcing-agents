-- `overdue` is a read-time effective state, not a stored invoice state.
CREATE OR REPLACE FUNCTION public.intools_list_invoices(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_status IS NOT NULL AND p_status NOT IN ('draft','sent','paid','cancelled','overdue') THEN RAISE EXCEPTION 'invalid invoice status filter' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_result FROM (
    SELECT i.id,i.invoice_no,i.status::text,i.currency,i.subtotal_cents,i.tax_cents,i.total_cents,
      COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS paid_cents,
      i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS balance_cents,
      i.due_date,CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END AS effective_status,
      coalesce(pr.company_name,pr.full_name) AS buyer_name,u.email::text AS buyer_email,r.case_no AS rfq_case_no,o.order_no,i.created_at,i.updated_at
    FROM public.invoices i JOIN public.profiles pr ON pr.id=i.buyer_profile_id JOIN auth.users u ON u.id=i.buyer_profile_id
    LEFT JOIN public.rfq_cases r ON r.id=i.rfq_case_id LEFT JOIN public.orders o ON o.id=i.order_id
  ) x WHERE p_status IS NULL OR x.effective_status=p_status;
  RETURN v_result;
END; $$;
