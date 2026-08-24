-- Cap published quotes per RFQ at 3 (matches the design's side-by-side
-- comparison, and keeps a buyer from ever facing an unbounded list) and let
-- the buyer see which supplier they picked outside the Quotes tab (Requests
-- table, workspace header) without a per-page N+1 fetch.

CREATE OR REPLACE FUNCTION public.intools_publish_rfq_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_quote public.rfq_quotes; v_case_id uuid; v_published_count integer;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT rfq_case_id INTO v_case_id FROM public.rfq_quotes WHERE id=p_quote_id AND status='draft';
  IF v_case_id IS NULL THEN RAISE EXCEPTION 'Quote not found or already published' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO v_published_count FROM public.rfq_quotes WHERE rfq_case_id=v_case_id AND status IN ('published','selected');
  IF v_published_count >= 3 THEN
    RAISE EXCEPTION 'This RFQ already has 3 published quotes — decline one before publishing another' USING ERRCODE='23514';
  END IF;
  UPDATE public.rfq_quotes SET status='published' WHERE id=p_quote_id AND status='draft' RETURNING * INTO v_quote;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found or already published' USING ERRCODE='42501'; END IF;
  UPDATE public.rfq_cases SET status='buyer_review', updated_at=now()
    WHERE id=v_quote.rfq_case_id AND status IN ('needs_research','awaiting_supplier','supplier_replied');
  RETURN to_jsonb(v_quote);
END;
$$;

-- Ops can also stand a published quote down (e.g. to make room under the
-- cap, or because terms fell through) without deleting the record.
CREATE OR REPLACE FUNCTION public.intools_decline_rfq_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_quote public.rfq_quotes;
BEGIN
  PERFORM public.intools_require_admin();
  UPDATE public.rfq_quotes SET status='declined' WHERE id=p_quote_id AND status='published' RETURNING * INTO v_quote;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found or not published' USING ERRCODE='42501'; END IF;
  RETURN to_jsonb(v_quote);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_list_selected_suppliers()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rfq_case_id', q.rfq_case_id, 'factory_name', f.name, 'factory_region', f.region
  )), '[]'::jsonb)
  FROM public.rfq_quotes q
  JOIN public.rfq_cases c ON c.id = q.rfq_case_id
  JOIN public.factories f ON f.id = q.factory_id
  WHERE c.buyer_profile_id = auth.uid() AND q.status = 'selected';
$$;

REVOKE ALL ON FUNCTION public.intools_decline_rfq_quote(uuid), public.workspace_list_selected_suppliers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_decline_rfq_quote(uuid), public.workspace_list_selected_suppliers() TO authenticated;
