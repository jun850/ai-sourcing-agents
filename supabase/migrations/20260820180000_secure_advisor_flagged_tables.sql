-- Resolve Supabase Advisor findings. Browser roles may read only the active
-- catalogue construction labels; payment transaction records are server-only.

ALTER TABLE public.catalog_constructions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_constructions FROM anon, authenticated;

-- This legacy table is present in the linked production database but not in
-- the local schema. Keep the migration portable while closing production's
-- exposed table immediately.
DO $$
BEGIN
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.payment_transactions FROM anon, authenticated;
  END IF;
END;
$$;

DROP POLICY IF EXISTS catalog_constructions_public_read ON public.catalog_constructions;
CREATE POLICY catalog_constructions_public_read
  ON public.catalog_constructions
  FOR SELECT
  TO anon, authenticated
  USING (active = true);
