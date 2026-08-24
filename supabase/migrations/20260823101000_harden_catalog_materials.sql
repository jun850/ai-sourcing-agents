-- The catalogue was retired before this migration reached the target. Keep
-- this migration in history as a verified no-op when that legacy table is
-- absent; catalogue retirement is handled by the later broker cutover.
DO $$
BEGIN
  IF to_regclass('public.catalog_materials') IS NOT NULL THEN
    ALTER TABLE public.catalog_materials ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS catalog_materials_active_read ON public.catalog_materials;
    CREATE POLICY catalog_materials_active_read ON public.catalog_materials
      FOR SELECT TO anon, authenticated USING (active = true);
    REVOKE ALL ON TABLE public.catalog_materials FROM anon, authenticated;
    GRANT SELECT ON TABLE public.catalog_materials TO anon, authenticated;
    GRANT ALL ON TABLE public.catalog_materials TO service_role;
  END IF;
END;
$$;
