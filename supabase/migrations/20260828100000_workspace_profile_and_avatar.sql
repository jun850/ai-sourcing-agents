-- Buyer profile edits are limited to personal display details. Profile role and
-- all commercial or account authority stay outside this user-facing workflow.
CREATE OR REPLACE FUNCTION public.workspace_get_profile()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('full_name', COALESCE(NULLIF(btrim(p.full_name), ''), split_part(u.email, '@', 1), 'Workspace'), 'avatar_url', p.avatar_url, 'email', u.email)
  FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.workspace_update_profile(p_full_name text, p_avatar_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text := NULLIF(btrim(p_full_name), ''); v_avatar text := NULLIF(btrim(p_avatar_url), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to update your profile' USING ERRCODE = '42501'; END IF;
  IF v_name IS NULL OR char_length(v_name) > 160 THEN RAISE EXCEPTION 'Enter a name between 1 and 160 characters' USING ERRCODE = '22023'; END IF;
  IF v_avatar IS NOT NULL AND (char_length(v_avatar) > 2048 OR v_avatar !~ '^https?://') THEN RAISE EXCEPTION 'Avatar URL is invalid' USING ERRCODE = '22023'; END IF;
  UPDATE public.profiles SET full_name = v_name, avatar_url = v_avatar WHERE id = auth.uid();
  UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name) WHERE id = auth.uid();
  RETURN public.workspace_get_profile();
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_get_profile(), public.workspace_update_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_get_profile(), public.workspace_update_profile(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rfq_ops_can_access_realtime_topic(p_topic text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND p_topic ~ '^rfq-ops:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(messages|presence)$' AND EXISTS (SELECT 1 FROM public.rfq_ops_conversations c WHERE c.id = split_part(p_topic, ':', 2)::uuid AND (c.buyer_profile_id = auth.uid() OR public.rfq_ops_is_confirmed_admin()));
$$;
DROP POLICY IF EXISTS rfq_ops_receive_private_broadcast ON realtime.messages;
CREATE POLICY rfq_ops_receive_private_broadcast ON realtime.messages FOR SELECT TO authenticated USING (realtime.messages.extension IN ('broadcast', 'presence') AND public.rfq_ops_can_access_realtime_topic(realtime.topic()));

-- Message history is rendered with the current personal avatar, matching the
-- existing current-name behavior while immutable message text remains intact.
CREATE OR REPLACE FUNCTION public.rfq_ops_message_json(p_message_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'rfq_case_id', c.rfq_case_id, 'client_message_id', m.client_message_id, 'sender_profile_id', m.sender_profile_id, 'sender_role', CASE WHEN m.sender_kind = 'atelix_ops' THEN 'ops' ELSE 'buyer' END, 'sender_label', CASE WHEN m.sender_kind = 'buyer' THEN COALESCE(NULLIF(btrim(p.full_name), ''), m.sender_label, 'Buyer') ELSE m.sender_label END, 'sender_avatar_url', p.avatar_url, 'body', m.body, 'created_at', m.created_at, 'read_at', receipt.last_read_at, 'attachments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'message_id', a.message_id, 'conversation_id', m.conversation_id, 'rfq_case_id', c.rfq_case_id, 'storage_path', a.storage_path, 'original_name', a.original_name, 'content_type', a.content_type, 'byte_size', a.byte_size, 'created_at', a.created_at) ORDER BY a.created_at, a.id) FROM public.rfq_ops_message_attachments a WHERE a.message_id = m.id), '[]'::jsonb))
  FROM public.rfq_ops_messages m JOIN public.rfq_ops_conversations c ON c.id = m.conversation_id LEFT JOIN public.profiles p ON p.id = m.sender_profile_id LEFT JOIN public.rfq_ops_conversation_reads receipt ON receipt.conversation_id = m.conversation_id AND receipt.reader_kind = CASE WHEN m.sender_kind = 'buyer' THEN 'atelix_ops'::public.rfq_ops_sender_kind ELSE 'buyer'::public.rfq_ops_sender_kind END WHERE m.id = p_message_id;
$$;
