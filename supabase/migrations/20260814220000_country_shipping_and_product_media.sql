-- Country shipping configured in Intools and ordered PDP media.

CREATE TABLE IF NOT EXISTS public.country_shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  country_name text NOT NULL,
  service_name text NOT NULL,
  flat_rate_usd numeric(12,2) NOT NULL,
  eta_min_days integer NOT NULL,
  eta_max_days integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT country_shipping_rates_code_check CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT country_shipping_rates_name_check CHECK (btrim(country_name) <> ''),
  CONSTRAINT country_shipping_rates_service_check CHECK (btrim(service_name) <> ''),
  CONSTRAINT country_shipping_rates_price_check CHECK (flat_rate_usd >= 0),
  CONSTRAINT country_shipping_rates_eta_check CHECK (eta_min_days >= 0 AND eta_max_days >= eta_min_days),
  CONSTRAINT country_shipping_rates_code_key UNIQUE (country_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS country_shipping_rates_name_key
  ON public.country_shipping_rates (lower(btrim(country_name)));
CREATE INDEX IF NOT EXISTS country_shipping_rates_active_idx
  ON public.country_shipping_rates (country_name)
  WHERE is_active AND archived_at IS NULL;

ALTER TABLE public.country_shipping_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.country_shipping_rates FROM anon, authenticated;

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_target_table_check,
  ADD CONSTRAINT admin_audit_log_target_table_check CHECK (
    target_table IN ('factories','products','content_pages','widget_instances','intools_media_assets','country_shipping_rates')
  );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_rate_id uuid REFERENCES public.country_shipping_rates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipping_eta_min_days integer,
  ADD COLUMN IF NOT EXISTS shipping_eta_max_days integer;

CREATE OR REPLACE FUNCTION public.public_list_shipping_rates()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'country_code',rate.country_code,
    'country_name',rate.country_name,
    'service_name',rate.service_name,
    'flat_rate_usd',rate.flat_rate_usd,
    'eta_min_days',rate.eta_min_days,
    'eta_max_days',rate.eta_max_days
  ) ORDER BY rate.country_name),'[]'::jsonb)
  FROM public.country_shipping_rates rate
  WHERE rate.is_active AND rate.archived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.public_shipping_quote(p_country text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_rate public.country_shipping_rates;
BEGIN
  IF btrim(COALESCE(p_country,''))='' THEN
    RAISE EXCEPTION 'Choose a delivery country first' USING ERRCODE='22023';
  END IF;
  SELECT rate.* INTO v_rate
  FROM public.country_shipping_rates rate
  WHERE rate.is_active AND rate.archived_at IS NULL
    AND lower(btrim(p_country)) IN (lower(rate.country_code),lower(btrim(rate.country_name)))
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'id',NULL,
      'country_code',NULL,
      'country_name',btrim(p_country),
      'service_name','Standard shipping',
      'flat_rate_usd',10.00,
      'eta_min_days',NULL,
      'eta_max_days',NULL,
      'is_default',true
    );
  END IF;
  RETURN jsonb_build_object(
    'id',v_rate.id,
    'country_code',v_rate.country_code,
    'country_name',v_rate.country_name,
    'service_name',v_rate.service_name,
    'flat_rate_usd',v_rate.flat_rate_usd,
    'eta_min_days',v_rate.eta_min_days,
    'eta_max_days',v_rate.eta_max_days,
    'is_default',false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_list_shipping_rates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(rate) ORDER BY rate.country_name),'[]'::jsonb)
    INTO v_result
  FROM public.country_shipping_rates rate;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_save_shipping_rate(
  p_rate_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate public.country_shipping_rates;
  v_unknown text[];
  v_code text := upper(btrim(p_payload->>'country_code'));
  v_name text := btrim(p_payload->>'country_name');
  v_service text := btrim(p_payload->>'service_name');
BEGIN
  PERFORM public.intools_require_admin();
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'shipping rate payload must be an object' USING ERRCODE='22023'; END IF;
  SELECT array_agg(key) INTO v_unknown FROM jsonb_object_keys(p_payload) fields(key)
    WHERE key <> ALL (ARRAY['country_code','country_name','service_name','flat_rate_usd','eta_min_days','eta_max_days','is_active']);
  IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'unsupported shipping fields: %',v_unknown USING ERRCODE='22023'; END IF;
  IF v_code !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'country code must contain two letters' USING ERRCODE='22023'; END IF;
  IF v_name='' OR v_service='' THEN RAISE EXCEPTION 'country and service names are required' USING ERRCODE='22023'; END IF;
  IF COALESCE((p_payload->>'flat_rate_usd')::numeric,-1)<0 THEN RAISE EXCEPTION 'flat shipping rate must be zero or greater' USING ERRCODE='22023'; END IF;
  IF COALESCE((p_payload->>'eta_min_days')::integer,-1)<0 OR (p_payload->>'eta_max_days')::integer<(p_payload->>'eta_min_days')::integer THEN
    RAISE EXCEPTION 'delivery estimate must be a valid day range' USING ERRCODE='22023';
  END IF;

  IF p_rate_id IS NULL THEN
    INSERT INTO public.country_shipping_rates(country_code,country_name,service_name,flat_rate_usd,eta_min_days,eta_max_days,is_active,created_by,updated_by)
    VALUES(v_code,v_name,v_service,(p_payload->>'flat_rate_usd')::numeric,(p_payload->>'eta_min_days')::integer,(p_payload->>'eta_max_days')::integer,COALESCE((p_payload->>'is_active')::boolean,true),auth.uid(),auth.uid())
    RETURNING * INTO v_rate;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    VALUES(auth.uid(),'country_shipping_rates',v_rate.id,'create','Created shipping rate for '||v_rate.country_name);
  ELSE
    UPDATE public.country_shipping_rates rate SET
      country_code=v_code,country_name=v_name,service_name=v_service,
      flat_rate_usd=(p_payload->>'flat_rate_usd')::numeric,
      eta_min_days=(p_payload->>'eta_min_days')::integer,
      eta_max_days=(p_payload->>'eta_max_days')::integer,
      is_active=COALESCE((p_payload->>'is_active')::boolean,rate.is_active),
      updated_at=now(),updated_by=auth.uid()
    WHERE rate.id=p_rate_id AND rate.updated_at=p_expected_updated_at
    RETURNING rate.* INTO v_rate;
    IF NOT FOUND THEN RAISE EXCEPTION 'shipping rate conflict or not found' USING ERRCODE='40001'; END IF;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    VALUES(auth.uid(),'country_shipping_rates',v_rate.id,'update','Updated shipping rate for '||v_rate.country_name);
  END IF;
  RETURN to_jsonb(v_rate);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_archive_shipping_rate(
  p_rate_id uuid,
  p_expected_updated_at timestamptz,
  p_restore boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_rate public.country_shipping_rates; v_action text := CASE WHEN p_restore THEN 'restore' ELSE 'archive' END;
BEGIN
  PERFORM public.intools_require_admin();
  UPDATE public.country_shipping_rates rate SET
    archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,
    is_active=p_restore,
    updated_at=now(),updated_by=auth.uid()
  WHERE rate.id=p_rate_id AND rate.updated_at=p_expected_updated_at
  RETURNING rate.* INTO v_rate;
  IF NOT FOUND THEN RAISE EXCEPTION 'shipping rate conflict or not found' USING ERRCODE='40001'; END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
  VALUES(auth.uid(),'country_shipping_rates',v_rate.id,v_action,initcap(v_action)||'d shipping rate for '||v_rate.country_name);
  RETURN to_jsonb(v_rate);
END;
$$;

-- Keep product.images ordered. The first image is the public card image and
-- the PDP's initial hero/first thumbnail.
CREATE OR REPLACE FUNCTION public.intools_save_product_with_images(
  p_product_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_saved jsonb;
  v_product public.products;
  v_payload jsonb := p_payload;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_payload ? 'images' THEN
    IF jsonb_typeof(p_payload->'images')<>'array' THEN RAISE EXCEPTION 'images must be an ordered array' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_payload->'images') image(url) WHERE btrim(image.url)='') THEN
      RAISE EXCEPTION 'image URLs cannot be empty' USING ERRCODE='22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements_text(p_payload->'images')) <> (SELECT count(DISTINCT image.url) FROM jsonb_array_elements_text(p_payload->'images') image(url)) THEN
      RAISE EXCEPTION 'product images cannot contain duplicates' USING ERRCODE='22023';
    END IF;
    v_payload := (p_payload - 'images') || jsonb_build_object('img',p_payload->'images'->>0);
  END IF;

  v_saved := public.intools_save_product(p_product_id,v_payload,p_expected_updated_at);
  IF p_payload ? 'images' THEN
    UPDATE public.products product SET
      images=ARRAY(SELECT image.url FROM jsonb_array_elements_text(p_payload->'images') WITH ORDINALITY image(url,position) ORDER BY image.position),
      img=p_payload->'images'->>0
    WHERE product.id=(v_saved->>'id')::uuid
    RETURNING product.* INTO v_product;
    RETURN to_jsonb(v_product);
  END IF;
  RETURN v_saved;
END;
$$;

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

  INSERT INTO public.orders(order_no,buyer_profile_id,status,subtotal,fee,ship,qc_fee,ins_fee,total,ship_country,ship_address,incoterms,notes,placed_at,shipping_rate_id,shipping_service,shipping_eta_min_days,shipping_eta_max_days)
  VALUES(v_order_no,v_buyer,'awaiting_payment',v_subtotal,v_fee,v_ship,v_qc_fee,v_ins_fee,v_total,COALESCE(v_rate.country_name,btrim(p_ship_country)),p_ship_address,p_incoterms,p_notes,now(),v_rate.id,COALESCE(v_rate.service_name,'Standard shipping'),v_rate.eta_min_days,v_rate.eta_max_days)
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
  RETURN v_order_no;
END;
$$;

REVOKE ALL ON FUNCTION public.public_list_shipping_rates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_shipping_quote(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_list_shipping_rates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_save_shipping_rate(uuid,jsonb,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_archive_shipping_rate(uuid,timestamptz,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_save_product_with_images(uuid,jsonb,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(text,text,text,text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_shipping_rates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_shipping_quote(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_shipping_rates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_save_shipping_rate(uuid,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_archive_shipping_rate(uuid,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_save_product_with_images(uuid,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,text,text,boolean,boolean) TO authenticated;
