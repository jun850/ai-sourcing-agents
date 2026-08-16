-- A verified OEM supplier is a directory destination, not a cart line. Keep
-- those suppliers public even when it has not listed a purchasable SKU yet.
CREATE OR REPLACE FUNCTION public.public_list_catalog_factories(p_locale text DEFAULT 'en')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object(
    'product_count',(SELECT count(*) FROM public.products p WHERE p.factory_id=f.id AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL),
    'supplier_taxonomy_memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object('l2',m.l2,'l3',m.l3,'is_primary',m.is_primary)) FROM public.supplier_taxonomy_memberships m WHERE m.factory_id=f.id),'[]'::jsonb)
  ) ORDER BY f.name),'[]'::jsonb)
  FROM public.factories f
  WHERE f.verify_state='verified' AND f.archived_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.public_list_catalog_factories(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_catalog_factories(text) TO anon,authenticated;

-- Keep the long-standing public OEM supplier in the same L2/L3 directory as
-- its active OEM listings. The classification is based only on those public
-- listings, not on private supplier information.
UPDATE public.supplier_taxonomy_memberships membership
SET is_primary=false, updated_at=now()
WHERE membership.factory_id=(SELECT id FROM public.factories WHERE slug='F-04')
  AND membership.is_primary;

INSERT INTO public.supplier_taxonomy_memberships(
  factory_id,l2,l3,is_primary,classification_method,classification_evidence
)
SELECT id,'oem','clothing',true,'rule','Public active OEM listings'
FROM public.factories
WHERE slug='F-04' AND verify_state='verified' AND archived_at IS NULL
ON CONFLICT (factory_id,l2,l3) DO UPDATE
SET is_primary=true,
    classification_method=EXCLUDED.classification_method,
    classification_evidence=EXCLUDED.classification_evidence,
    updated_at=now();
