-- Phase 4 keeps hosted Stripe Checkout and settlement server-authoritative.
-- This is deliberately additive: Phase 3 invoice states remain draft/sent/paid/cancelled.

CREATE TABLE public.invoice_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  state text NOT NULL DEFAULT 'checkout_created' CHECK (state IN ('checkout_created','processing','paid','failed','expired','partially_refunded','refunded')),
  gross_amount_cents integer NOT NULL CHECK (gross_amount_cents > 0),
  net_amount_cents integer NOT NULL CHECK (net_amount_cents > 0),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_invoice_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CHECK (gross_amount_cents = net_amount_cents),
  CHECK (state <> 'paid' OR paid_at IS NOT NULL)
);

CREATE TABLE public.invoice_checkout_attempt_invoices (
  attempt_id uuid NOT NULL REFERENCES public.invoice_checkout_attempts(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  PRIMARY KEY (attempt_id, invoice_id)
);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS active_checkout_attempt_id uuid REFERENCES public.invoice_checkout_attempts(id) ON DELETE SET NULL;

CREATE INDEX invoice_checkout_attempts_buyer_active_idx
  ON public.invoice_checkout_attempts (buyer_profile_id, state, created_at DESC);
CREATE INDEX invoice_checkout_attempt_invoices_invoice_idx
  ON public.invoice_checkout_attempt_invoices (invoice_id);
CREATE INDEX invoices_active_checkout_attempt_idx
  ON public.invoices (active_checkout_attempt_id) WHERE active_checkout_attempt_id IS NOT NULL;

ALTER TABLE public.invoice_checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_checkout_attempt_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_checkout_attempts, public.invoice_checkout_attempt_invoices FROM anon, authenticated;
GRANT SELECT ON public.invoice_checkout_attempts, public.invoice_checkout_attempt_invoices TO authenticated;
CREATE POLICY invoice_checkout_attempts_buyer_or_admin_read ON public.invoice_checkout_attempts FOR SELECT TO authenticated
  USING (buyer_profile_id = auth.uid() OR public.is_admin());
CREATE POLICY invoice_checkout_attempt_invoices_buyer_or_admin_read ON public.invoice_checkout_attempt_invoices FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.invoice_checkout_attempts a WHERE a.id=attempt_id AND a.buyer_profile_id=auth.uid()));

ALTER TABLE public.invoice_audit_log DROP CONSTRAINT IF EXISTS invoice_audit_log_action_check;
ALTER TABLE public.invoice_audit_log ADD CONSTRAINT invoice_audit_log_action_check
  CHECK (action IN ('create','update','send','cancel','manual_payment','paid','checkout_created','checkout_failed','checkout_paid','refund'));

