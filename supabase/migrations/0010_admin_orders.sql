-- ============================================================================
-- ARCANA — 0010 admin order management RPCs
-- Both are SECURITY DEFINER (need auth.users.email + cross-buyer visibility)
-- and gate on public.is_admin() internally; no new RLS write policy on orders
-- is needed since all writes still go through an RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin_list_orders() — every order, buyer name/email, item count. Admin-only
-- (returns zero rows for non-admins rather than erroring).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_orders()
RETURNS TABLE (
  id uuid, order_no text, status public.order_status, total numeric,
  placed_at timestamptz, buyer_name text, buyer_email text, item_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT o.id, o.order_no, o.status, o.total, o.placed_at,
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

-- ---------------------------------------------------------------------------
-- admin_update_order_status() — set status (incl. 'cancelled'), log an
-- order_status_events row, return what the caller needs to fire the email
-- notification (order_status_events already had no INSERT policy — RPC-only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_no text,
  p_status public.order_status,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  order_no text, status public.order_status,
  buyer_email text, buyer_name text, total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT o.id INTO v_order_id FROM public.orders o WHERE o.order_no = p_order_no;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  UPDATE public.orders SET status = p_status WHERE id = v_order_id;

  INSERT INTO public.order_status_events (order_id, status, note, created_by)
  VALUES (v_order_id, p_status, p_note, auth.uid());

  RETURN QUERY
  SELECT o.order_no, o.status,
         u.email::text, COALESCE(p.company_name, p.full_name), o.total
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.buyer_profile_id
  JOIN auth.users u ON u.id = o.buyer_profile_id
  WHERE o.id = v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(text, public.order_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(text, public.order_status, text) TO authenticated;
