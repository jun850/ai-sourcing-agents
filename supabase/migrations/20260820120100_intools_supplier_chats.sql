-- Atelix Intools: admin access to every buyer/supplier conversation.
-- All reads and writes remain behind the confirmed-admin boundary.

-- Earlier deployments may contain later variants with a different return type.
DROP FUNCTION IF EXISTS public.intools_list_supplier_chats();
DROP FUNCTION IF EXISTS public.intools_get_supplier_chat(uuid);
DROP FUNCTION IF EXISTS public.intools_send_supplier_chat_message(uuid, text);

CREATE OR REPLACE FUNCTION public.intools_list_supplier_chats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.last_message_at DESC NULLS LAST, row_data.created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT c.id AS conversation_id, c.factory_id, f.name AS supplier_name,
      c.buyer_profile_id, COALESCE(bp.full_name, bp.company_name, 'Buyer') AS buyer_name,
      bp.company_name AS buyer_company, bu.email AS buyer_email, c.created_at,
      count(m.id)::integer AS message_count, lm.body AS last_message,
      lm.created_at AS last_message_at
    FROM public.conversations c
    JOIN public.factories f ON f.id = c.factory_id
    LEFT JOIN public.profiles bp ON bp.id = c.buyer_profile_id
    LEFT JOIN auth.users bu ON bu.id = c.buyer_profile_id
    LEFT JOIN public.messages m ON m.conversation_id = c.id
    LEFT JOIN LATERAL (
      SELECT body, created_at FROM public.messages
      WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    ) lm ON true
    GROUP BY c.id, c.factory_id, f.name, c.buyer_profile_id, bp.full_name,
      bp.company_name, bu.email, c.created_at, lm.body, lm.created_at
  ) row_data;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_get_supplier_chat(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', c.id, 'factory_id', c.factory_id, 'supplier_name', f.name,
      'buyer_profile_id', c.buyer_profile_id,
      'buyer_name', COALESCE(bp.full_name, bp.company_name, 'Buyer'),
      'buyer_company', bp.company_name, 'buyer_email', bu.email,
      'created_at', c.created_at
    ),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'body', m.body, 'created_at', m.created_at,
        'sender_profile_id', m.sender_profile_id,
        'sender_name', COALESCE(sp.full_name, sp.company_name, 'Participant'),
        'sender_email', su.email
      ) ORDER BY m.created_at ASC)
      FROM public.messages m
      LEFT JOIN public.profiles sp ON sp.id = m.sender_profile_id
      LEFT JOIN auth.users su ON su.id = m.sender_profile_id
      WHERE m.conversation_id = c.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.conversations c
  JOIN public.factories f ON f.id = c.factory_id
  LEFT JOIN public.profiles bp ON bp.id = c.buyer_profile_id
  LEFT JOIN auth.users bu ON bu.id = c.buyer_profile_id
  WHERE c.id = p_conversation_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_send_supplier_chat_message(p_conversation_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_message public.messages;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_body IS NULL OR length(btrim(p_body)) = 0 OR length(p_body) > 4000 THEN
    RAISE EXCEPTION 'Message must contain 1 to 4000 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation_id) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.messages(conversation_id, sender_profile_id, body)
    VALUES (p_conversation_id, auth.uid(), btrim(p_body)) RETURNING * INTO v_message;
  RETURN to_jsonb(v_message);
END;
$$;

REVOKE ALL ON FUNCTION public.intools_list_supplier_chats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_get_supplier_chat(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_send_supplier_chat_message(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_list_supplier_chats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_get_supplier_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_send_supplier_chat_message(uuid,text) TO authenticated;
