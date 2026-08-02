-- ============================================================================
-- ARCANA — 0002 helper function + new-user trigger
-- Both functions pin search_path = '' and are SECURITY DEFINER so they run with
-- the owner's privileges (bypassing RLS) without exposing search_path hijacking.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- is_admin() — used across RLS policies. SECURITY DEFINER + STABLE so it reads
-- profiles without triggering recursive RLS evaluation on the profiles table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- handle_new_user() — mirrors every new auth.users row into public.profiles,
-- reading optional signup metadata (role/full_name/company_name/country).
-- Runs as definer, so no INSERT RLS policy on profiles is needed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, company_name, country)
  VALUES (
    new.id,
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'buyer'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'country'
  );
  RETURN new;
END;
$$;

-- Re-create the trigger idempotently.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
