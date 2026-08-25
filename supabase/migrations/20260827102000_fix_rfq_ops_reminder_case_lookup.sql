-- Additive correction: RFQ case metadata lives on rfq_cases, not conversations.
CREATE OR REPLACE FUNCTION public.rfq_ops_claim_due_reply_reminders(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_token uuid:=gen_random_uuid(); v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'limit must be between 1 and 100' USING ERRCODE='22023'; END IF;
  WITH due AS (
    SELECT r.id FROM public.rfq_ops_reply_reminders r
    WHERE r.resolved_at IS NULL AND r.next_due_at<=now() AND (r.claim_expires_at IS NULL OR r.claim_expires_at<now())
    ORDER BY r.next_due_at,r.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.rfq_ops_reply_reminders r SET claim_token=v_token,claim_expires_at=now()+interval '10 minutes',updated_at=now()
    FROM due WHERE r.id=due.id RETURNING r.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',c.id,'claim_token',v_token,'case_no',rfq.case_no,'rfq_case_id',rfq.id,
    'recipient_kind',c.recipient_kind,'recipient_email',CASE WHEN c.recipient_kind='atelix_ops' THEN 'info@arcanawangsa.com'
      WHEN COALESCE(pref.transactional_email,true) THEN u.email::text ELSE NULL END
  )),'[]'::jsonb) INTO v_result
  FROM claimed c JOIN public.rfq_ops_conversations conv ON conv.id=c.conversation_id
  JOIN public.rfq_cases rfq ON rfq.id=conv.rfq_case_id
  LEFT JOIN public.notification_preferences pref ON pref.profile_id=c.recipient_profile_id
  LEFT JOIN auth.users u ON u.id=c.recipient_profile_id;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.rfq_ops_claim_due_reply_reminders(integer) TO service_role;
