-- Distinguish "ops pulled this quote before any buyer decision" from
-- "buyer picked a different quote" — both used the same 'declined' status,
-- which meant an ops-withdrawn quote (freeing a slot under the 3-quote cap)
-- would still show up as a fourth, dimmed card on the buyer's Quotes tab.
-- 'withdrawn' quotes are excluded from workspace_list_rfq_quotes entirely;
-- 'declined' (buyer chose a sibling) still renders, dimmed, as before.

ALTER TABLE public.rfq_quotes DROP CONSTRAINT IF EXISTS rfq_quotes_status_check;
ALTER TABLE public.rfq_quotes ADD CONSTRAINT rfq_quotes_status_check
  CHECK (status IN ('draft','published','selected','declined','withdrawn'));

CREATE OR REPLACE FUNCTION public.intools_decline_rfq_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_quote public.rfq_quotes;
BEGIN
  PERFORM public.intools_require_admin();
  UPDATE public.rfq_quotes SET status='withdrawn' WHERE id=p_quote_id AND status='published' RETURNING * INTO v_quote;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found or not published' USING ERRCODE='42501'; END IF;
  RETURN to_jsonb(v_quote);
END;
$$;
