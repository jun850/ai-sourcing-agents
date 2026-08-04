-- ============================================================================
-- ARCANA — 0014 auto-provision supplier factory row on signup
-- Extends handle_new_user() so a seller signup carrying a category
-- (factory_type in signup metadata) immediately gets a pending factories row,
-- instead of requiring manual admin linking (the prior early-access flow).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_role public.user_role;
  meta_factory_type text;
  base_slug text;
  factory_slug text;
BEGIN
  new_role := COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'buyer');

  INSERT INTO public.profiles (id, role, full_name, company_name, country)
  VALUES (
    new.id,
    new_role,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'country'
  );

  meta_factory_type := new.raw_user_meta_data->>'factory_type';

  IF new_role = 'seller' AND meta_factory_type IS NOT NULL THEN
    base_slug := trim(both '-' from lower(regexp_replace(
      COALESCE(new.raw_user_meta_data->>'company_name', 'supplier'),
      '[^a-zA-Z0-9]+', '-', 'g'
    )));
    factory_slug := base_slug || '-' || substr(new.id::text, 1, 8);

    INSERT INTO public.factories (slug, name, type, region, owner_profile_id, verify_state)
    VALUES (
      factory_slug,
      COALESCE(new.raw_user_meta_data->>'company_name', 'New Supplier'),
      meta_factory_type::public.factory_type,
      new.raw_user_meta_data->>'country',
      new.id,
      'pending'
    );
  END IF;

  RETURN new;
END;
$$;
