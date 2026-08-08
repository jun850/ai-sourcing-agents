-- ============================================================================
-- ARCANA — admin supplier management
-- Verification changes and their audit rows are committed together through an
-- admin-only RPC. Regular profile/SKU edits continue to use existing RLS.
-- ============================================================================

-- The return type changes, so this function must be dropped before recreate.
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid, email text, role public.user_role, full_name text, company_name text,
  country text, created_at timestamptz, order_count bigint, factory_id uuid
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p.id, u.email::text, p.role, p.full_name, p.company_name, p.country, p.created_at,
         (SELECT count(*) FROM public.orders o WHERE o.buyer_profile_id = p.id) AS order_count,
         f.id AS factory_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.factories f ON f.owner_profile_id = p.id
  WHERE public.is_admin()
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
