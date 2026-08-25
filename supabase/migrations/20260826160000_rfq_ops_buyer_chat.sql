-- RFQ-scoped human messaging between the buyer and Atelix Ops.
-- This is deliberately separate from athelia_thread_messages and from the
-- legacy buyer/supplier conversations/messages tables. Chat messages and their
-- attachment metadata are append-only records; there is no retention job.

DO $$ BEGIN
  CREATE TYPE public.rfq_ops_sender_kind AS ENUM ('buyer', 'atelix_ops');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.rfq_ops_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL UNIQUE REFERENCES public.rfq_cases(id) ON DELETE RESTRICT,
  buyer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  buyer_label text NOT NULL CHECK (char_length(btrim(buyer_label)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rfq_ops_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.rfq_ops_conversations(id) ON DELETE RESTRICT,
  client_message_id uuid NOT NULL,
  sender_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_kind public.rfq_ops_sender_kind NOT NULL,
  sender_label text NOT NULL CHECK (char_length(btrim(sender_label)) BETWEEN 1 AND 160),
  -- Empty body represents an attachment-only message; send RPCs require an
  -- attachment whenever it is empty.
  body text NOT NULL DEFAULT '' CHECK (char_length(btrim(body)) <= 12000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, client_message_id)
);

CREATE TABLE IF NOT EXISTS public.rfq_ops_message_attachments (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.rfq_ops_messages(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL CHECK (char_length(btrim(original_name)) BETWEEN 1 AND 255),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- An upload must be reserved by an authorized participant before Storage will
-- accept it. Reservations expire naturally; no history or sent object purge is
-- introduced here. Twenty active reservations cap abandoned composer uploads.
CREATE TABLE IF NOT EXISTS public.rfq_ops_upload_reservations (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.rfq_ops_conversations(id) ON DELETE RESTRICT,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE RESTRICT,
  uploader_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  client_message_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL CHECK (char_length(btrim(original_name)) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  consumed_at timestamptz,
  message_id uuid REFERENCES public.rfq_ops_messages(id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  UNIQUE (uploader_profile_id, conversation_id, client_message_id, id)
);

-- Buyer reads and the whole Intools operations queue each have independent
-- receipts. A read receipt may change; a sent message never may.
CREATE TABLE IF NOT EXISTS public.rfq_ops_conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.rfq_ops_conversations(id) ON DELETE RESTRICT,
  reader_kind public.rfq_ops_sender_kind NOT NULL,
  reader_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_read_message_id uuid REFERENCES public.rfq_ops_messages(id) ON DELETE RESTRICT,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, reader_kind)
);

CREATE INDEX IF NOT EXISTS rfq_ops_conversations_buyer_created_idx
  ON public.rfq_ops_conversations (buyer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rfq_ops_messages_conversation_created_idx
  ON public.rfq_ops_messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS rfq_ops_messages_sender_created_idx
  ON public.rfq_ops_messages (sender_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS rfq_ops_attachments_message_idx
  ON public.rfq_ops_message_attachments (message_id, created_at, id);
CREATE INDEX IF NOT EXISTS rfq_ops_upload_reservations_active_idx
  ON public.rfq_ops_upload_reservations (uploader_profile_id, expires_at)
  WHERE consumed_at IS NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rfq-message-attachments', 'rfq-message-attachments', false, 26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.rfq_ops_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_ops_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_ops_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_ops_conversation_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_ops_upload_reservations ENABLE ROW LEVEL SECURITY;

-- Policies use this non-throwing helper because a policy must evaluate false,
-- rather than raise, for a normal buyer. Intools RPCs themselves call the
-- stricter public.intools_require_admin() guard below.
CREATE OR REPLACE FUNCTION public.rfq_ops_is_confirmed_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.is_admin()
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.rfq_ops_is_confirmed_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rfq_ops_is_confirmed_admin() TO authenticated;

-- Storage policies cannot directly inspect the private reservation table: its
-- RLS and table privileges intentionally remain closed to browser roles.
CREATE OR REPLACE FUNCTION public.rfq_ops_can_insert_reserved_object(p_storage_path text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rfq_ops_upload_reservations r
    WHERE r.storage_path = p_storage_path
      AND r.uploader_profile_id = auth.uid()
      AND r.consumed_at IS NULL
      AND r.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.rfq_ops_can_delete_reserved_object(p_storage_path text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rfq_ops_upload_reservations r
    WHERE r.storage_path = p_storage_path
      AND r.uploader_profile_id = auth.uid()
      AND r.consumed_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.rfq_ops_can_insert_reserved_object(text),
  public.rfq_ops_can_delete_reserved_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rfq_ops_can_insert_reserved_object(text),
  public.rfq_ops_can_delete_reserved_object(text) TO authenticated;

-- Realtime postgres_changes needs a SELECT policy. There are intentionally no
-- browser table-write policies: all writes are through the guarded RPCs below.
DROP POLICY IF EXISTS rfq_ops_messages_realtime_read ON public.rfq_ops_messages;
CREATE POLICY rfq_ops_messages_realtime_read ON public.rfq_ops_messages
FOR SELECT TO authenticated USING (
  public.rfq_ops_is_confirmed_admin()
  OR EXISTS (
    SELECT 1
    FROM public.rfq_ops_conversations c
    WHERE c.id = conversation_id AND c.buyer_profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS rfq_ops_storage_read ON storage.objects;
CREATE POLICY rfq_ops_storage_read ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'rfq-message-attachments'
  AND (
    public.rfq_ops_is_confirmed_admin()
    OR EXISTS (
      SELECT 1 FROM public.rfq_cases c
      WHERE c.buyer_profile_id = auth.uid()
        AND name ~ ('^[0-9a-f-]{36}/' || c.id::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$')
    )
  )
);

-- Files are uploaded before send, including clipboard images. They are then
-- checked again inside the send RPC and linked atomically to an immutable row.
DROP POLICY IF EXISTS rfq_ops_storage_insert ON storage.objects;
CREATE POLICY rfq_ops_storage_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'rfq-message-attachments'
  AND name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$')
  AND public.rfq_ops_can_insert_reserved_object(name)
);

-- Browser mutation is never allowed. An uploader may only cancel an
-- unconsumed reserved upload; once a message consumes it the object is kept.
DROP POLICY IF EXISTS rfq_ops_storage_update ON storage.objects;
DROP POLICY IF EXISTS rfq_ops_storage_delete ON storage.objects;
CREATE POLICY rfq_ops_storage_delete ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'rfq-message-attachments'
  AND public.rfq_ops_can_delete_reserved_object(name)
);

CREATE OR REPLACE FUNCTION public.rfq_ops_prevent_message_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A profile deletion uses this FK action. It preserves every message field
  -- that carries historical meaning and leaves the sender snapshot intact.
  IF TG_OP = 'UPDATE'
    AND OLD.sender_profile_id IS NOT NULL AND NEW.sender_profile_id IS NULL
    AND NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.conversation_id IS NOT DISTINCT FROM OLD.conversation_id
    AND NEW.client_message_id IS NOT DISTINCT FROM OLD.client_message_id
    AND NEW.sender_kind IS NOT DISTINCT FROM OLD.sender_kind
    AND NEW.sender_label IS NOT DISTINCT FROM OLD.sender_label
    AND NEW.body IS NOT DISTINCT FROM OLD.body
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'RFQ operations chat messages are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.rfq_ops_prevent_attachment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'RFQ operations chat attachments are immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS rfq_ops_messages_immutable ON public.rfq_ops_messages;
CREATE TRIGGER rfq_ops_messages_immutable
BEFORE UPDATE OR DELETE ON public.rfq_ops_messages
FOR EACH ROW EXECUTE FUNCTION public.rfq_ops_prevent_message_mutation();

DROP TRIGGER IF EXISTS rfq_ops_attachments_immutable ON public.rfq_ops_message_attachments;
CREATE TRIGGER rfq_ops_attachments_immutable
BEFORE UPDATE OR DELETE ON public.rfq_ops_message_attachments
FOR EACH ROW EXECUTE FUNCTION public.rfq_ops_prevent_attachment_mutation();

CREATE OR REPLACE FUNCTION public.rfq_ops_message_json(p_message_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'rfq_case_id', c.rfq_case_id,
    'client_message_id', m.client_message_id,
    'sender_profile_id', m.sender_profile_id,
    'sender_role', CASE WHEN m.sender_kind = 'atelix_ops' THEN 'ops' ELSE 'buyer' END,
    'sender_label', m.sender_label,
    'body', m.body,
    'created_at', m.created_at,
    'read_at', receipt.last_read_at,
    'attachments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'message_id', a.message_id, 'conversation_id', m.conversation_id,
        'rfq_case_id', c.rfq_case_id, 'storage_path', a.storage_path,
        'original_name', a.original_name, 'content_type', a.content_type,
        'byte_size', a.byte_size, 'created_at', a.created_at
      ) ORDER BY a.created_at, a.id)
      FROM public.rfq_ops_message_attachments a
      WHERE a.message_id = m.id
    ), '[]'::jsonb)
  )
  FROM public.rfq_ops_messages m
  JOIN public.rfq_ops_conversations c ON c.id = m.conversation_id
  LEFT JOIN public.rfq_ops_conversation_reads receipt ON receipt.conversation_id = m.conversation_id
    AND receipt.reader_kind = CASE WHEN m.sender_kind = 'buyer' THEN 'atelix_ops'::public.rfq_ops_sender_kind ELSE 'buyer'::public.rfq_ops_sender_kind END
  WHERE m.id = p_message_id;
$$;

CREATE OR REPLACE FUNCTION public.rfq_ops_reserve_upload_internal(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_attachment_id uuid,
  p_original_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conversation public.rfq_ops_conversations;
  v_reservation public.rfq_ops_upload_reservations;
  v_original_name text := btrim(COALESCE(p_original_name, ''));
  v_safe_name text;
  v_outstanding integer;
BEGIN
  IF p_client_message_id IS NULL OR p_attachment_id IS NULL
    OR char_length(v_original_name) NOT BETWEEN 1 AND 255
    OR position('/' IN v_original_name) > 0 OR position(E'\\' IN v_original_name) > 0 THEN
    RAISE EXCEPTION 'invalid upload reservation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_conversation FROM public.rfq_ops_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002'; END IF;

  v_safe_name := regexp_replace(regexp_replace(v_original_name, '[^A-Za-z0-9._-]', '_', 'g'), '^\\.+', '');
  v_safe_name := COALESCE(NULLIF(v_safe_name, ''), 'attachment');
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
  SELECT * INTO v_reservation FROM public.rfq_ops_upload_reservations WHERE id = p_attachment_id FOR UPDATE;
  IF FOUND THEN
    IF v_reservation.uploader_profile_id = auth.uid()
      AND v_reservation.conversation_id = p_conversation_id
      AND v_reservation.client_message_id = p_client_message_id
      AND v_reservation.original_name = v_original_name
      AND v_reservation.consumed_at IS NULL THEN
      IF v_reservation.expires_at <= now() THEN
        UPDATE public.rfq_ops_upload_reservations SET expires_at = now() + interval '1 hour'
        WHERE id = v_reservation.id RETURNING * INTO v_reservation;
      END IF;
      RETURN jsonb_build_object('id', v_reservation.id, 'conversation_id', v_reservation.conversation_id,
        'rfq_case_id', v_reservation.rfq_case_id, 'client_message_id', v_reservation.client_message_id,
        'storage_path', v_reservation.storage_path, 'original_name', v_reservation.original_name,
        'expires_at', v_reservation.expires_at);
    END IF;
    RAISE EXCEPTION 'attachment id is not available for this upload' USING ERRCODE = '23505';
  END IF;
  -- Expired reservations whose upload was cancelled are disposable control
  -- records, not chat history. This never touches a Storage object or a sent
  -- attachment reservation.
  DELETE FROM public.rfq_ops_upload_reservations r
  WHERE r.uploader_profile_id = auth.uid()
    AND r.consumed_at IS NULL
    AND r.expires_at <= now()
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'rfq-message-attachments' AND o.name = r.storage_path
    );
  SELECT count(*) INTO v_outstanding FROM public.rfq_ops_upload_reservations
  WHERE uploader_profile_id = auth.uid() AND consumed_at IS NULL;
  IF v_outstanding >= 20 THEN
    RAISE EXCEPTION 'too many outstanding uploads; finish or cancel existing uploads' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.rfq_ops_upload_reservations(
    id, conversation_id, rfq_case_id, uploader_profile_id, client_message_id, storage_path, original_name
  ) VALUES (
    p_attachment_id, v_conversation.id, v_conversation.rfq_case_id, auth.uid(), p_client_message_id,
    auth.uid()::text || '/' || v_conversation.rfq_case_id::text || '/' || p_client_message_id::text || '/' || p_attachment_id::text || '/' || v_safe_name,
    v_original_name
  ) RETURNING * INTO v_reservation;
  RETURN jsonb_build_object('id', v_reservation.id, 'conversation_id', v_reservation.conversation_id,
    'rfq_case_id', v_reservation.rfq_case_id, 'client_message_id', v_reservation.client_message_id,
    'storage_path', v_reservation.storage_path, 'original_name', v_reservation.original_name,
    'expires_at', v_reservation.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_reserve_ops_upload(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_attachment_id uuid,
  p_original_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rfq_ops_conversations WHERE id = p_conversation_id AND buyer_profile_id = auth.uid()
  ) THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501'; END IF;
  RETURN public.rfq_ops_reserve_upload_internal(p_conversation_id, p_client_message_id, p_attachment_id, p_original_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_reserve_buyer_upload(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_attachment_id uuid,
  p_original_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.intools_require_admin();
  RETURN public.rfq_ops_reserve_upload_internal(p_conversation_id, p_client_message_id, p_attachment_id, p_original_name);
END;
$$;

-- Validates the uploaded object metadata and inserts immutable attachment rows
-- in the caller's transaction. p_attachments is an array of
-- { id, storage_path, original_name }; clipboard images use this same shape.
CREATE OR REPLACE FUNCTION public.rfq_ops_record_attachments(
  p_message_id uuid,
  p_conversation_id uuid,
  p_rfq_case_id uuid,
  p_client_message_id uuid,
  p_attachments jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_attachment_id uuid;
  v_storage_path text;
  v_original_name text;
  v_metadata jsonb;
  v_content_type text;
  v_byte_size bigint;
  v_reservation public.rfq_ops_upload_reservations;
  v_count integer := 0;
BEGIN
  IF p_attachments IS NULL OR jsonb_typeof(p_attachments) <> 'array'
    OR jsonb_array_length(p_attachments) > 10 THEN
    RAISE EXCEPTION 'attachments must be an array of at most 10 files' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR COALESCE(v_item->>'id', '') !~ '^[0-9a-fA-F-]{36}$'
      OR COALESCE(v_item->>'original_name', '') = ''
      OR char_length(btrim(v_item->>'original_name')) > 255
      OR position('/' IN (v_item->>'original_name')) > 0
      OR position(E'\\' IN (v_item->>'original_name')) > 0 THEN
      RAISE EXCEPTION 'invalid attachment descriptor' USING ERRCODE = '22023';
    END IF;

    v_attachment_id := (v_item->>'id')::uuid;
    v_original_name := btrim(v_item->>'original_name');
    v_storage_path := v_item->>'storage_path';

    -- The client retains the original display filename separately, while the
    -- object leaf is a storage-safe filename. The immutable path prefix still
    -- binds the object to this author, RFQ, message UUID and attachment UUID.
    IF COALESCE(v_storage_path, '') !~ ('^' || auth.uid()::text || '/' || p_rfq_case_id::text || '/' || p_client_message_id::text || '/' || v_attachment_id::text || '/[^/]+$') THEN
      RAISE EXCEPTION 'attachment path does not match the required upload path' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_reservation FROM public.rfq_ops_upload_reservations r
    WHERE r.id = v_attachment_id
      AND r.conversation_id = p_conversation_id
      AND r.rfq_case_id = p_rfq_case_id
      AND r.uploader_profile_id = auth.uid()
      AND r.client_message_id = p_client_message_id
      AND r.storage_path = v_storage_path
      AND r.original_name = v_original_name
      AND r.consumed_at IS NULL
      AND r.expires_at > now()
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'active upload reservation was not found' USING ERRCODE = '42501';
    END IF;

    SELECT o.metadata INTO v_metadata
    FROM storage.objects o
    WHERE o.bucket_id = 'rfq-message-attachments' AND o.name = v_storage_path;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'uploaded attachment was not found' USING ERRCODE = 'P0002';
    END IF;

    v_content_type := COALESCE(v_metadata->>'mimetype', v_metadata->>'contentType');
    IF COALESCE(v_metadata->>'size', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'uploaded attachment has invalid size metadata' USING ERRCODE = '22023';
    END IF;
    v_byte_size := (v_metadata->>'size')::bigint;
    IF v_content_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      OR v_byte_size NOT BETWEEN 1 AND 26214400 THEN
      RAISE EXCEPTION 'attachment type or size is not allowed' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.rfq_ops_message_attachments(
      id, message_id, storage_path, original_name, content_type, byte_size
    ) VALUES (
      v_attachment_id, p_message_id, v_storage_path, v_original_name, v_content_type, v_byte_size
    );
    UPDATE public.rfq_ops_upload_reservations
    SET consumed_at = now(), message_id = p_message_id
    WHERE id = v_reservation.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rfq_ops_upsert_conversation(p_rfq_case_id uuid)
RETURNS public.rfq_ops_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.rfq_cases;
  v_conversation public.rfq_ops_conversations;
  v_buyer_label text;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases WHERE id = p_rfq_case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(NULLIF(btrim(company_name), ''), NULLIF(btrim(full_name), ''), 'Buyer')
    INTO v_buyer_label
  FROM public.profiles WHERE id = v_case.buyer_profile_id;

  INSERT INTO public.rfq_ops_conversations(rfq_case_id, buyer_profile_id, buyer_label)
  VALUES (v_case.id, v_case.buyer_profile_id, left(COALESCE(v_buyer_label, 'Buyer'), 160))
  ON CONFLICT (rfq_case_id) DO NOTHING;
  SELECT * INTO v_conversation FROM public.rfq_ops_conversations WHERE rfq_case_id = v_case.id;
  RETURN v_conversation;
END;
$$;

-- Every existing and future RFQ gets its dedicated operations thread before a
-- first message is sent, so both inboxes expose an RFQ immediately.
INSERT INTO public.rfq_ops_conversations(rfq_case_id, buyer_profile_id, buyer_label)
SELECT c.id, c.buyer_profile_id,
  left(COALESCE(NULLIF(btrim(p.company_name), ''), NULLIF(btrim(p.full_name), ''), 'Buyer'), 160)
FROM public.rfq_cases c
LEFT JOIN public.profiles p ON p.id = c.buyer_profile_id
ON CONFLICT (rfq_case_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rfq_ops_create_case_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.rfq_ops_upsert_conversation(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS rfq_ops_create_case_conversation ON public.rfq_cases;
CREATE TRIGGER rfq_ops_create_case_conversation
AFTER INSERT ON public.rfq_cases
FOR EACH ROW EXECUTE FUNCTION public.rfq_ops_create_case_conversation();

CREATE OR REPLACE FUNCTION public.rfq_ops_conversation_json(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'rfq_case_id', c.rfq_case_id, 'case_no', r.case_no,
    'rfq_title', r.title, 'rfq_status', r.status, 'buyer_profile_id', c.buyer_profile_id,
    'buyer_name', COALESCE(NULLIF(btrim(p.full_name), ''), c.buyer_label),
    'buyer_email', u.email::text, 'created_at', c.created_at,
    'updated_at', COALESCE((SELECT max(m.created_at) FROM public.rfq_ops_messages m WHERE m.conversation_id = c.id), c.created_at)
  )
  FROM public.rfq_ops_conversations c
  JOIN public.rfq_cases r ON r.id = c.rfq_case_id
  LEFT JOIN public.profiles p ON p.id = c.buyer_profile_id
  LEFT JOIN auth.users u ON u.id = c.buyer_profile_id
  WHERE c.id = p_conversation_id;
$$;

CREATE OR REPLACE FUNCTION public.rfq_ops_get_buyer_conversation(p_rfq_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_conversation public.rfq_ops_conversations;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rfq_cases WHERE id = p_rfq_case_id AND buyer_profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE = '42501';
  END IF;
  v_conversation := public.rfq_ops_upsert_conversation(p_rfq_case_id);
  RETURN public.rfq_ops_conversation_json(v_conversation.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_get_buyer_conversation(p_rfq_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_conversation public.rfq_ops_conversations;
BEGIN
  PERFORM public.intools_require_admin();
  v_conversation := public.rfq_ops_upsert_conversation(p_rfq_case_id);
  RETURN public.rfq_ops_conversation_json(v_conversation.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rfq_ops_idempotent_message_matches(
  p_message_id uuid,
  p_sender_kind public.rfq_ops_sender_kind,
  p_body text,
  p_attachments jsonb
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH expected AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', value->>'id', 'storage_path', value->>'storage_path', 'original_name', value->>'original_name'
    ) ORDER BY value->>'id'), '[]'::jsonb) AS attachments
    FROM jsonb_array_elements(p_attachments)
  ), actual AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id::text, 'storage_path', a.storage_path, 'original_name', a.original_name
    ) ORDER BY a.id::text), '[]'::jsonb) AS attachments
    FROM public.rfq_ops_message_attachments a WHERE a.message_id = p_message_id
  )
  SELECT m.sender_profile_id IS NOT DISTINCT FROM auth.uid()
    AND m.sender_kind = p_sender_kind
    AND m.body = p_body
    AND actual.attachments = expected.attachments
  FROM public.rfq_ops_messages m CROSS JOIN actual CROSS JOIN expected
  WHERE m.id = p_message_id;
$$;

CREATE OR REPLACE FUNCTION public.workspace_send_ops_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_body text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conversation public.rfq_ops_conversations;
  v_message public.rfq_ops_messages;
  v_body text := btrim(COALESCE(p_body, ''));
  v_attachment_count integer;
  v_label text;
BEGIN
  SELECT * INTO v_conversation FROM public.rfq_ops_conversations
  WHERE id = p_conversation_id AND buyer_profile_id = auth.uid();
  IF auth.uid() IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501';
  END IF;
  IF p_client_message_id IS NULL OR char_length(v_body) > 12000 THEN
    RAISE EXCEPTION 'invalid message' USING ERRCODE = '22023';
  END IF;
  IF p_attachments IS NULL OR jsonb_typeof(p_attachments) <> 'array' OR jsonb_array_length(p_attachments) > 10 THEN
    RAISE EXCEPTION 'attachments must be an array of at most 10 files' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_message FROM public.rfq_ops_messages
  WHERE conversation_id = v_conversation.id AND client_message_id = p_client_message_id;
  IF FOUND THEN
    IF NOT public.rfq_ops_idempotent_message_matches(v_message.id, 'buyer', v_body, p_attachments) THEN
      RAISE EXCEPTION 'client message id was already used with different content' USING ERRCODE = '23505';
    END IF;
    RETURN public.rfq_ops_message_json(v_message.id);
  END IF;

  SELECT COALESCE(NULLIF(btrim(company_name), ''), NULLIF(btrim(full_name), ''), 'Buyer')
    INTO v_label FROM public.profiles WHERE id = auth.uid();
  BEGIN
    INSERT INTO public.rfq_ops_messages(conversation_id, client_message_id, sender_profile_id, sender_kind, sender_label, body)
    VALUES (v_conversation.id, p_client_message_id, auth.uid(), 'buyer', left(COALESCE(v_label, 'Buyer'), 160), v_body)
    RETURNING * INTO v_message;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_message FROM public.rfq_ops_messages
    WHERE conversation_id = v_conversation.id AND client_message_id = p_client_message_id;
    IF NOT FOUND OR NOT public.rfq_ops_idempotent_message_matches(v_message.id, 'buyer', v_body, p_attachments) THEN
      RAISE EXCEPTION 'client message id was already used with different content' USING ERRCODE = '23505';
    END IF;
    RETURN public.rfq_ops_message_json(v_message.id);
  END;
  v_attachment_count := public.rfq_ops_record_attachments(v_message.id, v_conversation.id, v_conversation.rfq_case_id, p_client_message_id, COALESCE(p_attachments, '[]'::jsonb));
  IF v_body = '' AND v_attachment_count = 0 THEN
    RAISE EXCEPTION 'a message needs text or an attachment' USING ERRCODE = '22023';
  END IF;
  RETURN public.rfq_ops_message_json(v_message.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_send_buyer_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_body text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conversation public.rfq_ops_conversations;
  v_message public.rfq_ops_messages;
  v_body text := btrim(COALESCE(p_body, ''));
  v_attachment_count integer;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_client_message_id IS NULL OR char_length(v_body) > 12000 THEN
    RAISE EXCEPTION 'invalid message' USING ERRCODE = '22023';
  END IF;
  IF p_attachments IS NULL OR jsonb_typeof(p_attachments) <> 'array' OR jsonb_array_length(p_attachments) > 10 THEN
    RAISE EXCEPTION 'attachments must be an array of at most 10 files' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_conversation FROM public.rfq_ops_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_message FROM public.rfq_ops_messages
  WHERE conversation_id = v_conversation.id AND client_message_id = p_client_message_id;
  IF FOUND THEN
    IF NOT public.rfq_ops_idempotent_message_matches(v_message.id, 'atelix_ops', v_body, p_attachments) THEN
      RAISE EXCEPTION 'client message id was already used with different content' USING ERRCODE = '23505';
    END IF;
    RETURN public.rfq_ops_message_json(v_message.id);
  END IF;

  BEGIN
    INSERT INTO public.rfq_ops_messages(conversation_id, client_message_id, sender_profile_id, sender_kind, sender_label, body)
    VALUES (v_conversation.id, p_client_message_id, auth.uid(), 'atelix_ops', 'Atelix Ops', v_body)
    RETURNING * INTO v_message;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_message FROM public.rfq_ops_messages
    WHERE conversation_id = v_conversation.id AND client_message_id = p_client_message_id;
    IF NOT FOUND OR NOT public.rfq_ops_idempotent_message_matches(v_message.id, 'atelix_ops', v_body, p_attachments) THEN
      RAISE EXCEPTION 'client message id was already used with different content' USING ERRCODE = '23505';
    END IF;
    RETURN public.rfq_ops_message_json(v_message.id);
  END;
  v_attachment_count := public.rfq_ops_record_attachments(v_message.id, v_conversation.id, v_conversation.rfq_case_id, p_client_message_id, COALESCE(p_attachments, '[]'::jsonb));
  IF v_body = '' AND v_attachment_count = 0 THEN
    RAISE EXCEPTION 'a message needs text or an attachment' USING ERRCODE = '22023';
  END IF;
  RETURN public.rfq_ops_message_json(v_message.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_list_ops_messages(
  p_conversation_id uuid,
  p_before jsonb DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_result jsonb; v_before_created timestamptz; v_before_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rfq_ops_conversations c WHERE c.id = p_conversation_id AND c.buyer_profile_id = auth.uid()
  ) THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501'; END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'limit must be between 1 and 100' USING ERRCODE = '22023'; END IF;
  IF p_before IS NOT NULL THEN
    IF jsonb_typeof(p_before) <> 'object' OR COALESCE(p_before->>'created_at', '') = '' OR COALESCE(p_before->>'id', '') !~ '^[0-9a-fA-F-]{36}$' THEN
      RAISE EXCEPTION 'cursor must include created_at and id' USING ERRCODE = '22023';
    END IF;
    BEGIN v_before_created := (p_before->>'created_at')::timestamptz; v_before_id := (p_before->>'id')::uuid;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid cursor' USING ERRCODE = '22023'; END;
  END IF;
  SELECT jsonb_build_object(
    'conversation', public.rfq_ops_conversation_json(p_conversation_id),
    'messages', COALESCE(jsonb_agg(public.rfq_ops_message_json(x.id) ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb),
    'next_before', CASE WHEN count(x.id) = 0 THEN NULL ELSE jsonb_build_object(
      'created_at', (array_agg(x.created_at ORDER BY x.created_at, x.id))[1],
      'id', (array_agg(x.id ORDER BY x.created_at, x.id))[1]
    ) END
  ) INTO v_result
  FROM (
    SELECT m.id, m.created_at FROM public.rfq_ops_messages m
    WHERE m.conversation_id = p_conversation_id AND (p_before IS NULL OR (m.created_at, m.id) < (v_before_created, v_before_id))
    ORDER BY m.created_at DESC, m.id DESC LIMIT p_limit
  ) x;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_list_buyer_messages(
  p_conversation_id uuid,
  p_before jsonb DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_result jsonb; v_before_created timestamptz; v_before_id uuid;
BEGIN
  PERFORM public.intools_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.rfq_ops_conversations WHERE id = p_conversation_id) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'limit must be between 1 and 100' USING ERRCODE = '22023'; END IF;
  IF p_before IS NOT NULL THEN
    IF jsonb_typeof(p_before) <> 'object' OR COALESCE(p_before->>'created_at', '') = '' OR COALESCE(p_before->>'id', '') !~ '^[0-9a-fA-F-]{36}$' THEN
      RAISE EXCEPTION 'cursor must include created_at and id' USING ERRCODE = '22023';
    END IF;
    BEGIN v_before_created := (p_before->>'created_at')::timestamptz; v_before_id := (p_before->>'id')::uuid;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid cursor' USING ERRCODE = '22023'; END;
  END IF;
  SELECT jsonb_build_object(
    'conversation', public.rfq_ops_conversation_json(p_conversation_id),
    'messages', COALESCE(jsonb_agg(public.rfq_ops_message_json(x.id) ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb),
    'next_before', CASE WHEN count(x.id) = 0 THEN NULL ELSE jsonb_build_object(
      'created_at', (array_agg(x.created_at ORDER BY x.created_at, x.id))[1],
      'id', (array_agg(x.id ORDER BY x.created_at, x.id))[1]
    ) END
  ) INTO v_result
  FROM (
    SELECT m.id, m.created_at FROM public.rfq_ops_messages m
    WHERE m.conversation_id = p_conversation_id AND (p_before IS NULL OR (m.created_at, m.id) < (v_before_created, v_before_id))
    ORDER BY m.created_at DESC, m.id DESC LIMIT p_limit
  ) x;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_mark_ops_conversation_read(
  p_conversation_id uuid,
  p_through_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_read_at timestamptz := now(); v_read_message_id uuid := p_through_message_id;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rfq_ops_conversations c WHERE c.id = p_conversation_id AND c.buyer_profile_id = auth.uid()
  ) THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501'; END IF;
  IF p_through_message_id IS NOT NULL THEN
    SELECT id, created_at INTO v_read_message_id, v_read_at FROM public.rfq_ops_messages
    WHERE id = p_through_message_id AND conversation_id = p_conversation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'message not found' USING ERRCODE = 'P0002'; END IF;
  ELSE
    SELECT id, created_at INTO v_read_message_id, v_read_at FROM public.rfq_ops_messages
    WHERE conversation_id = p_conversation_id ORDER BY created_at DESC, id DESC LIMIT 1;
    IF NOT FOUND THEN v_read_at := now(); v_read_message_id := NULL; END IF;
  END IF;
  INSERT INTO public.rfq_ops_conversation_reads(conversation_id, reader_kind, reader_profile_id, last_read_message_id, last_read_at)
  VALUES (p_conversation_id, 'buyer', auth.uid(), v_read_message_id, v_read_at)
  ON CONFLICT (conversation_id, reader_kind) DO UPDATE
  SET reader_profile_id = EXCLUDED.reader_profile_id, last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at
  WHERE public.rfq_ops_conversation_reads.last_read_message_id IS NULL
    OR (EXCLUDED.last_read_message_id IS NOT NULL AND (EXCLUDED.last_read_at, EXCLUDED.last_read_message_id) >=
      (public.rfq_ops_conversation_reads.last_read_at, public.rfq_ops_conversation_reads.last_read_message_id));
  SELECT last_read_message_id, last_read_at INTO v_read_message_id, v_read_at
  FROM public.rfq_ops_conversation_reads WHERE conversation_id = p_conversation_id AND reader_kind = 'buyer';
  RETURN jsonb_build_object('conversation_id', p_conversation_id, 'reader_kind', 'buyer',
    'last_read_message_id', v_read_message_id, 'last_read_at', v_read_at, 'read_at', v_read_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_mark_buyer_conversation_read(
  p_conversation_id uuid,
  p_through_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_read_at timestamptz := now(); v_read_message_id uuid := p_through_message_id;
BEGIN
  PERFORM public.intools_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.rfq_ops_conversations WHERE id = p_conversation_id) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_through_message_id IS NOT NULL THEN
    SELECT id, created_at INTO v_read_message_id, v_read_at FROM public.rfq_ops_messages
    WHERE id = p_through_message_id AND conversation_id = p_conversation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'message not found' USING ERRCODE = 'P0002'; END IF;
  ELSE
    SELECT id, created_at INTO v_read_message_id, v_read_at FROM public.rfq_ops_messages
    WHERE conversation_id = p_conversation_id ORDER BY created_at DESC, id DESC LIMIT 1;
    IF NOT FOUND THEN v_read_at := now(); v_read_message_id := NULL; END IF;
  END IF;
  INSERT INTO public.rfq_ops_conversation_reads(conversation_id, reader_kind, reader_profile_id, last_read_message_id, last_read_at)
  VALUES (p_conversation_id, 'atelix_ops', auth.uid(), v_read_message_id, v_read_at)
  ON CONFLICT (conversation_id, reader_kind) DO UPDATE
  SET reader_profile_id = EXCLUDED.reader_profile_id, last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at
  WHERE public.rfq_ops_conversation_reads.last_read_message_id IS NULL
    OR (EXCLUDED.last_read_message_id IS NOT NULL AND (EXCLUDED.last_read_at, EXCLUDED.last_read_message_id) >=
      (public.rfq_ops_conversation_reads.last_read_at, public.rfq_ops_conversation_reads.last_read_message_id));
  SELECT last_read_message_id, last_read_at INTO v_read_message_id, v_read_at
  FROM public.rfq_ops_conversation_reads WHERE conversation_id = p_conversation_id AND reader_kind = 'atelix_ops';
  RETURN jsonb_build_object('conversation_id', p_conversation_id, 'reader_kind', 'atelix_ops',
    'last_read_message_id', v_read_message_id, 'last_read_at', v_read_at, 'read_at', v_read_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.rfq_ops_get_buyer_unread_count()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('unread_count', count(*))
  FROM public.rfq_ops_messages m
  JOIN public.rfq_ops_conversations c ON c.id = m.conversation_id
  LEFT JOIN public.rfq_ops_conversation_reads r ON r.conversation_id = c.id AND r.reader_kind = 'buyer'
  WHERE c.buyer_profile_id = auth.uid()
    AND m.sender_kind = 'atelix_ops'
    AND (r.last_read_message_id IS NULL OR (m.created_at, m.id) > (r.last_read_at, r.last_read_message_id));
$$;

CREATE OR REPLACE FUNCTION public.intools_get_buyer_unread_count()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_count bigint;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT count(*) INTO v_count
  FROM public.rfq_ops_messages m
  JOIN public.rfq_ops_conversations c ON c.id = m.conversation_id
  LEFT JOIN public.rfq_ops_conversation_reads r ON r.conversation_id = c.id AND r.reader_kind = 'atelix_ops'
  WHERE m.sender_kind = 'buyer'
    AND (r.last_read_message_id IS NULL OR (m.created_at, m.id) > (r.last_read_at, r.last_read_message_id));
  RETURN jsonb_build_object('unread_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_list_ops_conversations(
  p_before jsonb DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_result jsonb; v_before_created timestamptz; v_before_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'limit must be between 1 and 100' USING ERRCODE = '22023'; END IF;
  IF p_before IS NOT NULL THEN
    IF jsonb_typeof(p_before) <> 'object' OR COALESCE(p_before->>'created_at', '') = '' OR COALESCE(p_before->>'id', '') !~ '^[0-9a-fA-F-]{36}$' THEN
      RAISE EXCEPTION 'cursor must include created_at and id' USING ERRCODE = '22023';
    END IF;
    BEGIN v_before_created := (p_before->>'created_at')::timestamptz; v_before_id := (p_before->>'id')::uuid;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid cursor' USING ERRCODE = '22023'; END;
  END IF;
  SELECT jsonb_build_object(
    'conversations', COALESCE(jsonb_agg(x.payload ORDER BY x.last_activity_at DESC, x.id DESC), '[]'::jsonb),
    'next_before', CASE WHEN count(x.id) = 0 THEN NULL ELSE jsonb_build_object(
      'created_at', (array_agg(x.last_activity_at ORDER BY x.last_activity_at, x.id))[1],
      'id', (array_agg(x.id ORDER BY x.last_activity_at, x.id))[1]
    ) END
  ) INTO v_result
  FROM (
    SELECT c.id, COALESCE(last_message.created_at, c.created_at) AS last_activity_at,
      public.rfq_ops_conversation_json(c.id) || jsonb_build_object(
        'last_message_id', last_message.id,
        'last_message_body', last_message.body,
        'last_message_sender_role', CASE WHEN last_message.sender_kind = 'atelix_ops' THEN 'ops' WHEN last_message.sender_kind = 'buyer' THEN 'buyer' ELSE NULL END,
        'last_message_at', last_message.created_at,
        'buyer_unread_count', unread.count,
        'ops_unread_count', (SELECT count(*)::integer FROM public.rfq_ops_messages om
          LEFT JOIN public.rfq_ops_conversation_reads orc ON orc.conversation_id = c.id AND orc.reader_kind = 'atelix_ops'
          WHERE om.conversation_id = c.id AND om.sender_kind = 'buyer'
            AND (orc.last_read_message_id IS NULL OR (om.created_at, om.id) > (orc.last_read_at, orc.last_read_message_id)))
      ) AS payload
    FROM public.rfq_ops_conversations c
    LEFT JOIN LATERAL (
      SELECT m.id, m.body, m.sender_kind, m.created_at FROM public.rfq_ops_messages m
      WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) last_message ON true
    LEFT JOIN public.rfq_ops_conversation_reads receipt ON receipt.conversation_id = c.id AND receipt.reader_kind = 'buyer'
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS count FROM public.rfq_ops_messages m
      WHERE m.conversation_id = c.id AND m.sender_kind = 'atelix_ops'
        AND (receipt.last_read_message_id IS NULL OR (m.created_at, m.id) > (receipt.last_read_at, receipt.last_read_message_id))
    ) unread ON true
    WHERE c.buyer_profile_id = auth.uid()
      AND (p_before IS NULL OR (COALESCE(last_message.created_at, c.created_at), c.id) < (v_before_created, v_before_id))
    ORDER BY COALESCE(last_message.created_at, c.created_at) DESC, c.id DESC LIMIT p_limit
  ) x;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_list_buyer_conversations(
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_result jsonb; v_query text := NULLIF(btrim(p_query), ''); v_before_created timestamptz; v_before_id uuid;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'limit must be between 1 and 100' USING ERRCODE = '22023'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('all', 'unread', 'read') THEN
    RAISE EXCEPTION 'status must be all, unread, or read' USING ERRCODE = '22023';
  END IF;
  IF p_before IS NOT NULL THEN
    IF jsonb_typeof(p_before) <> 'object' OR COALESCE(p_before->>'created_at', '') = '' OR COALESCE(p_before->>'id', '') !~ '^[0-9a-fA-F-]{36}$' THEN
      RAISE EXCEPTION 'cursor must include created_at and id' USING ERRCODE = '22023';
    END IF;
    BEGIN v_before_created := (p_before->>'created_at')::timestamptz; v_before_id := (p_before->>'id')::uuid;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid cursor' USING ERRCODE = '22023'; END;
  END IF;
  SELECT jsonb_build_object(
    'conversations', COALESCE(jsonb_agg(x.payload ORDER BY x.last_activity_at DESC, x.id DESC), '[]'::jsonb),
    'next_before', CASE WHEN count(x.id) = 0 THEN NULL ELSE jsonb_build_object(
      'created_at', (array_agg(x.last_activity_at ORDER BY x.last_activity_at, x.id))[1],
      'id', (array_agg(x.id ORDER BY x.last_activity_at, x.id))[1]
    ) END
  ) INTO v_result
  FROM (
    SELECT c.id, COALESCE(last_message.created_at, c.created_at) AS last_activity_at,
      public.rfq_ops_conversation_json(c.id) || jsonb_build_object(
        'last_message_id', last_message.id,
        'last_message_body', last_message.body,
        'last_message_sender_role', CASE WHEN last_message.sender_kind = 'atelix_ops' THEN 'ops' WHEN last_message.sender_kind = 'buyer' THEN 'buyer' ELSE NULL END,
        'last_message_at', last_message.created_at,
        'buyer_unread_count', (SELECT count(*)::integer FROM public.rfq_ops_messages bm
          LEFT JOIN public.rfq_ops_conversation_reads brc ON brc.conversation_id = c.id AND brc.reader_kind = 'buyer'
          WHERE bm.conversation_id = c.id AND bm.sender_kind = 'atelix_ops'
            AND (brc.last_read_message_id IS NULL OR (bm.created_at, bm.id) > (brc.last_read_at, brc.last_read_message_id))),
        'ops_unread_count', unread.count
      ) AS payload
    FROM public.rfq_ops_conversations c
    JOIN public.rfq_cases rfq ON rfq.id = c.rfq_case_id
    LEFT JOIN public.profiles buyer ON buyer.id = c.buyer_profile_id
    LEFT JOIN auth.users buyer_user ON buyer_user.id = c.buyer_profile_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.body, m.sender_kind, m.created_at FROM public.rfq_ops_messages m
      WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) last_message ON true
    LEFT JOIN public.rfq_ops_conversation_reads receipt ON receipt.conversation_id = c.id AND receipt.reader_kind = 'atelix_ops'
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS count FROM public.rfq_ops_messages m
      WHERE m.conversation_id = c.id AND m.sender_kind = 'buyer'
        AND (receipt.last_read_message_id IS NULL OR (m.created_at, m.id) > (receipt.last_read_at, receipt.last_read_message_id))
    ) unread ON true
    WHERE (v_query IS NULL OR concat_ws(' ', rfq.case_no, rfq.title, c.buyer_label, buyer_user.email) ILIKE '%' || v_query || '%')
      AND (p_status IS NULL OR p_status = 'all' OR (p_status = 'unread' AND unread.count > 0) OR (p_status = 'read' AND unread.count = 0))
      AND (p_before IS NULL OR (COALESCE(last_message.created_at, c.created_at), c.id) < (v_before_created, v_before_id))
    ORDER BY COALESCE(last_message.created_at, c.created_at) DESC, c.id DESC LIMIT p_limit
  ) x;
  RETURN v_result;
END;
$$;

REVOKE ALL ON TABLE public.rfq_ops_conversations, public.rfq_ops_messages,
  public.rfq_ops_message_attachments, public.rfq_ops_conversation_reads,
  public.rfq_ops_upload_reservations FROM anon, authenticated;
-- Required for RLS-gated Realtime INSERT delivery; no direct write privilege
-- is granted to browser roles.
GRANT SELECT ON TABLE public.rfq_ops_messages TO authenticated;
REVOKE ALL ON FUNCTION public.rfq_ops_prevent_message_mutation(), public.rfq_ops_prevent_attachment_mutation(),
  public.rfq_ops_message_json(uuid), public.rfq_ops_record_attachments(uuid, uuid, uuid, uuid, jsonb),
  public.rfq_ops_upsert_conversation(uuid), public.rfq_ops_conversation_json(uuid),
  public.rfq_ops_create_case_conversation(),
  public.rfq_ops_idempotent_message_matches(uuid, public.rfq_ops_sender_kind, text, jsonb),
  public.rfq_ops_reserve_upload_internal(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rfq_ops_get_buyer_conversation(uuid), public.intools_get_buyer_conversation(uuid),
  public.workspace_send_ops_message(uuid, uuid, text, jsonb), public.intools_send_buyer_message(uuid, uuid, text, jsonb),
  public.workspace_reserve_ops_upload(uuid, uuid, uuid, text), public.intools_reserve_buyer_upload(uuid, uuid, uuid, text),
  public.workspace_list_ops_messages(uuid, jsonb, integer), public.intools_list_buyer_messages(uuid, jsonb, integer),
  public.workspace_mark_ops_conversation_read(uuid, uuid), public.intools_mark_buyer_conversation_read(uuid, uuid),
  public.rfq_ops_get_buyer_unread_count(), public.intools_get_buyer_unread_count(),
  public.workspace_list_ops_conversations(jsonb, integer),
  public.intools_list_buyer_conversations(text, text, jsonb, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rfq_ops_get_buyer_conversation(uuid), public.intools_get_buyer_conversation(uuid),
  public.workspace_send_ops_message(uuid, uuid, text, jsonb),
  public.intools_send_buyer_message(uuid, uuid, text, jsonb),
  public.workspace_reserve_ops_upload(uuid, uuid, uuid, text), public.intools_reserve_buyer_upload(uuid, uuid, uuid, text),
  public.workspace_list_ops_messages(uuid, jsonb, integer), public.intools_list_buyer_messages(uuid, jsonb, integer),
  public.workspace_mark_ops_conversation_read(uuid, uuid), public.intools_mark_buyer_conversation_read(uuid, uuid),
  public.rfq_ops_get_buyer_unread_count(), public.intools_get_buyer_unread_count(),
  public.workspace_list_ops_conversations(jsonb, integer),
  public.intools_list_buyer_conversations(text, text, jsonb, integer)
TO authenticated;

ALTER TABLE public.rfq_ops_messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rfq_ops_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