-- The Edge Function authenticates the caller and supplies that user id. The
-- function locks each invoice before reserving it, so parallel checkout calls
-- return the same open attempt instead of double-charging.
CREATE OR REPLACE FUNCTION public.invoice_checkout_create_attempt(
  p_buyer_id uuid, p_invoice_ids uuid[], p_environment text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_ids uuid[];
  v_existing uuid;
  v_active uuid;
  v_attempt public.invoice_checkout_attempts;
  v_total integer := 0;
  v_count integer := 0;
  v_invoice record;
BEGIN
  IF p_buyer_id IS NULL OR p_environment NOT IN ('test','live') OR p_invoice_ids IS NULL OR cardinality(p_invoice_ids) NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'invalid invoice checkout request' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM (SELECT DISTINCT unnest(p_invoice_ids) AS id) ids;
  IF cardinality(v_ids) <> cardinality(p_invoice_ids) THEN RAISE EXCEPTION 'duplicate invoice ids are not allowed' USING ERRCODE='22023'; END IF;

  -- Lock in a deterministic order. This serialization is the reservation.
  FOR v_invoice IN
    SELECT i.*, COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS paid_cents
    FROM public.invoices i WHERE i.id = ANY(v_ids) ORDER BY i.id FOR UPDATE
  LOOP
    v_count := v_count + 1;
    IF v_invoice.buyer_profile_id <> p_buyer_id OR v_invoice.status <> 'sent' OR v_invoice.currency <> 'usd' OR v_invoice.total_cents <= v_invoice.paid_cents THEN
      RAISE EXCEPTION 'one or more invoices cannot be paid with Stripe' USING ERRCODE='42501';
    END IF;
    IF v_invoice.active_checkout_attempt_id IS NOT NULL THEN
      SELECT id INTO v_active FROM public.invoice_checkout_attempts WHERE id=v_invoice.active_checkout_attempt_id AND state IN ('checkout_created','processing');
      IF v_active IS NULL THEN
        UPDATE public.invoices SET active_checkout_attempt_id=NULL, updated_at=now() WHERE id=v_invoice.id;
      ELSIF v_existing IS NULL THEN
        v_existing := v_active;
      ELSIF v_existing <> v_active THEN
        RAISE EXCEPTION 'one or more invoices already have an active checkout' USING ERRCODE='55000';
      END IF;
    END IF;
    v_total := v_total + v_invoice.total_cents - v_invoice.paid_cents;
  END LOOP;
  IF v_count <> cardinality(v_ids) OR v_total <= 0 THEN RAISE EXCEPTION 'one or more invoices were not found' USING ERRCODE='P0002'; END IF;
  IF v_existing IS NOT NULL THEN
    SELECT * INTO v_attempt FROM public.invoice_checkout_attempts WHERE id=v_existing;
    IF (SELECT count(*) FROM public.invoice_checkout_attempt_invoices WHERE attempt_id=v_existing) <> cardinality(v_ids)
      OR EXISTS (SELECT 1 FROM public.invoice_checkout_attempt_invoices WHERE attempt_id=v_existing AND invoice_id <> ALL(v_ids)) THEN
      RAISE EXCEPTION 'one or more invoices already have an active checkout' USING ERRCODE='55000';
    END IF;
    RETURN jsonb_build_object('attemptId',v_attempt.id,'created',false,'sessionId',v_attempt.stripe_checkout_session_id,'amountCents',v_attempt.net_amount_cents);
  END IF;

  INSERT INTO public.invoice_checkout_attempts(buyer_profile_id,environment,gross_amount_cents,net_amount_cents)
    VALUES(p_buyer_id,p_environment,v_total,v_total) RETURNING * INTO v_attempt;
  FOR v_invoice IN
    SELECT i.id, i.total_cents - COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS amount_cents
    FROM public.invoices i WHERE i.id=ANY(v_ids) ORDER BY i.id
  LOOP
    INSERT INTO public.invoice_checkout_attempt_invoices(attempt_id,invoice_id,amount_cents) VALUES(v_attempt.id,v_invoice.id,v_invoice.amount_cents);
    UPDATE public.invoices SET active_checkout_attempt_id=v_attempt.id, updated_at=now() WHERE id=v_invoice.id;
    INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary,metadata)
      VALUES(v_invoice.id,p_buyer_id,'checkout_created','Created hosted Stripe checkout',jsonb_build_object('attemptId',v_attempt.id));
  END LOOP;
  RETURN jsonb_build_object('attemptId',v_attempt.id,'created',true,'amountCents',v_attempt.net_amount_cents);
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_checkout_attach_session(
  p_attempt_id uuid, p_session_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt public.invoice_checkout_attempts;
BEGIN
  SELECT * INTO v_attempt FROM public.invoice_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.state <> 'checkout_created' THEN RAISE EXCEPTION 'invoice checkout attempt is not open' USING ERRCODE='55000'; END IF;
  IF char_length(btrim(coalesce(p_session_id,''))) < 3 THEN RAISE EXCEPTION 'invalid Stripe session' USING ERRCODE='22023'; END IF;
  IF v_attempt.stripe_checkout_session_id IS NOT NULL AND v_attempt.stripe_checkout_session_id <> p_session_id THEN RAISE EXCEPTION 'invoice checkout attempt already has a Stripe session' USING ERRCODE='55000'; END IF;
  UPDATE public.invoice_checkout_attempts SET stripe_checkout_session_id=p_session_id, updated_at=now() WHERE id=p_attempt_id;
  RETURN jsonb_build_object('attemptId',p_attempt_id);
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_checkout_settle_attempt(
  p_attempt_id uuid, p_session_id text, p_payment_intent_id text, p_stripe_invoice_id text, p_amount_cents integer, p_environment text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt public.invoice_checkout_attempts; v_payment public.invoice_payments; v_line record; v_allocated integer;
BEGIN
  SELECT * INTO v_attempt FROM public.invoice_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.environment <> p_environment OR v_attempt.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN RAISE EXCEPTION 'unknown invoice checkout session' USING ERRCODE='P0002'; END IF;
  IF v_attempt.state='paid' THEN RETURN jsonb_build_object('settled',false,'state','paid'); END IF;
  IF v_attempt.state NOT IN ('checkout_created','processing') OR p_amount_cents <> v_attempt.net_amount_cents OR char_length(btrim(coalesce(p_payment_intent_id,p_session_id,''))) < 3 THEN
    RAISE EXCEPTION 'invoice checkout cannot be settled' USING ERRCODE='55000';
  END IF;
  FOR v_line IN SELECT ai.invoice_id,ai.amount_cents,i.status,i.active_checkout_attempt_id FROM public.invoice_checkout_attempt_invoices ai JOIN public.invoices i ON i.id=ai.invoice_id WHERE ai.attempt_id=p_attempt_id ORDER BY ai.invoice_id FOR UPDATE LOOP
    IF v_line.status <> 'sent' OR v_line.active_checkout_attempt_id IS DISTINCT FROM p_attempt_id THEN RAISE EXCEPTION 'invoice reservation is no longer valid' USING ERRCODE='55000'; END IF;
    SELECT COALESCE(sum(a.amount_cents),0) INTO v_allocated FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=v_line.invoice_id AND p.status='succeeded';
    IF v_allocated + v_line.amount_cents <> (SELECT total_cents FROM public.invoices WHERE id=v_line.invoice_id) THEN RAISE EXCEPTION 'invoice balance changed during checkout' USING ERRCODE='55000'; END IF;
  END LOOP;
  INSERT INTO public.invoice_payments(provider,provider_reference,currency,amount_cents,status,recorded_by)
    VALUES('stripe',COALESCE(NULLIF(p_payment_intent_id,''),p_session_id),'usd',p_amount_cents,'succeeded',NULL)
    ON CONFLICT(provider,provider_reference) DO NOTHING RETURNING * INTO v_payment;
  IF v_payment.id IS NULL THEN SELECT * INTO v_payment FROM public.invoice_payments WHERE provider='stripe' AND provider_reference=COALESCE(NULLIF(p_payment_intent_id,''),p_session_id) FOR UPDATE; END IF;
  IF v_payment.amount_cents <> p_amount_cents OR v_payment.status <> 'succeeded' THEN RAISE EXCEPTION 'Stripe payment does not match checkout attempt' USING ERRCODE='55000'; END IF;
  FOR v_line IN SELECT invoice_id,amount_cents FROM public.invoice_checkout_attempt_invoices WHERE attempt_id=p_attempt_id ORDER BY invoice_id LOOP
    INSERT INTO public.invoice_payment_allocations(payment_id,invoice_id,amount_cents) VALUES(v_payment.id,v_line.invoice_id,v_line.amount_cents) ON CONFLICT(payment_id,invoice_id) DO NOTHING;
    UPDATE public.invoices SET status='paid',paid_at=now(),active_checkout_attempt_id=NULL,updated_at=now() WHERE id=v_line.invoice_id;
    INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary,metadata) VALUES(v_line.invoice_id,NULL,'checkout_paid','Stripe Checkout payment verified',jsonb_build_object('attemptId',p_attempt_id,'paymentIntentId',p_payment_intent_id));
  END LOOP;
  UPDATE public.invoice_checkout_attempts SET state='paid',stripe_payment_intent_id=NULLIF(p_payment_intent_id,''),stripe_invoice_id=NULLIF(p_stripe_invoice_id,''),paid_at=now(),updated_at=now() WHERE id=p_attempt_id;
  RETURN jsonb_build_object('settled',true,'state','paid','paymentId',v_payment.id);
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_checkout_close_attempt(
  p_attempt_id uuid, p_session_id text, p_state text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt public.invoice_checkout_attempts; v_line record;
BEGIN
  IF p_state NOT IN ('failed','expired') THEN RAISE EXCEPTION 'invalid invoice checkout terminal state' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_attempt FROM public.invoice_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN RAISE EXCEPTION 'unknown invoice checkout session' USING ERRCODE='P0002'; END IF;
  IF v_attempt.state='paid' THEN RETURN jsonb_build_object('closed',false,'state','paid'); END IF;
  IF v_attempt.state IN ('failed','expired') THEN RETURN jsonb_build_object('closed',false,'state',v_attempt.state); END IF;
  UPDATE public.invoice_checkout_attempts SET state=p_state,updated_at=now() WHERE id=p_attempt_id;
  FOR v_line IN SELECT invoice_id FROM public.invoice_checkout_attempt_invoices WHERE attempt_id=p_attempt_id LOOP
    UPDATE public.invoices SET active_checkout_attempt_id=NULL,updated_at=now() WHERE id=v_line.invoice_id AND active_checkout_attempt_id=p_attempt_id;
    INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary,metadata) VALUES(v_line.invoice_id,NULL,'checkout_failed','Stripe Checkout did not complete',jsonb_build_object('attemptId',p_attempt_id,'state',p_state));
  END LOOP;
  RETURN jsonb_build_object('closed',true,'state',p_state);
END; $$;

-- A Stripe API rejection before it returns a session must not leave an invoice
-- reserved forever. Once a session id is attached, retries use that stable
-- session/idempotency key instead and this release refuses to run.
CREATE OR REPLACE FUNCTION public.invoice_checkout_release_unattached_attempt(
  p_attempt_id uuid, p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt public.invoice_checkout_attempts; v_line record;
BEGIN
  SELECT * INTO v_attempt FROM public.invoice_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice checkout attempt not found' USING ERRCODE='P0002'; END IF;
  IF v_attempt.state <> 'checkout_created' OR v_attempt.stripe_checkout_session_id IS NOT NULL THEN RETURN jsonb_build_object('released',false,'state',v_attempt.state); END IF;
  UPDATE public.invoice_checkout_attempts SET state='failed',updated_at=now() WHERE id=p_attempt_id;
  FOR v_line IN SELECT invoice_id FROM public.invoice_checkout_attempt_invoices WHERE attempt_id=p_attempt_id LOOP
    UPDATE public.invoices SET active_checkout_attempt_id=NULL,updated_at=now() WHERE id=v_line.invoice_id AND active_checkout_attempt_id=p_attempt_id;
    INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary,metadata) VALUES(v_line.invoice_id,NULL,'checkout_failed','Stripe Checkout setup failed',jsonb_build_object('attemptId',p_attempt_id,'reason',left(coalesce(p_reason,'setup failed'),200)));
  END LOOP;
  RETURN jsonb_build_object('released',true,'state','failed');
END; $$;

-- Pending hosted checkout reserves the invoice balance, so an administrator
-- cannot cancel or manually allocate the same balance behind the buyer.
CREATE OR REPLACE FUNCTION public.intools_cancel_invoice(p_invoice_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_invoice public.invoices;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found' USING ERRCODE='P0002'; END IF;
  IF v_invoice.active_checkout_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'an active Stripe checkout reserves this invoice' USING ERRCODE='55000'; END IF;
  IF v_invoice.status NOT IN ('draft','sent') THEN RAISE EXCEPTION 'paid and cancelled invoices cannot be cancelled' USING ERRCODE='55000'; END IF;
  IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'cancellation reason must be 3 to 500 characters' USING ERRCODE='22023'; END IF;
  UPDATE public.invoices SET status='cancelled',cancelled_at=now(),cancelled_reason=btrim(p_reason),updated_by=auth.uid(),updated_at=now() WHERE id=p_invoice_id;
  INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary) VALUES(p_invoice_id,auth.uid(),'cancel','Cancelled invoice: '||btrim(p_reason));
  RETURN public.intools_get_invoice_detail(p_invoice_id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_record_manual_payment(p_invoice_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_invoice public.invoices; v_amount integer := NULLIF(p_payload->>'amountCents','')::integer; v_allocated integer; v_payment public.invoice_payments;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status <> 'sent' THEN RAISE EXCEPTION 'only sent invoices accept manual payments' USING ERRCODE='55000'; END IF;
  IF v_invoice.active_checkout_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'an active Stripe checkout reserves this invoice' USING ERRCODE='55000'; END IF;
  SELECT COALESCE(sum(a.amount_cents),0) INTO v_allocated FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=p_invoice_id AND p.status='succeeded';
  IF jsonb_typeof(p_payload) <> 'object' OR v_amount IS NULL OR v_amount <= 0 OR v_amount > v_invoice.total_cents-v_allocated OR char_length(btrim(coalesce(p_payload->>'reference',''))) NOT BETWEEN 3 AND 255 THEN RAISE EXCEPTION 'invalid manual payment' USING ERRCODE='22023'; END IF;
  INSERT INTO public.invoice_payments(provider,provider_reference,currency,amount_cents,status,recorded_by) VALUES('manual',btrim(p_payload->>'reference'),'usd',v_amount,'succeeded',auth.uid()) RETURNING * INTO v_payment;
  INSERT INTO public.invoice_payment_allocations(payment_id,invoice_id,amount_cents) VALUES(v_payment.id,p_invoice_id,v_amount);
  IF v_allocated+v_amount = v_invoice.total_cents THEN UPDATE public.invoices SET status='paid',paid_at=now(),updated_by=auth.uid(),updated_at=now() WHERE id=p_invoice_id; INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary) VALUES(p_invoice_id,auth.uid(),'paid','Invoice fully allocated and paid'); END IF;
  INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary,metadata) VALUES(p_invoice_id,auth.uid(),'manual_payment','Recorded manual payment',jsonb_build_object('amountCents',v_amount,'reference',btrim(p_payload->>'reference')));
  RETURN public.intools_get_invoice_detail(p_invoice_id);
END; $$;

CREATE OR REPLACE FUNCTION public.workspace_list_invoices()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
    SELECT i.id,i.invoice_no,i.status::text,CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END AS effective_status,i.currency,i.total_cents,
      i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS balance_cents,
      i.due_date,i.created_at
    FROM public.invoices i WHERE i.buyer_profile_id=auth.uid()
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.workspace_get_invoice_detail(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',i.id,'invoice_no',i.invoice_no,'status',i.status::text,'effective_status',CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END,
    'currency',i.currency,'subtotal_cents',i.subtotal_cents,'tax_cents',i.tax_cents,'total_cents',i.total_cents,
    'paid_cents',COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),
    'balance_cents',i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),
    'due_date',i.due_date,'notes',i.notes,'created_at',i.created_at,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('description',it.description,'quantity',it.quantity,'unit_amount_cents',it.unit_amount_cents,'tax_amount_cents',it.tax_amount_cents,'line_total_cents',it.line_total_cents) ORDER BY it.position) FROM public.invoice_items it WHERE it.invoice_id=i.id),'[]'::jsonb),
    'payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',p.provider,'reference',p.provider_reference,'amount_cents',a.amount_cents,'recorded_at',p.recorded_at) ORDER BY p.recorded_at DESC) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),'[]'::jsonb)
  ) INTO v_result FROM public.invoices i WHERE i.id=p_invoice_id AND i.buyer_profile_id=auth.uid();
  IF v_result IS NULL THEN RAISE EXCEPTION 'invoice not found' USING ERRCODE='P0002'; END IF;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.invoice_checkout_create_attempt(uuid,uuid[],text), public.invoice_checkout_attach_session(uuid,text), public.invoice_checkout_settle_attempt(uuid,text,text,text,integer,text), public.invoice_checkout_close_attempt(uuid,text,text), public.invoice_checkout_release_unattached_attempt(uuid,text), public.workspace_get_invoice_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_get_invoice_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_checkout_create_attempt(uuid,uuid[],text), public.invoice_checkout_attach_session(uuid,text), public.invoice_checkout_settle_attempt(uuid,text,text,text,integer,text), public.invoice_checkout_close_attempt(uuid,text,text), public.invoice_checkout_release_unattached_attempt(uuid,text) TO service_role;

