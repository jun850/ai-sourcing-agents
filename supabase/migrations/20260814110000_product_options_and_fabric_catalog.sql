-- Atelix — generic buyer-selectable product options and August fabric catalog.
-- Keeps product_variants.colorway populated for compatibility with older clients.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS option_selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS line_key text;

UPDATE public.cart_items item
SET line_key=product.sku
FROM public.products product
WHERE item.product_id=product.id AND item.line_key IS NULL;
ALTER TABLE public.cart_items ALTER COLUMN line_key SET NOT NULL;
ALTER TABLE public.cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_product_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_line_key
  ON public.cart_items(cart_id,line_key);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS option_selection jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS option_name text NOT NULL DEFAULT 'Color',
  ADD COLUMN IF NOT EXISTS option_value text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE public.product_variants
SET option_value = colorway
WHERE option_value IS NULL;

ALTER TABLE public.product_variants
  ALTER COLUMN option_value SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_option_value_key
  ON public.product_variants(product_id, option_name, option_value);

-- Preserve the deployed Intools implementation and wrap it with the new fields.
DO $$
BEGIN
  IF to_regprocedure('public.intools_save_product_legacy(uuid,jsonb,timestamptz)') IS NULL THEN
    ALTER FUNCTION public.intools_save_product(uuid,jsonb,timestamptz)
      RENAME TO intools_save_product_legacy;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.intools_save_product(
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
  v_result jsonb;
  v_product_id uuid;
  v_group jsonb;
  v_value text;
  v_group_order integer := 0;
  v_value_order integer;
  v_name text;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_payload ? 'images' AND jsonb_typeof(p_payload->'images') <> 'array' THEN
    RAISE EXCEPTION 'images must be an array' USING ERRCODE='22023';
  END IF;
  IF p_payload ? 'variants' AND jsonb_typeof(p_payload->'variants') <> 'array' THEN
    RAISE EXCEPTION 'variants must be an array' USING ERRCODE='22023';
  END IF;

  v_result := public.intools_save_product_legacy(
    p_product_id,
    p_payload - 'images' - 'variants',
    p_expected_updated_at
  );
  v_product_id := (v_result->>'id')::uuid;

  IF p_payload ? 'images' THEN
    UPDATE public.products
    SET images = ARRAY(
      SELECT btrim(value)
      FROM jsonb_array_elements_text(p_payload->'images') AS image_values(value)
      WHERE btrim(value) <> ''
    )
    WHERE id = v_product_id;
  END IF;

  IF p_payload ? 'variants' THEN
    DELETE FROM public.product_variants WHERE product_id = v_product_id;
    FOR v_group IN SELECT value FROM jsonb_array_elements(p_payload->'variants')
    LOOP
      v_group_order := v_group_order + 1;
      IF jsonb_typeof(v_group) = 'string' THEN
        v_name := 'Color';
        v_value := btrim(v_group #>> '{}');
        IF v_value <> '' AND lower(v_value) <> 'default' THEN
          INSERT INTO public.product_variants(product_id,colorway,option_name,option_value,sort_order)
          VALUES(v_product_id,v_value,v_name,v_value,v_group_order)
          ON CONFLICT (product_id,option_name,option_value) DO NOTHING;
        END IF;
      ELSIF jsonb_typeof(v_group) = 'object' THEN
        v_name := btrim(v_group->>'name');
        IF v_name = '' OR jsonb_typeof(v_group->'values') <> 'array' THEN
          RAISE EXCEPTION 'each variant group needs a name and values array' USING ERRCODE='22023';
        END IF;
        v_value_order := 0;
        FOR v_value IN SELECT btrim(value) FROM jsonb_array_elements_text(v_group->'values') AS option_values(value)
        LOOP
          v_value_order := v_value_order + 1;
          IF v_value <> '' THEN
            INSERT INTO public.product_variants(product_id,colorway,option_name,option_value,sort_order)
            VALUES(v_product_id,v_value,v_name,v_value,(v_group_order * 1000) + v_value_order)
            ON CONFLICT (product_id,option_name,option_value) DO NOTHING;
          END IF;
        END LOOP;
      ELSE
        RAISE EXCEPTION 'variants entries must be strings or option groups' USING ERRCODE='22023';
      END IF;
    END LOOP;
  END IF;

  SELECT to_jsonb(product) INTO v_result FROM public.products product WHERE product.id=v_product_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_list_products()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(p)||jsonb_build_object(
    'supplier_name',f.name,
    'price_breaks',COALESCE((SELECT jsonb_agg(jsonb_build_object('min_qty',pb.min_qty,'unit_price',pb.unit_price) ORDER BY pb.min_qty) FROM public.price_breaks pb WHERE pb.product_id=p.id),'[]'::jsonb),
    'variants',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',grouped.option_name,'values',grouped.option_values) ORDER BY grouped.group_order) FROM (
      SELECT variant.option_name,min(variant.sort_order) AS group_order,jsonb_agg(variant.option_value ORDER BY variant.sort_order,variant.created_at) AS option_values
      FROM public.product_variants variant WHERE variant.product_id=p.id GROUP BY variant.option_name
    ) grouped),'[]'::jsonb),
    'brand_emails',COALESCE((SELECT jsonb_agg(u.email ORDER BY u.email) FROM public.product_brand_assignments ba JOIN auth.users u ON u.id=ba.profile_id WHERE ba.product_id=p.id),'[]'::jsonb)
  ) ORDER BY p.updated_at DESC),'[]'::jsonb)
  INTO v_result FROM public.products p JOIN public.factories f ON f.id=p.factory_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.supplier_set_product_options(p_product_id uuid,p_options jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_group jsonb;
  v_value text;
  v_name text;
  v_group_order integer := 0;
  v_value_order integer;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF jsonb_typeof(p_options) <> 'array' THEN RAISE EXCEPTION 'options must be an array'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products product
    JOIN public.factories factory ON factory.id=product.factory_id
    JOIN public.profiles profile ON profile.id=auth.uid()
    WHERE product.id=p_product_id AND (factory.owner_profile_id=auth.uid() OR profile.role='admin')
  ) THEN RAISE EXCEPTION 'product not found or not owned by caller'; END IF;

  DELETE FROM public.product_variants WHERE product_id=p_product_id;
  FOR v_group IN SELECT value FROM jsonb_array_elements(p_options)
  LOOP
    v_group_order := v_group_order + 1;
    v_name := btrim(v_group->>'name');
    IF jsonb_typeof(v_group) <> 'object' OR v_name = '' OR jsonb_typeof(v_group->'values') <> 'array' THEN
      RAISE EXCEPTION 'each option needs a name and values array';
    END IF;
    v_value_order := 0;
    FOR v_value IN SELECT btrim(value) FROM jsonb_array_elements_text(v_group->'values') AS option_values(value)
    LOOP
      v_value_order := v_value_order + 1;
      IF v_value <> '' THEN
        INSERT INTO public.product_variants(product_id,colorway,option_name,option_value,sort_order)
        VALUES(p_product_id,v_value,v_name,v_value,(v_group_order * 1000) + v_value_order)
        ON CONFLICT (product_id,option_name,option_value) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name',grouped.option_name,'values',grouped.option_values) ORDER BY grouped.group_order),'[]'::jsonb)
  INTO v_result FROM (
    SELECT variant.option_name,min(variant.sort_order) AS group_order,jsonb_agg(variant.option_value ORDER BY variant.sort_order,variant.created_at) AS option_values
    FROM public.product_variants variant WHERE variant.product_id=p_product_id GROUP BY variant.option_name
  ) grouped;
  RETURN v_result;
