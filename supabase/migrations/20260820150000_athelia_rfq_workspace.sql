-- Athelia RFQ workspace: durable buyer chat history and supplier-specific RFQ cases.
-- Catalogue facts remain on products/factories; RFQ snapshots make a submitted
-- request auditable even when the catalogue is later edited.

-- Canonical agent/PDP facets. Existing explicit PDP fields (composition, GSM,
-- width, lead time, MOQ, origin and options) stay authoritative; this object
-- holds controlled repeatable tags for attributes that do not fit a column.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS agent_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(agent_metadata)='object');
CREATE INDEX IF NOT EXISTS products_agent_metadata_idx ON public.products USING gin(agent_metadata jsonb_path_ops)
  WHERE listing_status='active' AND is_private=false AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.athelia_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New sourcing request',
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS athelia_threads_buyer_updated_idx ON public.athelia_threads(buyer_profile_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.athelia_thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.athelia_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('buyer','agent','system')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 12000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS athelia_thread_messages_thread_idx ON public.athelia_thread_messages(thread_id,created_at);

CREATE TABLE IF NOT EXISTS public.rfq_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.athelia_threads(id) ON DELETE SET NULL,
  case_no text UNIQUE NOT NULL DEFAULT ('RFQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  title text NOT NULL,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_supplier','supplier_replied','buyer_review','needs_research','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS rfq_cases_buyer_updated_idx ON public.rfq_cases(buyer_profile_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.rfq_supplier_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE RESTRICT,
  outbound_body text NOT NULL CHECK (char_length(btrim(outbound_body)) BETWEEN 1 AND 12000),
  initial_message_id uuid,
  status text NOT NULL DEFAULT 'awaiting_supplier' CHECK (status IN ('awaiting_supplier','supplier_replied','closed')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  first_reply_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rfq_case_id,factory_id,product_id)
);
CREATE INDEX IF NOT EXISTS rfq_supplier_requests_case_idx ON public.rfq_supplier_requests(rfq_case_id,last_activity_at DESC);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS rfq_supplier_request_id uuid REFERENCES public.rfq_supplier_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_rfq_supplier_request_idx ON public.messages(rfq_supplier_request_id,created_at) WHERE rfq_supplier_request_id IS NOT NULL;

ALTER TABLE public.athelia_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athelia_thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_supplier_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY athelia_threads_buyer_all ON public.athelia_threads FOR ALL USING (buyer_profile_id=auth.uid()) WITH CHECK (buyer_profile_id=auth.uid());
CREATE POLICY athelia_thread_messages_buyer_all ON public.athelia_thread_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.athelia_threads t WHERE t.id=thread_id AND t.buyer_profile_id=auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.athelia_threads t WHERE t.id=thread_id AND t.buyer_profile_id=auth.uid()));
CREATE POLICY rfq_cases_buyer_all ON public.rfq_cases FOR ALL USING (buyer_profile_id=auth.uid()) WITH CHECK (buyer_profile_id=auth.uid());
CREATE POLICY rfq_supplier_requests_participant_read ON public.rfq_supplier_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.rfq_cases r WHERE r.id=rfq_case_id AND r.buyer_profile_id=auth.uid())
  OR EXISTS (SELECT 1 FROM public.factories f WHERE f.id=factory_id AND f.owner_profile_id=auth.uid())
);

CREATE OR REPLACE FUNCTION public.athelia_touch_thread()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN UPDATE public.athelia_threads SET updated_at=now() WHERE id=NEW.thread_id; RETURN NEW; END;
$$;
CREATE TRIGGER athelia_thread_message_touch AFTER INSERT ON public.athelia_thread_messages FOR EACH ROW EXECUTE FUNCTION public.athelia_touch_thread();
CREATE OR REPLACE FUNCTION public.rfq_case_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN UPDATE public.rfq_cases SET updated_at=now() WHERE id=NEW.rfq_case_id; RETURN NEW; END;
$$;
CREATE TRIGGER rfq_supplier_request_touch AFTER INSERT OR UPDATE ON public.rfq_supplier_requests FOR EACH ROW EXECUTE FUNCTION public.rfq_case_touch();

