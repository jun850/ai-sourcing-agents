-- Deliver RFQ Operations chat inserts through an authorized private Broadcast
-- topic. Broadcast keeps database change delivery out of the slower
-- postgres_changes replication path while the existing guarded RPCs remain the
-- sole writer of durable messages.

CREATE OR REPLACE FUNCTION public.rfq_ops_can_access_realtime_topic(p_topic text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_topic ~ '^rfq-ops:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:messages$'
    AND EXISTS (
      SELECT 1
      FROM public.rfq_ops_conversations c
      WHERE c.id = split_part(p_topic, ':', 2)::uuid
        AND (
          c.buyer_profile_id = auth.uid()
          OR public.rfq_ops_is_confirmed_admin()
        )
    );
$$;

REVOKE ALL ON FUNCTION public.rfq_ops_can_access_realtime_topic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rfq_ops_can_access_realtime_topic(text) TO authenticated;

DROP POLICY IF EXISTS rfq_ops_receive_private_broadcast ON realtime.messages;
CREATE POLICY rfq_ops_receive_private_broadcast
ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND public.rfq_ops_can_access_realtime_topic(realtime.topic())
);

CREATE OR REPLACE FUNCTION public.rfq_ops_broadcast_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'rfq-ops:' || NEW.conversation_id::text || ':messages',
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS rfq_ops_messages_broadcast_insert ON public.rfq_ops_messages;
CREATE TRIGGER rfq_ops_messages_broadcast_insert
AFTER INSERT ON public.rfq_ops_messages
FOR EACH ROW EXECUTE FUNCTION public.rfq_ops_broadcast_insert();

-- The message row is deliberately created before its reserved files are
-- linked. Emit an UPDATE after each immutable attachment link so a listening
-- peer can enrich the already-visible bubble without a thread fetch.
CREATE OR REPLACE FUNCTION public.rfq_ops_broadcast_attachment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message public.rfq_ops_messages;
BEGIN
  SELECT * INTO v_message
  FROM public.rfq_ops_messages
  WHERE id = NEW.message_id;

  PERFORM realtime.broadcast_changes(
    'rfq-ops:' || v_message.conversation_id::text || ':messages',
    'UPDATE',
    'UPDATE',
    'rfq_ops_messages',
    'public',
    v_message,
    NULL
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS rfq_ops_message_attachments_broadcast_insert ON public.rfq_ops_message_attachments;
CREATE TRIGGER rfq_ops_message_attachments_broadcast_insert
AFTER INSERT ON public.rfq_ops_message_attachments
FOR EACH ROW EXECUTE FUNCTION public.rfq_ops_broadcast_attachment_insert();

-- A single-message read is used only to enrich a freshly broadcast row with
-- private attachment metadata and the current buyer display name. The sender
-- is rendered immediately from the immutable broadcast record; this function
-- never replaces or reloads the active thread.
CREATE OR REPLACE FUNCTION public.rfq_ops_get_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  SELECT conversation_id INTO v_conversation_id
  FROM public.rfq_ops_messages
  WHERE id = p_message_id;

  IF v_conversation_id IS NULL OR auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rfq_ops_conversations c
    WHERE c.id = v_conversation_id
      AND (c.buyer_profile_id = auth.uid() OR public.rfq_ops_is_confirmed_admin())
  ) THEN
    RAISE EXCEPTION 'message not found' USING ERRCODE = '42501';
  END IF;

  RETURN public.rfq_ops_message_json(p_message_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rfq_ops_get_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rfq_ops_get_message(uuid) TO authenticated;
