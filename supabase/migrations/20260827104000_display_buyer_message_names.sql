-- Preserve the immutable sender snapshot while displaying a buyer's personal
-- profile name whenever it is still available. Company names remain case data,
-- not the author identity in a conversation.
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
    'sender_label', CASE
      WHEN m.sender_kind = 'buyer' THEN COALESCE(NULLIF(btrim(p.full_name), ''), m.sender_label, 'Buyer')
      ELSE m.sender_label
    END,
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
  LEFT JOIN public.profiles p ON p.id = m.sender_profile_id
  LEFT JOIN public.rfq_ops_conversation_reads receipt ON receipt.conversation_id = m.conversation_id
    AND receipt.reader_kind = CASE WHEN m.sender_kind = 'buyer' THEN 'atelix_ops'::public.rfq_ops_sender_kind ELSE 'buyer'::public.rfq_ops_sender_kind END
  WHERE m.id = p_message_id;
$$;
