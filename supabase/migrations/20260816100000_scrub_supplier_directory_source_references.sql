-- Public supplier routing and media paths must not disclose the import source.
UPDATE public.factories
SET slug='oem-'||substring(slug FROM length('apparelx-')+1),
    img=replace(img,'/catalog-media/apparelx/','/catalog-media/oem-partners/'),
    logo_img=replace(logo_img,'/catalog-media/apparelx/','/catalog-media/oem-partners/'),
    page_img=replace(page_img,'/catalog-media/apparelx/','/catalog-media/oem-partners/')
WHERE slug LIKE 'apparelx-%';

-- Correct the supplier identity from the verified company website. Keep the
-- record public as a Japanese supplier, without inventing a city.
UPDATE public.factories
SET slug='yamamoto-co-ltd',
    name='Yamamoto Co., Ltd.',
    region='Japan',
    web='https://www.excy.co.jp/',
    copy_i18n=jsonb_build_object(
      'en',jsonb_build_object('name','Yamamoto Co., Ltd.','description','Verified supplier. Contact the supplier to confirm current capabilities, specifications, minimums, and terms.'),
      'ja',jsonb_build_object('name','Yamamoto Co., Ltd.','description','認証済みサプライヤーです。現在の対応範囲、仕様、最小ロット、条件はサプライヤーにご確認ください。'),
      'zh',jsonb_build_object('name','Yamamoto Co., Ltd.','description','已认证供应商。请联系供应商确认当前能力、规格、最低订购量和条款。')
    )
WHERE slug='yamamoto-excy';

-- A public sourcing directory is limited to the agreed East Asia coverage.
CREATE OR REPLACE FUNCTION public.public_list_catalog_factories(p_locale text DEFAULT 'en')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object(
    'product_count',(SELECT count(*) FROM public.products p WHERE p.factory_id=f.id AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL),
    'supplier_taxonomy_memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object('l2',m.l2,'l3',m.l3,'is_primary',m.is_primary)) FROM public.supplier_taxonomy_memberships m WHERE m.factory_id=f.id),'[]'::jsonb)
  ) ORDER BY f.name),'[]'::jsonb)
  FROM public.factories f
  WHERE f.verify_state='verified'
    AND f.archived_at IS NULL
    AND f.region IN ('Japan','China','South Korea');
$$;

REVOKE ALL ON FUNCTION public.public_list_catalog_factories(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_catalog_factories(text) TO anon,authenticated;
