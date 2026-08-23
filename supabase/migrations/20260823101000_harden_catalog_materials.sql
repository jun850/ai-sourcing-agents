-- Harden an older taxonomy table that was created without RLS. Public and
-- browser reads need active material labels only; all taxonomy mutation stays
-- server/service-role controlled until a dedicated Intools write boundary exists.

ALTER TABLE public.catalog_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_materials_active_read ON public.catalog_materials;
CREATE POLICY catalog_materials_active_read ON public.catalog_materials
  FOR SELECT TO anon, authenticated USING (active = true);

REVOKE ALL ON TABLE public.catalog_materials FROM anon, authenticated;
GRANT SELECT ON TABLE public.catalog_materials TO anon, authenticated;
GRANT ALL ON TABLE public.catalog_materials TO service_role;
