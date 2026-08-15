-- Source-free fabric catalogue contract.
-- This migration intentionally stores no crawl provider identity, URLs, IDs,
-- costs, contacts, or provenance. Those values remain in local staging only.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS copy_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS construction_slug text;

CREATE TABLE IF NOT EXISTS public.catalog_constructions (
  slug text PRIMARY KEY,
  label_i18n jsonb NOT NULL,
  sort_order integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT catalog_constructions_locale_check CHECK (
    NULLIF(btrim(label_i18n->>'en'),'') IS NOT NULL AND
    NULLIF(btrim(label_i18n->>'ja'),'') IS NOT NULL AND
    NULLIF(btrim(label_i18n->>'zh'),'') IS NOT NULL
  )
);

INSERT INTO public.catalog_constructions(slug,label_i18n,sort_order) VALUES
('plain-weave','{"en":"Plain weave","ja":"平織り","zh":"平纹"}',10),
('twill-drill','{"en":"Twill & drill","ja":"綾織り・ドリル","zh":"斜纹与卡其"}',20),
('denim-chambray','{"en":"Denim & chambray","ja":"デニム・シャンブレー","zh":"牛仔与青年布"}',30),
('canvas-duck','{"en":"Canvas & duck","ja":"キャンバス・ダック","zh":"帆布"}',40),
('satin','{"en":"Satin","ja":"サテン","zh":"缎纹"}',50),
('jacquard-dobby','{"en":"Jacquard & dobby","ja":"ジャカード・ドビー","zh":"提花与多臂"}',60),
('jersey-pique','{"en":"Jersey & pique","ja":"天竺・鹿の子","zh":"针织汗布与珠地"}',70),
('fleece-terry','{"en":"Fleece & terry","ja":"フリース・裏毛","zh":"抓绒与毛圈"}',80),
('rib-knit','{"en":"Rib knit","ja":"リブニット","zh":"罗纹针织"}',90),
('interlock-double-knit','{"en":"Interlock & double knit","ja":"インターロック・ダブルニット","zh":"双面针织"}',100),
('mesh-tricot','{"en":"Mesh & tricot","ja":"メッシュ・トリコット","zh":"网眼与经编"}',110),
('lace-tulle','{"en":"Lace & tulle","ja":"レース・チュール","zh":"蕾丝与网纱"}',120),
('chiffon-organza','{"en":"Chiffon & organza","ja":"シフォン・オーガンジー","zh":"雪纺与欧根纱"}',130),
('gauze','{"en":"Gauze","ja":"ガーゼ","zh":"纱布"}',140),
('corduroy','{"en":"Corduroy","ja":"コーデュロイ","zh":"灯芯绒"}',150),
('melton-tweed','{"en":"Melton & tweed","ja":"メルトン・ツイード","zh":"麦尔登与粗花呢"}',160),
('crepe','{"en":"Crepe","ja":"クレープ","zh":"绉布"}',170),
('artificial-leather','{"en":"Artificial leather","ja":"人工皮革","zh":"人造革"}',180),
('specialty-other','{"en":"Specialty & other","ja":"特殊素材・その他","zh":"特殊面料与其他"}',190)
ON CONFLICT (slug) DO UPDATE SET label_i18n=EXCLUDED.label_i18n,sort_order=EXCLUDED.sort_order,active=true;

UPDATE public.products SET construction_slug='specialty-other'
WHERE category='fabrics' AND construction_slug IS NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_construction_slug_fkey;
ALTER TABLE public.products ADD CONSTRAINT products_construction_slug_fkey
  FOREIGN KEY (construction_slug) REFERENCES public.catalog_constructions(slug);

CREATE INDEX IF NOT EXISTS products_public_construction_idx
  ON public.products(category,construction_slug,updated_at DESC)
  WHERE listing_status='active' AND is_private=false AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  role text NOT NULL,
  position smallint NOT NULL,
  public_url text NOT NULL,
  thumb_url text NOT NULL,
  storage_path text NOT NULL,
  thumb_storage_path text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  bytes bigint NOT NULL,
  sha256 text NOT NULL,
  thumb_bytes bigint NOT NULL,
  thumb_sha256 text NOT NULL,
  alt_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_media_role_check CHECK (role IN ('flat_swatch','sample_card','texture','drape','detail')),
  CONSTRAINT product_media_position_check CHECK (position BETWEEN 0 AND 3),
  CONSTRAINT product_media_dimensions_check CHECK (width>0 AND height>0 AND bytes>0 AND thumb_bytes>0),
  CONSTRAINT product_media_sha_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT product_media_thumb_sha_check CHECK (thumb_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT product_media_https_check CHECK (public_url ~ '^https://' AND (thumb_url IS NULL OR thumb_url ~ '^https://')),
  CONSTRAINT product_media_neutral_path_check CHECK (storage_path ~ '^products/[0-9a-f-]{36}/[0-9a-f]{64}-1600[.]webp$'),
  CONSTRAINT product_media_thumb_path_check CHECK (thumb_storage_path ~ '^products/[0-9a-f-]{36}/[0-9a-f]{64}-640[.]webp$'),
  CONSTRAINT product_media_alt_locale_check CHECK (
    NULLIF(btrim(alt_i18n->>'en'),'') IS NOT NULL AND
    NULLIF(btrim(alt_i18n->>'ja'),'') IS NOT NULL AND
    NULLIF(btrim(alt_i18n->>'zh'),'') IS NOT NULL
  ),
  UNIQUE(product_id,position),
  UNIQUE(product_id,storage_path)
);
CREATE INDEX IF NOT EXISTS product_media_hash_idx ON public.product_media(sha256);

