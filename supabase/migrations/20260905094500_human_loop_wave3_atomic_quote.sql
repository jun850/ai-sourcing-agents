-- AI-native human-loop Wave 3: one reviewed, atomic quote publication path.

ALTER TABLE public.rfq_quotes
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
  ADD COLUMN IF NOT EXISTS supplier_response_event_id uuid REFERENCES public.rfq_supplier_outreach_events(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS commercial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(commercial_snapshot)='object'),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.rfq_lifecycle_events DROP CONSTRAINT IF EXISTS rfq_lifecycle_events_event_type_check;
ALTER TABLE public.rfq_lifecycle_events ADD CONSTRAINT rfq_lifecycle_events_event_type_check CHECK (event_type IN (
  'proposal_selected','invoice_created','invoice_sent','invoice_paid','sample_ready','sample_approved','sample_declined',
  'outreach_contacted','supplier_response_recorded','quote_published','bulk_started','stage_changed','cancelled'
));

CREATE OR REPLACE FUNCTION public.intools_publish_rfq_quote_reviewed(
  p_quote_id uuid,p_payload jsonb,p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_case public.rfq_cases;
  v_match public.rfq_supplier_matches;
  v_factory public.factories;
  v_quote public.rfq_quotes;
  v_case_id uuid;
  v_factory_id uuid;
  v_response_event uuid;
  v_visible_count integer;
  v_unit integer;
  v_total integer;
  v_moq integer;
  v_lead integer;
  v_certs text[];
BEGIN
  PERFORM public.intools_require_admin();
  IF NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='atomic_quote_publication_enabled'),false) THEN
    RAISE EXCEPTION 'Atomic quote publication is not enabled' USING ERRCODE='55000';
  END IF;
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Quote payload must be an object' USING ERRCODE='22023'; END IF;
  BEGIN
    v_case_id:=(p_payload->>'rfq_case_id')::uuid;
    v_factory_id:=(p_payload->>'factory_id')::uuid;
    v_unit:=(p_payload->>'unit_price_cents')::integer;
    v_total:=(p_payload->>'quote_total_cents')::integer;
    v_moq:=(p_payload->>'moq')::integer;
    v_lead:=(p_payload->>'lead_time_days')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Quote contains invalid numeric or identifier fields' USING ERRCODE='22023';
  END;
  IF v_case_id IS NULL OR v_factory_id IS NULL OR v_unit<=0 OR v_total<=0 OR v_moq<=0 OR v_lead<=0 OR COALESCE(lower(p_payload->>'currency'),'usd')<>'usd' THEN
    RAISE EXCEPTION 'Quote requires positive USD terms, MOQ, lead time, and total' USING ERRCODE='22023';
  END IF;
  IF char_length(COALESCE(p_payload->>'certification_note',''))>300 OR char_length(COALESCE(p_payload->>'notes',''))>2000 THEN RAISE EXCEPTION 'Quote note is too long' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=v_case_id FOR UPDATE;
  IF v_case.id IS NULL OR v_case.status NOT IN ('awaiting_supplier','supplier_replied','buyer_review') THEN RAISE EXCEPTION 'RFQ is not eligible for quote publication' USING ERRCODE='55000'; END IF;
  SELECT m.* INTO v_match FROM public.rfq_supplier_matches m WHERE m.rfq_case_id=v_case_id AND m.factory_id=v_factory_id AND m.status='approved' FOR UPDATE;
  SELECT * INTO v_factory FROM public.factories WHERE id=v_factory_id;
  IF v_match.id IS NULL OR v_factory.id IS NULL OR v_factory.verify_state<>'verified' OR v_factory.broker_status<>'approved' OR v_factory.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Supplier is not currently eligible' USING ERRCODE='42501'; END IF;
  SELECT e.id INTO v_response_event FROM public.rfq_supplier_outreach_events e
  WHERE e.rfq_case_id=v_case_id AND e.match_id=v_match.id AND e.event_type='supplier_response'
  ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
  IF v_response_event IS NULL THEN RAISE EXCEPTION 'Record supplier-confirmed evidence before publishing a quote' USING ERRCODE='55000'; END IF;
  SELECT COALESCE(array_agg(value),'{}'::text[]) INTO v_certs FROM jsonb_array_elements_text(COALESCE(p_payload->'certifications','[]'::jsonb));
  IF p_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.rfq_quotes WHERE id=p_quote_id AND rfq_case_id=v_case_id AND factory_id=v_factory_id FOR UPDATE;
  ELSE
    SELECT * INTO v_quote FROM public.rfq_quotes WHERE rfq_case_id=v_case_id AND factory_id=v_factory_id FOR UPDATE;
  END IF;
  IF v_quote.id IS NOT NULL AND (v_quote.status<>'draft' OR v_quote.revision<>COALESCE(p_expected_revision,0)) THEN RAISE EXCEPTION 'Quote changed or is no longer editable' USING ERRCODE='40001'; END IF;
  SELECT count(*) INTO v_visible_count FROM public.rfq_quotes WHERE rfq_case_id=v_case_id AND status IN ('published','selected') AND (v_quote.id IS NULL OR id<>v_quote.id);
  IF v_visible_count>=3 THEN RAISE EXCEPTION 'This RFQ already has 3 visible quotes' USING ERRCODE='23514'; END IF;
  IF v_quote.id IS NULL THEN
    IF COALESCE(p_expected_revision,0)<>0 THEN RAISE EXCEPTION 'Quote changed; reload before publishing' USING ERRCODE='40001'; END IF;
    INSERT INTO public.rfq_quotes(rfq_case_id,match_id,factory_id,status,unit_price_cents,currency,moq,lead_time_days,certifications,certification_note,recommended,notes,quote_total_cents,revision,supplier_response_event_id,commercial_snapshot,created_by,reviewed_by,reviewed_at)
    VALUES(v_case_id,v_match.id,v_factory_id,'draft',v_unit,'usd',v_moq,v_lead,v_certs,NULLIF(btrim(p_payload->>'certification_note'),''),COALESCE((p_payload->>'recommended')::boolean,false),NULLIF(btrim(p_payload->>'notes'),''),v_total,0,v_response_event,jsonb_build_object('unit_price_cents',v_unit,'quote_total_cents',v_total,'currency','usd','moq',v_moq,'lead_time_days',v_lead,'certifications',to_jsonb(v_certs),'supplier_response_event_id',v_response_event),auth.uid(),auth.uid(),now()) RETURNING * INTO v_quote;
  ELSE
    UPDATE public.rfq_quotes SET unit_price_cents=v_unit,currency='usd',moq=v_moq,lead_time_days=v_lead,
      certifications=v_certs,certification_note=NULLIF(btrim(p_payload->>'certification_note'),''),
      recommended=COALESCE((p_payload->>'recommended')::boolean,false),notes=NULLIF(btrim(p_payload->>'notes'),''),
      quote_total_cents=v_total,supplier_response_event_id=v_response_event,
      commercial_snapshot=jsonb_build_object('unit_price_cents',v_unit,'quote_total_cents',v_total,'currency','usd','moq',v_moq,'lead_time_days',v_lead,'certifications',to_jsonb(v_certs),'supplier_response_event_id',v_response_event),
      reviewed_by=auth.uid(),reviewed_at=now()
    WHERE id=v_quote.id RETURNING * INTO v_quote;
  END IF;
  UPDATE public.rfq_quotes SET status='published',revision=revision+1 WHERE id=v_quote.id RETURNING * INTO v_quote;
  UPDATE public.rfq_cases SET status='buyer_review',updated_at=now() WHERE id=v_case_id;
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,actor_profile_id,metadata)
  VALUES(v_case_id,'quote_published',auth.uid(),jsonb_build_object('quote_id',v_quote.id,'supplier_response_event_id',v_response_event));
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
  VALUES(auth.uid(),'rfq_quotes',v_quote.id,'publish','Published reviewed supplier quote',jsonb_build_object('rfq_case_id',v_case_id,'supplier_response_event_id',v_response_event));
  RETURN to_jsonb(v_quote);
