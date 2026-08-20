-- Material taxonomy for fabric routes and blended compositions.
-- Construction remains a separate structural facet.

CREATE TABLE IF NOT EXISTS public.catalog_materials (
  slug text PRIMARY KEY,
  label_i18n jsonb NOT NULL,
  sort_order integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT catalog_materials_locale_check CHECK (
    NULLIF(btrim(label_i18n->>'en'),'') IS NOT NULL AND
    NULLIF(btrim(label_i18n->>'ja'),'') IS NOT NULL AND
    NULLIF(btrim(label_i18n->>'zh'),'') IS NOT NULL
  )
);

INSERT INTO public.catalog_materials(slug,label_i18n,sort_order) VALUES
('cotton','{"en":"Cotton","ja":"綿","zh":"棉"}',10),
('polyester','{"en":"Polyester","ja":"ポリエステル","zh":"聚酯纤维"}',20),
('linen','{"en":"Linen","ja":"リネン","zh":"亚麻"}',30),
('viscose','{"en":"Viscose & rayon","ja":"ビスコース・レーヨン","zh":"粘胶与人造丝"}',40),
('wool','{"en":"Wool","ja":"ウール","zh":"羊毛"}',50),
('nylon','{"en":"Nylon","ja":"ナイロン","zh":"尼龙"}',60),
('spandex','{"en":"Spandex","ja":"スパンデックス","zh":"氨纶"}',70)
ON CONFLICT (slug) DO UPDATE SET label_i18n=EXCLUDED.label_i18n,sort_order=EXCLUDED.sort_order,active=true;

CREATE TABLE IF NOT EXISTS public.product_materials (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  material_slug text NOT NULL REFERENCES public.catalog_materials(slug) ON DELETE CASCADE,
  PRIMARY KEY(product_id,material_slug)
);

CREATE INDEX IF NOT EXISTS product_materials_material_idx ON public.product_materials(material_slug,product_id);

INSERT INTO public.product_materials(product_id,material_slug)
SELECT p.id,m.slug
FROM public.products p
CROSS JOIN public.catalog_materials m
WHERE p.category='fabrics'
  AND p.comp IS NOT NULL
  AND (
    (m.slug='cotton' AND p.comp ILIKE '%cotton%') OR
    (m.slug='polyester' AND p.comp ILIKE '%polyester%') OR
    (m.slug='linen' AND p.comp ILIKE '%linen%') OR
    (m.slug='viscose' AND (p.comp ILIKE '%viscose%' OR p.comp ILIKE '%rayon%' OR p.comp ILIKE '%modal%' OR p.comp ILIKE '%cupro%')) OR
    (m.slug='wool' AND (p.comp ILIKE '%wool%' OR p.comp ILIKE '%merino%' OR p.comp ILIKE '%cashmere%')) OR
    (m.slug='nylon' AND p.comp ILIKE '%nylon%') OR
    (m.slug='spandex' AND (p.comp ILIKE '%spandex%' OR p.comp ILIKE '%elastane%' OR p.comp ILIKE '%lycra%' OR p.comp ILIKE '%polyurethane%'))
  )
ON CONFLICT DO NOTHING;

ALTER TABLE public.product_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_materials_public_read ON public.product_materials;
CREATE POLICY product_materials_public_read ON public.product_materials FOR SELECT USING (true);

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
    WHERE (p_materials IS NULL OR cardinality(p_materials)=0 OR EXISTS (
      SELECT 1 FROM unnest(p_materials) requested
      JOIN public.catalog_materials material ON lower(requested)=material.slug OR lower(requested)=lower(material.label_i18n->>'en')
      JOIN public.product_materials membership ON membership.material_slug=material.slug AND membership.product_id=base.id
    ))
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
    'facets',jsonb_build_object('constructions',COALESCE((SELECT jsonb_object_agg(construction_slug,item_count) FROM (SELECT construction_slug,count(*) item_count FROM base WHERE construction_slug IS NOT NULL GROUP BY construction_slug) x),'{}'::jsonb),
      'materials',COALESCE((SELECT jsonb_object_agg(material.slug,(SELECT count(*) FROM base b JOIN public.product_materials pm ON pm.product_id=b.id WHERE pm.material_slug=material.slug)) FROM public.catalog_materials material WHERE material.active),'{}'::jsonb),
      'countries',COALESCE((SELECT jsonb_object_agg(region,item_count) FROM (SELECT supplier_region region,count(*) item_count FROM base WHERE supplier_region IS NOT NULL GROUP BY supplier_region) x),'{}'::jsonb),
      'regions',COALESCE((SELECT jsonb_object_agg(country,city_counts) FROM (SELECT supplier_region country,jsonb_object_agg(supplier_city,item_count) city_counts FROM (SELECT supplier_region,supplier_city,count(*) item_count FROM base WHERE supplier_region IS NOT NULL AND supplier_city IS NOT NULL GROUP BY supplier_region,supplier_city) x GROUP BY supplier_region) x),'{}'::jsonb)),
    'products',COALESCE((SELECT jsonb_agg((to_jsonb(paged)-'page_order')||jsonb_build_object(
      'supplier_name',supplier_name,'supplier_slug',supplier_slug,'supplier_region',supplier_region,'supplier_city',supplier_city,
      'catalog_prices',COALESCE((SELECT jsonb_object_agg(cp.currency,cp.catalog_amount) FROM public.catalog_prices cp WHERE cp.product_id=paged.id),'{}'::jsonb),
      'media',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.position) FROM public.product_media m WHERE m.product_id=paged.id),'[]'::jsonb)
    ) ORDER BY page_order) FROM paged),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;