CREATE TABLE IF NOT EXISTS public.catalog_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  factory_id uuid REFERENCES public.factories(id) ON DELETE CASCADE,
  construction_slug text REFERENCES public.catalog_constructions(slug) ON DELETE CASCADE,
  category public.product_category,
  question_i18n jsonb NOT NULL,
  answer_i18n jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_faq_scope_check CHECK (scope IN ('product','supplier','construction','category')),
  CONSTRAINT catalog_faq_target_check CHECK (
    (scope='product' AND product_id IS NOT NULL AND factory_id IS NULL AND construction_slug IS NULL AND category IS NULL) OR
    (scope='supplier' AND product_id IS NULL AND factory_id IS NOT NULL AND construction_slug IS NULL AND category IS NULL) OR
    (scope='construction' AND product_id IS NULL AND factory_id IS NULL AND construction_slug IS NOT NULL AND category IS NULL) OR
    (scope='category' AND product_id IS NULL AND factory_id IS NULL AND construction_slug IS NULL AND category IS NOT NULL)
  ),
  CONSTRAINT catalog_faq_locale_check CHECK (
    NULLIF(btrim(question_i18n->>'en'),'') IS NOT NULL AND NULLIF(btrim(question_i18n->>'ja'),'') IS NOT NULL AND NULLIF(btrim(question_i18n->>'zh'),'') IS NOT NULL AND
    NULLIF(btrim(answer_i18n->>'en'),'') IS NOT NULL AND NULLIF(btrim(answer_i18n->>'ja'),'') IS NOT NULL AND NULLIF(btrim(answer_i18n->>'zh'),'') IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS catalog_faq_product_idx ON public.catalog_faqs(product_id,sort_order) WHERE active;
CREATE INDEX IF NOT EXISTS catalog_faq_factory_idx ON public.catalog_faqs(factory_id,sort_order) WHERE active;
CREATE INDEX IF NOT EXISTS catalog_faq_construction_idx ON public.catalog_faqs(construction_slug,sort_order) WHERE active;

INSERT INTO public.catalog_faqs(scope,category,question_i18n,answer_i18n,sort_order,active) VALUES
('category','fabrics',
 '{"en":"How should I confirm colour and hand feel?","ja":"色と風合いはどのように確認すればよいですか？","zh":"如何确认颜色和手感？"}',
 '{"en":"Request a current swatch or sample from the supplier before production. Screen colours and textile lots can vary.","ja":"生産前にサプライヤーへ最新のスワッチまたはサンプルをご依頼ください。画面上の色と生地ロットには差が生じる場合があります。","zh":"生产前请向供应商索取最新色卡或样品。屏幕颜色和不同面料批次可能存在差异。"}',10,true),
('category','fabrics',
 '{"en":"What should I confirm before ordering?","ja":"注文前に何を確認すべきですか？","zh":"下单前需要确认什么？"}',
 '{"en":"Confirm the current specification, minimum order, lead time, care requirements, and intended application with the supplier.","ja":"最新の仕様、最小ロット、リードタイム、取扱方法、用途をサプライヤーにご確認ください。","zh":"请与供应商确认当前规格、起订量、交期、护理要求及预期用途。"}',20,true);

CREATE TABLE IF NOT EXISTS public.catalog_release_batches (
  id uuid PRIMARY KEY,
  release_id uuid NOT NULL,
  entity_kind text NOT NULL CHECK (entity_kind IN ('supplier','product')),
  sequence_no integer NOT NULL CHECK (sequence_no>0),
  entity_count integer NOT NULL CHECK (entity_count BETWEEN 1 AND 50),
  storage_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_bytes>=0),
  manifest_sha256 text NOT NULL UNIQUE CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  deployed_git_sha text NOT NULL CHECK (deployed_git_sha ~ '^[0-9a-f]{40}$'),
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','live_verified','rolled_back')),
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE(release_id,entity_kind,sequence_no)
);

CREATE OR REPLACE FUNCTION public.catalog_locale_complete(p_copy jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_copy IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['en','ja','zh']) locale
    WHERE jsonb_typeof(p_copy->locale) <> 'object'
       OR NULLIF(btrim(p_copy->locale->>'name'),'') IS NULL
       OR NULLIF(btrim(p_copy->locale->>'description'),'') IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.catalog_resolved_faqs(p_product_id uuid,p_locale text DEFAULT 'en')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH product AS (
    SELECT id,factory_id,construction_slug,category FROM public.products WHERE id=p_product_id
  ), ranked AS (
    SELECT faq.*,
      CASE faq.scope WHEN 'product' THEN 1 WHEN 'supplier' THEN 2 WHEN 'construction' THEN 3 ELSE 4 END AS priority
    FROM public.catalog_faqs faq CROSS JOIN product
    WHERE faq.active AND (
      faq.product_id=product.id OR faq.factory_id=product.factory_id OR
      faq.construction_slug=product.construction_slug OR faq.category=product.category
    )
  ), selected AS (SELECT * FROM ranked WHERE priority=(SELECT min(priority) FROM ranked))
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',id,'scope',scope,
    'question',COALESCE(NULLIF(question_i18n->>CASE WHEN p_locale IN ('en','ja','zh') THEN p_locale ELSE 'en' END,''),question_i18n->>'en'),
    'answer',COALESCE(NULLIF(answer_i18n->>CASE WHEN p_locale IN ('en','ja','zh') THEN p_locale ELSE 'en' END,''),answer_i18n->>'en')
  ) ORDER BY priority,sort_order,id),'[]'::jsonb) FROM selected;