-- A webhook event is not deduplicated until its business mutation commits.
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','processing','processed','failed')),
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE OR REPLACE FUNCTION public.stripe_claim_webhook_event(p_event_id text,p_environment text,p_event_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_event public.stripe_webhook_events;
BEGIN
  IF char_length(btrim(coalesce(p_event_id,''))) < 3 OR p_environment NOT IN ('test','live') OR char_length(btrim(coalesce(p_event_type,''))) < 3 THEN RAISE EXCEPTION 'invalid Stripe event' USING ERRCODE='22023'; END IF;
  INSERT INTO public.stripe_webhook_events(stripe_event_id,environment,event_type,state)
    VALUES(p_event_id,p_environment,p_event_type,'received') ON CONFLICT(stripe_event_id) DO NOTHING;
  SELECT * INTO v_event FROM public.stripe_webhook_events WHERE stripe_event_id=p_event_id FOR UPDATE;
  IF v_event.environment <> p_environment OR v_event.event_type <> p_event_type THEN RAISE EXCEPTION 'Stripe event identity mismatch' USING ERRCODE='22023'; END IF;
  IF v_event.state='processed' THEN RETURN false; END IF;
  UPDATE public.stripe_webhook_events SET state='processing',attempts=v_event.attempts+1,last_attempt_at=now(),error=NULL WHERE stripe_event_id=p_event_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.stripe_finish_webhook_event(p_event_id text,p_processed boolean,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.stripe_webhook_events
    SET state=CASE WHEN p_processed THEN 'processed' ELSE 'failed' END,
        processed_at=CASE WHEN p_processed THEN now() ELSE NULL END,
        error=CASE WHEN p_processed THEN NULL ELSE left(coalesce(p_error,'Stripe event processing failed'),1000) END
  WHERE stripe_event_id=p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stripe event was not claimed' USING ERRCODE='P0002'; END IF;
END; $$;

CREATE TABLE public.invoice_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invoice_payment_id uuid NOT NULL REFERENCES public.invoice_payments(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  stripe_refund_id text UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('pending','succeeded','failed','canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.invoice_refund_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_refund_id uuid NOT NULL REFERENCES public.invoice_refunds(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  UNIQUE(invoice_refund_id,invoice_id)
);
CREATE INDEX invoice_refunds_payment_idx ON public.invoice_refunds(invoice_payment_id, created_at DESC);
CREATE INDEX invoice_refund_allocations_invoice_idx ON public.invoice_refund_allocations(invoice_id);
ALTER TABLE public.invoice_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_refund_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_refunds, public.invoice_refund_allocations FROM anon, authenticated;
GRANT SELECT ON public.invoice_refunds, public.invoice_refund_allocations TO authenticated;
CREATE POLICY invoice_refunds_buyer_or_admin_read ON public.invoice_refunds FOR SELECT TO authenticated USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.invoice_payment_allocations a JOIN public.invoices i ON i.id=a.invoice_id WHERE a.payment_id=invoice_refunds.invoice_payment_id AND i.buyer_profile_id=auth.uid())
);
CREATE POLICY invoice_refund_allocations_buyer_or_admin_read ON public.invoice_refund_allocations FOR SELECT TO authenticated USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.buyer_profile_id=auth.uid())
);

