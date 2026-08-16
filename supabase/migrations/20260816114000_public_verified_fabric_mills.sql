-- Keep the regional OEM directory boundary while ensuring verified fabric
-- mills remain public factory destinations even when their location is not
-- disclosed. Product ownership supplies the verified catalogue relationship.
CREATE OR REPLACE FUNCTION public.public_list_catalog_factories(p_locale text DEFAULT 'en')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object(
    'product_count',(SELECT count(*) FROM public.products p WHERE p.factory_id=f.id AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL),
    'supplier_taxonomy_memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object('l2',m.l2,'l3',m.l3,'is_primary',m.is_primary)) FROM public.supplier_taxonomy_memberships m WHERE m.factory_id=f.id),'[]'::jsonb)
  ) ORDER BY f.name),'[]'::jsonb)
  FROM public.factories f
  WHERE f.verify_state='verified'
    AND f.archived_at IS NULL
    AND (f.type='fabric_mill' OR f.region IN ('Japan','China','South Korea'));
$$;

REVOKE ALL ON FUNCTION public.public_list_catalog_factories(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_catalog_factories(text) TO anon,authenticated;