$$;

CREATE OR REPLACE FUNCTION public.public_list_catalog_products(
  p_category public.product_category DEFAULT NULL,
  p_construction_slug text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 24,
  p_locale text DEFAULT 'en',
  p_materials text[] DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_regions text[] DEFAULT NULL,
  p_availability text DEFAULT 'all',
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_sort text DEFAULT 'recommended',
  p_supplier_slug text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_page integer:=GREATEST(COALESCE(p_page,1),1); v_size integer:=LEAST(GREATEST(COALESCE(p_page_size,24),1),50); v_result jsonb;
BEGIN
  IF p_availability NOT IN ('all','oem','nonoem') THEN p_availability:='all'; END IF;
  IF p_sort NOT IN ('recommended','new','moq','price') THEN p_sort:='recommended'; END IF;
  WITH base AS (
    SELECT p.*,f.name AS supplier_name,f.slug AS supplier_slug,f.region AS supplier_region,f.loc AS supplier_city
    FROM public.products p JOIN public.factories f ON f.id=p.factory_id
    WHERE p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL
      AND f.verify_state='verified' AND f.archived_at IS NULL
      AND (p_category IS NULL OR p.category=p_category)
      AND (p_construction_slug IS NULL OR p.construction_slug=p_construction_slug)
      AND (NULLIF(btrim(p_supplier_slug),'') IS NULL OR f.slug=p_supplier_slug)
  ), filtered AS (
    SELECT * FROM base
    WHERE (p_materials IS NULL OR cardinality(p_materials)=0 OR EXISTS (SELECT 1 FROM unnest(p_materials) material WHERE COALESCE(comp,'') ILIKE '%'||material||'%'))
      AND (NULLIF(btrim(p_country),'') IS NULL OR supplier_region=p_country)
      AND (p_regions IS NULL OR cardinality(p_regions)=0 OR supplier_city=ANY(p_regions))
      AND (p_availability='all' OR (p_availability='oem' AND badge='oem') OR (p_availability='nonoem' AND COALESCE(badge,'')<>'oem'))
      AND ((p_min_price IS NULL AND p_max_price IS NULL) OR (pricing_mode='fixed' AND (p_min_price IS NULL OR price>=p_min_price) AND (p_max_price IS NULL OR price<=p_max_price)))
  ), ordered AS (
    SELECT filtered.*,row_number() OVER (ORDER BY
      CASE WHEN p_sort='price' AND pricing_mode='fixed' THEN price END ASC NULLS LAST,
      CASE WHEN p_sort='moq' THEN moq END ASC NULLS LAST,
      CASE WHEN p_sort IN ('recommended','new') THEN updated_at END DESC NULLS LAST,
      updated_at DESC,id
    ) AS page_order FROM filtered
  ), paged AS (
    SELECT * FROM ordered ORDER BY page_order OFFSET (v_page-1)*v_size LIMIT v_size
  )
  SELECT jsonb_build_object(
    'page',v_page,'page_size',v_size,'total',(SELECT count(*) FROM filtered),'supplier_total',(SELECT count(DISTINCT factory_id) FROM filtered),
    'facets',jsonb_build_object('constructions',COALESCE((
      SELECT jsonb_object_agg(facet.construction_slug,facet.item_count) FROM (
        SELECT construction_slug,count(*) AS item_count FROM base WHERE construction_slug IS NOT NULL GROUP BY construction_slug
      ) facet
    ),'{}'::jsonb),
    'materials',COALESCE((
      SELECT jsonb_object_agg(material,(SELECT count(*) FROM base WHERE COALESCE(comp,'') ILIKE '%'||material||'%'))
      FROM unnest(ARRAY['Cotton','Polyester','Linen','Nylon','Wool','Viscose','Spandex']) material
    ),'{}'::jsonb),
    'countries',COALESCE((SELECT jsonb_object_agg(region,item_count) FROM (SELECT supplier_region AS region,count(*) AS item_count FROM base WHERE supplier_region IS NOT NULL GROUP BY supplier_region) countries),'{}'::jsonb),
    'regions',COALESCE((
      SELECT jsonb_object_agg(country,city_counts) FROM (
        SELECT country,jsonb_object_agg(city,item_count) AS city_counts FROM (
          SELECT supplier_region AS country,supplier_city AS city,count(*) AS item_count
          FROM base WHERE supplier_region IS NOT NULL AND supplier_city IS NOT NULL
          GROUP BY supplier_region,supplier_city
        ) city_rows GROUP BY country
      ) region_rows
    ),'{}'::jsonb)),
    'products',COALESCE((SELECT jsonb_agg((to_jsonb(paged)-'page_order')||jsonb_build_object(
      'supplier_name',supplier_name,'supplier_slug',supplier_slug,'supplier_region',supplier_region,'supplier_city',supplier_city,
      'catalog_prices',COALESCE((SELECT jsonb_object_agg(cp.currency,cp.catalog_amount) FROM public.catalog_prices cp WHERE cp.product_id=paged.id),'{}'::jsonb),
      'media',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.position) FROM public.product_media m WHERE m.product_id=paged.id),'[]'::jsonb)
    ) ORDER BY page_order) FROM paged),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.public_get_product(p_sku text,p_locale text DEFAULT 'en')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT to_jsonb(p)||jsonb_build_object(
    'supplier',jsonb_build_object('id',f.id,'slug',f.slug,'name',f.name,'region',f.region,'loc',f.loc,'logo_img',f.logo_img,'copy_i18n',f.copy_i18n),
    'media',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.position) FROM public.product_media m WHERE m.product_id=p.id),'[]'::jsonb),
    'faqs',public.catalog_resolved_faqs(p.id,p_locale),
    'catalog_prices',COALESCE((SELECT jsonb_object_agg(cp.currency,cp.catalog_amount) FROM public.catalog_prices cp WHERE cp.product_id=p.id),'{}'::jsonb)
  ) FROM public.products p JOIN public.factories f ON f.id=p.factory_id
  WHERE p.sku=p_sku AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL
    AND f.verify_state='verified' AND f.archived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.public_list_catalog_factories(p_locale text DEFAULT 'en')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object(
    'product_count',(SELECT count(*) FROM public.products p WHERE p.factory_id=f.id AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL),
    'supplier_taxonomy_memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object('l2',m.l2,'l3',m.l3,'is_primary',m.is_primary)) FROM public.supplier_taxonomy_memberships m WHERE m.factory_id=f.id),'[]'::jsonb)
  ) ORDER BY f.name),'[]'::jsonb)
  FROM public.factories f WHERE f.verify_state='verified' AND f.archived_at IS NULL
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.factory_id=f.id AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.catalog_guard_order_item()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p JOIN public.factories f ON f.id=p.factory_id
    WHERE p.id=NEW.product_id AND p.factory_id=NEW.factory_id AND p.listing_status='active'
      AND p.is_private=false AND p.archived_at IS NULL AND f.verify_state='verified' AND f.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'product is no longer available from this supplier' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS order_items_catalog_guard ON public.order_items;
