-- RFQ sample-to-bulk lifecycle. Additive: historical orders and invoices stay intact.
CREATE TABLE IF NOT EXISTS public.rfq_lifecycles (
  rfq_case_id uuid PRIMARY KEY REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  selected_quote_id uuid NOT NULL REFERENCES public.rfq_quotes(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'sample_invoice_pending' CHECK (state IN (
    'sample_invoice_pending','sample_payment_pending','sample_in_progress',
    'sample_awaiting_buyer','sample_declined','bulk_invoice_pending',
    'bulk_payment_pending','bulk_in_production','quality_inspection','shipped','delivered','cancelled'
  )),
  sample_ready_at timestamptz,
  sample_decision text CHECK (sample_decision IN ('approved','declined')),
  sample_decided_at timestamptz,
  sample_decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rfq_lifecycles_selected_quote_unique ON public.rfq_lifecycles(selected_quote_id);
-- Preserve visibility of prior selected RFQs while making the new lifecycle
-- authoritative for all future transitions. Existing active production is not
-- rewritten; it is represented as its current terminal operational state.
INSERT INTO public.rfq_lifecycles(rfq_case_id,selected_quote_id,state)
SELECT DISTINCT ON (q.rfq_case_id) q.rfq_case_id,q.id,
  CASE WHEN c.status='in_production' THEN 'bulk_in_production' ELSE 'sample_invoice_pending' END
FROM public.rfq_quotes q JOIN public.rfq_cases c ON c.id=q.rfq_case_id
WHERE q.status='selected'
ORDER BY q.rfq_case_id,q.selected_at DESC NULLS LAST,q.updated_at DESC
ON CONFLICT (rfq_case_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.rfq_phase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('sample','bulk')),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rfq_case_id, phase, invoice_id)
);
CREATE INDEX IF NOT EXISTS rfq_phase_invoices_case_phase_idx ON public.rfq_phase_invoices(rfq_case_id, phase, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rfq_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('proposal_selected','invoice_created','invoice_sent','invoice_paid','sample_ready','sample_approved','sample_declined','bulk_started','stage_changed','cancelled')),
  phase text CHECK (phase IN ('sample','bulk')),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_lifecycle_events_case_created_idx ON public.rfq_lifecycle_events(rfq_case_id, created_at);

CREATE OR REPLACE FUNCTION public.rfq_lifecycle_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_key text := 'rfq-lifecycle:'||NEW.id::text;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=NEW.rfq_case_id;
  IF NEW.event_type='sample_ready' THEN
    PERFORM public.notification_emit(v_case.buyer_profile_id,'rfq','Sample ready for '||v_case.case_no,'Review the sample outcome before bulk production can be invoiced.','rfq_case',v_case.id,NULL,false,'high',jsonb_build_object('phase','sample'),v_key);
  ELSIF NEW.event_type='sample_approved' THEN
    PERFORM public.notification_emit_to_admins('rfq','Sample approved for '||v_case.case_no,'Bulk invoice preparation is now available.','rfq_case',v_case.id,'high',jsonb_build_object('phase','bulk'),v_key);
  ELSIF NEW.event_type='sample_declined' THEN
    PERFORM public.notification_emit_to_admins('rfq','Sample declined for '||v_case.case_no,'Review the buyer decision before any further commercial action.','rfq_case',v_case.id,'high',jsonb_build_object('phase','sample'),v_key);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rfq_lifecycle_notify_after_insert ON public.rfq_lifecycle_events;
CREATE TRIGGER rfq_lifecycle_notify_after_insert AFTER INSERT ON public.rfq_lifecycle_events FOR EACH ROW EXECUTE FUNCTION public.rfq_lifecycle_notify();

