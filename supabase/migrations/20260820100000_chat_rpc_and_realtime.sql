-- ============================================================================
-- ARCANA — chat: my_conversations RPC + Realtime enablement for messages
-- ============================================================================

-- ---------------------------------------------------------------------------
-- my_conversations() — returns all conversations for the current user (buyer
-- or seller) with factory/buyer metadata and the latest message preview.
-- ---------------------------------------------------------------------------
-- The remote may already have a later version with additional OUT columns.
-- PostgreSQL cannot change a function's table return shape in-place.
DROP FUNCTION IF EXISTS public.my_conversations();

CREATE OR REPLACE FUNCTION public.my_conversations()
RETURNS TABLE (
  id uuid, factory_id uuid, factory_name text, factory_slug text,
  factory_logo text, buyer_profile_id uuid, buyer_name text,
  buyer_company text, buyer_avatar text, last_message text,
  last_message_at timestamptz, last_sender_id uuid, created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT c.id, c.factory_id, f.name, f.slug, f.logo_img,
         c.buyer_profile_id, p.full_name, p.company_name, p.avatar_url,
         m.body, m.created_at, m.sender_profile_id, c.created_at
  FROM public.conversations c
  JOIN public.factories f ON f.id = c.factory_id
  JOIN public.profiles p ON p.id = c.buyer_profile_id
  LEFT JOIN LATERAL (
    SELECT body, created_at, sender_profile_id FROM public.messages
    WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
  ) m ON true
  WHERE c.buyer_profile_id = auth.uid()
     OR f.owner_profile_id = auth.uid()
  ORDER BY COALESCE(m.created_at, c.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.my_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_conversations() TO authenticated;

-- ---------------------------------------------------------------------------
-- Enable Supabase Realtime on the messages table so clients can subscribe
-- to new message inserts via postgres_changes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
