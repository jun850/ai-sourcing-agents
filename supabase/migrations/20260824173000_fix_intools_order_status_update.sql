-- Preserve the existing status, audit, and notification workflow while
-- qualifying the orders lookup. The output parameter `order_no` otherwise
-- shadows the column reference in PL/pgSQL at execution time.
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_no text,
  p_status public.order_status,
  p_note text DEFAULT NULL
)
RETURNS TABLE(
  order_no text,
  status public.order_status,
  buyer_email text,
  buyer_name text,
  total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_notification uuid;
  v_label text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.order_no = p_order_no
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  UPDATE public.orders
  SET status = p_status
  WHERE id = v_order.id;

  INSERT INTO public.order_status_events(order_id, status, note, created_by)
  VALUES (v_order.id, p_status, p_note, auth.uid());

  v_label := initcap(replace(p_status::text, '_', ' '));
  v_notification := public.notification_insert(
    v_order.buyer_profile_id,
    'order',
    'Order ' || v_order.order_no || ' updated',
    v_label || CASE
      WHEN p_note IS NOT NULL AND btrim(p_note) <> ''
        THEN ': ' || left(btrim(p_note), 700)
      ELSE ''
    END,
    '/pages/brand-owner.html#orders',
    false,
    'high',
    jsonb_build_object('order_no', v_order.order_no),
    'order:' || v_order.id || ':' || p_status::text || ':' || coalesce(p_note, '')
  );

  IF COALESCE((
    SELECT pref.transactional_email
    FROM public.notification_preferences AS pref
    WHERE pref.profile_id = v_order.buyer_profile_id
  ), true) THEN
    INSERT INTO public.notification_deliveries(notification_id, channel, status)
    VALUES (v_notification, 'email', 'queued')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    v_order.order_no,
    p_status,
    u.email::text,
    coalesce(p.company_name, p.full_name),
    v_order.total
  FROM public.profiles AS p
  JOIN auth.users AS u ON u.id = p.id
  WHERE p.id = v_order.buyer_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(text, public.order_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(text, public.order_status, text) TO authenticated;