CREATE TRIGGER order_items_catalog_guard BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.catalog_guard_order_item();

CREATE OR REPLACE FUNCTION public.catalog_save_product_content(
  p_product_id uuid,
  p_copy_i18n jsonb,
  p_construction_slug text,
  p_media jsonb,
  p_faqs jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_is_admin boolean; v_media jsonb; v_faq jsonb; v_position integer:=0; v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT role='admin' INTO v_is_admin FROM public.profiles WHERE id=v_actor;
  IF NOT COALESCE(v_is_admin,false) AND NOT EXISTS (
    SELECT 1 FROM public.products p JOIN public.factories f ON f.id=p.factory_id
    WHERE p.id=p_product_id AND f.owner_profile_id=v_actor AND f.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'product not found or not owned by caller' USING ERRCODE='42501'; END IF;
  IF p_media IS NOT NULL AND (jsonb_typeof(p_media)<>'array' OR jsonb_array_length(p_media)<1 OR jsonb_array_length(p_media)>4) THEN RAISE EXCEPTION 'media must contain one to four images'; END IF;
  IF jsonb_typeof(p_faqs)<>'array' THEN RAISE EXCEPTION 'faqs must be an array'; END IF;
  IF NOT public.catalog_locale_complete(p_copy_i18n) THEN RAISE EXCEPTION 'English, Japanese, and Chinese product copy is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_constructions WHERE slug=p_construction_slug AND active) THEN RAISE EXCEPTION 'invalid construction'; END IF;

  UPDATE public.products SET copy_i18n=p_copy_i18n,construction_slug=p_construction_slug,
    name=p_copy_i18n->'en'->>'name',description=p_copy_i18n->'en'->>'description',updated_at=now()
  WHERE id=p_product_id;
  IF p_media IS NOT NULL THEN
  DELETE FROM public.product_media WHERE product_id=p_product_id;
  FOR v_media IN SELECT value FROM jsonb_array_elements(p_media) LOOP
    IF v_position=0 AND COALESCE(v_media->>'role','') NOT IN ('flat_swatch','sample_card') THEN
      RAISE EXCEPTION 'the first image must be a flat swatch or sample card';
    END IF;
    INSERT INTO public.product_media(product_id,role,position,public_url,thumb_url,storage_path,thumb_storage_path,width,height,bytes,sha256,thumb_bytes,thumb_sha256,alt_i18n)
    VALUES(p_product_id,v_media->>'role',v_position,v_media->>'public_url',NULLIF(v_media->>'thumb_url',''),v_media->>'storage_path',NULLIF(v_media->>'thumb_storage_path',''),
      (v_media->>'width')::integer,(v_media->>'height')::integer,(v_media->>'bytes')::bigint,v_media->>'sha256',(v_media->>'thumb_bytes')::bigint,v_media->>'thumb_sha256',COALESCE(v_media->'alt_i18n','{}'::jsonb));
    v_position:=v_position+1;
  END LOOP;
  UPDATE public.products SET
    images=COALESCE((SELECT array_agg(m.public_url ORDER BY m.position) FROM public.product_media m WHERE m.product_id=p_product_id),'{}'::text[]),
    img=(SELECT COALESCE(m.thumb_url,m.public_url) FROM public.product_media m WHERE m.product_id=p_product_id ORDER BY m.position LIMIT 1)
  WHERE id=p_product_id;
  END IF;

  DELETE FROM public.catalog_faqs WHERE product_id=p_product_id;
  FOR v_faq IN SELECT value FROM jsonb_array_elements(p_faqs) LOOP
    INSERT INTO public.catalog_faqs(scope,product_id,question_i18n,answer_i18n,sort_order,active)
    VALUES('product',p_product_id,v_faq->'question_i18n',v_faq->'answer_i18n',COALESCE((v_faq->>'sort_order')::integer,0),COALESCE((v_faq->>'active')::boolean,true));
  END LOOP;
  SELECT to_jsonb(p)||jsonb_build_object(
    'media',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.position) FROM public.product_media m WHERE m.product_id=p.id),'[]'::jsonb),
    'faqs',COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.sort_order) FROM public.catalog_faqs f WHERE f.product_id=p.id),'[]'::jsonb)
  ) INTO v_result FROM public.products p WHERE p.id=p_product_id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.catalog_save_supplier_faqs(p_factory_id uuid,p_faqs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_is_admin boolean; v_faq jsonb; v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT role='admin' INTO v_is_admin FROM public.profiles WHERE id=v_actor;
  IF NOT COALESCE(v_is_admin,false) AND NOT EXISTS (SELECT 1 FROM public.factories WHERE id=p_factory_id AND owner_profile_id=v_actor AND archived_at IS NULL)
    THEN RAISE EXCEPTION 'supplier not found or not owned by caller' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_faqs)<>'array' THEN RAISE EXCEPTION 'faqs must be an array'; END IF;
  DELETE FROM public.catalog_faqs WHERE factory_id=p_factory_id;
  FOR v_faq IN SELECT value FROM jsonb_array_elements(p_faqs) LOOP
    INSERT INTO public.catalog_faqs(scope,factory_id,question_i18n,answer_i18n,sort_order,active)
    VALUES('supplier',p_factory_id,v_faq->'question_i18n',v_faq->'answer_i18n',COALESCE((v_faq->>'sort_order')::integer,0),COALESCE((v_faq->>'active')::boolean,true));
  END LOOP;
  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.sort_order),'[]'::jsonb) INTO v_result FROM public.catalog_faqs f WHERE f.factory_id=p_factory_id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.catalog_save_supplier_content(p_factory_id uuid,p_copy_i18n jsonb,p_faqs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_is_admin boolean; v_faqs jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT role='admin' INTO v_is_admin FROM public.profiles WHERE id=v_actor;
  IF NOT COALESCE(v_is_admin,false) AND NOT EXISTS (SELECT 1 FROM public.factories WHERE id=p_factory_id AND owner_profile_id=v_actor AND archived_at IS NULL)
    THEN RAISE EXCEPTION 'supplier not found or not owned by caller' USING ERRCODE='42501'; END IF;
  IF NOT public.catalog_locale_complete(p_copy_i18n) THEN RAISE EXCEPTION 'English, Japanese, and Chinese supplier copy is required'; END IF;
  UPDATE public.factories SET copy_i18n=p_copy_i18n,name=p_copy_i18n->'en'->>'name',bio=p_copy_i18n->'en'->>'description',updated_at=now() WHERE id=p_factory_id;
  v_faqs:=public.catalog_save_supplier_faqs(p_factory_id,p_faqs);
  RETURN jsonb_build_object('factory_id',p_factory_id,'copy_i18n',p_copy_i18n,'faqs',v_faqs);
END; $$;

CREATE OR REPLACE FUNCTION public.catalog_finalize_source_free_batch(
  p_batch_id uuid,p_release_id uuid,p_entity_kind text,p_sequence_no integer,p_manifest_sha256 text,p_deployed_git_sha text,p_storage_bytes bigint,p_entities jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_entity jsonb; v_data jsonb; v_media jsonb; v_faq jsonb; v_price jsonb; v_previous jsonb:='[]'::jsonb; v_ids uuid[]:='{}'; v_id uuid; v_count integer; v_existing public.catalog_release_batches;
BEGIN
  IF auth.role()<>'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'admin or service role required' USING ERRCODE='42501'; END IF;
  IF p_entity_kind NOT IN ('supplier','product') OR jsonb_typeof(p_entities)<>'array' THEN RAISE EXCEPTION 'invalid batch'; END IF;
  v_count:=jsonb_array_length(p_entities);IF v_count<1 OR v_count>50 THEN RAISE EXCEPTION 'batch must contain 1..50 entities'; END IF;
  IF p_release_id IS NULL OR p_storage_bytes<0 OR (p_entity_kind='supplier' AND p_storage_bytes<>0) THEN RAISE EXCEPTION 'invalid release or storage metadata'; END IF;
  IF p_manifest_sha256!~'^[0-9a-f]{64}$' OR p_deployed_git_sha!~'^[0-9a-f]{40}$' THEN RAISE EXCEPTION 'invalid release hashes'; END IF;
  IF lower(p_entities::text)~'apparel[ -]?x|www[.]apparel|source[_ ]?(url|id|key|price|cost|contact)|provenance|supplier(sourceid|code)|makerid|external[_ ]?id|"(phone|fax|email|contact_email|contact_phone|source_contact)"[[:space:]]*:'
    THEN RAISE EXCEPTION 'source or provenance content is forbidden in release entities'; END IF;
  INSERT INTO public.catalog_release_batches(id,release_id,entity_kind,sequence_no,entity_count,storage_bytes,manifest_sha256,deployed_git_sha,status)
  VALUES(p_batch_id,p_release_id,p_entity_kind,p_sequence_no,v_count,p_storage_bytes,p_manifest_sha256,p_deployed_git_sha,'staged')
  ON CONFLICT(id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_existing FROM public.catalog_release_batches WHERE id=p_batch_id AND manifest_sha256=p_manifest_sha256;
    IF NOT FOUND THEN RAISE EXCEPTION 'batch id already exists with different content'; END IF;
    IF v_existing.status='rolled_back' THEN RAISE EXCEPTION 'rolled back batch cannot be republished'; END IF;
    RETURN to_jsonb(v_existing);
  END IF;
  FOR v_entity IN SELECT value FROM jsonb_array_elements(p_entities) LOOP
    IF p_entity_kind='supplier' THEN
      v_data:=v_entity;
      IF NOT public.catalog_locale_complete(v_data->'copy_i18n') THEN RAISE EXCEPTION 'supplier translations incomplete'; END IF;
      SELECT v_previous||jsonb_build_array(jsonb_build_object('id',f.id,'copy_i18n',f.copy_i18n,'bio',f.bio)) INTO v_previous FROM public.factories f WHERE f.id=(v_data->>'id')::uuid;
      v_previous:=COALESCE(v_previous,'[]'::jsonb);
      INSERT INTO public.factories(id,slug,name,type,region,loc,verify_state,bio,copy_i18n,owner_profile_id,updated_at)
      VALUES((v_data->>'id')::uuid,v_data->>'slug',v_data->>'name',(v_data->>'type')::public.factory_type,v_data->>'region',v_data->>'loc','verified',v_data->'copy_i18n'->'en'->>'description',v_data->'copy_i18n',NULL,now())
      ON CONFLICT(id) DO UPDATE SET copy_i18n=excluded.copy_i18n,bio=excluded.bio,updated_at=now()
      RETURNING id INTO v_id;
    ELSE
      v_data:=v_entity->'product';v_id:=(v_entity->>'id')::uuid;
      IF NOT public.catalog_locale_complete(v_data->'copy_i18n') THEN RAISE EXCEPTION 'product translations incomplete'; END IF;
      IF (v_data->>'pricing_mode') NOT IN ('fixed','quote') OR
         ((v_data->>'pricing_mode')='fixed' AND COALESCE((v_data->>'price')::numeric,0)<=0) OR
         ((v_data->>'pricing_mode')='quote' AND COALESCE((v_data->>'price')::numeric,0)<>0)
      THEN RAISE EXCEPTION 'invalid public product price'; END IF;
      IF jsonb_typeof(COALESCE(v_entity->'prices','[]'::jsonb))<>'array' OR jsonb_array_length(v_entity->'prices')<>2 OR
         (SELECT count(DISTINCT value->>'currency') FROM jsonb_array_elements(v_entity->'prices'))<>2 OR
         NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_entity->'prices') value WHERE value->>'currency'='USD') OR
         NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_entity->'prices') value WHERE value->>'currency'='JPY')
      THEN RAISE EXCEPTION 'existing catalogue price pattern requires one USD and one JPY row'; END IF;
      FOR v_price IN SELECT value FROM jsonb_array_elements(v_entity->'prices') LOOP
        IF (v_price->>'currency') NOT IN ('USD','JPY') OR (v_price->>'markup_bps')::integer<2000 OR
           public.catalog_calculate_price((v_price->>'base_amount')::numeric,(v_price->>'fx_rate')::numeric,v_price->>'currency',(v_price->>'markup_bps')::integer)<>(v_price->>'catalog_amount')::numeric
        THEN RAISE EXCEPTION 'invalid catalogue price calculation'; END IF;
      END LOOP;
      IF (v_data->>'price')::numeric<>(SELECT (value->>'catalog_amount')::numeric FROM jsonb_array_elements(v_entity->'prices') value WHERE value->>'currency'='USD')
      THEN RAISE EXCEPTION 'product compatibility price must match USD catalogue price'; END IF;
      IF jsonb_array_length(COALESCE(v_entity->'media','[]'::jsonb))<1 OR jsonb_array_length(v_entity->'media')>4 THEN RAISE EXCEPTION 'product media count must be 1..4'; END IF;
      IF v_entity->'media'->0->>'role' NOT IN ('flat_swatch','sample_card') THEN RAISE EXCEPTION 'first product image must be a flat swatch or sample card'; END IF;
      INSERT INTO public.products(id,sku,name,description,copy_i18n,category,construction_slug,construction,subcategory,comp,spec,gsm,applications,season,handling_notes,pricing_mode,price,unit_type,moq,factory_id,listing_status,is_private,img,images,updated_at,archived_at)
      VALUES(v_id,v_data->>'sku',v_data->>'name',v_data->>'description',v_data->'copy_i18n','fabrics',(v_data->>'construction_slug'),v_data->>'construction',NULLIF(v_data->>'subcategory',''),NULLIF(v_data->>'comp',''),NULLIF(v_data->>'spec',''),NULLIF(v_data->>'gsm',''),NULLIF(v_data->>'applications',''),NULLIF(v_data->>'season',''),NULLIF(v_data->>'handling_notes',''),(v_data->>'pricing_mode')::public.pricing_mode,(v_data->>'price')::numeric,'m',NULL,(v_entity->>'factory_id')::uuid,'active',false,v_data->>'img',ARRAY(SELECT jsonb_array_elements_text(v_data->'images')),now(),NULL)
      RETURNING id INTO v_id;
      FOR v_price IN SELECT value FROM jsonb_array_elements(v_entity->'prices') LOOP
        INSERT INTO public.catalog_prices(product_id,currency,source_amount,source_currency,fx_rate,fx_snapshot_id,markup_bps,unrounded_amount,rounding_increment,catalog_amount,calculation_version,calculated_at)
        VALUES(v_id,v_price->>'currency',(v_price->>'base_amount')::numeric,v_price->>'currency',(v_price->>'fx_rate')::numeric,v_price->>'fx_snapshot_id',(v_price->>'markup_bps')::integer,
          (v_price->>'base_amount')::numeric*(v_price->>'fx_rate')::numeric*(1+(v_price->>'markup_bps')::numeric/10000),(v_price->>'rounding_increment')::numeric,(v_price->>'catalog_amount')::numeric,v_price->>'calculation_version',now())
        ON CONFLICT(product_id,currency) DO UPDATE SET source_amount=excluded.source_amount,source_currency=excluded.source_currency,fx_rate=excluded.fx_rate,fx_snapshot_id=excluded.fx_snapshot_id,markup_bps=excluded.markup_bps,unrounded_amount=excluded.unrounded_amount,rounding_increment=excluded.rounding_increment,catalog_amount=excluded.catalog_amount,calculation_version=excluded.calculation_version,calculated_at=now()
        WHERE NOT catalog_prices.manual_lock;
      END LOOP;
      DELETE FROM public.product_media WHERE product_id=v_id;
      FOR v_media IN SELECT value FROM jsonb_array_elements(v_entity->'media') LOOP
        INSERT INTO public.product_media(product_id,role,position,public_url,thumb_url,storage_path,thumb_storage_path,width,height,bytes,sha256,thumb_bytes,thumb_sha256,alt_i18n)
        VALUES(v_id,v_media->>'role',(v_media->>'position')::integer,v_media->>'public_url',v_media->>'thumb_url',v_media->>'storage_path',v_media->>'thumb_storage_path',(v_media->>'width')::integer,(v_media->>'height')::integer,(v_media->>'bytes')::bigint,v_media->>'sha256',(v_media->>'thumb_bytes')::bigint,v_media->>'thumb_sha256',COALESCE(v_media->'alt_i18n','{}'::jsonb));
      END LOOP;
      DELETE FROM public.catalog_faqs WHERE product_id=v_id;
      FOR v_faq IN SELECT value FROM jsonb_array_elements(COALESCE(v_entity->'faqs','[]'::jsonb)) LOOP
        INSERT INTO public.catalog_faqs(scope,product_id,question_i18n,answer_i18n,sort_order,active) VALUES('product',v_id,v_faq->'question_i18n',v_faq->'answer_i18n',COALESCE((v_faq->>'sort_order')::integer,0),true);
      END LOOP;
    END IF;
    v_ids:=array_append(v_ids,v_id);
  END LOOP;
  UPDATE public.catalog_release_batches SET verification=jsonb_build_object('entity_ids',to_jsonb(v_ids),'database_transaction_committed',true,'previous_supplier_content',v_previous) WHERE id=p_batch_id;
  RETURN (SELECT to_jsonb(b) FROM public.catalog_release_batches b WHERE b.id=p_batch_id);
