-- ARCANA — retain buyer/supplier chat history for 30 days and page it safely.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.messages (conversation_id, created_at DESC);

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
    SELECT 1
    FROM public.conversations c
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
      AND m.created_at >= now() - interval '30 days'
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.messages
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_messages(uuid, int, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_chat_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid, int, timestamptz) TO authenticated;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'atelix-purge-expired-chat-messages';

SELECT cron.schedule(
  'atelix-purge-expired-chat-messages',
  '17 3 * * *',
  'SELECT public.purge_expired_chat_messages();'
);
