-- RFQ Ops response reminders. This is additive: message history remains immutable.
CREATE TABLE IF NOT EXISTS public.rfq_ops_reply_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id uuid NOT NULL UNIQUE REFERENCES public.rfq_ops_messages(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES public.rfq_ops_conversations(id) ON DELETE RESTRICT,
  recipient_kind public.rfq_ops_sender_kind NOT NULL,
  recipient_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_at timestamptz NOT NULL,
  next_due_at timestamptz NOT NULL,
  resolved_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0 CHECK (reminder_count >= 0),
  last_sent_at timestamptz,
  claim_token uuid,
  claim_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_ops_reply_reminders_due_idx ON public.rfq_ops_reply_reminders(next_due_at) WHERE resolved_at IS NULL;
ALTER TABLE public.rfq_ops_reply_reminders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rfq_ops_queue_reply_reminder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_recipient_profile_id uuid; v_recipient_kind public.rfq_ops_sender_kind;
BEGIN
  v_recipient_kind := CASE WHEN NEW.sender_kind='buyer' THEN 'atelix_ops'::public.rfq_ops_sender_kind ELSE 'buyer'::public.rfq_ops_sender_kind END;
  IF NEW.sender_kind='atelix_ops' THEN
    SELECT buyer_profile_id INTO v_recipient_profile_id FROM public.rfq_ops_conversations WHERE id=NEW.conversation_id;
  END IF;
  INSERT INTO public.rfq_ops_reply_reminders(source_message_id,conversation_id,recipient_kind,recipient_profile_id,due_at,next_due_at)
  VALUES(NEW.id,NEW.conversation_id,v_recipient_kind,v_recipient_profile_id,NEW.created_at+interval '5 hours',NEW.created_at+interval '5 hours')
  ON CONFLICT(source_message_id) DO NOTHING;
  UPDATE public.rfq_ops_reply_reminders r
  SET resolved_at=NEW.created_at,updated_at=now(),claim_token=NULL,claim_expires_at=NULL
  FROM public.rfq_ops_messages source
  WHERE r.source_message_id=source.id AND r.conversation_id=NEW.conversation_id AND r.resolved_at IS NULL
    AND source.sender_kind<>NEW.sender_kind AND source.created_at<NEW.created_at;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rfq_ops_reply_reminder_after_insert ON public.rfq_ops_messages;
CREATE TRIGGER rfq_ops_reply_reminder_after_insert AFTER INSERT ON public.rfq_ops_messages
FOR EACH ROW EXECUTE FUNCTION public.rfq_ops_queue_reply_reminder();

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
    'id',c.id,'claim_token',v_token,'case_no',conv.case_no,'rfq_case_id',conv.rfq_case_id,
    'recipient_kind',c.recipient_kind,'recipient_email',CASE WHEN c.recipient_kind='atelix_ops' THEN 'info@arcanawangsa.com'
      WHEN COALESCE(pref.transactional_email,true) THEN u.email::text ELSE NULL END
  )),'[]'::jsonb) INTO v_result
  FROM claimed c JOIN public.rfq_ops_conversations conv ON conv.id=c.conversation_id
  LEFT JOIN public.notification_preferences pref ON pref.profile_id=c.recipient_profile_id
  LEFT JOIN auth.users u ON u.id=c.recipient_profile_id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.rfq_ops_complete_reply_reminder(p_id uuid,p_claim_token uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('sent','skipped','failed') THEN RAISE EXCEPTION 'invalid completion status' USING ERRCODE='22023'; END IF;
  UPDATE public.rfq_ops_reply_reminders SET
    claim_token=NULL,claim_expires_at=NULL,updated_at=now(),
    reminder_count=CASE WHEN p_status='sent' THEN reminder_count+1 ELSE reminder_count END,
    last_sent_at=CASE WHEN p_status='sent' THEN now() ELSE last_sent_at END,
    next_due_at=CASE WHEN p_status='failed' THEN now()+interval '15 minutes' ELSE now()+interval '24 hours' END
  WHERE id=p_id AND claim_token=p_claim_token AND resolved_at IS NULL;
END; $$;
REVOKE ALL ON TABLE public.rfq_ops_reply_reminders FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.rfq_ops_queue_reply_reminder(),public.rfq_ops_claim_due_reply_reminders(integer),public.rfq_ops_complete_reply_reminder(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
