-- A payment path is fixed when an order is created. Changing the Intools
-- setting must not change how an already-created order can be paid.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_path text NOT NULL DEFAULT 'bank_transfer'
  CHECK (payment_path IN ('bank_transfer', 'stripe'));

-- Retire the client-supplied delivery-address RPC. The replacement snapshots a
-- saved address owned by the authenticated buyer before it clears the cart.
DROP FUNCTION IF EXISTS public.place_order(text, text, text, text, boolean, boolean);

CREATE FUNCTION public.place_order(
  p_address_id uuid,
  p_notes text DEFAULT NULL,
  p_qc boolean DEFAULT false,
  p_insurance boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_buyer uuid := auth.uid();
  v_address public.addresses;
  v_cart_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_fee numeric(12,2) := 0;
  v_ship numeric(12,2) := 10.00;
  v_qc_fee numeric(12,2) := 0;
  v_ins_fee numeric(12,2) := 0;
  v_qc_rate numeric;
  v_ins_rate numeric;
  v_total numeric(12,2);
  v_order_id uuid;
  v_order_no text;
  v_rate public.country_shipping_rates;
  v_payment_path text := 'bank_transfer';
  v_ship_address text;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_address_id IS NULL THEN RAISE EXCEPTION 'delivery address is required'; END IF;

  SELECT address.* INTO v_address
  FROM public.addresses address
  WHERE address.id=p_address_id AND address.profile_id=v_buyer;
  IF NOT FOUND THEN RAISE EXCEPTION 'select a saved delivery address'; END IF;

  SELECT rate.* INTO v_rate FROM public.country_shipping_rates rate
  WHERE rate.is_active AND rate.archived_at IS NULL
    AND lower(btrim(v_address.country)) IN (lower(rate.country_code),lower(btrim(rate.country_name)))
  LIMIT 1;
  IF FOUND THEN v_ship:=v_rate.flat_rate_usd; END IF;

  SELECT CASE WHEN value='true' THEN 'stripe' ELSE 'bank_transfer' END
    INTO v_payment_path
  FROM public.platform_settings WHERE key='stripe_checkout_enabled';
  v_payment_path:=COALESCE(v_payment_path,'bank_transfer');

  SELECT id INTO v_cart_id FROM public.carts WHERE profile_id=v_buyer;
  IF v_cart_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id=v_cart_id) THEN RAISE EXCEPTION 'cart is empty'; END IF;
  IF EXISTS (SELECT 1 FROM public.cart_items ci JOIN public.products p ON p.id=ci.product_id WHERE ci.cart_id=v_cart_id AND p.pricing_mode='quote') THEN
    RAISE EXCEPTION 'cart contains quote-only items that cannot be checked out';
  END IF;

  SELECT COALESCE(SUM(ci.qty*COALESCE((SELECT pb.unit_price FROM public.price_breaks pb WHERE pb.product_id=ci.product_id AND pb.min_qty<=ci.qty ORDER BY pb.min_qty DESC LIMIT 1),p.price)),0)
    INTO v_subtotal FROM public.cart_items ci JOIN public.products p ON p.id=ci.product_id WHERE ci.cart_id=v_cart_id;
  v_fee:=round(v_subtotal*0.05,2);
  IF v_subtotal<1000 THEN v_qc_rate:=0.02;v_ins_rate:=0.01; ELSE v_qc_rate:=0.01;v_ins_rate:=0.005; END IF;
  IF p_qc THEN v_qc_fee:=round(v_subtotal*v_qc_rate,2); END IF;
  IF p_insurance THEN v_ins_fee:=round(v_subtotal*v_ins_rate,2); END IF;
  v_total:=v_subtotal+v_fee+v_ship+v_qc_fee+v_ins_fee;
  v_order_no:='ARC-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_no_seq')::text,4,'0');
  v_ship_address:=concat_ws(' · ', NULLIF(btrim(v_address.recipient_name),''), NULLIF(btrim(v_address.phone),''), concat_ws(', ', NULLIF(btrim(v_address.line1),''), NULLIF(btrim(v_address.line2),''), NULLIF(btrim(v_address.city),''), NULLIF(btrim(v_address.province),''), NULLIF(btrim(v_address.postal_code),''), NULLIF(btrim(v_address.country),'')));

  INSERT INTO public.orders(order_no,buyer_profile_id,status,payment_path,subtotal,fee,ship,qc_fee,ins_fee,total,ship_country,ship_address,incoterms,notes,placed_at,shipping_rate_id,shipping_service,shipping_eta_min_days,shipping_eta_max_days)
  VALUES(v_order_no,v_buyer,'awaiting_payment',v_payment_path,v_subtotal,v_fee,v_ship,v_qc_fee,v_ins_fee,v_total,v_address.country,v_ship_address,NULL,p_notes,now(),v_rate.id,COALESCE(v_rate.service_name,'Standard shipping'),v_rate.eta_min_days,v_rate.eta_max_days)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(order_id,product_id,factory_id,sku_snapshot,name_snapshot,seller_snapshot,unit_price,qty,line_total,option_selection)
  SELECT v_order_id,p.id,p.factory_id,p.sku,p.name,f.name,
    COALESCE((SELECT pb.unit_price FROM public.price_breaks pb WHERE pb.product_id=ci.product_id AND pb.min_qty<=ci.qty ORDER BY pb.min_qty DESC LIMIT 1),p.price),
    ci.qty,round(ci.qty*COALESCE((SELECT pb.unit_price FROM public.price_breaks pb WHERE pb.product_id=ci.product_id AND pb.min_qty<=ci.qty ORDER BY pb.min_qty DESC LIMIT 1),p.price),2),ci.option_selection
  FROM public.cart_items ci JOIN public.products p ON p.id=ci.product_id JOIN public.factories f ON f.id=p.factory_id WHERE ci.cart_id=v_cart_id;
  INSERT INTO public.order_fulfillments(order_id,factory_id)
  SELECT DISTINCT v_order_id,p.factory_id FROM public.cart_items ci JOIN public.products p ON p.id=ci.product_id WHERE ci.cart_id=v_cart_id;
  INSERT INTO public.order_status_events(order_id,status,note,created_by) VALUES(v_order_id,'awaiting_payment','Order placed',v_buyer);
  DELETE FROM public.cart_items WHERE cart_id=v_cart_id;
  RETURN jsonb_build_object('order_no',v_order_no,'payment_path',v_payment_path);
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(uuid,text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,boolean,boolean) TO authenticated;