END; $$;

CREATE OR REPLACE FUNCTION public.catalog_storage_usage()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'bucket','catalog-media',
    'object_count',count(*),
    'used_bytes',COALESCE(sum(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE 0 END),0)
  ) FROM storage.objects WHERE bucket_id='catalog-media';
$$;

CREATE OR REPLACE FUNCTION public.catalog_verify_source_free_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_batch public.catalog_release_batches; v_ids uuid[]; v_live integer; v_media integer;
BEGIN
  IF auth.role()<>'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'admin or service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_batch FROM public.catalog_release_batches WHERE id=p_batch_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'batch not found'; END IF;
  IF v_batch.status='rolled_back' THEN RAISE EXCEPTION 'rolled back batch cannot be verified'; END IF;
  SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(v_batch.verification->'entity_ids');
  IF v_batch.entity_kind='supplier' THEN SELECT count(*) INTO v_live FROM public.factories WHERE id=ANY(v_ids) AND verify_state='verified' AND archived_at IS NULL;
  ELSE
    SELECT count(*) INTO v_live FROM public.products WHERE id=ANY(v_ids) AND listing_status='active' AND is_private=false AND archived_at IS NULL;
    SELECT count(DISTINCT product_id) INTO v_media FROM public.product_media WHERE product_id=ANY(v_ids) AND position=0 AND role IN ('flat_swatch','sample_card');
    IF v_media<>v_batch.entity_count THEN RAISE EXCEPTION 'batch media verification failed'; END IF;
  END IF;
  IF v_live<>v_batch.entity_count THEN RAISE EXCEPTION 'batch live count verification failed'; END IF;
  UPDATE public.catalog_release_batches SET status='live_verified',verified_at=now(),verification=verification||jsonb_build_object('live_count',v_live,'media_primary_count',COALESCE(v_media,0)) WHERE id=p_batch_id RETURNING * INTO v_batch;
  RETURN to_jsonb(v_batch);
