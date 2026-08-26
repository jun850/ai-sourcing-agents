-- Durable in-app notifications for the private RFQ Operations conversation.
-- This is additive: the immutable message stream and its existing receipts
-- remain authoritative, while the notification projection provides one shared
-- Operations alert or one buyer alert for each incoming message.

CREATE TABLE IF NOT EXISTS public.rfq_ops_message_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.rfq_ops_messages(id) ON DELETE RESTRICT,
  recipient_kind public.rfq_ops_sender_kind NOT NULL,
  recipient_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, recipient_kind),
  CHECK ((recipient_kind = 'buyer' AND recipient_profile_id IS NOT NULL) OR (recipient_kind = 'atelix_ops' AND recipient_profile_id IS NULL))
);

CREATE INDEX IF NOT EXISTS rfq_ops_message_notifications_recipient_idx
  ON public.rfq_ops_message_notifications (recipient_profile_id, created_at DESC)
  WHERE recipient_kind = 'buyer';
CREATE INDEX IF NOT EXISTS rfq_ops_message_notifications_ops_idx
  ON public.rfq_ops_message_notifications (created_at DESC)
  WHERE recipient_kind = 'atelix_ops';
CREATE INDEX IF NOT EXISTS rfq_ops_message_notifications_unread_idx
  ON public.rfq_ops_message_notifications (created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS rfq_ops_messages_body_search_idx
  ON public.rfq_ops_messages USING gin (to_tsvector('simple', body));

ALTER TABLE public.rfq_ops_message_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rfq_ops_create_message_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_buyer uuid;
BEGIN
  IF NEW.sender_kind = 'buyer' THEN
    INSERT INTO public.rfq_ops_message_notifications(message_id, recipient_kind)
    VALUES (NEW.id, 'atelix_ops') ON CONFLICT (message_id, recipient_kind) DO NOTHING;
  ELSE
    SELECT buyer_profile_id INTO v_buyer FROM public.rfq_ops_conversations WHERE id = NEW.conversation_id;
    IF v_buyer IS NOT NULL THEN
      INSERT INTO public.rfq_ops_message_notifications(message_id, recipient_kind, recipient_profile_id)
      VALUES (NEW.id, 'buyer', v_buyer) ON CONFLICT (message_id, recipient_kind) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rfq_ops_message_notification_after_insert ON public.rfq_ops_messages;
CREATE TRIGGER rfq_ops_message_notification_after_insert
AFTER INSERT ON public.rfq_ops_messages FOR EACH ROW
EXECUTE FUNCTION public.rfq_ops_create_message_notification();

-- Existing conversation receipts are the single read authority. Synchronize
-- only forward from those receipts; notifications never mutate message rows.
CREATE OR REPLACE FUNCTION public.rfq_ops_sync_notification_reads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.rfq_ops_message_notifications n
  SET read_at = COALESCE(n.read_at, NEW.last_read_at)
  FROM public.rfq_ops_messages m
  WHERE n.message_id = m.id
    AND m.conversation_id = NEW.conversation_id
    AND n.recipient_kind = NEW.reader_kind
    AND n.read_at IS NULL
    AND (NEW.last_read_message_id IS NULL OR (m.created_at, m.id) <= (NEW.last_read_at, NEW.last_read_message_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rfq_ops_notification_reads_after_receipt ON public.rfq_ops_conversation_reads;
CREATE TRIGGER rfq_ops_notification_reads_after_receipt
AFTER INSERT OR UPDATE ON public.rfq_ops_conversation_reads FOR EACH ROW
EXECUTE FUNCTION public.rfq_ops_sync_notification_reads();

-- Make the notification center useful immediately without changing the read
-- meaning of any historic conversation.
INSERT INTO public.rfq_ops_message_notifications(message_id, recipient_kind, recipient_profile_id, read_at, created_at)
SELECT m.id,
  CASE WHEN m.sender_kind = 'buyer' THEN 'atelix_ops'::public.rfq_ops_sender_kind ELSE 'buyer'::public.rfq_ops_sender_kind END,
  CASE WHEN m.sender_kind = 'atelix_ops' THEN c.buyer_profile_id ELSE NULL END,
  CASE WHEN r.last_read_message_id IS NOT NULL AND (m.created_at, m.id) <= (r.last_read_at, r.last_read_message_id) THEN r.last_read_at ELSE NULL END,
  m.created_at
FROM public.rfq_ops_messages m
JOIN public.rfq_ops_conversations c ON c.id = m.conversation_id
LEFT JOIN public.rfq_ops_conversation_reads r ON r.conversation_id = m.conversation_id
  AND r.reader_kind = CASE WHEN m.sender_kind = 'buyer' THEN 'atelix_ops'::public.rfq_ops_sender_kind ELSE 'buyer'::public.rfq_ops_sender_kind END
WHERE (m.sender_kind = 'buyer' OR c.buyer_profile_id IS NOT NULL)
ON CONFLICT (message_id, recipient_kind) DO NOTHING;

CREATE OR REPLACE FUNCTION public.workspace_notification_center(
  p_query text DEFAULT NULL, p_state text DEFAULT 'all', p_sort text DEFAULT 'newest', p_limit integer DEFAULT 80
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_query text := NULLIF(btrim(p_query), ''); v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF p_state NOT IN ('all','unread','read') OR p_sort NOT IN ('newest','oldest') OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid notification query' USING ERRCODE='22023';
  END IF;
  WITH items AS (
    SELECT n.id, 'notification'::text AS source, n.kind, n.title, n.body, n.href, n.read_at, n.created_at, NULL::uuid AS rfq_case_id, false AS sent
    FROM public.notifications n
    WHERE n.profile_id = auth.uid() AND (n.expires_at IS NULL OR n.expires_at > now())
      AND (v_query IS NULL OR to_tsvector('simple', n.title || ' ' || n.body) @@ websearch_to_tsquery('simple', v_query))
      AND (p_state = 'all' OR (p_state = 'unread' AND n.read_at IS NULL) OR (p_state = 'read' AND n.read_at IS NOT NULL))
    UNION ALL
    SELECT n.id, 'rfq_message'::text, 'chat'::text,
      'Message on ' || c.case_no, left(m.body, 1000), '/dashboard/messages/' || c.rfq_case_id::text,
      n.read_at, n.created_at, c.rfq_case_id, false
    FROM public.rfq_ops_message_notifications n
    JOIN public.rfq_ops_messages m ON m.id=n.message_id JOIN public.rfq_ops_conversations c ON c.id=m.conversation_id
    WHERE n.recipient_kind='buyer' AND n.recipient_profile_id=auth.uid()
      AND (v_query IS NULL OR to_tsvector('simple', m.body || ' ' || c.case_no) @@ websearch_to_tsquery('simple', v_query))
      AND (p_state='all' OR (p_state='unread' AND n.read_at IS NULL) OR (p_state='read' AND n.read_at IS NOT NULL))
    UNION ALL
    SELECT m.id, 'rfq_message'::text, 'chat'::text,
      'Message on ' || c.case_no, left(m.body, 1000), '/dashboard/messages/' || c.rfq_case_id::text,
      NULL::timestamptz, m.created_at, c.rfq_case_id, true
    FROM public.rfq_ops_messages m JOIN public.rfq_ops_conversations c ON c.id=m.conversation_id
    WHERE v_query IS NOT NULL AND c.buyer_profile_id=auth.uid() AND m.sender_kind='buyer' AND p_state='all'
      AND to_tsvector('simple', m.body || ' ' || c.case_no) @@ websearch_to_tsquery('simple', v_query)
  ) SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY CASE WHEN p_sort='newest' THEN x.created_at END DESC, CASE WHEN p_sort='oldest' THEN x.created_at END ASC),'[]'::jsonb) INTO v_result
  FROM (SELECT * FROM items ORDER BY CASE WHEN p_sort='newest' THEN created_at END DESC, CASE WHEN p_sort='oldest' THEN created_at END ASC LIMIT p_limit) x;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_notification_center(
  p_query text DEFAULT NULL, p_state text DEFAULT 'all', p_sort text DEFAULT 'newest', p_limit integer DEFAULT 80
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_query text := NULLIF(btrim(p_query), ''); v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_state NOT IN ('all','unread','read') OR p_sort NOT IN ('newest','oldest') OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid notification query' USING ERRCODE='22023'; END IF;
  WITH items AS (
    SELECT n.id, 'rfq_message'::text AS source, 'chat'::text AS kind, 'Message on ' || c.case_no AS title,
      left(m.body,1000) AS body, '/intools/messages/' || c.rfq_case_id::text AS href, n.read_at, n.created_at, c.rfq_case_id, false AS sent
    FROM public.rfq_ops_message_notifications n JOIN public.rfq_ops_messages m ON m.id=n.message_id JOIN public.rfq_ops_conversations c ON c.id=m.conversation_id
    WHERE n.recipient_kind='atelix_ops'
      AND (v_query IS NULL OR to_tsvector('simple',m.body || ' ' || c.case_no || ' ' || c.buyer_label) @@ websearch_to_tsquery('simple',v_query))
      AND (p_state='all' OR (p_state='unread' AND n.read_at IS NULL) OR (p_state='read' AND n.read_at IS NOT NULL))
    UNION ALL
    SELECT m.id, 'rfq_message'::text, 'chat'::text, 'Message on ' || c.case_no, left(m.body,1000),
      '/intools/messages/' || c.rfq_case_id::text, NULL::timestamptz, m.created_at, c.rfq_case_id, true
    FROM public.rfq_ops_messages m JOIN public.rfq_ops_conversations c ON c.id=m.conversation_id
    WHERE v_query IS NOT NULL AND m.sender_kind='atelix_ops' AND p_state='all'
      AND to_tsvector('simple',m.body || ' ' || c.case_no || ' ' || c.buyer_label) @@ websearch_to_tsquery('simple',v_query)
  ) SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY CASE WHEN p_sort='newest' THEN x.created_at END DESC, CASE WHEN p_sort='oldest' THEN x.created_at END ASC),'[]'::jsonb) INTO v_result
  FROM (SELECT * FROM items ORDER BY CASE WHEN p_sort='newest' THEN created_at END DESC, CASE WHEN p_sort='oldest' THEN created_at END ASC LIMIT p_limit) x;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_notification_unread_count() RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT (SELECT count(*)::integer FROM public.notifications n WHERE n.profile_id=auth.uid() AND n.read_at IS NULL AND (n.expires_at IS NULL OR n.expires_at>now()))
    + (SELECT count(*)::integer FROM public.rfq_ops_message_notifications n WHERE n.recipient_kind='buyer' AND n.recipient_profile_id=auth.uid() AND n.read_at IS NULL);
$$;
CREATE OR REPLACE FUNCTION public.intools_notification_unread_count() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$ BEGIN PERFORM public.intools_require_admin(); RETURN (SELECT count(*)::integer FROM public.rfq_ops_message_notifications WHERE recipient_kind='atelix_ops' AND read_at IS NULL); END; $$;

-- The prior email reply reminder is retired. Keep its historical rows inert.
DROP TRIGGER IF EXISTS rfq_ops_reply_reminder_after_insert ON public.rfq_ops_messages;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = ''atelix-rfq-ops-reply-reminder''';
  END IF;
END $$;

REVOKE ALL ON TABLE public.rfq_ops_message_notifications FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rfq_ops_create_message_notification(), public.rfq_ops_sync_notification_reads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_notification_center(text,text,text,integer), public.workspace_notification_unread_count(), public.intools_notification_center(text,text,text,integer), public.intools_notification_unread_count() TO authenticated;
