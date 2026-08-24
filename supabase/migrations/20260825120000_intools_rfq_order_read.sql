-- Ops-side read of the order/fulfillment confirmed for an RFQ, so the
-- Intools RFQ review panel can show and update production stage after a
-- page reload without re-deriving it from intools_confirm_rfq_order's
-- one-time return value. Additive only.

CREATE OR REPLACE FUNCTION public.intools_get_rfq_order(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status::text, 'total', o.total, 'placed_at', o.placed_at,
    'production_stage', (SELECT ofl.production_stage FROM public.order_fulfillments ofl WHERE ofl.order_id = o.id LIMIT 1)
  ) INTO v_result
  FROM public.orders o WHERE o.rfq_case_id = p_case_id ORDER BY o.created_at DESC LIMIT 1;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_get_rfq_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_get_rfq_order(uuid) TO authenticated;
