-- Expose the invoice's originating order to the buyer workspace so the
-- sourced-product detail page can offer a "Pay invoice" action without a
-- new RPC, mirroring how 20260825090000 exposed rfq_case_id for the same
-- purpose on the Requests table. Additive: same signature and RLS as the
-- existing workspace_list_invoices function.

CREATE OR REPLACE FUNCTION public.workspace_list_invoices()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
    SELECT i.id,i.invoice_no,i.status::text,CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END AS effective_status,i.currency,i.total_cents,
      i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS balance_cents,
      i.due_date,i.created_at,i.rfq_case_id,i.order_id
    FROM public.invoices i WHERE i.buyer_profile_id=auth.uid()
  ) x;
$$;