CREATE OR REPLACE FUNCTION public.invoice_refund_allocation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_refund public.invoice_refunds; v_payment public.invoice_payments; v_original integer; v_refunded integer; v_refund_total integer;
BEGIN
  SELECT * INTO v_refund FROM public.invoice_refunds WHERE id=NEW.invoice_refund_id FOR UPDATE;
  SELECT * INTO v_payment FROM public.invoice_payments WHERE id=v_refund.invoice_payment_id FOR UPDATE;
  IF NOT FOUND OR v_refund.status <> 'succeeded' OR v_payment.provider <> 'stripe' OR v_payment.status <> 'succeeded' THEN RAISE EXCEPTION 'invalid invoice refund allocation' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(sum(amount_cents),0) INTO v_original FROM public.invoice_payment_allocations WHERE payment_id=v_payment.id AND invoice_id=NEW.invoice_id;
  SELECT COALESCE(sum(ra.amount_cents),0) INTO v_refunded FROM public.invoice_refund_allocations ra JOIN public.invoice_refunds r ON r.id=ra.invoice_refund_id WHERE r.invoice_payment_id=v_payment.id AND r.status='succeeded' AND ra.invoice_id=NEW.invoice_id AND ra.id IS DISTINCT FROM NEW.id;
  SELECT COALESCE(sum(amount_cents),0) INTO v_refund_total FROM public.invoice_refund_allocations WHERE invoice_refund_id=v_refund.id AND id IS DISTINCT FROM NEW.id;
  IF v_original <= 0 OR v_refunded+NEW.amount_cents > v_original OR v_refund_total+NEW.amount_cents > v_refund.amount_cents THEN RAISE EXCEPTION 'refund allocation exceeds settled invoice payment' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER invoice_refund_allocations_within_payment BEFORE INSERT OR UPDATE ON public.invoice_refund_allocations FOR EACH ROW EXECUTE FUNCTION public.invoice_refund_allocation_guard();

