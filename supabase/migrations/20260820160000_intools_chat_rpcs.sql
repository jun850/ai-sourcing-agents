-- ============================================================================
-- ARCANA — Intools chat: fix column names + add get/send RPCs
-- ============================================================================

-- 1. Fix intools_list_supplier_chats column names to match JS expectations
DROP FUNCTION IF EXISTS public.intools_list_supplier_chats();

CREATE OR REPLACE FUNCTION public.intools_list_supplier_chats()
RETURNS TABLE (
  conversation_id uuid, factory_id uuid, supplier_name text, factory_slug text,
  buyer_profile_id uuid, buyer_name text, buyer_company text, buyer_email text,
  last_message text, last_message_at timestamptz,
  message_count bigint, created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT c.id, c.factory_id, f.name, f.slug,
         c.buyer_profile_id, p.full_name, p.company_name,
         u.email,
         m.body, m.created_at, msg_count.cnt, c.created_at
  FROM public.conversations c
  JOIN public.factories f ON f.id = c.factory_id
  JOIN public.profiles p ON p.id = c.buyer_profile_id
  JOIN auth.users u ON u.id = c.buyer_profile_id
  LEFT JOIN LATERAL (
    SELECT body, created_at FROM public.messages
    WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS cnt FROM public.messages
    WHERE conversation_id = c.id
  ) msg_count ON true
  WHERE public.is_admin()
  ORDER BY COALESCE(m.created_at, c.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.intools_list_supplier_chats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_list_supplier_chats() TO authenticated;

-- 2. Get a single conversation with its messages (admin-only)
CREATE OR REPLACE FUNCTION public.intools_get_supplier_chat(p_conversation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'conversation', (
      SELECT json_build_object(
        'id', c.id,
        'factory_id', c.factory_id,
        'supplier_name', f.name,
        'buyer_name', p.full_name,
        'buyer_company', p.company_name,
        'buyer_email', u.email
      )
      FROM public.conversations c
      JOIN public.factories f ON f.id = c.factory_id
      JOIN public.profiles p ON p.id = c.buyer_profile_id
      JOIN auth.users u ON u.id = c.buyer_profile_id
      WHERE c.id = p_conversation_id
    ),
    'messages', COALESCE((
      SELECT json_agg(row_to_json(msg) ORDER BY msg.created_at ASC)
      FROM (
        SELECT m.id, m.body, m.created_at,
               m.sender_profile_id,
               p.full_name AS sender_name,
               u.email AS sender_email
        FROM public.messages m
        JOIN public.profiles p ON p.id = m.sender_profile_id
        JOIN auth.users u ON u.id = m.sender_profile_id
        WHERE m.conversation_id = p_conversation_id
        ORDER BY m.created_at ASC
      ) msg
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_get_supplier_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_get_supplier_chat(uuid) TO authenticated;

-- 3. Admin send message into a conversation
DROP FUNCTION IF EXISTS public.intools_send_supplier_chat_message(uuid, text);

CREATE OR REPLACE FUNCTION public.intools_send_supplier_chat_message(
  p_conversation_id uuid,
  p_body text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_msg public.messages;
  sender_name text;
  sender_email text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation_id) THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_profile_id, body)
  VALUES (p_conversation_id, auth.uid(), p_body)
  RETURNING * INTO new_msg;

  SELECT p.full_name, u.email
  INTO sender_name, sender_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = auth.uid();

  RETURN json_build_object(
    'id', new_msg.id,
    'body', new_msg.body,
    'created_at', new_msg.created_at,
    'sender_profile_id', new_msg.sender_profile_id,
    'sender_name', sender_name,
    'sender_email', sender_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.intools_send_supplier_chat_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_send_supplier_chat_message(uuid, text) TO authenticated;
