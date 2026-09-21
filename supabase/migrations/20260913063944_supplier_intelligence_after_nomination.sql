-- Supplier intelligence remains downstream of manual RFQ nomination. Seeded
-- percentages are presentation baselines only; they never become evidence,
-- learning labels, or routing weights.

ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS default_moq_units integer CHECK (default_moq_units IS NULL OR default_moq_units > 0),
  ADD COLUMN IF NOT EXISTS default_lead_time_days integer CHECK (default_lead_time_days IS NULL OR default_lead_time_days > 0),
  ADD COLUMN IF NOT EXISTS commercial_defaults_source text CHECK (commercial_defaults_source IN ('seeded','ops_entered')),
  ADD COLUMN IF NOT EXISTS commercial_defaults_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_defaults_verified_at timestamptz;
CREATE INDEX factories_commercial_defaults_verifier_idx ON public.factories(commercial_defaults_verified_by) WHERE commercial_defaults_verified_by IS NOT NULL;

-- Only backfill values whose meaning is unambiguous. Ranges and phrases such
-- as "quoted to brief" remain empty and must be confirmed by Operations.
UPDATE public.factories
SET default_moq_units=(regexp_match(btrim(moq),'^([0-9]+)(?:\s*(?:units?|pcs?))?$','i'))[1]::integer,
    commercial_defaults_source=COALESCE(commercial_defaults_source,'seeded')
WHERE default_moq_units IS NULL
  AND btrim(COALESCE(moq,'')) ~* '^[0-9]+(?:\s*(?:units?|pcs?))?$';

UPDATE public.factories
SET default_lead_time_days=(regexp_match(btrim(lead),'^([0-9]+)(?:\s*days?)?$','i'))[1]::integer,
    commercial_defaults_source=COALESCE(commercial_defaults_source,'seeded')
WHERE default_lead_time_days IS NULL
  AND btrim(COALESCE(lead,'')) ~* '^[0-9]+(?:\s*days?)?$';

ALTER TABLE public.rfq_supplier_outreach_drafts
  ADD COLUMN IF NOT EXISTS response_disposition text
    CHECK (response_disposition IN ('open','responded','no_response','excluded_invalid_contact','excluded_buyer_withdrawn')),
  ADD COLUMN IF NOT EXISTS response_closed_at timestamptz;

ALTER TABLE public.rfq_supplier_outreach_events
  DROP CONSTRAINT IF EXISTS rfq_supplier_outreach_events_event_type_check;
ALTER TABLE public.rfq_supplier_outreach_events
  ADD CONSTRAINT rfq_supplier_outreach_events_event_type_check CHECK (
    event_type IN ('created','edited','reset','copied_subject','copied_body','copied_all','contacted','supplier_response','no_response','invalid_contact','buyer_withdrawn','superseded')
  );

UPDATE public.rfq_supplier_outreach_drafts d SET
  response_disposition='responded',
  response_closed_at=(SELECT max(e.created_at) FROM public.rfq_supplier_outreach_events e WHERE e.draft_id=d.id AND e.event_type='supplier_response')
WHERE d.status='contacted' AND EXISTS(
  SELECT 1 FROM public.rfq_supplier_outreach_events e WHERE e.draft_id=d.id AND e.event_type='supplier_response'
);

UPDATE public.rfq_supplier_outreach_drafts
SET response_disposition='open',response_closed_at=NULL
WHERE status='contacted' AND response_disposition IS NULL;

CREATE INDEX rfq_supplier_outreach_response_metric_idx
  ON public.rfq_supplier_outreach_drafts(match_id,response_closed_at DESC)
  WHERE response_disposition IN ('responded','no_response');

