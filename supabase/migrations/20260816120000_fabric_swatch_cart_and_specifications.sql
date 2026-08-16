-- Fabric swatches are purchasable samples of an existing public fabric. They
-- remain attached to that fabric so supplier assignment and order history stay
-- accurate, while the server—not browser code—enforces their flat $4 price.
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'product';

ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_line_type_check;
ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_line_type_check CHECK (line_type IN ('product','swatch'));

CREATE OR REPLACE FUNCTION public.cart_item_line_type_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.line_type='swatch' AND NOT EXISTS (
    SELECT 1
    FROM public.products product
    JOIN public.factories factory ON factory.id=product.factory_id
    WHERE product.id=NEW.product_id
      AND product.category='fabrics'
      AND product.listing_status='active'
      AND product.is_private=false
      AND product.archived_at IS NULL
      AND factory.verify_state='verified'
      AND factory.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'swatches are available only for public active fabrics' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cart_items_line_type_guard ON public.cart_items;
CREATE TRIGGER cart_items_line_type_guard
BEFORE INSERT OR UPDATE OF product_id,line_type ON public.cart_items
FOR EACH ROW EXECUTE FUNCTION public.cart_item_line_type_guard();

-- Normalise dimensions already captured in verified public specification text.
-- Values without explicit units remain untouched rather than being inferred.
WITH parsed AS (
  SELECT id,
    (regexp_match(spec,'(?i)(?:standard|width)[[:space:]:：]*([0-9]+(?:[.][0-9]+)?(?:[[:space:]]*(?:/|[-–])[[:space:]]*[0-9]+(?:[.][0-9]+)?)?)[[:space:]]*(?:cm|㎝)'))[1] AS width_cm,
    (regexp_match(spec,'(?i)[×x][[:space:]]*([0-9]+(?:[.][0-9]+)?)[[:space:]]*(?:m|mt|meter|meters)(?:[^a-z]|$)'))[1] AS length_m,
    (regexp_match(spec,'(?i)(?:industry[[:space:]]+)?weight[^0-9]{0,20}([0-9]+(?:[.][0-9]+)?)'))[1] AS weight_gsm
  FROM public.products
  WHERE category='fabrics'
    AND listing_status='active'
    AND is_private=false
    AND archived_at IS NULL
    AND spec IS NOT NULL
)
UPDATE public.products product
SET fabric_width=COALESCE(NULLIF(product.fabric_width,''),parsed.width_cm||' cm'),
    roll_length=COALESCE(NULLIF(product.roll_length,''),parsed.length_m||' m'),
    gsm=COALESCE(product.gsm,parsed.weight_gsm),
    updated_at=now()
FROM parsed
WHERE product.id=parsed.id
  AND (parsed.width_cm IS NOT NULL OR parsed.length_m IS NOT NULL OR parsed.weight_gsm IS NOT NULL);

CREATE OR REPLACE FUNCTION public.place_order(
  p_ship_country text,
  p_ship_address text,
  p_incoterms text,
  p_notes text,
  p_qc boolean DEFAULT false,
  p_insurance boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_buyer uuid := auth.uid();
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
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF btrim(COALESCE(p_ship_country,''))='' OR btrim(COALESCE(p_ship_address,''))='' THEN RAISE EXCEPTION 'delivery address is required'; END IF;
  SELECT rate.* INTO v_rate FROM public.country_shipping_rates rate
  WHERE rate.is_active AND rate.archived_at IS NULL
    AND lower(btrim(p_ship_country)) IN (lower(rate.country_code),lower(btrim(rate.country_name)))
  LIMIT 1;
  IF FOUND THEN v_ship:=v_rate.flat_rate_usd; END IF;

  SELECT id INTO v_cart_id FROM public.carts WHERE profile_id=v_buyer;
  IF v_cart_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id=v_cart_id) THEN RAISE EXCEPTION 'cart is empty'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.cart_items item JOIN public.products product ON product.id=item.product_id
    WHERE item.cart_id=v_cart_id AND item.line_type<>'swatch' AND product.pricing_mode='quote'
  ) THEN RAISE EXCEPTION 'cart contains quote-only items that cannot be checked out'; END IF;

  SELECT COALESCE(SUM(item.qty*CASE WHEN item.line_type='swatch' THEN 4.00 ELSE COALESCE((SELECT price_break.unit_price FROM public.price_breaks price_break WHERE price_break.product_id=item.product_id AND price_break.min_qty<=item.qty ORDER BY price_break.min_qty DESC LIMIT 1),product.price) END),0)
  INTO v_subtotal
  FROM public.cart_items item JOIN public.products product ON product.id=item.product_id
  WHERE item.cart_id=v_cart_id;
  v_fee:=round(v_subtotal*0.05,2);
  IF v_subtotal<1000 THEN v_qc_rate:=0.02;v_ins_rate:=0.01; ELSE v_qc_rate:=0.01;v_ins_rate:=0.005; END IF;
  IF p_qc THEN v_qc_fee:=round(v_subtotal*v_qc_rate,2); END IF;
  IF p_insurance THEN v_ins_fee:=round(v_subtotal*v_ins_rate,2); END IF;
  v_total:=v_subtotal+v_fee+v_ship+v_qc_fee+v_ins_fee;
  v_order_no:='ARC-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_no_seq')::text,4,'0');

  INSERT INTO public.orders(order_no,buyer_profile_id,status,subtotal,fee,ship,qc_fee,ins_fee,total,ship_country,ship_address,incoterms,notes,placed_at,shipping_rate_id,shipping_service,shipping_eta_min_days,shipping_eta_max_days)
  VALUES(v_order_no,v_buyer,'awaiting_payment',v_subtotal,v_fee,v_ship,v_qc_fee,v_ins_fee,v_total,COALESCE(v_rate.country_name,btrim(p_ship_country)),p_ship_address,p_incoterms,p_notes,now(),v_rate.id,COALESCE(v_rate.service_name,'Standard shipping'),v_rate.eta_min_days,v_rate.eta_max_days)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(order_id,product_id,factory_id,sku_snapshot,name_snapshot,seller_snapshot,unit_price,qty,line_total,option_selection)
  SELECT v_order_id,product.id,product.factory_id,
    CASE WHEN item.line_type='swatch' THEN product.sku||'-SWATCH' ELSE product.sku END,
    CASE WHEN item.line_type='swatch' THEN 'Swatch — '||product.name ELSE product.name END,
    factory.name,
    CASE WHEN item.line_type='swatch' THEN 4.00 ELSE COALESCE((SELECT price_break.unit_price FROM public.price_breaks price_break WHERE price_break.product_id=item.product_id AND price_break.min_qty<=item.qty ORDER BY price_break.min_qty DESC LIMIT 1),product.price) END,
    item.qty,
    round(item.qty*CASE WHEN item.line_type='swatch' THEN 4.00 ELSE COALESCE((SELECT price_break.unit_price FROM public.price_breaks price_break WHERE price_break.product_id=item.product_id AND price_break.min_qty<=item.qty ORDER BY price_break.min_qty DESC LIMIT 1),product.price) END,2),
    item.option_selection
  FROM public.cart_items item
  JOIN public.products product ON product.id=item.product_id
  JOIN public.factories factory ON factory.id=product.factory_id
  WHERE item.cart_id=v_cart_id;
  INSERT INTO public.order_fulfillments(order_id,factory_id)
  SELECT DISTINCT v_order_id,product.factory_id FROM public.cart_items item JOIN public.products product ON product.id=item.product_id WHERE item.cart_id=v_cart_id;
  INSERT INTO public.order_status_events(order_id,status,note,created_by) VALUES(v_order_id,'awaiting_payment','Order placed',v_buyer);
  DELETE FROM public.cart_items WHERE cart_id=v_cart_id;
  RETURN v_order_no;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(text,text,text,text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,text,text,boolean,boolean) TO authenticated;
