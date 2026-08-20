-- ============================================================================
-- ARCANA — chat: unread tracking + header badge support
-- ============================================================================

-- Read timestamps per participant side
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS buyer_last_read_at  timestamptz,
  ADD COLUMN IF NOT EXISTS seller_last_read_at timestamptz;

-- ---------------------------------------------------------------------------
-- mark_conversation_read(conv_id) — sets the caller's last_read_at to now()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_conversation_read(conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  UPDATE public.conversations
  SET buyer_last_read_at = now()
  WHERE id = conv_id AND buyer_profile_id = v_uid;

  IF NOT FOUND THEN
    UPDATE public.conversations c
    SET seller_last_read_at = now()
    FROM public.factories f
    WHERE c.id = conv_id
      AND c.factory_id = f.id
      AND f.owner_profile_id = v_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- my_unread_count() — total unread messages across all conversations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_unread_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(cnt), 0)::bigint FROM (
    SELECT COUNT(*) AS cnt
    FROM public.conversations c
    JOIN public.messages m ON m.conversation_id = c.id
    WHERE c.buyer_profile_id = auth.uid()
      AND m.sender_profile_id <> auth.uid()
      AND m.created_at > COALESCE(c.buyer_last_read_at, c.created_at)
    UNION ALL
    SELECT COUNT(*) AS cnt
    FROM public.conversations c
    JOIN public.factories f ON f.id = c.factory_id
    JOIN public.messages m ON m.conversation_id = c.id
    WHERE f.owner_profile_id = auth.uid()
      AND c.buyer_profile_id <> auth.uid()
      AND m.sender_profile_id <> auth.uid()
      AND m.created_at > COALESCE(c.seller_last_read_at, c.created_at)
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.my_unread_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_unread_count() TO authenticated;

-- ---------------------------------------------------------------------------
-- Update my_conversations() to include unread_count per conversation
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.my_conversations();

CREATE FUNCTION public.my_conversations()
RETURNS TABLE (
  id uuid, factory_id uuid, factory_name text, factory_slug text,
  factory_logo text, buyer_profile_id uuid, buyer_name text,
  buyer_company text, buyer_avatar text, last_message text,
  last_message_at timestamptz, last_sender_id uuid, created_at timestamptz,
  unread_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT c.id, c.factory_id, f.name, f.slug, f.logo_img,
         c.buyer_profile_id, p.full_name, p.company_name, p.avatar_url,
         m.body, m.created_at, m.sender_profile_id, c.created_at,
         (
           SELECT COUNT(*)::bigint FROM public.messages msg
           WHERE msg.conversation_id = c.id
             AND msg.sender_profile_id <> auth.uid()
             AND msg.created_at > COALESCE(
               CASE WHEN c.buyer_profile_id = auth.uid()
                    THEN c.buyer_last_read_at
                    ELSE c.seller_last_read_at
               END,
               c.created_at
             )
         ) AS unread_count
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
