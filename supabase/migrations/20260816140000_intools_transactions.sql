-- ============================================================================
-- ARCANA — Intools transaction management RPCs
-- Admin-gated read-only views for the Transactions tab in the intools SPA.
-- Status updates reuse the existing admin_update_order_status RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- intools_list_orders — all orders with buyer info and item counts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intools_list_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.placed_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      o.id,
      o.order_no,
      o.status::text AS status,
      COALESCE(p.company_name, p.full_name) AS buyer_name,
      u.email::text AS buyer_email,
      p.company_name AS buyer_company,
      (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count,
      o.subtotal,
      o.fee,
      o.ship,
      o.qc_fee,
      o.ins_fee,
      o.total,
      o.ship_country,
      o.ship_address,
      o.shipping_service,
      o.shipping_eta_min_days,
      o.shipping_eta_max_days,
      o.placed_at,
      o.payment_declared_at,
      o.payment_verified_at
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.buyer_profile_id
    JOIN auth.users u ON u.id = o.buyer_profile_id
  ) t;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_list_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_list_orders() TO authenticated;

-- ---------------------------------------------------------------------------
-- intools_get_order_detail — full order with items, fulfillments, events
-- ---------------------------------------------------------------------------
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
