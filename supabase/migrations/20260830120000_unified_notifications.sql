-- One durable, per-recipient notification ledger.  The existing RFQ Ops
-- projection remains historical only; notifications themselves are the single
-- read authority for the bell.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('chat','order','account','campaign','agent','rfq','quote','invoice','payment','production'));

CREATE INDEX IF NOT EXISTS notifications_profile_unread_created_idx
  ON public.notifications (profile_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION public.notification_safe_href(p_href text, p_fallback text DEFAULT '/dashboard/requests')
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_href text := NULLIF(btrim(p_href), '');
BEGIN
  IF v_href IS NULL OR v_href !~ '^/' OR v_href ~ '^//' OR v_href ~ '[\\\\[:cntrl:]]' OR char_length(v_href) > 500 THEN
    RETURN p_fallback;
  END IF;
  RETURN v_href;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_destination(
  p_profile_id uuid, p_kind text, p_entity_type text, p_entity_id uuid, p_fallback text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT role = 'admin' INTO v_is_admin FROM public.profiles WHERE id = p_profile_id;
  IF p_entity_id IS NOT NULL AND p_entity_type = 'rfq_case' THEN
    RETURN CASE WHEN v_is_admin THEN '/intools/rfq/' || p_entity_id::text ELSE '/dashboard/requests/' || p_entity_id::text END;
  END IF;
  IF p_entity_id IS NOT NULL AND p_entity_type = 'rfq_message' THEN
    RETURN CASE WHEN v_is_admin THEN '/intools/messages/' || p_entity_id::text ELSE '/dashboard/messages/' || p_entity_id::text END;
  END IF;
  IF p_entity_id IS NOT NULL AND p_entity_type = 'invoice' THEN
    RETURN CASE WHEN v_is_admin THEN '/intools/invoices/' || p_entity_id::text ELSE '/dashboard/invoices/' || p_entity_id::text END;
  END IF;
  IF p_entity_type = 'order' THEN
    RETURN CASE WHEN v_is_admin THEN '/intools/orders' ELSE '/dashboard/products' END;
  END IF;
  IF p_kind = 'account' THEN RETURN '/dashboard/settings'; END IF;
  IF p_kind = 'chat' THEN RETURN CASE WHEN v_is_admin THEN '/intools/messages' ELSE '/dashboard/messages' END; END IF;
  IF p_kind IN ('rfq','quote','agent') THEN RETURN CASE WHEN v_is_admin THEN '/intools/rfq' ELSE '/dashboard/requests' END; END IF;
  IF p_kind IN ('invoice','payment') THEN RETURN CASE WHEN v_is_admin THEN '/intools/invoices' ELSE '/dashboard/invoices' END; END IF;
  RETURN public.notification_safe_href(p_fallback, CASE WHEN v_is_admin THEN '/intools/invoices' ELSE '/dashboard/requests' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_emit(
  p_profile_id uuid,
  p_kind text,
  p_title text,
  p_body text DEFAULT '',
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_fallback_href text DEFAULT NULL,
  p_marketing boolean DEFAULT false,
  p_priority text DEFAULT 'normal',
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_href text;
BEGIN
  IF p_profile_id IS NULL OR p_kind NOT IN ('chat','order','account','campaign','agent','rfq','quote','invoice','payment','production')
    OR char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 140
    OR char_length(COALESCE(p_body, '')) > 1000
    OR p_priority NOT IN ('normal','high') THEN
    RAISE EXCEPTION 'invalid notification' USING ERRCODE='22023';
  END IF;
  v_href := public.notification_destination(p_profile_id, p_kind, p_entity_type, p_entity_id, p_fallback_href);
  INSERT INTO public.notifications(profile_id, kind, priority, title, body, href, marketing, payload, entity_type, entity_id, idempotency_key)
  VALUES (p_profile_id, p_kind, p_priority, btrim(p_title), COALESCE(p_body, ''), v_href, p_marketing,
    COALESCE(p_payload, '{}'::jsonb), p_entity_type, p_entity_id, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO v_id;
  INSERT INTO public.notification_deliveries(notification_id, channel, status)
  VALUES (v_id, 'in_app', 'sent') ON CONFLICT DO NOTHING;
  RETURN v_id;
END;
$$;

-- Preserve the public signature used by older guarded server functions while
-- ensuring their links pass through the destination registry.
CREATE OR REPLACE FUNCTION public.notification_insert(
  p_profile_id uuid,p_kind text,p_title text,p_body text,p_href text,p_marketing boolean DEFAULT false,
  p_priority text DEFAULT 'normal',p_payload jsonb DEFAULT '{}'::jsonb,p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_entity_type text; v_entity_id uuid;
BEGIN
  v_entity_type := CASE
    WHEN p_kind = 'chat' THEN 'rfq_message'
    WHEN p_kind IN ('rfq','quote','agent') THEN 'rfq_case'
    WHEN p_kind IN ('invoice','payment') THEN 'invoice'
    WHEN p_kind IN ('order','production') THEN 'order'
    ELSE NULL
  END;
  BEGIN
    v_entity_id := COALESCE((p_payload->>'rfq_case_id')::uuid, (p_payload->>'invoice_id')::uuid, (p_payload->>'order_id')::uuid);
  EXCEPTION WHEN invalid_text_representation THEN v_entity_id := NULL;
  END;
  IF v_entity_id IS NULL AND p_kind IN ('order','production') AND NULLIF(p_payload->>'order_no','') IS NOT NULL THEN
    SELECT id INTO v_entity_id FROM public.orders WHERE order_no = p_payload->>'order_no';
  END IF;
  RETURN public.notification_emit(p_profile_id, p_kind, p_title, p_body, v_entity_type, v_entity_id,
    p_href, p_marketing, p_priority, p_payload, p_idempotency_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_emit_to_admins(
  p_kind text, p_title text, p_body text DEFAULT '', p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL, p_priority text DEFAULT 'normal', p_payload jsonb DEFAULT '{}'::jsonb,
  p_idempotency_prefix text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_profile record; v_count integer := 0;
BEGIN
  FOR v_profile IN
    SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'admin' AND u.email_confirmed_at IS NOT NULL
  LOOP
    PERFORM public.notification_emit(v_profile.id, p_kind, p_title, p_body, p_entity_type, p_entity_id,
      NULL, false, p_priority, p_payload,
      CASE WHEN p_idempotency_prefix IS NULL THEN NULL ELSE p_idempotency_prefix || ':' || v_profile.id::text END);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_emit_rfq_ops_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case record; v_body text;
BEGIN
  SELECT c.rfq_case_id, r.case_no, c.buyer_profile_id INTO v_case
  FROM public.rfq_ops_conversations c JOIN public.rfq_cases r ON r.id = c.rfq_case_id
  WHERE c.id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_body := CASE WHEN btrim(NEW.body) = '' THEN 'Attachment received' ELSE left(NEW.body, 1000) END;
  IF NEW.sender_kind = 'buyer' THEN
    PERFORM public.notification_emit_to_admins('chat', 'Message on ' || v_case.case_no, v_body,
      'rfq_message', v_case.rfq_case_id, 'high', jsonb_build_object('message_id', NEW.id), 'rfq-ops-message:' || NEW.id::text);
  ELSIF v_case.buyer_profile_id IS NOT NULL THEN
    PERFORM public.notification_emit(v_case.buyer_profile_id, 'chat', 'Atelix Operations replied on ' || v_case.case_no,
      v_body, 'rfq_message', v_case.rfq_case_id, NULL, false, 'high',
      jsonb_build_object('message_id', NEW.id), 'rfq-ops-message:' || NEW.id::text || ':' || v_case.buyer_profile_id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_emit_rfq_ops_message_after_insert ON public.rfq_ops_messages;
CREATE TRIGGER notification_emit_rfq_ops_message_after_insert
AFTER INSERT ON public.rfq_ops_messages FOR EACH ROW EXECUTE FUNCTION public.notification_emit_rfq_ops_message();

CREATE OR REPLACE FUNCTION public.notification_emit_rfq_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.buyer_profile_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'draft' THEN
    PERFORM public.notification_emit(NEW.buyer_profile_id, 'rfq', 'RFQ ' || NEW.case_no || ' updated',
      initcap(replace(NEW.status::text, '_', ' ')), 'rfq_case', NEW.id, NULL, false, 'normal',
      jsonb_build_object('status', NEW.status), 'rfq-stage:' || NEW.id::text || ':' || NEW.status::text || ':' || NEW.updated_at::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notification_emit_rfq_stage_after_update ON public.rfq_cases;
CREATE TRIGGER notification_emit_rfq_stage_after_update
AFTER UPDATE OF status ON public.rfq_cases FOR EACH ROW EXECUTE FUNCTION public.notification_emit_rfq_stage();

CREATE OR REPLACE FUNCTION public.notification_emit_quote_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases;
BEGIN
  IF NEW.status = 'published' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO v_case FROM public.rfq_cases WHERE id = NEW.rfq_case_id;
    IF v_case.buyer_profile_id IS NOT NULL THEN
      PERFORM public.notification_emit(v_case.buyer_profile_id, 'quote', 'Quote ready for ' || v_case.case_no,
        'Atelix has shared a reviewed quote for your approval.', 'rfq_case', v_case.id, NULL, false, 'high',
        jsonb_build_object('quote_id', NEW.id), 'quote-published:' || NEW.id::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notification_emit_quote_published_after_update ON public.rfq_quotes;
CREATE TRIGGER notification_emit_quote_published_after_update
AFTER UPDATE OF status ON public.rfq_quotes FOR EACH ROW EXECUTE FUNCTION public.notification_emit_quote_published();

CREATE OR REPLACE FUNCTION public.notification_emit_invoice_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'draft' THEN
    PERFORM public.notification_emit(NEW.buyer_profile_id,
      CASE WHEN NEW.status = 'paid' THEN 'payment' ELSE 'invoice' END,
      'Invoice ' || NEW.invoice_no || ' updated', initcap(replace(NEW.status::text, '_', ' ')),
      'invoice', NEW.id, NULL, false, CASE WHEN NEW.status IN ('sent','paid') THEN 'high' ELSE 'normal' END,
      jsonb_build_object('status', NEW.status), 'invoice-status:' || NEW.id::text || ':' || NEW.status::text || ':' || NEW.updated_at::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notification_emit_invoice_status_after_update ON public.invoices;
CREATE TRIGGER notification_emit_invoice_status_after_update
AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.notification_emit_invoice_status();

CREATE OR REPLACE FUNCTION public.notification_broadcast_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.read_at IS DISTINCT FROM NEW.read_at THEN
    PERFORM realtime.send(
      jsonb_build_object('notification_id', NEW.id, 'operation', lower(TG_OP)),
      'notification_changed', 'user:' || NEW.profile_id::text || ':notifications', true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_broadcast_change_after_write ON public.notifications;
CREATE TRIGGER notification_broadcast_change_after_write
AFTER INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notification_broadcast_change();

DROP POLICY IF EXISTS notification_broadcast_receive_self ON realtime.messages;
CREATE POLICY notification_broadcast_receive_self ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.topic() = 'user:' || auth.uid()::text || ':notifications');

-- Preserve the existing function signatures during the frontend rollout.
CREATE OR REPLACE FUNCTION public.workspace_notification_center(
  p_query text DEFAULT NULL, p_state text DEFAULT 'all', p_sort text DEFAULT 'newest', p_limit integer DEFAULT 80
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_query text := NULLIF(btrim(p_query), ''); v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF p_state NOT IN ('all','unread','read') OR p_sort NOT IN ('newest','oldest') OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid notification query' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_result FROM (
    SELECT n.id, 'notification'::text AS source, n.kind, n.title, n.body, n.href, n.read_at, n.created_at,
      CASE WHEN n.entity_type IN ('rfq_case','rfq_message') THEN n.entity_id ELSE NULL END AS rfq_case_id, false AS sent
    FROM public.notifications n
    WHERE n.profile_id = auth.uid() AND (n.expires_at IS NULL OR n.expires_at > now())
      AND (v_query IS NULL OR to_tsvector('simple', n.title || ' ' || n.body) @@ websearch_to_tsquery('simple', v_query))
      AND (p_state = 'all' OR (p_state = 'unread' AND n.read_at IS NULL) OR (p_state = 'read' AND n.read_at IS NOT NULL))
    ORDER BY CASE WHEN p_sort = 'newest' THEN n.created_at END DESC, CASE WHEN p_sort = 'oldest' THEN n.created_at END ASC
    LIMIT p_limit
  ) x;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_notification_center(
  p_query text DEFAULT NULL, p_state text DEFAULT 'all', p_sort text DEFAULT 'newest', p_limit integer DEFAULT 80
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
BEGIN
  PERFORM public.intools_require_admin();
  RETURN public.workspace_notification_center(p_query, p_state, p_sort, p_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_notification_unread_count() RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT count(*)::integer FROM public.notifications n
  WHERE n.profile_id = auth.uid() AND n.read_at IS NULL AND (n.expires_at IS NULL OR n.expires_at > now());
$$;

CREATE OR REPLACE FUNCTION public.intools_notification_unread_count() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
BEGIN PERFORM public.intools_require_admin(); RETURN public.workspace_notification_unread_count(); END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.notifications SET read_at = COALESCE(read_at, now())
  WHERE profile_id = auth.uid() AND read_at IS NULL AND (p_ids IS NULL OR id = ANY(p_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.intools_require_admin();
  RETURN public.mark_notifications_read(p_ids);
END;
$$;

-- Existing buyer-message notification rows are copied once. The old table's
-- shared Ops read state cannot represent per-admin history, so it is not used
-- as an active source after this migration.
INSERT INTO public.notifications(profile_id, kind, priority, title, body, href, payload, entity_type, entity_id, read_at, created_at, idempotency_key)
SELECT n.recipient_profile_id, 'chat', 'high', 'Message on ' || r.case_no,
  CASE WHEN btrim(m.body) = '' THEN 'Attachment received' ELSE left(m.body, 1000) END,
  '/dashboard/messages/' || c.rfq_case_id::text, jsonb_build_object('message_id', m.id),
  'rfq_message', c.rfq_case_id, n.read_at, n.created_at, 'rfq-ops-backfill:' || n.id::text
FROM public.rfq_ops_message_notifications n
JOIN public.rfq_ops_messages m ON m.id = n.message_id
JOIN public.rfq_ops_conversations c ON c.id = m.conversation_id
JOIN public.rfq_cases r ON r.id = c.rfq_case_id
WHERE n.recipient_kind = 'buyer' AND n.recipient_profile_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.notifications(profile_id, kind, priority, title, body, href, payload, entity_type, entity_id, read_at, created_at, idempotency_key)
SELECT p.id, 'chat', 'high', 'Message on ' || r.case_no,
  CASE WHEN btrim(m.body) = '' THEN 'Attachment received' ELSE left(m.body, 1000) END,
  '/intools/messages/' || c.rfq_case_id::text, jsonb_build_object('message_id', m.id),
  'rfq_message', c.rfq_case_id, n.read_at, n.created_at, 'rfq-ops-backfill:' || n.id::text || ':' || p.id::text
FROM public.rfq_ops_message_notifications n
JOIN public.rfq_ops_messages m ON m.id = n.message_id
JOIN public.rfq_ops_conversations c ON c.id = m.conversation_id
JOIN public.rfq_cases r ON r.id = c.rfq_case_id
JOIN public.profiles p ON p.role = 'admin'
JOIN auth.users u ON u.id = p.id AND u.email_confirmed_at IS NOT NULL
WHERE n.recipient_kind = 'atelix_ops'
ON CONFLICT (idempotency_key) DO NOTHING;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('notification_safe_href','notification_destination','notification_emit','notification_emit_to_admins','notification_emit_rfq_ops_message','notification_broadcast_change','workspace_notification_center','intools_notification_center','workspace_notification_unread_count','intools_notification_unread_count','mark_notifications_read','intools_mark_notifications_read')
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.workspace_notification_center(text,text,text,integer), public.workspace_notification_unread_count(), public.mark_notifications_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_notification_center(text,text,text,integer), public.intools_notification_unread_count(), public.intools_mark_notifications_read(uuid[]) TO authenticated;
