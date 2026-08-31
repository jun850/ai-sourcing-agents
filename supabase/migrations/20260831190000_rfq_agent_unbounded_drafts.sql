-- Buyer drafts may be long and can be refined over any number of turns.
-- The Edge Function still rejects an empty message; there is no application
-- level token or character ceiling on the buyer's RFQ text.
ALTER TABLE public.agent_rfq_turns
  DROP CONSTRAINT IF EXISTS agent_rfq_turns_buyer_message_check;

ALTER TABLE public.agent_rfq_turns
  ADD CONSTRAINT agent_rfq_turns_buyer_message_check
  CHECK (char_length(btrim(buyer_message)) > 0);

CREATE OR REPLACE FUNCTION public.agent_rfq_record_thread_message(
  p_case_id uuid,
  p_profile_id uuid,
  p_role text,
  p_content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_thread uuid;
BEGIN
  IF p_role NOT IN ('buyer','agent') OR char_length(btrim(coalesce(p_content,''))) = 0 THEN
    RAISE EXCEPTION 'Invalid agent message' USING ERRCODE='22023';
  END IF;
  SELECT thread_id INTO v_thread FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=p_profile_id FOR UPDATE;
  IF v_thread IS NULL THEN
    INSERT INTO public.athelia_threads(buyer_profile_id,title) SELECT buyer_profile_id,title FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=p_profile_id RETURNING id INTO v_thread;
    UPDATE public.rfq_cases SET thread_id=v_thread WHERE id=p_case_id AND buyer_profile_id=p_profile_id;
  END IF;
  IF v_thread IS NULL THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  INSERT INTO public.athelia_thread_messages(thread_id,role,content) VALUES(v_thread,p_role,btrim(p_content));
END;
$$;
