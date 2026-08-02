-- ============================================================================
-- ARCANA — 0012 admin users table + orders-by-buyer filter
-- ============================================================================

-- admin_list_orders now also returns buyer_profile_id, so the client can
-- filter orders by an exact user rather than matching on name/email.
DROP FUNCTION IF EXISTS public.admin_list_orders();

CREATE FUNCTION public.admin_list_orders()
RETURNS TABLE (
  id uuid, order_no text, status public.order_status, total numeric,
  placed_at timestamptz, buyer_profile_id uuid, buyer_name text, buyer_email text, item_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT o.id, o.order_no, o.status, o.total, o.placed_at, o.buyer_profile_id,
         COALESCE(p.company_name, p.full_name) AS buyer_name,
         u.email::text AS buyer_email,
         (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.buyer_profile_id
  JOIN auth.users u ON u.id = o.buyer_profile_id
  WHERE public.is_admin()
  ORDER BY o.placed_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_orders() TO authenticated;

-- admin_list_users() — every account on the platform, with an order count.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid, email text, role public.user_role, full_name text, company_name text,
  country text, created_at timestamptz, order_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p.id, u.email::text, p.role, p.full_name, p.company_name, p.country, p.created_at,
         (SELECT count(*) FROM public.orders o WHERE o.buyer_profile_id = p.id) AS order_count
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE public.is_admin()
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