END; $$;

-- The old multi-request publish endpoint cannot bypass the evidence and atomicity gate.
CREATE OR REPLACE FUNCTION public.intools_publish_rfq_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.intools_require_admin();
  RAISE EXCEPTION 'Use reviewed atomic quote publication' USING ERRCODE='55000';
END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_rfq_quotes(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',q.id,'status',q.status,'unit_price_cents',q.unit_price_cents,'quote_total_cents',q.quote_total_cents,
    'moq',q.moq,'lead_time_days',q.lead_time_days,'certifications',to_jsonb(q.certifications),
    'certification_note',q.certification_note,'recommended',q.recommended,'notes',q.notes,
    'selected_at',q.selected_at,'factory_id',f.id,'factory_name',f.name,'factory_region',f.region,
    'revision',q.revision,'supplier_response_event_id',q.supplier_response_event_id,
    'reviewed_by',q.reviewed_by,'reviewed_at',q.reviewed_at
  ) ORDER BY q.updated_at DESC),'[]'::jsonb) INTO v_result
  FROM public.rfq_quotes q JOIN public.factories f ON f.id=q.factory_id WHERE q.rfq_case_id=p_case_id;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.intools_publish_rfq_quote_reviewed(uuid,jsonb,integer), public.intools_list_rfq_quotes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_publish_rfq_quote_reviewed(uuid,jsonb,integer), public.intools_list_rfq_quotes(uuid) TO authenticated;