CREATE TABLE public.supplier_order_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.rfq_quotes(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('published','superseded')),
  outcome text NOT NULL CHECK (outcome IN ('delivered','supplier_failed','buyer_cancelled')),
  promised_delivery_date date,
  revised_delivery_date date,
  actual_delivery_date date,
  supplier_responsible boolean NOT NULL,
  had_defect boolean NOT NULL DEFAULT false,
  had_rework boolean NOT NULL DEFAULT false,
  sample_iterations integer NOT NULL DEFAULT 0 CHECK (sample_iterations >= 0),
  evidence_references jsonb NOT NULL CHECK (jsonb_typeof(evidence_references)='array' AND jsonb_array_length(evidence_references)>0),
  note text CHECK (note IS NULL OR char_length(note) <= 4000),
  methodology_version integer NOT NULL DEFAULT 1 CHECK (methodology_version > 0),
  reviewed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id uuid REFERENCES public.supplier_order_outcomes(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,version),
  CHECK (outcome <> 'delivered' OR actual_delivery_date IS NOT NULL),
  CHECK (outcome = 'delivered' OR NOT had_defect AND NOT had_rework),
  CHECK (outcome <> 'supplier_failed' OR supplier_responsible),
  CHECK (outcome <> 'buyer_cancelled' OR NOT supplier_responsible)
);
CREATE UNIQUE INDEX supplier_order_outcomes_current_idx ON public.supplier_order_outcomes(order_id) WHERE status='published';
CREATE INDEX supplier_order_outcomes_supplier_window_idx ON public.supplier_order_outcomes(supplier_id,reviewed_at DESC) WHERE status='published';
CREATE INDEX supplier_order_outcomes_rfq_case_idx ON public.supplier_order_outcomes(rfq_case_id);
CREATE INDEX supplier_order_outcomes_quote_idx ON public.supplier_order_outcomes(quote_id);
CREATE INDEX supplier_order_outcomes_supersedes_idx ON public.supplier_order_outcomes(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX supplier_order_outcomes_reviewer_idx ON public.supplier_order_outcomes(reviewed_by,reviewed_at DESC);

CREATE TABLE public.supplier_performance_snapshots (
  supplier_id uuid PRIMARY KEY REFERENCES public.factories(id) ON DELETE CASCADE,
  delivery_rate numeric(5,1) NOT NULL DEFAULT 100 CHECK (delivery_rate BETWEEN 0 AND 100),
  delivery_basis text NOT NULL DEFAULT 'baseline' CHECK (delivery_basis IN ('baseline','observed','historical')),
  delivery_sample_size integer NOT NULL DEFAULT 0 CHECK (delivery_sample_size >= 0),
  delivery_brand_count integer NOT NULL DEFAULT 0 CHECK (delivery_brand_count >= 0),
  response_rate numeric(5,1) NOT NULL DEFAULT 100 CHECK (response_rate BETWEEN 0 AND 100),
  response_basis text NOT NULL DEFAULT 'baseline' CHECK (response_basis IN ('baseline','observed','historical')),
  response_sample_size integer NOT NULL DEFAULT 0 CHECK (response_sample_size >= 0),
  response_brand_count integer NOT NULL DEFAULT 0 CHECK (response_brand_count >= 0),
  on_time_rate numeric(5,1) CHECK (on_time_rate IS NULL OR on_time_rate BETWEEN 0 AND 100),
  on_time_basis text CHECK (on_time_basis IS NULL OR on_time_basis IN ('observed','historical')),
  on_time_sample_size integer NOT NULL DEFAULT 0 CHECK (on_time_sample_size>=0),
  affected_order_rate numeric(5,1) CHECK (affected_order_rate IS NULL OR affected_order_rate BETWEEN 0 AND 100),
  affected_order_basis text CHECK (affected_order_basis IS NULL OR affected_order_basis IN ('observed','historical')),
  affected_order_sample_size integer NOT NULL DEFAULT 0 CHECK (affected_order_sample_size>=0),
  qualifying_orders integer NOT NULL DEFAULT 0 CHECK (qualifying_orders >= 0),
  methodology_version integer NOT NULL DEFAULT 1 CHECK (methodology_version > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supplier_performance_snapshot_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK(revision>0),
  delivery_rate numeric(5,1) NOT NULL CHECK(delivery_rate BETWEEN 0 AND 100),
  delivery_basis text NOT NULL CHECK(delivery_basis IN ('baseline','observed','historical')),
  response_rate numeric(5,1) NOT NULL CHECK(response_rate BETWEEN 0 AND 100),
  response_basis text NOT NULL CHECK(response_basis IN ('baseline','observed','historical')),
  qualifying_orders integer NOT NULL CHECK(qualifying_orders>=0),
  methodology_version integer NOT NULL CHECK(methodology_version>0),
  snapshot_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier_id,revision)
);
CREATE INDEX supplier_performance_snapshot_versions_window_idx ON public.supplier_performance_snapshot_versions(snapshot_updated_at DESC,supplier_id);

CREATE OR REPLACE FUNCTION public.capture_supplier_performance_snapshot_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.supplier_performance_snapshot_versions(supplier_id,revision,delivery_rate,delivery_basis,response_rate,response_basis,qualifying_orders,methodology_version,snapshot_updated_at)
  VALUES(NEW.supplier_id,NEW.revision,NEW.delivery_rate,NEW.delivery_basis,NEW.response_rate,NEW.response_basis,NEW.qualifying_orders,NEW.methodology_version,NEW.updated_at)
  ON CONFLICT(supplier_id,revision) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER supplier_performance_snapshot_version_after_change AFTER INSERT OR UPDATE ON public.supplier_performance_snapshots
FOR EACH ROW EXECUTE FUNCTION public.capture_supplier_performance_snapshot_version();

INSERT INTO public.supplier_performance_snapshots(supplier_id)
SELECT id FROM public.factories ON CONFLICT(supplier_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.supplier_performance_seed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.supplier_performance_snapshots(supplier_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS supplier_performance_seed_after_factory ON public.factories;
CREATE TRIGGER supplier_performance_seed_after_factory AFTER INSERT ON public.factories
FOR EACH ROW EXECUTE FUNCTION public.supplier_performance_seed();

CREATE OR REPLACE FUNCTION public.refresh_supplier_performance(p_supplier_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_previous public.supplier_performance_snapshots;
  v_delivery_total integer:=0; v_delivery_brands integer:=0; v_delivered integer:=0;
  v_on_time integer:=0; v_on_time_eligible integer:=0; v_on_time_brands integer:=0;
  v_completed integer:=0; v_completed_brands integer:=0; v_affected integer:=0;
  v_response_total integer:=0; v_response_brands integer:=0; v_responded integer:=0;
BEGIN
  INSERT INTO public.supplier_performance_snapshots(supplier_id) VALUES(p_supplier_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_previous FROM public.supplier_performance_snapshots WHERE supplier_id=p_supplier_id FOR UPDATE;

  SELECT count(*),count(DISTINCT c.buyer_profile_id),count(*) FILTER (WHERE o.outcome='delivered'),
    count(*) FILTER (WHERE o.outcome='delivered' AND o.promised_delivery_date IS NOT NULL AND o.actual_delivery_date<=o.promised_delivery_date),
    count(*) FILTER (WHERE o.outcome='delivered' AND o.promised_delivery_date IS NOT NULL),
    count(DISTINCT c.buyer_profile_id) FILTER (WHERE o.outcome='delivered' AND o.promised_delivery_date IS NOT NULL),
    count(*) FILTER (WHERE o.outcome='delivered'),
    count(DISTINCT c.buyer_profile_id) FILTER (WHERE o.outcome='delivered'),
    count(*) FILTER (WHERE o.outcome='delivered' AND (o.had_defect OR o.had_rework))
  INTO v_delivery_total,v_delivery_brands,v_delivered,v_on_time,v_on_time_eligible,v_on_time_brands,v_completed,v_completed_brands,v_affected
  FROM public.supplier_order_outcomes o JOIN public.rfq_cases c ON c.id=o.rfq_case_id
  WHERE o.supplier_id=p_supplier_id AND o.status='published' AND o.reviewed_at>=now()-interval '24 months'
    AND o.outcome IN ('delivered','supplier_failed') AND (o.outcome='delivered' OR o.supplier_responsible);

  WITH opportunities AS (
    SELECT d.id,c.buyer_profile_id,d.response_disposition='responded' responded
    FROM public.rfq_supplier_outreach_drafts d
    JOIN public.rfq_supplier_matches m ON m.id=d.match_id
    JOIN public.rfq_cases c ON c.id=d.rfq_case_id
    WHERE m.factory_id=p_supplier_id AND d.status='contacted'
      AND d.response_disposition IN ('responded','no_response')
      AND d.response_closed_at>=now()-interval '24 months'
  ) SELECT count(*),count(DISTINCT buyer_profile_id),count(*) FILTER (WHERE responded)
    INTO v_response_total,v_response_brands,v_responded FROM opportunities;

  UPDATE public.supplier_performance_snapshots SET
    delivery_rate=CASE WHEN v_delivery_total>=10 AND v_delivery_brands>=5 THEN round(v_delivered*100.0/v_delivery_total,1) ELSE v_previous.delivery_rate END,
    delivery_basis=CASE WHEN v_delivery_total>=10 AND v_delivery_brands>=5 THEN 'observed' WHEN v_previous.delivery_basis IN ('observed','historical') THEN 'historical' ELSE 'baseline' END,
    delivery_sample_size=CASE WHEN v_delivery_total>=10 AND v_delivery_brands>=5 OR v_previous.delivery_basis='baseline' THEN v_delivery_total ELSE v_previous.delivery_sample_size END,
    delivery_brand_count=CASE WHEN v_delivery_total>=10 AND v_delivery_brands>=5 OR v_previous.delivery_basis='baseline' THEN v_delivery_brands ELSE v_previous.delivery_brand_count END,
    response_rate=CASE WHEN v_response_total>=10 AND v_response_brands>=5 THEN round(v_responded*100.0/v_response_total,1) ELSE v_previous.response_rate END,
    response_basis=CASE WHEN v_response_total>=10 AND v_response_brands>=5 THEN 'observed' WHEN v_previous.response_basis IN ('observed','historical') THEN 'historical' ELSE 'baseline' END,
    response_sample_size=CASE WHEN v_response_total>=10 AND v_response_brands>=5 OR v_previous.response_basis='baseline' THEN v_response_total ELSE v_previous.response_sample_size END,
    response_brand_count=CASE WHEN v_response_total>=10 AND v_response_brands>=5 OR v_previous.response_basis='baseline' THEN v_response_brands ELSE v_previous.response_brand_count END,
    on_time_rate=CASE WHEN v_on_time_eligible>=10 AND v_on_time_brands>=5 THEN round(v_on_time*100.0/NULLIF(v_on_time_eligible,0),1) ELSE v_previous.on_time_rate END,
    on_time_basis=CASE WHEN v_on_time_eligible>=10 AND v_on_time_brands>=5 THEN 'observed' WHEN v_previous.on_time_basis IN ('observed','historical') THEN 'historical' ELSE NULL END,
    on_time_sample_size=CASE WHEN v_on_time_eligible>=10 AND v_on_time_brands>=5 OR v_previous.on_time_basis IS NULL THEN v_on_time_eligible ELSE v_previous.on_time_sample_size END,
    affected_order_rate=CASE WHEN v_completed>=10 AND v_completed_brands>=5 THEN round(v_affected*100.0/NULLIF(v_completed,0),1) ELSE v_previous.affected_order_rate END,
    affected_order_basis=CASE WHEN v_completed>=10 AND v_completed_brands>=5 THEN 'observed' WHEN v_previous.affected_order_basis IN ('observed','historical') THEN 'historical' ELSE NULL END,
    affected_order_sample_size=CASE WHEN v_completed>=10 AND v_completed_brands>=5 OR v_previous.affected_order_basis IS NULL THEN v_completed ELSE v_previous.affected_order_sample_size END,
    qualifying_orders=v_completed,methodology_version=1,revision=v_previous.revision+1,updated_at=now()
  WHERE supplier_id=p_supplier_id;
END; $$;

CREATE OR REPLACE FUNCTION public.supplier_performance_json(p_supplier_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'deliveryRate',jsonb_build_object('value',s.delivery_rate,'basis',s.delivery_basis,'sampleSize',s.delivery_sample_size),
    'responseRate',jsonb_build_object('value',s.response_rate,'basis',s.response_basis,'sampleSize',s.response_sample_size),
    'affectedOrderRate',CASE WHEN s.affected_order_basis IS NULL THEN NULL ELSE jsonb_build_object('value',s.affected_order_rate,'basis',s.affected_order_basis,'sampleSize',s.affected_order_sample_size) END,
    'onTimeRate',CASE WHEN s.on_time_basis IS NULL THEN NULL ELSE jsonb_build_object('value',s.on_time_rate,'basis',s.on_time_basis,'sampleSize',s.on_time_sample_size) END,
    'qualifyingOrders',s.qualifying_orders,'methodologyVersion',s.methodology_version,'revision',s.revision,'updatedAt',s.updated_at
  ) FROM public.supplier_performance_snapshots s WHERE s.supplier_id=p_supplier_id;
$$;

CREATE OR REPLACE FUNCTION public.supplier_performance_refresh_from_outreach()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_supplier_id uuid;
BEGIN
  IF NEW.event_type NOT IN ('contacted','supplier_response','no_response','invalid_contact','buyer_withdrawn') THEN RETURN NEW; END IF;
  UPDATE public.rfq_supplier_outreach_drafts SET
    response_disposition=CASE NEW.event_type
      WHEN 'contacted' THEN 'open'
      WHEN 'supplier_response' THEN 'responded'
      WHEN 'no_response' THEN 'no_response'
      WHEN 'invalid_contact' THEN 'excluded_invalid_contact'
      WHEN 'buyer_withdrawn' THEN 'excluded_buyer_withdrawn'
    END,
    response_closed_at=CASE WHEN NEW.event_type='contacted' THEN NULL ELSE NEW.created_at END
  WHERE id=NEW.draft_id;
  IF NEW.event_type NOT IN ('supplier_response','no_response') THEN RETURN NEW; END IF;
  SELECT m.factory_id INTO v_supplier_id FROM public.rfq_supplier_matches m WHERE m.id=NEW.match_id;
  IF v_supplier_id IS NOT NULL THEN PERFORM public.refresh_supplier_performance(v_supplier_id); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS supplier_performance_after_outreach ON public.rfq_supplier_outreach_events;
CREATE TRIGGER supplier_performance_after_outreach AFTER INSERT ON public.rfq_supplier_outreach_events
FOR EACH ROW EXECUTE FUNCTION public.supplier_performance_refresh_from_outreach();

CREATE OR REPLACE FUNCTION public.intools_close_rfq_response_opportunity(p_draft_id uuid,p_disposition text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_draft public.rfq_supplier_outreach_drafts;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_disposition NOT IN ('no_response','invalid_contact','buyer_withdrawn') THEN RAISE EXCEPTION 'Unsupported response disposition' USING ERRCODE='22023'; END IF;
  IF char_length(btrim(COALESCE(p_note,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A close note is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_draft FROM public.rfq_supplier_outreach_drafts WHERE id=p_draft_id AND status='contacted' FOR UPDATE;
  IF v_draft.id IS NULL OR COALESCE(v_draft.response_disposition,'open')<>'open' THEN RAISE EXCEPTION 'Response opportunity is not eligible to close' USING ERRCODE='55000'; END IF;
  INSERT INTO public.rfq_supplier_outreach_events(draft_id,rfq_case_id,match_id,event_type,actor_profile_id,note)
  VALUES(v_draft.id,v_draft.rfq_case_id,v_draft.match_id,p_disposition,auth.uid(),btrim(p_note));
  RETURN public.rfq_outreach_draft_json(v_draft.id);
END; $$;

CREATE TABLE public.rfq_order_commercial_snapshots (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.rfq_quotes(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  moq integer NOT NULL CHECK (moq>0),
  lead_time_days integer NOT NULL CHECK (lead_time_days>0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents>0),
  quote_total_cents integer NOT NULL CHECK (quote_total_cents>0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rfq_order_commercial_snapshots_case_idx ON public.rfq_order_commercial_snapshots(rfq_case_id);
CREATE INDEX rfq_order_commercial_snapshots_quote_idx ON public.rfq_order_commercial_snapshots(quote_id);
CREATE INDEX rfq_order_commercial_snapshots_supplier_idx ON public.rfq_order_commercial_snapshots(supplier_id);

CREATE OR REPLACE FUNCTION public.capture_rfq_order_commercial_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.rfq_case_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.rfq_order_commercial_snapshots(order_id,rfq_case_id,quote_id,supplier_id,moq,lead_time_days,unit_price_cents,quote_total_cents)
  SELECT NEW.id,NEW.rfq_case_id,q.id,q.factory_id,q.moq,q.lead_time_days,q.unit_price_cents,q.quote_total_cents
  FROM public.rfq_lifecycles l JOIN public.rfq_quotes q ON q.id=l.selected_quote_id
  WHERE l.rfq_case_id=NEW.rfq_case_id AND q.quote_total_cents IS NOT NULL
  ON CONFLICT(order_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS capture_rfq_order_commercial_snapshot_after_insert ON public.orders;
CREATE TRIGGER capture_rfq_order_commercial_snapshot_after_insert AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_rfq_order_commercial_snapshot();

INSERT INTO public.rfq_order_commercial_snapshots(order_id,rfq_case_id,quote_id,supplier_id,moq,lead_time_days,unit_price_cents,quote_total_cents)
SELECT o.id,o.rfq_case_id,q.id,q.factory_id,q.moq,q.lead_time_days,q.unit_price_cents,q.quote_total_cents
FROM public.orders o JOIN public.rfq_lifecycles l ON l.rfq_case_id=o.rfq_case_id JOIN public.rfq_quotes q ON q.id=l.selected_quote_id
WHERE o.rfq_case_id IS NOT NULL AND q.quote_total_cents IS NOT NULL ON CONFLICT(order_id) DO NOTHING;

CREATE TABLE public.rfq_invoice_commercial_snapshots (
  invoice_id uuid PRIMARY KEY REFERENCES public.invoices(id) ON DELETE RESTRICT,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.rfq_quotes(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  moq integer NOT NULL CHECK (moq>0),
  lead_time_days integer NOT NULL CHECK (lead_time_days>0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents>0),
  quote_total_cents integer NOT NULL CHECK (quote_total_cents>0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rfq_invoice_commercial_snapshots_case_idx ON public.rfq_invoice_commercial_snapshots(rfq_case_id);
CREATE INDEX rfq_invoice_commercial_snapshots_quote_idx ON public.rfq_invoice_commercial_snapshots(quote_id);
CREATE INDEX rfq_invoice_commercial_snapshots_supplier_idx ON public.rfq_invoice_commercial_snapshots(supplier_id);

CREATE OR REPLACE FUNCTION public.reject_commercial_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Commercial snapshots are immutable' USING ERRCODE='55000';
END; $$;
CREATE TRIGGER rfq_order_commercial_snapshot_immutable BEFORE UPDATE OR DELETE ON public.rfq_order_commercial_snapshots
FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_snapshot_mutation();
CREATE TRIGGER rfq_invoice_commercial_snapshot_immutable BEFORE UPDATE OR DELETE ON public.rfq_invoice_commercial_snapshots
FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_snapshot_mutation();
CREATE OR REPLACE FUNCTION public.capture_rfq_invoice_commercial_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.rfq_invoice_commercial_snapshots(invoice_id,rfq_case_id,quote_id,supplier_id,moq,lead_time_days,unit_price_cents,quote_total_cents)
  SELECT NEW.invoice_id,NEW.rfq_case_id,q.id,q.factory_id,q.moq,q.lead_time_days,q.unit_price_cents,q.quote_total_cents
  FROM public.rfq_lifecycles l JOIN public.rfq_quotes q ON q.id=l.selected_quote_id
  WHERE l.rfq_case_id=NEW.rfq_case_id AND q.quote_total_cents IS NOT NULL
  ON CONFLICT(invoice_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS capture_rfq_invoice_commercial_snapshot_after_link ON public.rfq_phase_invoices;
CREATE TRIGGER capture_rfq_invoice_commercial_snapshot_after_link AFTER INSERT ON public.rfq_phase_invoices
FOR EACH ROW EXECUTE FUNCTION public.capture_rfq_invoice_commercial_snapshot();

INSERT INTO public.rfq_invoice_commercial_snapshots(invoice_id,rfq_case_id,quote_id,supplier_id,moq,lead_time_days,unit_price_cents,quote_total_cents)
SELECT pi.invoice_id,pi.rfq_case_id,q.id,q.factory_id,q.moq,q.lead_time_days,q.unit_price_cents,q.quote_total_cents
FROM public.rfq_phase_invoices pi JOIN public.rfq_lifecycles l ON l.rfq_case_id=pi.rfq_case_id JOIN public.rfq_quotes q ON q.id=l.selected_quote_id
WHERE q.quote_total_cents IS NOT NULL ON CONFLICT(invoice_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.intools_set_supplier_intelligence_defaults(p_supplier_id uuid,p_moq integer,p_lead_time_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_supplier public.factories;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_moq IS NULL OR p_moq<=0 OR p_lead_time_days IS NULL OR p_lead_time_days<=0 THEN RAISE EXCEPTION 'MOQ and lead time must be positive whole numbers' USING ERRCODE='22023'; END IF;
  UPDATE public.factories SET default_moq_units=p_moq,default_lead_time_days=p_lead_time_days,
    commercial_defaults_source='ops_entered',commercial_defaults_verified_by=auth.uid(),commercial_defaults_verified_at=now(),updated_at=now()
  WHERE id=p_supplier_id RETURNING * INTO v_supplier;
  IF v_supplier.id IS NULL THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
  VALUES(auth.uid(),'factories',p_supplier_id,'update','Updated supplier quote defaults',jsonb_build_object('default_moq_units',p_moq,'default_lead_time_days',p_lead_time_days));
  RETURN jsonb_build_object('supplier_id',v_supplier.id,'default_moq_units',v_supplier.default_moq_units,'default_lead_time_days',v_supplier.default_lead_time_days,'source',v_supplier.commercial_defaults_source,'verified_at',v_supplier.commercial_defaults_verified_at);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_suppliers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object('product_count',0,'performance_basis',
    CASE WHEN s.delivery_basis='observed' OR s.response_basis='observed' THEN 'observed'
      WHEN s.delivery_basis='historical' OR s.response_basis='historical' THEN 'historical' ELSE 'baseline' END)
    ORDER BY f.updated_at DESC),'[]'::jsonb)
  INTO v_result FROM public.factories f JOIN public.supplier_performance_snapshots s ON s.supplier_id=f.id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_get_supplier_intelligence(p_supplier_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT jsonb_build_object('supplier_id',f.id,'default_moq_units',f.default_moq_units,'default_lead_time_days',f.default_lead_time_days,
    'source',f.commercial_defaults_source,'verified_at',f.commercial_defaults_verified_at,'performance',public.supplier_performance_json(f.id))
  INTO v_result FROM public.factories f WHERE f.id=p_supplier_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='P0002'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_get_supplier_intelligence_for_case(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('supplier_id',f.id,'default_moq_units',f.default_moq_units,'default_lead_time_days',f.default_lead_time_days,
    'source',f.commercial_defaults_source,'performance',public.supplier_performance_json(f.id)) ORDER BY f.name),'[]'::jsonb)
  INTO v_result FROM public.rfq_supplier_matches m JOIN public.factories f ON f.id=m.factory_id
  WHERE m.rfq_case_id=p_case_id AND m.status IN ('approved','selected');
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_set_rfq_supplier_match_status(p_match_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_match public.rfq_supplier_matches; v_previous_status text;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_status NOT IN ('suggested','selected','approved','rejected') THEN RAISE EXCEPTION 'Invalid RFQ supplier match status' USING ERRCODE='22023'; END IF;
  SELECT m.* INTO v_match FROM public.rfq_supplier_matches m WHERE m.id=p_match_id FOR UPDATE;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'RFQ supplier match not found' USING ERRCODE='P0002'; END IF;
  v_previous_status:=v_match.status;
  IF p_status IN ('suggested','rejected') AND v_previous_status IN ('approved','selected') AND EXISTS(
    SELECT 1 FROM public.rfq_quotes q WHERE q.match_id=p_match_id AND q.status='selected'
  ) THEN RAISE EXCEPTION 'A buyer-selected supplier must be handled through the order lifecycle' USING ERRCODE='55000'; END IF;
  UPDATE public.rfq_supplier_matches SET status=p_status,
    approved_by=CASE WHEN p_status='approved' THEN auth.uid() ELSE approved_by END,
    approved_at=CASE WHEN p_status='approved' THEN now() ELSE approved_at END,updated_at=now()
  WHERE id=p_match_id RETURNING * INTO v_match;
  IF p_status IN ('suggested','rejected') AND v_previous_status IN ('approved','selected') THEN
    INSERT INTO public.rfq_supplier_outreach_events(draft_id,rfq_case_id,match_id,event_type,actor_profile_id,note)
    SELECT d.id,d.rfq_case_id,d.match_id,'superseded',auth.uid(),'Supplier nomination revoked'
    FROM public.rfq_supplier_outreach_drafts d WHERE d.match_id=p_match_id AND d.status IN ('draft','copied');
    UPDATE public.rfq_supplier_outreach_drafts SET status='superseded',updated_by=auth.uid(),updated_at=now()
    WHERE match_id=p_match_id AND status IN ('draft','copied');
    UPDATE public.rfq_quotes SET status='withdrawn',updated_at=now()
    WHERE match_id=p_match_id AND status IN ('draft','published');
    PERFORM realtime.send(jsonb_build_object('event_type','supplier_nomination_revoked','match_id',p_match_id),'rfq_activity_changed','rfq:'||v_match.rfq_case_id::text||':activity',true);
  END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
  VALUES(auth.uid(),'factories',v_match.factory_id,'update','Set RFQ supplier match status to '||p_status);
  RETURN to_jsonb(v_match);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_get_supplier_order_outcome(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT to_jsonb(o) INTO v_result FROM public.supplier_order_outcomes o WHERE o.order_id=p_order_id AND o.status='published';
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_publish_supplier_order_outcome(p_order_id uuid,p_payload jsonb,p_expected_version integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders; v_quote public.rfq_quotes; v_stage text; v_previous public.supplier_order_outcomes; v_outcome public.supplier_order_outcomes; v_version integer;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.rfq_case_id IS NULL THEN RAISE EXCEPTION 'RFQ order not found' USING ERRCODE='P0002'; END IF;
  SELECT q.* INTO v_quote FROM public.rfq_lifecycles l JOIN public.rfq_quotes q ON q.id=l.selected_quote_id WHERE l.rfq_case_id=v_order.rfq_case_id;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Selected quote snapshot is unavailable' USING ERRCODE='55000'; END IF;
  SELECT production_stage INTO v_stage FROM public.order_fulfillments WHERE order_id=p_order_id ORDER BY created_at LIMIT 1;
  SELECT * INTO v_previous FROM public.supplier_order_outcomes WHERE order_id=p_order_id AND status='published' FOR UPDATE;
  IF COALESCE(v_previous.version,0)<>COALESCE(p_expected_version,0) THEN RAISE EXCEPTION 'Outcome changed; reload before publishing' USING ERRCODE='40001'; END IF;
  IF COALESCE(p_payload->>'outcome','') NOT IN ('delivered','supplier_failed','buyer_cancelled')
    OR jsonb_typeof(COALESCE(p_payload->'evidence_references','[]'::jsonb))<>'array'
    OR jsonb_array_length(COALESCE(p_payload->'evidence_references','[]'::jsonb))=0
  THEN RAISE EXCEPTION 'Outcome and at least one evidence reference are required' USING ERRCODE='22023'; END IF;
  IF p_payload->>'outcome'='delivered' AND (v_stage<>'delivered' OR NULLIF(p_payload->>'actual_delivery_date','') IS NULL) THEN RAISE EXCEPTION 'Delivered outcomes require a delivered fulfillment and actual date' USING ERRCODE='55000'; END IF;
  IF p_payload->>'outcome' IN ('supplier_failed','buyer_cancelled') AND v_order.status NOT IN ('cancelled','disputed') THEN RAISE EXCEPTION 'Failed or cancelled outcomes require a terminal order status' USING ERRCODE='55000'; END IF;
  IF p_payload->>'outcome'='supplier_failed' AND COALESCE((p_payload->>'supplier_responsible')::boolean,false)=false THEN RAISE EXCEPTION 'Supplier failed outcomes must be supplier-responsible' USING ERRCODE='22023'; END IF;
  IF p_payload->>'outcome'='buyer_cancelled' AND COALESCE((p_payload->>'supplier_responsible')::boolean,false)=true THEN RAISE EXCEPTION 'Buyer-cancelled outcomes cannot be supplier-responsible' USING ERRCODE='22023'; END IF;
  IF p_payload->>'outcome'<>'delivered' AND (COALESCE((p_payload->>'had_defect')::boolean,false) OR COALESCE((p_payload->>'had_rework')::boolean,false)) THEN RAISE EXCEPTION 'Defect and rework labels require a delivered order' USING ERRCODE='22023'; END IF;
  IF v_previous.id IS NOT NULL THEN UPDATE public.supplier_order_outcomes SET status='superseded' WHERE id=v_previous.id; END IF;
  v_version:=COALESCE(v_previous.version,0)+1;
  INSERT INTO public.supplier_order_outcomes(order_id,rfq_case_id,quote_id,supplier_id,version,status,outcome,promised_delivery_date,revised_delivery_date,actual_delivery_date,supplier_responsible,had_defect,had_rework,sample_iterations,evidence_references,note,reviewed_by,supersedes_id)
  VALUES(p_order_id,v_order.rfq_case_id,v_quote.id,v_quote.factory_id,v_version,'published',p_payload->>'outcome',NULLIF(p_payload->>'promised_delivery_date','')::date,NULLIF(p_payload->>'revised_delivery_date','')::date,NULLIF(p_payload->>'actual_delivery_date','')::date,COALESCE((p_payload->>'supplier_responsible')::boolean,false),COALESCE((p_payload->>'had_defect')::boolean,false),COALESCE((p_payload->>'had_rework')::boolean,false),COALESCE((p_payload->>'sample_iterations')::integer,0),COALESCE(p_payload->'evidence_references','[]'::jsonb),NULLIF(btrim(p_payload->>'note'),''),auth.uid(),v_previous.id)
  RETURNING * INTO v_outcome;
  PERFORM public.refresh_supplier_performance(v_quote.factory_id);
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
  VALUES(auth.uid(),'supplier_order_outcomes',v_outcome.id,'publish','Published reviewed supplier outcome',jsonb_build_object('order_id',p_order_id,'supplier_id',v_quote.factory_id,'version',v_version));
  RETURN to_jsonb(v_outcome);
END; $$;

CREATE OR REPLACE FUNCTION public.workspace_list_rfq_quotes(p_case_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',q.id,'status',q.status,'unit_price_cents',q.unit_price_cents,'moq',q.moq,'lead_time_days',q.lead_time_days,
    'certifications',to_jsonb(q.certifications),'certification_note',q.certification_note,'recommended',q.recommended,'selected_at',q.selected_at,
    'factory_id',f.id,'factory_name',f.name,'factory_region',f.region,'factory_years',COALESCE(f.years,CASE WHEN f.founded IS NOT NULL THEN extract(year from current_date)::integer-f.founded END),
    'performance',public.supplier_performance_json(f.id)
  ) ORDER BY q.recommended DESC,q.unit_price_cents ASC),'[]'::jsonb)
  FROM public.rfq_quotes q JOIN public.factories f ON f.id=q.factory_id JOIN public.rfq_supplier_matches m ON m.id=q.match_id AND m.status IN ('approved','selected')
  WHERE q.rfq_case_id=p_case_id AND q.status IN ('published','selected','declined')
    AND EXISTS(SELECT 1 FROM public.rfq_cases c WHERE c.id=p_case_id AND c.buyer_profile_id=auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.supplier_performance_can_access_topic(p_topic text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_topic !~ '^supplier:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:performance$' THEN RETURN false; END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.rfq_quotes q JOIN public.rfq_cases c ON c.id=q.rfq_case_id JOIN public.rfq_supplier_matches m ON m.id=q.match_id AND m.status IN ('approved','selected')
    WHERE q.factory_id=split_part(p_topic,':',2)::uuid AND q.status IN ('published','selected','declined') AND c.buyer_profile_id=auth.uid());
END;
$$;
DROP POLICY IF EXISTS supplier_performance_receive_private_broadcast ON realtime.messages;
CREATE POLICY supplier_performance_receive_private_broadcast ON realtime.messages FOR SELECT TO authenticated USING(
  realtime.messages.extension='broadcast' AND public.supplier_performance_can_access_topic(realtime.topic()));

CREATE OR REPLACE FUNCTION public.supplier_performance_broadcast_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM realtime.send(jsonb_build_object('supplierId',NEW.supplier_id,'snapshotRevision',NEW.revision),'supplier_performance_changed','supplier:'||NEW.supplier_id::text||':performance',true);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS supplier_performance_broadcast_after_update ON public.supplier_performance_snapshots;
CREATE TRIGGER supplier_performance_broadcast_after_update AFTER UPDATE ON public.supplier_performance_snapshots
FOR EACH ROW WHEN (OLD.revision IS DISTINCT FROM NEW.revision) EXECUTE FUNCTION public.supplier_performance_broadcast_change();

CREATE TABLE public.agent_learning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_role text NOT NULL, model text, provider text,
  prompt_version text NOT NULL, policy_version text NOT NULL, retrieval_version text, schema_version text NOT NULL,
  input_hash text NOT NULL, status text NOT NULL CHECK(status IN ('completed','failed','rejected')),
  reviewer_disposition text CHECK(reviewer_disposition IN ('accepted','corrected','rejected')),
  outcome_id uuid REFERENCES public.supplier_order_outcomes(id) ON DELETE SET NULL,
  run_class text NOT NULL DEFAULT 'production' CHECK(run_class IN ('production','learning')),
  label_source text NOT NULL DEFAULT 'none' CHECK(label_source IN ('none','approved_outcome','held_out_fixture')),
  deidentified boolean NOT NULL DEFAULT false,
  shared_evaluation boolean NOT NULL DEFAULT false,
  latency_ms integer CHECK(latency_ms IS NULL OR latency_ms>=0), cost_microusd integer CHECK(cost_microusd IS NULL OR cost_microusd>=0),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metrics)='object'), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(label_source<>'approved_outcome' OR outcome_id IS NOT NULL),
  CHECK(NOT shared_evaluation OR (deidentified AND label_source IN ('approved_outcome','held_out_fixture') AND reviewer_disposition IN ('accepted','corrected')))
);
CREATE TABLE public.agent_learning_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_role text NOT NULL, candidate_version text NOT NULL,
  state text NOT NULL CHECK(state IN ('candidate','canary','production','rolled_back','frozen')),
  held_out_cases integer NOT NULL CHECK(held_out_cases>=20), improvement_points numeric(6,2), protected_failures integer NOT NULL DEFAULT 0 CHECK(protected_failures>=0),
  canary_percent numeric(4,2) NOT NULL DEFAULT 1 CHECK(canary_percent>0 AND canary_percent<=1), canary_execution_cap integer NOT NULL DEFAULT 20 CHECK(canary_execution_cap BETWEEN 1 AND 20),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(state NOT IN ('canary','production') OR (COALESCE(improvement_points,0)>0 AND protected_failures=0 AND approved_by IS NOT NULL))
);
CREATE INDEX agent_learning_runs_outcome_idx ON public.agent_learning_runs(outcome_id) WHERE outcome_id IS NOT NULL;
CREATE INDEX agent_learning_promotions_approver_idx ON public.agent_learning_promotions(approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX agent_learning_promotions_recent_idx ON public.agent_learning_promotions(updated_at DESC);
CREATE TABLE public.agent_learning_monthly_budgets (
  month_start date PRIMARY KEY, cap_microusd integer NOT NULL DEFAULT 10000000 CHECK(cap_microusd=10000000),
  spent_microusd integer NOT NULL DEFAULT 0 CHECK(spent_microusd BETWEEN 0 AND 10000000), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.enforce_agent_learning_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_month date:=date_trunc('month',NEW.created_at)::date; v_next integer;
BEGIN
  IF NEW.run_class<>'learning' OR COALESCE(NEW.cost_microusd,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.agent_learning_monthly_budgets(month_start) VALUES(v_month) ON CONFLICT DO NOTHING;
  UPDATE public.agent_learning_monthly_budgets
  SET spent_microusd=spent_microusd+NEW.cost_microusd,updated_at=now()
  WHERE month_start=v_month AND spent_microusd+NEW.cost_microusd<=cap_microusd
  RETURNING spent_microusd INTO v_next;
  IF v_next IS NULL THEN RAISE EXCEPTION 'Monthly paid learning budget exhausted' USING ERRCODE='54000'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER agent_learning_budget_before_insert BEFORE INSERT ON public.agent_learning_runs
FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_learning_budget();

INSERT INTO public.platform_settings(key,value) VALUES
  ('supplier_learning_frozen','false'),
  ('supplier_learning_methodology_version','1'),
  ('supplier_learning_paid_cap_microusd','10000000')
ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.protect_agent_learning_promotion()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.protected_failures>0 THEN NEW.state:='frozen'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER agent_learning_promotion_protected_boundary BEFORE INSERT OR UPDATE ON public.agent_learning_promotions
FOR EACH ROW EXECUTE FUNCTION public.protect_agent_learning_promotion();

CREATE OR REPLACE FUNCTION public.intools_set_supplier_learning_freeze(p_frozen boolean,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.intools_require_admin();
  IF p_frozen IS NULL OR char_length(btrim(COALESCE(p_note,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A freeze decision and note are required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.platform_settings(key,value) VALUES('supplier_learning_frozen',CASE WHEN p_frozen THEN 'true' ELSE 'false' END)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
  IF p_frozen THEN UPDATE public.agent_learning_promotions SET state='frozen',updated_at=now() WHERE state IN ('canary','production'); END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
  VALUES(auth.uid(),'platform_settings',auth.uid(),'update',CASE WHEN p_frozen THEN 'Froze supplier learning promotions' ELSE 'Lifted supplier learning freeze' END,jsonb_build_object('note',btrim(p_note)));
  RETURN jsonb_build_object('learning_frozen',p_frozen);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_set_agent_learning_promotion_state(p_promotion_id uuid,p_state text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_promotion public.agent_learning_promotions; v_frozen boolean;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_state NOT IN ('canary','production','rolled_back','frozen') OR char_length(btrim(COALESCE(p_note,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A valid promotion state and note are required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_promotion FROM public.agent_learning_promotions WHERE id=p_promotion_id FOR UPDATE;
  IF v_promotion.id IS NULL THEN RAISE EXCEPTION 'Promotion record not found' USING ERRCODE='P0002'; END IF;
  IF NOT (p_state IN ('rolled_back','frozen') OR (v_promotion.state='candidate' AND p_state='canary') OR (v_promotion.state='canary' AND p_state='production')) THEN RAISE EXCEPTION 'Unsupported promotion transition' USING ERRCODE='55000'; END IF;
  SELECT COALESCE(value='true',false) INTO v_frozen FROM public.platform_settings WHERE key='supplier_learning_frozen';
  IF p_state IN ('canary','production') AND (v_frozen OR v_promotion.held_out_cases<20 OR COALESCE(v_promotion.improvement_points,0)<=0 OR v_promotion.protected_failures>0) THEN RAISE EXCEPTION 'Promotion gates are not satisfied' USING ERRCODE='55000'; END IF;
  UPDATE public.agent_learning_promotions SET state=p_state,approved_by=auth.uid(),updated_at=now() WHERE id=p_promotion_id RETURNING * INTO v_promotion;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
  VALUES(auth.uid(),'agent_learning_promotions',p_promotion_id,'update','Updated learning promotion state',jsonb_build_object('state',p_state,'note',btrim(p_note)));
  RETURN to_jsonb(v_promotion);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_get_supplier_intelligence_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT jsonb_build_object(
    'suppliers',count(*),'defaults_complete',count(*) FILTER(WHERE f.default_moq_units IS NOT NULL AND f.default_lead_time_days IS NOT NULL),
    'delivery_observed',count(*) FILTER(WHERE s.delivery_basis='observed'),'response_observed',count(*) FILTER(WHERE s.response_basis='observed'),
    'outcomes_pending',(SELECT count(*) FROM public.orders o JOIN public.order_fulfillments ofl ON ofl.order_id=o.id WHERE ofl.production_stage='delivered' AND NOT EXISTS(SELECT 1 FROM public.supplier_order_outcomes so WHERE so.order_id=o.id AND so.status='published')),
    'methodology_version',COALESCE((SELECT value::integer FROM public.platform_settings WHERE key='supplier_learning_methodology_version'),1),
    'paid_learning_cap_microusd',10000000,
    'paid_learning_spent_microusd',COALESCE((SELECT spent_microusd FROM public.agent_learning_monthly_budgets WHERE month_start=date_trunc('month',now())::date),0),
    'learning_frozen',COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='supplier_learning_frozen'),false),
    'performance_trend',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',t.snapshot_day,'delivery_rate',t.delivery_rate,'response_rate',t.response_rate) ORDER BY t.snapshot_day) FROM (
      SELECT snapshot_day,round(avg(delivery_rate) FILTER(WHERE delivery_basis='observed'),1) delivery_rate,round(avg(response_rate) FILTER(WHERE response_basis='observed'),1) response_rate
      FROM (SELECT DISTINCT ON (supplier_id,snapshot_updated_at::date) supplier_id,snapshot_updated_at::date AS snapshot_day,delivery_rate,delivery_basis,response_rate,response_basis
        FROM public.supplier_performance_snapshot_versions WHERE snapshot_updated_at>=current_date-89 ORDER BY supplier_id,snapshot_updated_at::date,revision DESC) latest
      GROUP BY snapshot_day HAVING count(*) FILTER(WHERE delivery_basis='observed' OR response_basis='observed')>0 ORDER BY snapshot_day
    ) t),'[]'::jsonb),
    'promotions',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC) FROM (SELECT * FROM public.agent_learning_promotions ORDER BY updated_at DESC LIMIT 50) p),'[]'::jsonb)
  ) INTO v_result FROM public.factories f JOIN public.supplier_performance_snapshots s ON s.supplier_id=f.id;
  RETURN v_result;
END; $$;

ALTER TABLE public.supplier_order_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_performance_snapshot_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_order_commercial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_invoice_commercial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_learning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_learning_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_learning_monthly_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_order_outcomes,public.supplier_performance_snapshots,public.supplier_performance_snapshot_versions,public.rfq_order_commercial_snapshots,public.rfq_invoice_commercial_snapshots,
  public.agent_learning_runs,public.agent_learning_promotions,public.agent_learning_monthly_budgets FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.refresh_supplier_performance(uuid),public.supplier_performance_json(uuid),public.supplier_performance_can_access_topic(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.supplier_performance_seed(),public.supplier_performance_refresh_from_outreach(),public.supplier_performance_broadcast_change(),
  public.capture_supplier_performance_snapshot_version(),
  public.capture_rfq_order_commercial_snapshot(),public.capture_rfq_invoice_commercial_snapshot(),public.reject_commercial_snapshot_mutation(),
  public.enforce_agent_learning_budget(),public.protect_agent_learning_promotion() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.intools_set_supplier_intelligence_defaults(uuid,integer,integer),public.intools_get_supplier_intelligence(uuid),public.intools_close_rfq_response_opportunity(uuid,text,text),public.intools_set_supplier_learning_freeze(boolean,text),public.intools_set_agent_learning_promotion_state(uuid,text,text),
  public.intools_get_supplier_intelligence_for_case(uuid),public.intools_get_supplier_order_outcome(uuid),public.intools_publish_supplier_order_outcome(uuid,jsonb,integer),
  public.intools_get_supplier_intelligence_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.intools_set_supplier_intelligence_defaults(uuid,integer,integer),public.intools_get_supplier_intelligence(uuid),public.intools_close_rfq_response_opportunity(uuid,text,text),public.intools_set_supplier_learning_freeze(boolean,text),public.intools_set_agent_learning_promotion_state(uuid,text,text),
  public.intools_get_supplier_intelligence_for_case(uuid),public.intools_get_supplier_order_outcome(uuid),public.intools_publish_supplier_order_outcome(uuid,jsonb,integer),
  public.intools_get_supplier_intelligence_overview() TO authenticated;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_target_table_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_target_table_check CHECK(target_table IN (
  'factories','products','content_pages','widget_instances','intools_media_assets','country_shipping_rates','rfq_cases','platform_settings',
  'rfq_outreach_template_versions','rfq_supplier_outreach_drafts','rfq_supplier_outreach_events','rfq_quotes','rfq_qc_inspections',
  'rfq_production_updates','rfq_qc_checklist_versions','rfq_qc_reviews','supplier_order_outcomes','supplier_performance_snapshots','agent_learning_promotions'));

COMMENT ON TABLE public.supplier_performance_snapshots IS 'Buyer-safe supplier metrics. Baseline values are presentation defaults and must never be used as evidence or learning labels.';