-- Supplier dashboards still use the established conversation composer. When a
-- conversation has exactly one open RFQ, associate a normal reply with it
-- automatically; ambiguous conversations remain unlinked rather than guessed.
CREATE OR REPLACE FUNCTION public.rfq_attach_unambiguous_reply()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_request_id uuid; v_count integer;
BEGIN
  IF NEW.rfq_supplier_request_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.rfq_supplier_requests r
    JOIN public.rfq_cases c ON c.id=r.rfq_case_id
    WHERE r.conversation_id=NEW.conversation_id AND r.status='awaiting_supplier' AND c.buyer_profile_id<>NEW.sender_profile_id;
  IF v_count=1 THEN
    SELECT r.id INTO v_request_id FROM public.rfq_supplier_requests r JOIN public.rfq_cases c ON c.id=r.rfq_case_id
      WHERE r.conversation_id=NEW.conversation_id AND r.status='awaiting_supplier' AND c.buyer_profile_id<>NEW.sender_profile_id;
    NEW.rfq_supplier_request_id:=v_request_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rfq_attach_unambiguous_reply_before_insert BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.rfq_attach_unambiguous_reply();

CREATE OR REPLACE FUNCTION public.rfq_message_activity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_request public.rfq_supplier_requests; v_case public.rfq_cases;
BEGIN
  IF NEW.rfq_supplier_request_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_request FROM public.rfq_supplier_requests WHERE id=NEW.rfq_supplier_request_id;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=v_request.rfq_case_id;
  UPDATE public.rfq_supplier_requests SET last_activity_at=NEW.created_at,
    first_reply_at=CASE WHEN NEW.sender_profile_id<>v_case.buyer_profile_id AND first_reply_at IS NULL THEN NEW.created_at ELSE first_reply_at END,
    status=CASE WHEN NEW.sender_profile_id<>v_case.buyer_profile_id THEN 'supplier_replied' ELSE status END WHERE id=NEW.rfq_supplier_request_id;
  IF NEW.sender_profile_id<>v_case.buyer_profile_id THEN UPDATE public.rfq_cases SET status='supplier_replied',updated_at=NEW.created_at WHERE id=v_case.id AND status='awaiting_supplier'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rfq_message_activity_after_insert AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.rfq_message_activity();

-- One deliberate action creates the supplier conversations, RFQ request rows,
-- and outbound messages. It cannot dispatch archived/unverified suppliers.
CREATE OR REPLACE FUNCTION public.dispatch_athelia_rfq(p_case_id uuid,p_requests jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_request jsonb; v_product public.products; v_conversation public.conversations; v_link public.rfq_supplier_requests; v_message public.messages; v_result jsonb:='[]'::jsonb;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ case not found' USING ERRCODE='42501'; END IF;
  IF v_case.status NOT IN ('draft','needs_research') THEN RAISE EXCEPTION 'RFQ has already been dispatched'; END IF;
  IF jsonb_typeof(p_requests)<>'array' OR jsonb_array_length(p_requests)<1 OR jsonb_array_length(p_requests)>5 THEN RAISE EXCEPTION 'Select one to five verified matches'; END IF;
  FOR v_request IN SELECT value FROM jsonb_array_elements(p_requests) LOOP
    SELECT p.* INTO v_product FROM public.products p JOIN public.factories f ON f.id=p.factory_id
      WHERE p.id=(v_request->>'product_id')::uuid AND p.listing_status='active' AND p.is_private=false AND p.archived_at IS NULL AND f.verify_state='verified' AND f.archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Selected product is no longer available'; END IF;
    INSERT INTO public.conversations(buyer_profile_id,factory_id) VALUES(auth.uid(),v_product.factory_id)
      ON CONFLICT (buyer_profile_id,factory_id) DO NOTHING;
    SELECT * INTO v_conversation FROM public.conversations WHERE buyer_profile_id=auth.uid() AND factory_id=v_product.factory_id;
    INSERT INTO public.rfq_supplier_requests(rfq_case_id,factory_id,product_id,conversation_id,outbound_body)
      VALUES(p_case_id,v_product.factory_id,v_product.id,v_conversation.id,left(btrim(v_request->>'body'),12000)) RETURNING * INTO v_link;
    INSERT INTO public.messages(conversation_id,sender_profile_id,body,rfq_supplier_request_id)
      VALUES(v_conversation.id,auth.uid(),v_link.outbound_body,v_link.id) RETURNING * INTO v_message;
    UPDATE public.rfq_supplier_requests SET initial_message_id=v_message.id WHERE id=v_link.id;
    v_result:=v_result||jsonb_build_array(jsonb_build_object('request_id',v_link.id,'conversation_id',v_conversation.id,'product_id',v_product.id));
  END LOOP;
  UPDATE public.rfq_cases SET status='awaiting_supplier',updated_at=now() WHERE id=p_case_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_athelia_rfq(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_athelia_rfq(uuid,jsonb) TO authenticated;