CREATE OR REPLACE FUNCTION public.invoice_record_stripe_refund(
  p_payment_intent_id text,p_stripe_refund_id text,p_amount_cents integer,p_status text,p_environment text,p_request_key uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.invoice_payments; v_refund public.invoice_refunds; v_line record; v_remaining integer:=p_amount_cents; v_previous integer; v_allocated integer:=0; v_attempt public.invoice_checkout_attempts;
BEGIN
  IF p_status NOT IN ('pending','succeeded','failed','canceled') OR p_environment NOT IN ('test','live') OR p_amount_cents <= 0 OR char_length(btrim(coalesce(p_stripe_refund_id,''))) < 3 THEN RAISE EXCEPTION 'invalid Stripe refund' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_payment FROM public.invoice_payments WHERE provider='stripe' AND provider_reference=p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown invoice Stripe payment' USING ERRCODE='P0002'; END IF;
  IF p_request_key IS NOT NULL THEN
    SELECT * INTO v_refund FROM public.invoice_refunds WHERE request_key=p_request_key FOR UPDATE;
    IF FOUND THEN
      IF v_refund.invoice_payment_id <> v_payment.id OR v_refund.environment <> p_environment OR v_refund.amount_cents <> p_amount_cents THEN RAISE EXCEPTION 'Stripe refund does not match invoice payment' USING ERRCODE='22023'; END IF;
      UPDATE public.invoice_refunds SET stripe_refund_id=COALESCE(stripe_refund_id,p_stripe_refund_id),status=CASE WHEN status='succeeded' THEN 'succeeded' ELSE p_status END,updated_at=now() WHERE id=v_refund.id RETURNING * INTO v_refund;
    END IF;
  END IF;
  IF v_refund.id IS NULL THEN
    INSERT INTO public.invoice_refunds(invoice_payment_id,environment,stripe_refund_id,amount_cents,status)
      VALUES(v_payment.id,p_environment,p_stripe_refund_id,p_amount_cents,p_status)
      ON CONFLICT(stripe_refund_id) DO UPDATE SET status=CASE WHEN public.invoice_refunds.status='succeeded' THEN 'succeeded' ELSE EXCLUDED.status END,updated_at=now()
      RETURNING * INTO v_refund;
  END IF;
  IF v_refund.invoice_payment_id <> v_payment.id OR v_refund.environment <> p_environment OR v_refund.amount_cents <> p_amount_cents THEN RAISE EXCEPTION 'Stripe refund does not match invoice payment' USING ERRCODE='22023'; END IF;
  IF p_status <> 'succeeded' OR EXISTS (SELECT 1 FROM public.invoice_refund_allocations WHERE invoice_refund_id=v_refund.id) THEN RETURN jsonb_build_object('refundId',v_refund.id,'allocated',false,'status',v_refund.status); END IF;
  FOR v_line IN SELECT a.invoice_id,a.amount_cents FROM public.invoice_payment_allocations a WHERE a.payment_id=v_payment.id ORDER BY a.invoice_id FOR UPDATE LOOP
    SELECT COALESCE(sum(ra.amount_cents),0) INTO v_previous FROM public.invoice_refund_allocations ra JOIN public.invoice_refunds r ON r.id=ra.invoice_refund_id WHERE r.invoice_payment_id=v_payment.id AND r.status='succeeded' AND ra.invoice_id=v_line.invoice_id;
    v_allocated:=least(v_remaining,v_line.amount_cents-v_previous);
    IF v_allocated>0 THEN
      INSERT INTO public.invoice_refund_allocations(invoice_refund_id,invoice_id,amount_cents) VALUES(v_refund.id,v_line.invoice_id,v_allocated);
      INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary,metadata) VALUES(v_line.invoice_id,NULL,'refund','Stripe refund verified',jsonb_build_object('stripeRefundId',p_stripe_refund_id,'amountCents',v_allocated));
      v_remaining:=v_remaining-v_allocated;
    END IF;
  END LOOP;
  IF v_remaining <> 0 THEN RAISE EXCEPTION 'refund exceeds invoice payment balance' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_attempt FROM public.invoice_checkout_attempts WHERE stripe_payment_intent_id=p_payment_intent_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.invoice_checkout_attempts SET state=CASE WHEN (SELECT COALESCE(sum(amount_cents),0) FROM public.invoice_refunds WHERE invoice_payment_id=v_payment.id AND status='succeeded') >= v_payment.amount_cents THEN 'refunded' ELSE 'partially_refunded' END,updated_at=now() WHERE id=v_attempt.id;
  END IF;
  RETURN jsonb_build_object('refundId',v_refund.id,'allocated',true,'status','succeeded');
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_refund_prepare(p_invoice_payment_id uuid,p_amount_cents integer,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.invoice_payments; v_reserved integer; v_refund public.invoice_refunds;
BEGIN
  IF p_amount_cents <= 0 OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid invoice refund request' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_payment FROM public.invoice_payments WHERE id=p_invoice_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.provider <> 'stripe' OR v_payment.status <> 'succeeded' THEN RAISE EXCEPTION 'invoice payment is not refundable' USING ERRCODE='55000'; END IF;
  SELECT COALESCE(sum(amount_cents),0) INTO v_reserved FROM public.invoice_refunds WHERE invoice_payment_id=v_payment.id AND status IN ('pending','succeeded');
  IF v_reserved+p_amount_cents > v_payment.amount_cents THEN RAISE EXCEPTION 'refund exceeds invoice payment balance' USING ERRCODE='22023'; END IF;
  INSERT INTO public.invoice_refunds(invoice_payment_id,environment,amount_cents,status) VALUES(v_payment.id,p_environment,p_amount_cents,'pending') RETURNING * INTO v_refund;
  RETURN jsonb_build_object('requestKey',v_refund.request_key,'paymentIntentId',v_payment.provider_reference);
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_refund_fail_request(p_request_key uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.invoice_refunds SET status='failed',updated_at=now() WHERE request_key=p_request_key AND status='pending';
END; $$;

REVOKE ALL ON FUNCTION public.stripe_claim_webhook_event(text,text,text), public.stripe_finish_webhook_event(text,boolean,text), public.invoice_record_stripe_refund(text,text,integer,text,text,uuid), public.invoice_refund_prepare(uuid,integer,text), public.invoice_refund_fail_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stripe_claim_webhook_event(text,text,text), public.stripe_finish_webhook_event(text,boolean,text), public.invoice_record_stripe_refund(text,text,integer,text,text,uuid), public.invoice_refund_prepare(uuid,integer,text), public.invoice_refund_fail_request(uuid) TO service_role;