END; $$;

CREATE OR REPLACE FUNCTION public.catalog_rollback_source_free_batch(p_batch_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_batch public.catalog_release_batches; v_ids uuid[]; v_previous jsonb;
BEGIN
  IF auth.role()<>'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'admin or service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_batch FROM public.catalog_release_batches WHERE id=p_batch_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'batch not found'; END IF;
  SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(v_batch.verification->'entity_ids');
  IF v_batch.entity_kind='product' THEN UPDATE public.products SET listing_status='archived',archived_at=now(),updated_at=now() WHERE id=ANY(v_ids);
  ELSE
    FOR v_previous IN SELECT value FROM jsonb_array_elements(COALESCE(v_batch.verification->'previous_supplier_content','[]'::jsonb)) LOOP
      UPDATE public.factories SET copy_i18n=COALESCE(v_previous->'copy_i18n','{}'::jsonb),bio=v_previous->>'bio',updated_at=now() WHERE id=(v_previous->>'id')::uuid;
    END LOOP;
    UPDATE public.factories SET archived_at=now(),updated_at=now() WHERE id=ANY(v_ids)
      AND id NOT IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(COALESCE(v_batch.verification->'previous_supplier_content','[]'::jsonb)))
      AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.factory_id=factories.id AND p.listing_status='active' AND p.archived_at IS NULL);
  END IF;
  UPDATE public.catalog_release_batches SET status='rolled_back',verification=verification||jsonb_build_object('rollback_reason',left(COALESCE(p_reason,'batch verification failed'),1000),'rolled_back_at',now()) WHERE id=p_batch_id RETURNING * INTO v_batch;
  RETURN to_jsonb(v_batch);
