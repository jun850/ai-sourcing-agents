-- ============================================================================
-- ARCANA — 0004 checkout RPCs (SECURITY DEFINER)
-- place_order + declare_payment. Both pin search_path = '' and are the ONLY
-- write paths into orders / order_items / order_fulfillments / status events.
-- Money is ALWAYS recomputed server-side; the client never supplies amounts.
-- ============================================================================

-- Sequence backing the human-readable order number (ARC-YYMMDD-NNNN).
CREATE SEQUENCE IF NOT EXISTS public.order_no_seq;

-- ---------------------------------------------------------------------------
-- place_order — converts the caller's cart into an order, clears the cart,
-- and returns the generated order_no.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order(
  p_ship_country text,
  p_ship_address text,
  p_incoterms    text,
  p_notes        text,
  p_qc           boolean DEFAULT false,
  p_insurance    boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_buyer     uuid := auth.uid();
  v_cart_id   uuid;
  v_subtotal  numeric(12,2) := 0;
  v_fee       numeric(12,2) := 0;
  v_ship      numeric(12,2) := 0;   -- PLACEHOLDER: shipping is a fixed 0 estimate.
                                     -- Replace with a real rate engine pre-launch.
                                     -- Never accept a client-supplied shipping amount.
  v_qc_fee    numeric(12,2) := 0;
  v_ins_fee   numeric(12,2) := 0;
  v_qc_rate   numeric;
  v_ins_rate  numeric;
  v_total     numeric(12,2);
  v_order_id  uuid;
  v_order_no  text;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Resolve the caller's cart and guard against empty checkout.
  SELECT id INTO v_cart_id FROM public.carts WHERE profile_id = v_buyer;
  IF v_cart_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart_id) THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;

  -- Quote-only items cannot be checked out (price must be negotiated first).
  IF EXISTS (
    SELECT 1 FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    WHERE ci.cart_id = v_cart_id AND p.pricing_mode = 'quote'
  ) THEN
    RAISE EXCEPTION 'cart contains quote-only items that cannot be checked out';
  END IF;

  -- Subtotal: for each line pick the price_break with the highest min_qty <= qty,
  -- else fall back to products.price. Computed entirely server-side.
  SELECT COALESCE(SUM(
    ci.qty * COALESCE(
      (SELECT pb.unit_price
         FROM public.price_breaks pb
        WHERE pb.product_id = ci.product_id
          AND pb.min_qty <= ci.qty
        ORDER BY pb.min_qty DESC
        LIMIT 1),
      p.price)
  ), 0)
  INTO v_subtotal
  FROM public.cart_items ci
  JOIN public.products p ON p.id = ci.product_id
  WHERE ci.cart_id = v_cart_id;

  -- Money model (mirrors js/data.js ARCANA_addonRates). Recompute, never trust client.
  v_fee := round(v_subtotal * 0.05, 2);
  IF v_subtotal < 1000 THEN
    v_qc_rate  := 0.02;
    v_ins_rate := 0.01;
  ELSE
    v_qc_rate  := 0.01;
    v_ins_rate := 0.005;
  END IF;
  IF p_qc THEN
    v_qc_fee := round(v_subtotal * v_qc_rate, 2);
  END IF;
  IF p_insurance THEN
    v_ins_fee := round(v_subtotal * v_ins_rate, 2);
  END IF;
  v_total := v_subtotal + v_fee + v_ship + v_qc_fee + v_ins_fee;

  -- Human-readable order number.
  v_order_no := 'ARC-' || to_char(now(), 'YYMMDD') || '-'
                || lpad(nextval('public.order_no_seq')::text, 4, '0');

  -- Order header.
  INSERT INTO public.orders (
    order_no, buyer_profile_id, status,
    subtotal, fee, ship, qc_fee, ins_fee, total,
    ship_country, ship_address, incoterms, notes, placed_at
  ) VALUES (
    v_order_no, v_buyer, 'awaiting_payment',
    v_subtotal, v_fee, v_ship, v_qc_fee, v_ins_fee, v_total,
    p_ship_country, p_ship_address, p_incoterms, p_notes, now()
  )
  RETURNING id INTO v_order_id;

  -- Immutable line snapshots (sku / name / seller frozen at purchase time).
  INSERT INTO public.order_items (
    order_id, product_id, factory_id,
    sku_snapshot, name_snapshot, seller_snapshot,
    unit_price, qty, line_total
  )
  SELECT
    v_order_id, p.id, p.factory_id,
    p.sku, p.name, f.name,
    COALESCE(
      (SELECT pb.unit_price FROM public.price_breaks pb
        WHERE pb.product_id = ci.product_id AND pb.min_qty <= ci.qty
        ORDER BY pb.min_qty DESC LIMIT 1),
      p.price) AS unit_price,
    ci.qty,
    round(ci.qty * COALESCE(
      (SELECT pb.unit_price FROM public.price_breaks pb
        WHERE pb.product_id = ci.product_id AND pb.min_qty <= ci.qty
        ORDER BY pb.min_qty DESC LIMIT 1),
      p.price), 2) AS line_total
  FROM public.cart_items ci
  JOIN public.products p  ON p.id = ci.product_id
  JOIN public.factories f ON f.id = p.factory_id
  WHERE ci.cart_id = v_cart_id;

  -- One fulfillment row per distinct factory in the order.
  INSERT INTO public.order_fulfillments (order_id, factory_id)
  SELECT DISTINCT v_order_id, p.factory_id
  FROM public.cart_items ci
  JOIN public.products p ON p.id = ci.product_id
  WHERE ci.cart_id = v_cart_id;

  -- Initial audit event.
  INSERT INTO public.order_status_events (order_id, status, note, created_by)
  VALUES (v_order_id, 'awaiting_payment', 'Order placed', v_buyer);

  -- Clear the cart.
  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  RETURN v_order_no;
END;
$$;

-- ---------------------------------------------------------------------------
-- declare_payment — buyer signals they have transferred funds to escrow.
-- Only valid while the order is awaiting_payment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.declare_payment(p_order_no text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_status   public.order_status;
BEGIN
  SELECT id, status INTO v_order_id, v_status
  FROM public.orders
  WHERE order_no = p_order_no AND buyer_profile_id = auth.uid();

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF v_status <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'payment can only be declared while the order is awaiting payment';
  END IF;

  UPDATE public.orders
     SET status = 'payment_declared',
         payment_declared_at = now()
   WHERE id = v_order_id;

  INSERT INTO public.order_status_events (order_id, status, note, created_by)
  VALUES (v_order_id, 'payment_declared', 'Buyer declared payment', auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants — expose RPCs to authenticated users only. Definer rights bypass RLS.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.place_order(text, text, text, text, boolean, boolean) FROM public;
REVOKE ALL ON FUNCTION public.declare_payment(text) FROM public;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declare_payment(text) TO authenticated;
