-- "Mark all as read" for the notification center dropdown. Additive.
--
-- The buyer inbox merges two sources with different read authorities:
--   * public.notifications          — read_at is set directly (same as
--     mark_notifications_read(NULL)).
--   * public.rfq_ops_message_notifications — read_at is downstream of the
--     conversation read receipts (rfq_ops_sync_notification_reads trigger).
--     We therefore advance the reader's receipt to the latest message in every
--     conversation that still has an unread notification, and let the existing
--     trigger sync the notification rows forward. Receipts stay the single
--     read authority.
--
-- Both functions return the number of notifications that transitioned to read.

CREATE OR REPLACE FUNCTION public.workspace_mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  v_before := public.workspace_notification_unread_count();

  UPDATE public.notifications
  SET read_at = now()
  WHERE profile_id = auth.uid()
    AND read_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  INSERT INTO public.rfq_ops_conversation_reads AS r
    (conversation_id, reader_kind, reader_profile_id, last_read_message_id, last_read_at)
  SELECT c.id, 'buyer', auth.uid(), lm.id, lm.created_at
  FROM public.rfq_ops_conversations c
  JOIN LATERAL (
    SELECT m.id, m.created_at
    FROM public.rfq_ops_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) lm ON true
  WHERE c.buyer_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.rfq_ops_message_notifications n
      JOIN public.rfq_ops_messages m2 ON m2.id = n.message_id
      WHERE m2.conversation_id = c.id
        AND n.recipient_kind = 'buyer'
        AND n.recipient_profile_id = auth.uid()
        AND n.read_at IS NULL
    )
  ON CONFLICT (conversation_id, reader_kind) DO UPDATE
  SET reader_profile_id = EXCLUDED.reader_profile_id,
      last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at
  WHERE r.last_read_message_id IS NULL
     OR (EXCLUDED.last_read_message_id IS NOT NULL
         AND (EXCLUDED.last_read_at, EXCLUDED.last_read_message_id)
             >= (r.last_read_at, r.last_read_message_id));

  v_after := public.workspace_notification_unread_count();
  RETURN greatest(v_before - v_after, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  PERFORM public.intools_require_admin();

  v_before := public.intools_notification_unread_count();

  INSERT INTO public.rfq_ops_conversation_reads AS r
    (conversation_id, reader_kind, reader_profile_id, last_read_message_id, last_read_at)
  SELECT c.id, 'atelix_ops', auth.uid(), lm.id, lm.created_at
  FROM public.rfq_ops_conversations c
  JOIN LATERAL (
    SELECT m.id, m.created_at
    FROM public.rfq_ops_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) lm ON true
  WHERE EXISTS (
    SELECT 1
    FROM public.rfq_ops_message_notifications n
    JOIN public.rfq_ops_messages m2 ON m2.id = n.message_id
    WHERE m2.conversation_id = c.id
      AND n.recipient_kind = 'atelix_ops'
      AND n.read_at IS NULL
  )
  ON CONFLICT (conversation_id, reader_kind) DO UPDATE
  SET reader_profile_id = EXCLUDED.reader_profile_id,
      last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at
  WHERE r.last_read_message_id IS NULL
     OR (EXCLUDED.last_read_message_id IS NOT NULL
         AND (EXCLUDED.last_read_at, EXCLUDED.last_read_message_id)
             >= (r.last_read_at, r.last_read_message_id));

  v_after := public.intools_notification_unread_count();
  RETURN greatest(v_before - v_after, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intools_mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_mark_all_notifications_read() TO authenticated;