END; $$;

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_release_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_media_public_read ON public.product_media;
CREATE POLICY product_media_public_read ON public.product_media FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.products p JOIN public.factories f ON f.id=p.factory_id
    WHERE p.id=product_id AND (
      (p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL AND f.verify_state='verified' AND f.archived_at IS NULL) OR
      (SELECT public.is_admin()) OR f.owner_profile_id=(SELECT auth.uid())
    ))
);
DROP POLICY IF EXISTS catalog_faq_public_read ON public.catalog_faqs;
CREATE POLICY catalog_faq_public_read ON public.catalog_faqs FOR SELECT USING (
  (active AND (
    scope IN ('category','construction') OR
    (scope='product' AND EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id=p.factory_id
      WHERE p.id=product_id AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL AND f.verify_state='verified' AND f.archived_at IS NULL
    )) OR
    (scope='supplier' AND EXISTS (
      SELECT 1 FROM public.factories f WHERE f.id=factory_id AND f.verify_state='verified' AND f.archived_at IS NULL
        AND EXISTS (SELECT 1 FROM public.products p WHERE p.factory_id=f.id AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL)
    ))
  )) OR (SELECT public.is_admin()) OR EXISTS (
    SELECT 1 FROM public.factories f WHERE f.owner_profile_id=(SELECT auth.uid()) AND (f.id=factory_id OR EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.factory_id=f.id))
  )
);

