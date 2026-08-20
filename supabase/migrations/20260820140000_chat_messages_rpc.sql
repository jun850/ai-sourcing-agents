-- ============================================================================
-- ARCANA — chat: SECURITY DEFINER RPC for reliable message loading + Intools
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_conversation_id uuid,
  p_limit int DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid, conversation_id uuid, sender_profile_id uuid,
  body text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    LEFT JOIN public.factories f ON f.id = c.factory_id
    WHERE c.id = p_conversation_id
      AND (c.buyer_profile_id = auth.uid() OR f.owner_profile_id = auth.uid())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT m.id, m.conversation_id, m.sender_profile_id, m.body, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_messages(uuid, int, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid, int, timestamptz) TO authenticated;

-- Admin-only: Intools Chats panel
CREATE OR REPLACE FUNCTION public.intools_list_supplier_chats()
RETURNS TABLE (
  id uuid, factory_id uuid, factory_name text, factory_slug text,
  buyer_profile_id uuid, buyer_name text, buyer_company text,
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
         m.body, m.created_at, msg_count.cnt, c.created_at
  FROM public.conversations c
  JOIN public.factories f ON f.id = c.factory_id
  JOIN public.profiles p ON p.id = c.buyer_profile_id
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