END;
$$;

-- Snapshot the buyer's selected options with each immutable order line.
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
  v_ship numeric(12,2) := 0;
  v_qc_fee numeric(12,2) := 0;
  v_ins_fee numeric(12,2) := 0;
  v_qc_rate numeric;
  v_ins_rate numeric;
  v_total numeric(12,2);
  v_order_id uuid;
  v_order_no text;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id INTO v_cart_id FROM public.carts WHERE profile_id=v_buyer;
  IF v_cart_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id=v_cart_id) THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cart_items ci JOIN public.products p ON p.id=ci.product_id
    WHERE ci.cart_id=v_cart_id AND p.pricing_mode='quote'
  ) THEN RAISE EXCEPTION 'cart contains quote-only items that cannot be checked out'; END IF;

  SELECT COALESCE(SUM(ci.qty*COALESCE(
    (SELECT pb.unit_price FROM public.price_breaks pb WHERE pb.product_id=ci.product_id AND pb.min_qty<=ci.qty ORDER BY pb.min_qty DESC LIMIT 1),
    p.price
  )),0)
  INTO v_subtotal
  FROM public.cart_items ci JOIN public.products p ON p.id=ci.product_id
  WHERE ci.cart_id=v_cart_id;

  v_fee := round(v_subtotal*0.05,2);
  IF v_subtotal<1000 THEN v_qc_rate:=0.02;v_ins_rate:=0.01; ELSE v_qc_rate:=0.01;v_ins_rate:=0.005; END IF;
  IF p_qc THEN v_qc_fee:=round(v_subtotal*v_qc_rate,2); END IF;
  IF p_insurance THEN v_ins_fee:=round(v_subtotal*v_ins_rate,2); END IF;
  v_total:=v_subtotal+v_fee+v_ship+v_qc_fee+v_ins_fee;
  v_order_no:='ARC-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_no_seq')::text,4,'0');

  INSERT INTO public.orders(order_no,buyer_profile_id,status,subtotal,fee,ship,qc_fee,ins_fee,total,ship_country,ship_address,incoterms,notes,placed_at)
  VALUES(v_order_no,v_buyer,'awaiting_payment',v_subtotal,v_fee,v_ship,v_qc_fee,v_ins_fee,v_total,p_ship_country,p_ship_address,p_incoterms,p_notes,now())
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(
    order_id,product_id,factory_id,sku_snapshot,name_snapshot,seller_snapshot,unit_price,qty,line_total,option_selection
  )
  SELECT v_order_id,p.id,p.factory_id,p.sku,p.name,f.name,
    COALESCE((SELECT pb.unit_price FROM public.price_breaks pb WHERE pb.product_id=ci.product_id AND pb.min_qty<=ci.qty ORDER BY pb.min_qty DESC LIMIT 1),p.price),
    ci.qty,
    round(ci.qty*COALESCE((SELECT pb.unit_price FROM public.price_breaks pb WHERE pb.product_id=ci.product_id AND pb.min_qty<=ci.qty ORDER BY pb.min_qty DESC LIMIT 1),p.price),2),
    ci.option_selection
  FROM public.cart_items ci
  JOIN public.products p ON p.id=ci.product_id
  JOIN public.factories f ON f.id=p.factory_id
  WHERE ci.cart_id=v_cart_id;

  INSERT INTO public.order_fulfillments(order_id,factory_id)
  SELECT DISTINCT v_order_id,p.factory_id FROM public.cart_items ci JOIN public.products p ON p.id=ci.product_id WHERE ci.cart_id=v_cart_id;
  INSERT INTO public.order_status_events(order_id,status,note,created_by)
  VALUES(v_order_id,'awaiting_payment','Order placed',v_buyer);
  DELETE FROM public.cart_items WHERE cart_id=v_cart_id;
  RETURN v_order_no;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_save_product(uuid,jsonb,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_list_products() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_set_product_options(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(text,text,text,text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_save_product(uuid,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_set_product_options(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,text,text,boolean,boolean) TO authenticated;

-- Workbook-backed products. Prices are per metre in USD; orders of 10 m or
-- less carry the source workbook fees documented in handling_notes.
INSERT INTO public.products
  (sku,name,description,comp,price,pricing_mode,unit_type,moq,factory_id,category,img,images,loc,listing_status,
   subcategory,applications,origin_country,lead_time,handling_notes,gsm,fabric_width,roll_length,style_code)
SELECT v.sku,v.name,v.description,v.comp,v.price,'fixed'::public.pricing_mode,'m'::public.unit_type,1,factory.id,
  'fabrics'::public.product_category,v.img,v.images,v.loc,'active'::public.listing_status,v.subcategory,
  'Multiple apparel types', 'Japan',v.lead_time,v.handling_notes,v.gsm,v.fabric_width,v.roll_length,v.style_code
FROM (VALUES
  ('FAB-140','RR8811 Summer Wool-Like Trousers','A thin, wool-like polyester textile suited to spring and summer trousers.','100% Polyester',5.71,'catalog/fabrics/rokal/1094299.jpg',ARRAY['catalog/fabrics/rokal/1094299.jpg','catalog/fabrics/rokal/1094299-3.jpg','catalog/fabrics/rokal/1094299-5.jpg']::text[],'Harajuku, Tokyo, Japan','polyester','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','130 GSM','145 cm','50 m','RR8811'),
  ('FAB-158','RR7702 CRAFTMAN NYLON OX','Produced in small batches by veteran dyeing craftspeople with close attention to texture, dyeing, and drying.','100% Nylon',8.53,'catalog/fabrics/rokal/1094302-1.jpg',ARRAY['catalog/fabrics/rokal/1094302-1.jpg','catalog/fabrics/rokal/1094302-4.jpg','catalog/fabrics/rokal/1094302-5.jpg']::text[],'Harajuku, Tokyo, Japan','polyester','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','120 GSM','110 cm','50 m','RR7702'),
  ('FAB-159','RM-0018-SG M-52 French Trousers Chino','Based on the French military M-52 trouser cloth and pigment dyed to develop a natural aged character.','100% Cotton',13.67,'catalog/fabrics/rokal/1094164-1.jpg',ARRAY['catalog/fabrics/rokal/1094164-1.jpg','catalog/fabrics/rokal/1094164-3.jpg','catalog/fabrics/rokal/fre.jpg']::text[],'Harajuku, Tokyo, Japan','cotton','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','270 GSM','145 cm','50 m','RM-0018-SG'),
  ('FAB-160','RR1062 T/C Drill','A drill textile woven from a cotton and polyester blend.','65% Polyester, 35% Cotton',9.79,'catalog/fabrics/rokal/1094249.jpg',ARRAY['catalog/fabrics/rokal/1094249.jpg','catalog/fabrics/rokal/1094249-1.jpg','catalog/fabrics/rokal/1094249-5.jpg']::text[],'Harajuku, Tokyo, Japan','cotton','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.',NULL,'148 cm','50 m','RR1062'),
  ('FAB-161','RM-0007 M65 Fishtail Shell Cloth','A reproduction of the classic M-65 fishtail parka shell cloth used by the U.S. military from 1965 through the 1990s.','70% Cotton, 30% Nylon',13.86,'catalog/fabrics/rokal/1094154-1.jpg',ARRAY['catalog/fabrics/rokal/1094154-1.jpg','catalog/fabrics/rokal/1094154-3.jpg','catalog/fabrics/rokal/1094154-5.jpg']::text[],'Harajuku, Tokyo, Japan','cotton','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','169 GSM','140 cm','50 m estimated','RM-0007'),
  ('FAB-162','RR8802-SEN Nylon Taffeta Soft Salt Shrink','A lightweight nylon taffeta with a softly salt-shrunk finish.','100% Nylon',9.41,'catalog/fabrics/rokal/1094252-1.jpg',ARRAY['catalog/fabrics/rokal/1094252-1.jpg','catalog/fabrics/rokal/1094252-3.jpg','catalog/fabrics/rokal/1094252-5.jpg']::text[],'Harajuku, Tokyo, Japan','polyester','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','90 GSM','130 cm','40 m','RR8802-SEN'),
  ('FAB-163','RECO-001 7.7oz Recycled Poly Denim Stretch','Recycled-polyester denim engineered to reduce dye, water, and energy loss at the raw-material dyeing stage, with SOLOTEX in the weft.','100% Recycled Polyester',11.29,'catalog/fabrics/rokal/1094131-1.jpg',ARRAY['catalog/fabrics/rokal/1094131-1.jpg','catalog/fabrics/rokal/1094131-3.jpg','catalog/fabrics/rokal/1094131-4.jpg']::text[],'Harajuku, Tokyo, Japan','denim','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','261 GSM','132 cm','50 m','RECO-001'),
  ('FAB-164','RECO-002 10.3oz Recycled Poly Denim Stretch','Stretch denim made with recycled polyester to reduce dye, water, and energy loss during raw-material dyeing.','100% Polyester',11.79,'catalog/fabrics/rokal/1094132-4.jpg',ARRAY['catalog/fabrics/rokal/1094132-4.jpg','catalog/fabrics/rokal/1094132-5.jpg','catalog/fabrics/rokal/1094132-6.jpg']::text[],'Harajuku, Tokyo, Japan','denim','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','349 GSM','127 cm','50 m','RECO-002'),
  ('FAB-165','RECO-003 10.2oz Recycled Poly Denim','Recycled-polyester denim using special spinning to reduce pilling and surface fuzz.','100% Polyester',12.04,'catalog/fabrics/rokal/1094306-1.jpg',ARRAY['catalog/fabrics/rokal/1094306-1.jpg','catalog/fabrics/rokal/1094306-5.jpg','catalog/fabrics/rokal/1094306-6.jpg']::text[],'Harajuku, Tokyo, Japan','denim','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','345 GSM','150 cm','50 m','RECO-003'),
  ('FAB-166','RECO-004 Organic Cotton Drill','Dense drill woven from thick Turkish organic cotton yarn and finished through a Kurashiki dyeing process.','100% Cotton',14.55,'catalog/fabrics/rokal/1094134-3.jpg',ARRAY['catalog/fabrics/rokal/1094134-3.jpg','catalog/fabrics/rokal/1094134-4.jpg','catalog/fabrics/rokal/1094134-6.jpg']::text[],'Harajuku, Tokyo, Japan','cotton','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','393 GSM',NULL,NULL,'RECO-004'),
  ('FAB-167','RECO-005 Organic Cotton Weather Cloth','GOTS-certified Turkish organic cotton weather cloth finished through a Kurashiki dyeing process.','100% Cotton',11.29,'catalog/fabrics/rokal/1094135-1.jpg',ARRAY['catalog/fabrics/rokal/1094135-1.jpg','catalog/fabrics/rokal/1094135-3.jpg','catalog/fabrics/rokal/1094135-6.jpg']::text[],'Harajuku, Tokyo, Japan','cotton','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','213 GSM','148 cm','50 m','RECO-005'),
  ('FAB-168','RECO-006 Organic Cotton Duck','High-density duck woven from thick GOTS-certified Turkish organic cotton yarn and finished through a Kurashiki dyeing process.','100% Cotton',14.36,'catalog/fabrics/rokal/1094136-1.jpg',ARRAY['catalog/fabrics/rokal/1094136-1.jpg','catalog/fabrics/rokal/1094136-1 (1).jpg','catalog/fabrics/rokal/1094136-6.jpg']::text[],'Harajuku, Tokyo, Japan','cotton','Stock status on request','For orders of 10 m or less, a US$12.54 cutting fee and US$6.27 small-order fee apply.','346 GSM','148 cm','50 m','RECO-006'),
  ('FAB-144','1099520 SUPIMA-Like Denim-Look Jersey','A high-density denim-look jersey with a subtle sheen and firm hand.','100% Polyester',13.74,'catalog/fabrics/takisada-nagoya/1100477-2.jpg',ARRAY['catalog/fabrics/takisada-nagoya/1100477-2.jpg','catalog/fabrics/takisada-nagoya/1100477-3.jpg','catalog/fabrics/takisada-nagoya/1100477-4.jpg']::text[],'Nagoya, Aichi, Japan','knits','Quote on request','For orders of 10 m or less, a US$10.04 cutting fee applies.','210 GSM','126 cm','50 m estimated','1099520'),
  ('FAB-147','1038400 NEW DotAir Ultra-Lightweight Double Weave','An ultra-lightweight double-weave DotAir fabric with ventilation holes, water repellency, one-way stretch, wrinkle resistance, and washability.','100% Polyester',11.98,'catalog/fabrics/takisada-nagoya/1091445-2.jpg',ARRAY['catalog/fabrics/takisada-nagoya/1091445-2.jpg','catalog/fabrics/takisada-nagoya/1091445-5.jpg','catalog/fabrics/takisada-nagoya/1091445-7.jpg']::text[],'Nagoya, Aichi, Japan','polyester','Quote on request','For orders of 10 m or less, a US$10.04 cutting fee applies.','76 GSM','151 cm','47 m','1038400'),
  ('FAB-169','1032350 Vintage Sheep Boa','A substantial faux sheepskin boa suitable for warm outer layers.','76% Polyester, 24% Acrylic',13.80,'catalog/fabrics/takisada-nagoya/1077399-2.jpg',ARRAY['catalog/fabrics/takisada-nagoya/1077399-2.jpg','catalog/fabrics/takisada-nagoya/1077399-4.jpg','catalog/fabrics/takisada-nagoya/1077399-11.jpg']::text[],'Nagoya, Aichi, Japan','knits','Quote on request','For orders of 10 m or less, a US$10.04 cutting fee applies.','295 GSM','147 cm','33 m','1032350'),
  ('FAB-170','1022193 RE:NEWOOL JAPAN Cashmere Kersey Series','A domestically produced recycled wool and cashmere blend, finished in the Oshu wool-producing region of Aichi Prefecture.','54% Wool, 34% Polyester, 8% Cashmere, 2% Nylon, 1% Acrylic, 1% Rayon',15.62,'catalog/fabrics/takisada-nagoya/1080539.jpg',ARRAY['catalog/fabrics/takisada-nagoya/1080539.jpg']::text[],'Nagoya, Aichi, Japan','polyester','Quote on request','For orders of 10 m or less, a US$10.04 cutting fee applies.','310 GSM','140 cm','50 m','1022193'),
  ('FAB-171','1063450 IRM Modified Military Waffle Knit','A flexible 22-gauge waffle knit with good rebound, quick drying, UV resistance, and washability.','100% Polyester',12.29,'catalog/fabrics/takisada-nagoya/1093129-3.jpg',ARRAY['catalog/fabrics/takisada-nagoya/1093129-3.jpg','catalog/fabrics/takisada-nagoya/1093129-5.jpg','catalog/fabrics/takisada-nagoya/1093129-9.jpg']::text[],'Nagoya, Aichi, Japan','knits','Quote on request','For orders of 10 m or less, a US$10.04 cutting fee applies.','210 GSM','120 cm','40 m','1063450')
) AS v(sku,name,description,comp,price,img,images,loc,subcategory,lead_time,handling_notes,gsm,fabric_width,roll_length,style_code)
JOIN public.factories factory ON factory.slug=CASE WHEN v.sku IN ('FAB-140','FAB-158','FAB-159','FAB-160','FAB-161','FAB-162','FAB-163','FAB-164','FAB-165','FAB-166','FAB-167','FAB-168') THEN 'F-17' ELSE 'F-14' END
ON CONFLICT (sku) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,comp=EXCLUDED.comp,price=EXCLUDED.price,
  pricing_mode=EXCLUDED.pricing_mode,unit_type=EXCLUDED.unit_type,moq=EXCLUDED.moq,factory_id=EXCLUDED.factory_id,
  category=EXCLUDED.category,img=EXCLUDED.img,images=EXCLUDED.images,loc=EXCLUDED.loc,listing_status=EXCLUDED.listing_status,
  subcategory=EXCLUDED.subcategory,applications=EXCLUDED.applications,origin_country=EXCLUDED.origin_country,
  lead_time=EXCLUDED.lead_time,handling_notes=EXCLUDED.handling_notes,gsm=EXCLUDED.gsm,
  fabric_width=EXCLUDED.fabric_width,roll_length=EXCLUDED.roll_length,style_code=EXCLUDED.style_code;

DELETE FROM public.product_variants variant
USING public.products product
WHERE variant.product_id=product.id AND product.sku IN (
  'FAB-140','FAB-144','FAB-147','FAB-158','FAB-159','FAB-160','FAB-161','FAB-162','FAB-163','FAB-164','FAB-165','FAB-166','FAB-167','FAB-168','FAB-169','FAB-170','FAB-171'
);

INSERT INTO public.product_variants(product_id,colorway,option_name,option_value,sort_order)
SELECT product.id,color.value,'Color',color.value,color.ordinality::integer
FROM (VALUES
  ('FAB-140',ARRAY['Light Gray','Dark Grey','Dark Brown','Navy Blue','Black']::text[]),
  ('FAB-158',ARRAY['Beige','Camel','Olive','Blue','Red','Brown','Dark Grey','Navy Blue','Black']::text[]),
  ('FAB-159',ARRAY['Beige','Black','Navy Blue','Khaki']::text[]),
  ('FAB-160',ARRAY['Black','Navy Blue','Beige','Brown','Dark Green','Off White','Light Grey','Grey']::text[]),
  ('FAB-161',ARRAY['Black','Navy Blue','Khaki']::text[]),
  ('FAB-162',ARRAY['Beige','Dark Gray','Blue','Black','Brown','Navy Blue']::text[]),
  ('FAB-163',ARRAY['Light Blue','Dark Blue','Sky Blue']::text[]),
  ('FAB-164',ARRAY['Fade Black','Black','Blue','Blue Black','Gray','Gray Black','Navy Blue','Navy Blue Black','Saxe Blue','Olive']::text[]),
  ('FAB-165',ARRAY['Fade Black','Black','Blue','Gray','Gray Black','Navy Blue','Olive','Olive Black','Mild Blue']::text[]),
  ('FAB-167',ARRAY['Army Green','Black','Beige','Khaki','Navy','Olive']::text[]),
  ('FAB-168',ARRAY['Olive','Beige','Black','Camel','Navy Blue','Off White']::text[]),
  ('FAB-144',ARRAY['Gray Denim','Black Denim','Blue Denim','Light Blue Denim','Khaki','Black']::text[]),
  ('FAB-147',ARRAY['White','Gray','Black','Navy Blue','Beige','Khaki']::text[]),
  ('FAB-169',ARRAY['Light Gray','Off White','Top Gray','Black','Orange','Brown','Blue','Navy Blue','Beige','Yellow','Khaki']::text[]),
  ('FAB-170',ARRAY['Light Gray','Medium Gray','Charcoal Heaven Gray','Black','Navy Blue','Brown Khaki']::text[]),
  ('FAB-171',ARRAY['Gray','Charcoal Heaven Gray','Black','Navy Blue','Beige','Olive','Off White']::text[])
) AS source(sku,colors)
JOIN public.products product ON product.sku=source.sku
CROSS JOIN LATERAL unnest(source.colors) WITH ORDINALITY AS color(value,ordinality);
