-- Private, buyer-assigned products for Atelix Sourcing and other admin-managed
-- company workspaces. Private products never participate in the public catalog.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_products_public_catalog ON public.products (listing_status, category) WHERE is_private = false;

CREATE TABLE IF NOT EXISTS public.product_brand_assignments (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_product_brand_assignments_profile ON public.product_brand_assignments(profile_id);
ALTER TABLE public.product_brand_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT USING (
  is_private = false OR (select public.is_admin()) OR EXISTS (
    SELECT 1 FROM public.product_brand_assignments pba
    WHERE pba.product_id = products.id AND pba.profile_id = (select auth.uid())
  )
);
DROP POLICY IF EXISTS product_brand_assignments_select ON public.product_brand_assignments;
CREATE POLICY product_brand_assignments_select ON public.product_brand_assignments
  FOR SELECT USING ((select public.is_admin()) OR profile_id = (select auth.uid()));
DROP POLICY IF EXISTS product_brand_assignments_admin_write ON public.product_brand_assignments;
CREATE POLICY product_brand_assignments_admin_write ON public.product_brand_assignments
  FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

CREATE OR REPLACE FUNCTION public.admin_lookup_brand_owner(search_email text)
RETURNS TABLE(profile_id uuid, email text, full_name text, company_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  RETURN QUERY SELECT p.id, u.email::text, p.full_name, p.company_name
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'buyer' AND lower(u.email) = lower(trim(search_email));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_private_product_assignments(target_product uuid, brand_emails text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE valid_emails text[];
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = target_product AND is_private = true) THEN
    RAISE EXCEPTION 'Private product not found';
  END IF;
  valid_emails := ARRAY(SELECT lower(trim(x)) FROM unnest(coalesce(brand_emails, '{}'::text[])) AS x WHERE trim(x) <> '');
  IF EXISTS (SELECT 1 FROM unnest(valid_emails) e WHERE NOT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.role='buyer' AND lower(u.email)=e)) THEN
    RAISE EXCEPTION 'Every assigned email must belong to a registered brand owner';
  END IF;
  DELETE FROM public.product_brand_assignments WHERE product_id = target_product;
  INSERT INTO public.product_brand_assignments(product_id, profile_id, assigned_by)
  SELECT target_product, p.id, auth.uid() FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.role='buyer' AND lower(u.email)=ANY(valid_emails);
END; $$;

REVOKE ALL ON FUNCTION public.admin_lookup_brand_owner(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_private_product_assignments(uuid, text[]) FROM PUBLIC, anon, authenticated;

INSERT INTO public.factories (slug, name, type, region, loc, verify_state, owner_profile_id)
SELECT 'atelix-sourcing', 'Atelix Sourcing', 'garment_manufacturer', 'Atelix', 'Private company workspace', 'unverified', p.id
FROM public.profiles p JOIN auth.users u ON u.id=p.id
WHERE lower(u.email)='jun@arcanawangsa.com'
ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, owner_profile_id=EXCLUDED.owner_profile_id;
