-- Expose the invoice's originating RFQ case to the buyer workspace so the
-- Requests table can flag "next step owner: You" for a case with an unpaid
-- invoice, without adding a new RPC. Additive: same signature and RLS as the
-- existing workspace_list_invoices/workspace_get_invoice_detail functions.

CREATE OR REPLACE FUNCTION public.workspace_list_invoices()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
    SELECT i.id,i.invoice_no,i.status::text,CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END AS effective_status,i.currency,i.total_cents,
      i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS balance_cents,
      i.due_date,i.created_at,i.rfq_case_id
    FROM public.invoices i WHERE i.buyer_profile_id=auth.uid()
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.workspace_get_invoice_detail(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',i.id,'invoice_no',i.invoice_no,'status',i.status::text,'effective_status',CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END,
    'currency',i.currency,'subtotal_cents',i.subtotal_cents,'tax_cents',i.tax_cents,'total_cents',i.total_cents,
    'paid_cents',COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),
    'balance_cents',i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),
    'due_date',i.due_date,'notes',i.notes,'created_at',i.created_at,'rfq_case_id',i.rfq_case_id,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('description',it.description,'quantity',it.quantity,'unit_amount_cents',it.unit_amount_cents,'tax_amount_cents',it.tax_amount_cents,'line_total_cents',it.line_total_cents) ORDER BY it.position) FROM public.invoice_items it WHERE it.invoice_id=i.id),'[]'::jsonb),
    'payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',p.provider,'reference',p.provider_reference,'amount_cents',a.amount_cents,'recorded_at',p.recorded_at) ORDER BY p.recorded_at DESC) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),'[]'::jsonb)
  ) INTO v_result FROM public.invoices i WHERE i.id=p_invoice_id AND i.buyer_profile_id=auth.uid();
  IF v_result IS NULL THEN RAISE EXCEPTION 'invoice not found' USING ERRCODE='P0002'; END IF;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.workspace_list_invoices(), public.workspace_get_invoice_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_list_invoices(), public.workspace_get_invoice_detail(uuid) TO authenticated;
