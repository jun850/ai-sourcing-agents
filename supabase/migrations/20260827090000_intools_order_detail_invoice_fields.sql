-- Expose buyer_profile_id and rfq_case_id on intools_get_order_detail so the
-- Intools invoice-creation flow can auto-fill buyer/order/RFQ context from an
-- order instead of requiring the operator to paste raw UUIDs. Additive only;
-- same underlying join, just returning two more already-available columns.
CREATE OR REPLACE FUNCTION public.intools_get_order_detail(p_order_no text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();

  SELECT o.id INTO v_order_id
  FROM public.orders o WHERE o.order_no = p_order_no;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'id', o.id,
    'order_no', o.order_no,
    'status', o.status::text,
    'buyer_profile_id', o.buyer_profile_id,
    'rfq_case_id', o.rfq_case_id,
    'subtotal', o.subtotal,
    'fee', o.fee,
    'ship', o.ship,
    'qc_fee', o.qc_fee,
    'ins_fee', o.ins_fee,
    'total', o.total,
    'ship_country', o.ship_country,
    'ship_address', o.ship_address,
    'shipping_service', o.shipping_service,
    'shipping_eta_min_days', o.shipping_eta_min_days,
    'shipping_eta_max_days', o.shipping_eta_max_days,
    'incoterms', o.incoterms,
    'notes', o.notes,
    'placed_at', o.placed_at,
    'payment_declared_at', o.payment_declared_at,
    'payment_verified_at', o.payment_verified_at,
    'buyer', jsonb_build_object(
      'full_name', p.full_name,
      'email', u.email::text,
      'company_name', p.company_name,
      'country', p.country
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', oi.name_snapshot,
        'seller', oi.seller_snapshot,
        'sku', oi.sku_snapshot,
        'unit_price', oi.unit_price,
        'qty', oi.qty,
        'line_total', oi.line_total,
        'option_selection', oi.option_selection,
        'buyer_note', oi.buyer_note
      ) ORDER BY oi.created_at)
      FROM public.order_items oi WHERE oi.order_id = o.id
    ), '[]'::jsonb),
    'fulfillments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'factory_name', COALESCE(f.name, 'Unknown'),
        'fulfillment_status', of2.fulfillment_status::text,
        'tracking', of2.tracking
      ) ORDER BY of2.created_at)
      FROM public.order_fulfillments of2
      LEFT JOIN public.factories f ON f.id = of2.factory_id
      WHERE of2.order_id = o.id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'status', ev.status::text,
        'note', ev.note,
        'created_by_name', COALESCE(ep.full_name, 'System'),
        'created_at', ev.created_at
      ) ORDER BY ev.created_at DESC)
      FROM public.order_status_events ev
      LEFT JOIN public.profiles ep ON ep.id = ev.created_by
      WHERE ev.order_id = o.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.buyer_profile_id
  JOIN auth.users u ON u.id = o.buyer_profile_id
  WHERE o.id = v_order_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_get_order_detail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_get_order_detail(text) TO authenticated;