ALTER TABLE public.rfq_lifecycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_phase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfq_lifecycles, public.rfq_phase_invoices, public.rfq_lifecycle_events FROM anon, authenticated;
GRANT SELECT ON public.rfq_lifecycles, public.rfq_phase_invoices, public.rfq_lifecycle_events TO authenticated;
CREATE POLICY rfq_lifecycles_read ON public.rfq_lifecycles FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.rfq_cases c WHERE c.id=rfq_case_id AND c.buyer_profile_id=auth.uid()));
CREATE POLICY rfq_phase_invoices_read ON public.rfq_phase_invoices FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.rfq_cases c WHERE c.id=rfq_case_id AND c.buyer_profile_id=auth.uid()));
CREATE POLICY rfq_lifecycle_events_read ON public.rfq_lifecycle_events FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.rfq_cases c WHERE c.id=rfq_case_id AND c.buyer_profile_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.workspace_select_rfq_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_quote public.rfq_quotes;
BEGIN
  SELECT q.* INTO v_quote FROM public.rfq_quotes q JOIN public.rfq_cases c ON c.id=q.rfq_case_id
    WHERE q.id=p_quote_id AND c.buyer_profile_id=auth.uid() AND q.status='published' FOR UPDATE;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Proposal not found or not available for selection' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.rfq_lifecycles WHERE rfq_case_id=v_quote.rfq_case_id) THEN RAISE EXCEPTION 'A factory has already been selected for this request' USING ERRCODE='55000'; END IF;
  UPDATE public.rfq_quotes SET status='declined' WHERE rfq_case_id=v_quote.rfq_case_id AND status='published' AND id<>v_quote.id;
  UPDATE public.rfq_quotes SET status='selected', selected_at=now() WHERE id=v_quote.id RETURNING * INTO v_quote;
  INSERT INTO public.rfq_lifecycles(rfq_case_id,selected_quote_id) VALUES(v_quote.rfq_case_id,v_quote.id);
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,actor_profile_id,metadata) VALUES(v_quote.rfq_case_id,'proposal_selected',auth.uid(),jsonb_build_object('quoteId',v_quote.id));
  UPDATE public.rfq_cases SET status='quote_selected',updated_at=now() WHERE id=v_quote.rfq_case_id;
  RETURN to_jsonb(v_quote);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_create_rfq_phase_invoice(p_case_id uuid, p_phase text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_lifecycle public.rfq_lifecycles; v_case public.rfq_cases; v_existing uuid; v_invoice jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_phase NOT IN ('sample','bulk') OR jsonb_typeof(p_payload) <> 'object' OR jsonb_typeof(p_payload->'items') <> 'array' THEN RAISE EXCEPTION 'invalid phase invoice' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_lifecycle FROM public.rfq_lifecycles WHERE rfq_case_id=p_case_id FOR UPDATE;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id;
  IF v_lifecycle.rfq_case_id IS NULL OR v_case.id IS NULL OR v_lifecycle.state IN ('cancelled','sample_declined') THEN RAISE EXCEPTION 'This RFQ is not eligible for an invoice' USING ERRCODE='55000'; END IF;
  IF (p_phase='sample' AND v_lifecycle.state NOT IN ('sample_invoice_pending','sample_payment_pending')) OR (p_phase='bulk' AND v_lifecycle.state <> 'bulk_invoice_pending') THEN RAISE EXCEPTION 'This phase is not ready for an invoice' USING ERRCODE='55000'; END IF;
  SELECT pi.invoice_id INTO v_existing FROM public.rfq_phase_invoices pi JOIN public.invoices i ON i.id=pi.invoice_id WHERE pi.rfq_case_id=p_case_id AND pi.phase=p_phase AND i.status <> 'cancelled' ORDER BY pi.created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'An active invoice already exists for this phase' USING ERRCODE='23505'; END IF;
  v_invoice := public.intools_create_invoice(jsonb_build_object('buyerProfileId',v_case.buyer_profile_id,'rfqCaseId',p_case_id,'orderId',null,'dueDate',p_payload->>'dueDate','notes',nullif(btrim(p_payload->>'notes'),''),'items',p_payload->'items'));
  INSERT INTO public.rfq_phase_invoices(rfq_case_id,phase,invoice_id,created_by) VALUES(p_case_id,p_phase,(v_invoice->>'id')::uuid,auth.uid());
  -- A draft is not payable. Sending it is the transition to payment pending.
  UPDATE public.rfq_lifecycles SET updated_at=now() WHERE rfq_case_id=p_case_id;
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,actor_profile_id,metadata) VALUES(p_case_id,'invoice_created',p_phase,auth.uid(),jsonb_build_object('invoiceId',v_invoice->>'id'));
  RETURN v_invoice;
END; $$;