REVOKE ALL ON public.catalog_release_batches FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.public_list_catalog_products(public.product_category,text,integer,integer,text,text[],text,text[],text,numeric,numeric,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_get_product(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_list_catalog_factories(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_resolved_faqs(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_catalog_products(public.product_category,text,integer,integer,text,text[],text,text[],text,numeric,numeric,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_product(text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.public_list_catalog_factories(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_resolved_faqs(uuid,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.catalog_save_product_content(uuid,jsonb,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_save_supplier_faqs(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_save_product_content(uuid,jsonb,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_save_supplier_faqs(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.catalog_save_supplier_content(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_save_supplier_content(uuid,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.catalog_finalize_source_free_batch(uuid,uuid,text,integer,text,text,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_verify_source_free_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_finalize_source_free_batch(uuid,uuid,text,integer,text,text,bigint,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalog_verify_source_free_batch(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.catalog_rollback_source_free_batch(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_rollback_source_free_batch(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.catalog_storage_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_storage_usage() TO service_role;
GRANT SELECT ON public.catalog_constructions,public.product_media,public.catalog_faqs TO anon,authenticated;

-- Product media are written only to neutral product UUID paths. Admins may
-- manage every object; supplier accounts are limited to products they own.
DROP POLICY IF EXISTS catalog_media_product_owner_insert ON storage.objects;
CREATE POLICY catalog_media_product_owner_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='catalog-media' AND name ~ '^products/[0-9a-f-]{36}/[0-9a-f]{64}-(640|1600)[.]webp$' AND (
    (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id=p.factory_id
      WHERE p.id=CASE WHEN name ~ '^products/[0-9a-f-]{36}/' THEN split_part(name,'/',2)::uuid ELSE NULL END AND f.owner_profile_id=(SELECT auth.uid()) AND f.archived_at IS NULL
    )
  )
);
DROP POLICY IF EXISTS catalog_media_product_owner_update ON storage.objects;
CREATE POLICY catalog_media_product_owner_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id='catalog-media' AND ((SELECT public.is_admin()) OR EXISTS (
    SELECT 1 FROM public.products p JOIN public.factories f ON f.id=p.factory_id
    WHERE p.id=CASE WHEN name ~ '^products/[0-9a-f-]{36}/' THEN split_part(name,'/',2)::uuid ELSE NULL END AND f.owner_profile_id=(SELECT auth.uid()) AND f.archived_at IS NULL
  ))
) WITH CHECK (bucket_id='catalog-media');
DROP POLICY IF EXISTS catalog_media_product_owner_delete ON storage.objects;
CREATE POLICY catalog_media_product_owner_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='catalog-media' AND ((SELECT public.is_admin()) OR EXISTS (
    SELECT 1 FROM public.products p JOIN public.factories f ON f.id=p.factory_id
    WHERE p.id=CASE WHEN name ~ '^products/[0-9a-f-]{36}/' THEN split_part(name,'/',2)::uuid ELSE NULL END AND f.owner_profile_id=(SELECT auth.uid()) AND f.archived_at IS NULL
  ))
);