CREATE OR REPLACE FUNCTION public.rfq_lifecycle_invoice_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_phase text; v_case_id uuid; v_quote public.rfq_quotes; v_case public.rfq_cases; v_order public.orders; v_total numeric(12,2);
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    SELECT phase,rfq_case_id INTO v_phase,v_case_id FROM public.rfq_phase_invoices WHERE invoice_id=NEW.id;
    IF v_case_id IS NOT NULL THEN
      UPDATE public.rfq_lifecycles SET state=CASE WHEN v_phase='sample' THEN 'sample_in_progress' ELSE 'bulk_in_production' END,updated_at=now() WHERE rfq_case_id=v_case_id AND state=CASE WHEN v_phase='sample' THEN 'sample_payment_pending' ELSE 'bulk_payment_pending' END;
      INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,metadata) VALUES(v_case_id,'invoice_paid',v_phase,jsonb_build_object('invoiceId',NEW.id));
      IF v_phase='bulk' THEN
        SELECT q.* INTO v_quote FROM public.rfq_lifecycles l JOIN public.rfq_quotes q ON q.id=l.selected_quote_id WHERE l.rfq_case_id=v_case_id;
        SELECT * INTO v_case FROM public.rfq_cases WHERE id=v_case_id;
        IF NOT EXISTS (SELECT 1 FROM public.orders WHERE rfq_case_id=v_case_id) THEN
          v_total:=round(COALESCE(v_quote.quote_total_cents,NEW.total_cents)::numeric/100,2);
          INSERT INTO public.orders(order_no,buyer_profile_id,rfq_case_id,status,subtotal,total,placed_at,payment_verified_at)
            VALUES('ATL-ORD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),v_case.buyer_profile_id,v_case_id,'payment_verified',v_total,v_total,now(),now()) RETURNING * INTO v_order;
          INSERT INTO public.order_items(order_id,factory_id,sku_snapshot,name_snapshot,seller_snapshot,unit_price,qty,line_total)
            VALUES(v_order.id,v_quote.factory_id,v_case.case_no,v_case.title,(SELECT name FROM public.factories WHERE id=v_quote.factory_id),round(v_quote.unit_price_cents::numeric/100,2),v_quote.moq,v_total);
          INSERT INTO public.order_fulfillments(order_id,factory_id,fulfillment_status,production_stage) VALUES(v_order.id,v_quote.factory_id,'processing','bulk_production');
          INSERT INTO public.order_status_events(order_id,status,note,created_by) VALUES(v_order.id,'payment_verified','Bulk invoice fully settled',NULL);
        END IF;
        UPDATE public.rfq_cases SET status='in_production',updated_at=now() WHERE id=v_case_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rfq_lifecycle_invoice_paid ON public.invoices;
CREATE TRIGGER rfq_lifecycle_invoice_paid AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.rfq_lifecycle_invoice_paid();

CREATE OR REPLACE FUNCTION public.rfq_lifecycle_invoice_sent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_phase text; v_case_id uuid;
BEGIN
  IF NEW.status='sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    SELECT phase,rfq_case_id INTO v_phase,v_case_id FROM public.rfq_phase_invoices WHERE invoice_id=NEW.id;
    IF v_case_id IS NOT NULL THEN
      UPDATE public.rfq_lifecycles SET state=CASE WHEN v_phase='sample' THEN 'sample_payment_pending' ELSE 'bulk_payment_pending' END,updated_at=now()
        WHERE rfq_case_id=v_case_id AND state=CASE WHEN v_phase='sample' THEN 'sample_invoice_pending' ELSE 'bulk_invoice_pending' END;
      INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,metadata) VALUES(v_case_id,'invoice_sent',v_phase,jsonb_build_object('invoiceId',NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rfq_lifecycle_invoice_sent ON public.invoices;
CREATE TRIGGER rfq_lifecycle_invoice_sent AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.rfq_lifecycle_invoice_sent();

CREATE OR REPLACE FUNCTION public.intools_publish_rfq_sample(p_case_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_state text;
BEGIN
  PERFORM public.intools_require_admin();
  IF char_length(btrim(coalesce(p_note,''))) > 2000 THEN RAISE EXCEPTION 'Sample note is too long' USING ERRCODE='22023'; END IF;
  SELECT state INTO v_state FROM public.rfq_lifecycles WHERE rfq_case_id=p_case_id FOR UPDATE;
  IF v_state <> 'sample_in_progress' THEN RAISE EXCEPTION 'Sampling is not paid and in progress' USING ERRCODE='55000'; END IF;
  UPDATE public.rfq_lifecycles SET state='sample_awaiting_buyer',sample_ready_at=now(),updated_at=now() WHERE rfq_case_id=p_case_id;
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,actor_profile_id,note) VALUES(p_case_id,'sample_ready','sample',auth.uid(),nullif(btrim(p_note),''));
  RETURN jsonb_build_object('rfq_case_id',p_case_id,'state','sample_awaiting_buyer');
END; $$;

CREATE OR REPLACE FUNCTION public.workspace_decide_rfq_sample(p_case_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_state text;
BEGIN
  IF p_decision NOT IN ('approved','declined') OR char_length(btrim(coalesce(p_note,''))) > 2000 THEN RAISE EXCEPTION 'Invalid sample decision' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid()) THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  SELECT state INTO v_state FROM public.rfq_lifecycles WHERE rfq_case_id=p_case_id FOR UPDATE;
  IF v_state <> 'sample_awaiting_buyer' THEN RAISE EXCEPTION 'No sample is awaiting your decision' USING ERRCODE='55000'; END IF;
  UPDATE public.rfq_lifecycles SET state=CASE WHEN p_decision='approved' THEN 'bulk_invoice_pending' ELSE 'sample_declined' END,sample_decision=p_decision,sample_decided_at=now(),sample_decided_by=auth.uid(),updated_at=now() WHERE rfq_case_id=p_case_id;
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,actor_profile_id,note) VALUES(p_case_id,CASE WHEN p_decision='approved' THEN 'sample_approved' ELSE 'sample_declined' END,'sample',auth.uid(),nullif(btrim(p_note),''));
  RETURN public.workspace_get_rfq_production(p_case_id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_update_order_production_stage(p_order_id uuid, p_stage text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders; v_case_id uuid; v_state text; v_fulfillment public.order_fulfillments;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_stage NOT IN ('quality_inspection','shipped','delivered') THEN RAISE EXCEPTION 'Only paid bulk fulfillment stages may be advanced here' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id; v_case_id:=v_order.rfq_case_id;
  SELECT state INTO v_state FROM public.rfq_lifecycles WHERE rfq_case_id=v_case_id FOR UPDATE;
  IF v_order.id IS NULL OR v_state NOT IN ('bulk_in_production','quality_inspection','shipped') THEN RAISE EXCEPTION 'Bulk production is not paid and active' USING ERRCODE='55000'; END IF;
  IF (v_state='bulk_in_production' AND p_stage<>'quality_inspection') OR (v_state='quality_inspection' AND p_stage<>'shipped') OR (v_state='shipped' AND p_stage<>'delivered') THEN RAISE EXCEPTION 'Fulfillment stages must advance in order' USING ERRCODE='55000'; END IF;
  UPDATE public.order_fulfillments SET production_stage=p_stage WHERE order_id=p_order_id RETURNING * INTO v_fulfillment;
  UPDATE public.rfq_lifecycles SET state=p_stage,updated_at=now() WHERE rfq_case_id=v_case_id;
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,actor_profile_id,note,metadata) VALUES(v_case_id,'stage_changed','bulk',auth.uid(),nullif(btrim(p_note),''),jsonb_build_object('stage',p_stage));
  RETURN to_jsonb(v_fulfillment);
END; $$;

-- The pre-lifecycle RPC created an order immediately after proposal selection.
-- Keep its signature only to fail safely for stale browser clients; phase
-- invoice settlement is now the exclusive route into production.
CREATE OR REPLACE FUNCTION public.intools_confirm_rfq_order(
  p_case_id uuid, p_quote_id uuid, p_qty numeric,
  p_ship_country text DEFAULT NULL, p_ship_address text DEFAULT NULL, p_incoterms text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.intools_require_admin();
  RAISE EXCEPTION 'Order confirmation is lifecycle-controlled: send and settle the required phase invoice first' USING ERRCODE='55000';
END; $$;

CREATE OR REPLACE FUNCTION public.workspace_get_rfq_production(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid()) THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'quote',(SELECT jsonb_build_object('id',q.id,'unit_price_cents',q.unit_price_cents,'moq',q.moq,'lead_time_days',q.lead_time_days,'selected_at',q.selected_at,'factory_name',f.name,'factory_region',f.region) FROM public.rfq_quotes q JOIN public.factories f ON f.id=q.factory_id WHERE q.id=l.selected_quote_id),
    'lifecycle',jsonb_build_object('state',l.state,'sample_ready_at',l.sample_ready_at,'sample_decision',l.sample_decision,'sample_decided_at',l.sample_decided_at),
    'invoices',COALESCE((SELECT jsonb_object_agg(pi.phase,jsonb_build_object('id',i.id,'invoice_no',i.invoice_no,'phase',pi.phase,'status',i.status::text,'effective_status',CASE WHEN i.status='sent' AND i.due_date<current_date THEN 'overdue' ELSE i.status::text END,'total_cents',i.total_cents,'balance_cents',i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),'due_date',i.due_date)) FROM public.rfq_phase_invoices pi JOIN public.invoices i ON i.id=pi.invoice_id WHERE pi.rfq_case_id=p_case_id),'{}'::jsonb),
    'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type',e.event_type,'phase',e.phase,'note',e.note,'created_at',e.created_at) ORDER BY e.created_at) FROM public.rfq_lifecycle_events e WHERE e.rfq_case_id=p_case_id),'[]'::jsonb)
  ) INTO v_result FROM public.rfq_lifecycles l WHERE l.rfq_case_id=p_case_id;
  RETURN COALESCE(v_result,jsonb_build_object('quote',null,'lifecycle',null,'invoices','{}'::jsonb,'events','[]'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.intools_create_rfq_phase_invoice(uuid,text,jsonb), public.intools_publish_rfq_sample(uuid,text), public.workspace_decide_rfq_sample(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_create_rfq_phase_invoice(uuid,text,jsonb), public.intools_publish_rfq_sample(uuid,text), public.workspace_decide_rfq_sample(uuid,text,text) TO authenticated;
