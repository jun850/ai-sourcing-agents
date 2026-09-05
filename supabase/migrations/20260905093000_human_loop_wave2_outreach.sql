-- AI-native human-loop Wave 2: private, versioned supplier outreach.

INSERT INTO public.platform_settings(key,value) VALUES
  ('outreach_templates_enabled','false'),
  ('atomic_quote_publication_enabled','false'),
  ('production_updates_enabled','false'),
  ('qc_evidence_upload_enabled','false'),
  ('qc_ai_shadow_enabled','false'),
  ('qc_buyer_visibility_enabled','false'),
  ('rfq_activity_realtime_enabled','false')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.rfq_outreach_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale text NOT NULL DEFAULT 'en' CHECK (locale='en'),
  version integer NOT NULL CHECK (version>0),
  subject_template text NOT NULL CHECK (char_length(subject_template) BETWEEN 1 AND 240),
  body_template text NOT NULL CHECK (char_length(body_template) BETWEEN 1 AND 12000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  activated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE(locale,version)
);
CREATE UNIQUE INDEX rfq_outreach_template_one_active_idx ON public.rfq_outreach_template_versions(locale) WHERE status='active';

CREATE TABLE public.rfq_supplier_outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.rfq_supplier_matches(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES public.rfq_outreach_template_versions(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 240),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 12000),
  resolved_fields jsonb NOT NULL CHECK (jsonb_typeof(resolved_fields)='object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','copied','contacted','superseded')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rfq_supplier_outreach_current_idx ON public.rfq_supplier_outreach_drafts(rfq_case_id,match_id) WHERE status<>'superseded';
CREATE INDEX rfq_supplier_outreach_case_idx ON public.rfq_supplier_outreach_drafts(rfq_case_id,updated_at DESC);

CREATE TABLE public.rfq_supplier_outreach_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.rfq_supplier_outreach_drafts(id) ON DELETE CASCADE,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.rfq_supplier_matches(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('created','edited','reset','copied_subject','copied_body','copied_all','contacted','supplier_response','superseded')),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note)<=2000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rfq_supplier_outreach_events_draft_idx ON public.rfq_supplier_outreach_events(draft_id,created_at,id);

CREATE TABLE public.rfq_outreach_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.rfq_supplier_outreach_drafts(id) ON DELETE CASCADE,
  template_version_id uuid NOT NULL REFERENCES public.rfq_outreach_template_versions(id) ON DELETE RESTRICT,
  provider text,
  model text,
  preset text,
  prompt_hash text,
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens>=0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens>=0),
  cost numeric CHECK (cost IS NULL OR cost>=0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms>=0),
  status text NOT NULL CHECK (status IN ('ready','failed')),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason)<=1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rfq_outreach_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_supplier_outreach_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_supplier_outreach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_outreach_generation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfq_outreach_template_versions, public.rfq_supplier_outreach_drafts,
  public.rfq_supplier_outreach_events, public.rfq_outreach_generation_runs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.rfq_outreach_unknown_placeholders(p_text text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token),'{}'::text[])
  FROM (
    SELECT (regexp_matches(COALESCE(p_text,''),'\[\.[A-Za-z0-9_]+\]','g'))[1] token
  ) found
  WHERE token<>ALL(ARRAY['[.case_no]','[.product]','[.quantity]','[.material]','[.certifications]','[.colors]','[.sizes]','[.budget]','[.timeline]','[.supplier_name]']);
$$;

CREATE OR REPLACE FUNCTION public.rfq_outreach_field(p_brief jsonb,p_key text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_value jsonb;
BEGIN
  v_value:=COALESCE(p_brief->'fields'->p_key,p_brief->p_key);
  IF v_value IS NULL OR v_value='null'::jsonb THEN RETURN 'Not provided by buyer'; END IF;
  IF jsonb_typeof(v_value)='string' THEN RETURN COALESCE(NULLIF(btrim(v_value#>>'{}'),'') ,'Not provided by buyer'); END IF;
  RETURN COALESCE(NULLIF(btrim(v_value::text),''),'Not provided by buyer');
END; $$;

CREATE OR REPLACE FUNCTION public.rfq_render_outreach_template(
  p_template text,p_case_no text,p_brief jsonb,p_supplier_name text
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_text text:=p_template;
BEGIN
  v_text:=replace(v_text,'[.case_no]',COALESCE(NULLIF(btrim(p_case_no),''),'Not provided by buyer'));
  v_text:=replace(v_text,'[.product]',public.rfq_outreach_field(p_brief,'product'));
  v_text:=replace(v_text,'[.quantity]',public.rfq_outreach_field(p_brief,'quantity'));
  v_text:=replace(v_text,'[.material]',public.rfq_outreach_field(p_brief,'material'));
  v_text:=replace(v_text,'[.certifications]',public.rfq_outreach_field(p_brief,'certifications'));
  v_text:=replace(v_text,'[.colors]',public.rfq_outreach_field(p_brief,'colors'));
  v_text:=replace(v_text,'[.sizes]',public.rfq_outreach_field(p_brief,'sizes'));
  v_text:=replace(v_text,'[.budget]',public.rfq_outreach_field(p_brief,'budget'));
  v_text:=replace(v_text,'[.timeline]',public.rfq_outreach_field(p_brief,'timeline'));
  v_text:=replace(v_text,'[.supplier_name]',COALESCE(NULLIF(btrim(p_supplier_name),''),'Not provided by supplier record'));
  RETURN v_text;
END; $$;

CREATE OR REPLACE FUNCTION public.rfq_outreach_match_is_eligible(p_case_id uuid,p_match_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.rfq_supplier_matches m
    JOIN public.rfq_cases c ON c.id=m.rfq_case_id
    JOIN public.factories f ON f.id=m.factory_id
    WHERE m.id=p_match_id AND m.rfq_case_id=p_case_id AND m.status='approved'
      AND c.status<>'draft' AND c.submitted_at IS NOT NULL
      AND f.verify_state='verified' AND f.broker_status='approved' AND f.archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.rfq_outreach_draft_json(p_draft_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id',d.id,'rfq_case_id',d.rfq_case_id,'match_id',d.match_id,
    'template_version_id',d.template_version_id,'template_version',t.version,
    'subject',d.subject,'body',d.body,'resolved_fields',d.resolved_fields,
    'status',d.status,'revision',d.revision,'created_at',d.created_at,'updated_at',d.updated_at,
    'last_editor',COALESCE(NULLIF(btrim(p.full_name),''),'Administrator'),
    'case_no',c.case_no,'supplier_name',f.name,
    'events',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',e.id,'event_type',e.event_type,'note',e.note,'metadata',e.metadata,'created_at',e.created_at
    ) ORDER BY e.created_at,e.id) FROM public.rfq_supplier_outreach_events e WHERE e.draft_id=d.id),'[]'::jsonb)
  ) FROM public.rfq_supplier_outreach_drafts d
  JOIN public.rfq_outreach_template_versions t ON t.id=d.template_version_id
  JOIN public.rfq_cases c ON c.id=d.rfq_case_id
  JOIN public.rfq_supplier_matches m ON m.id=d.match_id
  JOIN public.factories f ON f.id=m.factory_id
  LEFT JOIN public.profiles p ON p.id=d.updated_by
  WHERE d.id=p_draft_id;
$$;

INSERT INTO public.rfq_outreach_template_versions(locale,version,subject_template,body_template,status,activated_at)
VALUES('en',1,'RFQ [.case_no] — [.product]',E'Hello [.supplier_name],\n\nAtelix is reviewing production partners for the following sourcing request.\n\nProduct: [.product]\nQuantity: [.quantity]\nMaterial: [.material]\nColors: [.colors]\nSizes: [.sizes]\nCertifications requested: [.certifications]\nBuyer-stated budget: [.budget]\nRequired timeline: [.timeline]\n\nPlease confirm whether this request fits your capabilities and provide your current MOQ, unit price, lead time, sample terms, production availability, certification evidence, and quote validity.\n\nRegards,\nAtelix Operations','active',now())
ON CONFLICT(locale,version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.intools_get_rfq_outreach_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT jsonb_build_object(
    'capability_enabled',COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='outreach_templates_enabled'),false),
    'active_template',(SELECT to_jsonb(t) FROM public.rfq_outreach_template_versions t WHERE t.locale='en' AND t.status='active'),
    'versions',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.version DESC) FROM public.rfq_outreach_template_versions t WHERE t.locale='en'),'[]'::jsonb),
    'placeholders',to_jsonb(ARRAY['[.case_no]','[.product]','[.quantity]','[.material]','[.certifications]','[.colors]','[.sizes]','[.budget]','[.timeline]','[.supplier_name]']),
    'instruction','Use placeholders such as `[.product]` and `[.budget]`. Values are inserted from the submitted RFQ and approved supplier record. Missing RFQ values appear as `Not provided by buyer`.',
    'example',jsonb_build_object(
      'subject',public.rfq_render_outreach_template((SELECT subject_template FROM public.rfq_outreach_template_versions WHERE locale='en' AND status='active'),'ATL-RFQ-SAMPLE',jsonb_build_object('fields',jsonb_build_object('product','Non-production sample product','budget','Non-production sample budget')),'Non-production sample supplier'),
      'body',public.rfq_render_outreach_template((SELECT body_template FROM public.rfq_outreach_template_versions WHERE locale='en' AND status='active'),'ATL-RFQ-SAMPLE',jsonb_build_object('fields',jsonb_build_object('product','Non-production sample product','budget','Non-production sample budget')),'Non-production sample supplier')
    )
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_save_rfq_outreach_template(p_subject text,p_body text,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_latest integer; v_unknown text[]; v_template public.rfq_outreach_template_versions;
BEGIN
  PERFORM public.intools_require_admin();
  IF char_length(btrim(COALESCE(p_subject,''))) NOT BETWEEN 1 AND 240 OR char_length(btrim(COALESCE(p_body,''))) NOT BETWEEN 1 AND 12000 THEN
    RAISE EXCEPTION 'Template subject or body length is invalid' USING ERRCODE='22023';
  END IF;
  v_unknown:=public.rfq_outreach_unknown_placeholders(p_subject||E'\n'||p_body);
  IF cardinality(v_unknown)>0 THEN RAISE EXCEPTION 'Unknown placeholders: %',array_to_string(v_unknown,', ') USING ERRCODE='22023'; END IF;
  LOCK TABLE public.rfq_outreach_template_versions IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(version),0) INTO v_latest FROM public.rfq_outreach_template_versions WHERE locale='en';
  IF COALESCE(p_expected_version,0)<>v_latest THEN RAISE EXCEPTION 'Template changed; reload before saving' USING ERRCODE='40001'; END IF;
  INSERT INTO public.rfq_outreach_template_versions(locale,version,subject_template,body_template,status,created_by)
  VALUES('en',v_latest+1,btrim(p_subject),btrim(p_body),'draft',auth.uid()) RETURNING * INTO v_template;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
  VALUES(auth.uid(),'rfq_outreach_template_versions',v_template.id,'create','Created supplier outreach template version '||v_template.version);
  RETURN to_jsonb(v_template);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_activate_rfq_outreach_template(p_template_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_source public.rfq_outreach_template_versions; v_target public.rfq_outreach_template_versions; v_next integer; v_unknown text[];
BEGIN
  PERFORM public.intools_require_admin();
  LOCK TABLE public.rfq_outreach_template_versions IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_source FROM public.rfq_outreach_template_versions WHERE id=p_template_version_id AND locale='en' FOR UPDATE;
  IF v_source.id IS NULL THEN RAISE EXCEPTION 'Template version not found' USING ERRCODE='P0002'; END IF;
  v_unknown:=public.rfq_outreach_unknown_placeholders(v_source.subject_template||E'\n'||v_source.body_template);
  IF cardinality(v_unknown)>0 THEN RAISE EXCEPTION 'Unknown placeholders: %',array_to_string(v_unknown,', ') USING ERRCODE='22023'; END IF;
  UPDATE public.rfq_outreach_template_versions SET status='retired' WHERE locale='en' AND status='active';
  IF v_source.status='draft' THEN
    UPDATE public.rfq_outreach_template_versions SET status='active',activated_by=auth.uid(),activated_at=now() WHERE id=v_source.id RETURNING * INTO v_target;
  ELSE
    SELECT COALESCE(max(version),0)+1 INTO v_next FROM public.rfq_outreach_template_versions WHERE locale='en';
    INSERT INTO public.rfq_outreach_template_versions(locale,version,subject_template,body_template,status,created_by,activated_by,activated_at)
    VALUES('en',v_next,v_source.subject_template,v_source.body_template,'active',auth.uid(),auth.uid(),now()) RETURNING * INTO v_target;
  END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
  VALUES(auth.uid(),'rfq_outreach_template_versions',v_target.id,'publish','Activated supplier outreach template version '||v_target.version);
  RETURN to_jsonb(v_target);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_prepare_rfq_outreach_draft(p_case_id uuid,p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_match public.rfq_supplier_matches; v_factory public.factories; v_template public.rfq_outreach_template_versions; v_draft public.rfq_supplier_outreach_drafts; v_fields jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  IF NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='outreach_templates_enabled'),false) THEN RAISE EXCEPTION 'Supplier outreach templates are not enabled' USING ERRCODE='55000'; END IF;
  IF NOT public.rfq_outreach_match_is_eligible(p_case_id,p_match_id) THEN RAISE EXCEPTION 'Supplier match is not currently eligible for outreach' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_draft FROM public.rfq_supplier_outreach_drafts WHERE rfq_case_id=p_case_id AND match_id=p_match_id AND status<>'superseded';
  IF v_draft.id IS NOT NULL THEN RETURN public.rfq_outreach_draft_json(v_draft.id); END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id;
  SELECT * INTO v_match FROM public.rfq_supplier_matches WHERE id=p_match_id;
  SELECT * INTO v_factory FROM public.factories WHERE id=v_match.factory_id;
  SELECT * INTO v_template FROM public.rfq_outreach_template_versions WHERE locale='en' AND status='active';
  IF v_template.id IS NULL THEN RAISE EXCEPTION 'No active outreach template' USING ERRCODE='55000'; END IF;
  v_fields:=jsonb_build_object('case_no',v_case.case_no,'product',public.rfq_outreach_field(v_case.brief,'product'),'quantity',public.rfq_outreach_field(v_case.brief,'quantity'),'material',public.rfq_outreach_field(v_case.brief,'material'),'certifications',public.rfq_outreach_field(v_case.brief,'certifications'),'colors',public.rfq_outreach_field(v_case.brief,'colors'),'sizes',public.rfq_outreach_field(v_case.brief,'sizes'),'budget',public.rfq_outreach_field(v_case.brief,'budget'),'timeline',public.rfq_outreach_field(v_case.brief,'timeline'),'supplier_name',v_factory.name);
  INSERT INTO public.rfq_supplier_outreach_drafts(rfq_case_id,match_id,template_version_id,subject,body,resolved_fields,created_by,updated_by)
  VALUES(p_case_id,p_match_id,v_template.id,public.rfq_render_outreach_template(v_template.subject_template,v_case.case_no,v_case.brief,v_factory.name),public.rfq_render_outreach_template(v_template.body_template,v_case.case_no,v_case.brief,v_factory.name),v_fields,auth.uid(),auth.uid()) RETURNING * INTO v_draft;
  INSERT INTO public.rfq_supplier_outreach_events(draft_id,rfq_case_id,match_id,event_type,actor_profile_id) VALUES(v_draft.id,p_case_id,p_match_id,'created',auth.uid());
  RETURN public.rfq_outreach_draft_json(v_draft.id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_update_rfq_outreach_draft(p_draft_id uuid,p_subject text,p_body text,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_draft public.rfq_supplier_outreach_drafts;
BEGIN
  PERFORM public.intools_require_admin();
  IF char_length(btrim(COALESCE(p_subject,''))) NOT BETWEEN 1 AND 240 OR char_length(btrim(COALESCE(p_body,''))) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Draft subject or body length is invalid' USING ERRCODE='22023'; END IF;
  UPDATE public.rfq_supplier_outreach_drafts SET subject=btrim(p_subject),body=btrim(p_body),revision=revision+1,updated_by=auth.uid(),updated_at=now()
  WHERE id=p_draft_id AND revision=p_expected_revision AND status IN ('draft','copied') RETURNING * INTO v_draft;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'Draft changed or is no longer editable' USING ERRCODE='40001'; END IF;
  INSERT INTO public.rfq_supplier_outreach_events(draft_id,rfq_case_id,match_id,event_type,actor_profile_id) VALUES(v_draft.id,v_draft.rfq_case_id,v_draft.match_id,'edited',auth.uid());
  RETURN public.rfq_outreach_draft_json(v_draft.id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_reset_rfq_outreach_draft(p_draft_id uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_draft public.rfq_supplier_outreach_drafts; v_case public.rfq_cases; v_factory public.factories; v_template public.rfq_outreach_template_versions;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_draft FROM public.rfq_supplier_outreach_drafts WHERE id=p_draft_id AND revision=p_expected_revision AND status IN ('draft','copied') FOR UPDATE;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'Draft changed or is no longer editable' USING ERRCODE='40001'; END IF;
  IF NOT public.rfq_outreach_match_is_eligible(v_draft.rfq_case_id,v_draft.match_id) THEN RAISE EXCEPTION 'Supplier match is not currently eligible for outreach' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=v_draft.rfq_case_id;
  SELECT f.* INTO v_factory FROM public.rfq_supplier_matches m JOIN public.factories f ON f.id=m.factory_id WHERE m.id=v_draft.match_id;
  SELECT * INTO v_template FROM public.rfq_outreach_template_versions WHERE locale='en' AND status='active';
  IF v_template.id IS NULL THEN RAISE EXCEPTION 'No active outreach template' USING ERRCODE='55000'; END IF;
  UPDATE public.rfq_supplier_outreach_drafts SET template_version_id=v_template.id,
    subject=public.rfq_render_outreach_template(v_template.subject_template,v_case.case_no,v_case.brief,v_factory.name),
    body=public.rfq_render_outreach_template(v_template.body_template,v_case.case_no,v_case.brief,v_factory.name),
    status='draft',revision=revision+1,updated_by=auth.uid(),updated_at=now()
  WHERE id=v_draft.id RETURNING * INTO v_draft;
  INSERT INTO public.rfq_supplier_outreach_events(draft_id,rfq_case_id,match_id,event_type,actor_profile_id,metadata) VALUES(v_draft.id,v_draft.rfq_case_id,v_draft.match_id,'reset',auth.uid(),jsonb_build_object('template_version_id',v_template.id));
  RETURN public.rfq_outreach_draft_json(v_draft.id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_record_rfq_outreach_copy(p_draft_id uuid,p_part text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_draft public.rfq_supplier_outreach_drafts;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_part NOT IN ('subject','body','all') THEN RAISE EXCEPTION 'Invalid copy part' USING ERRCODE='22023'; END IF;
  UPDATE public.rfq_supplier_outreach_drafts SET status=CASE WHEN status='contacted' THEN status ELSE 'copied' END,updated_by=auth.uid(),updated_at=now() WHERE id=p_draft_id AND status<>'superseded' RETURNING * INTO v_draft;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'Draft not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.rfq_supplier_outreach_events(draft_id,rfq_case_id,match_id,event_type,actor_profile_id) VALUES(v_draft.id,v_draft.rfq_case_id,v_draft.match_id,('copied_'||p_part),auth.uid());
  RETURN public.rfq_outreach_draft_json(v_draft.id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_mark_rfq_supplier_contacted(p_draft_id uuid,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_draft public.rfq_supplier_outreach_drafts;
BEGIN
  PERFORM public.intools_require_admin();
  IF char_length(btrim(COALESCE(p_note,'')))>2000 THEN RAISE EXCEPTION 'Contact note is too long' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_draft FROM public.rfq_supplier_outreach_drafts WHERE id=p_draft_id AND status IN ('draft','copied') FOR UPDATE;
  IF v_draft.id IS NULL OR NOT public.rfq_outreach_match_is_eligible(v_draft.rfq_case_id,v_draft.match_id) THEN RAISE EXCEPTION 'Draft is not eligible to mark contacted' USING ERRCODE='42501'; END IF;
  UPDATE public.rfq_supplier_outreach_drafts SET status='contacted',revision=revision+1,updated_by=auth.uid(),updated_at=now() WHERE id=v_draft.id RETURNING * INTO v_draft;
  INSERT INTO public.rfq_supplier_outreach_events(draft_id,rfq_case_id,match_id,event_type,actor_profile_id,note) VALUES(v_draft.id,v_draft.rfq_case_id,v_draft.match_id,'contacted',auth.uid(),NULLIF(btrim(p_note),''));
  UPDATE public.rfq_cases SET status='awaiting_supplier',updated_at=now() WHERE id=v_draft.rfq_case_id AND status IN ('needs_research','reviewed');
  RETURN public.rfq_outreach_draft_json(v_draft.id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_record_rfq_supplier_response(p_draft_id uuid,p_note text,p_evidence_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_draft public.rfq_supplier_outreach_drafts; v_event uuid;
BEGIN
  PERFORM public.intools_require_admin();
  IF char_length(btrim(COALESCE(p_note,'')))>2000 OR char_length(btrim(COALESCE(p_evidence_reference,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Supplier response requires a valid evidence reference' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_draft FROM public.rfq_supplier_outreach_drafts WHERE id=p_draft_id AND status='contacted' FOR UPDATE;
  IF v_draft.id IS NULL OR NOT public.rfq_outreach_match_is_eligible(v_draft.rfq_case_id,v_draft.match_id) THEN RAISE EXCEPTION 'Supplier outreach is not eligible for a response' USING ERRCODE='42501'; END IF;
  INSERT INTO public.rfq_supplier_outreach_events(draft_id,rfq_case_id,match_id,event_type,actor_profile_id,note,metadata)
  VALUES(v_draft.id,v_draft.rfq_case_id,v_draft.match_id,'supplier_response',auth.uid(),NULLIF(btrim(p_note),''),jsonb_build_object('evidence_reference',btrim(p_evidence_reference))) RETURNING id INTO v_event;
  UPDATE public.rfq_cases SET status='supplier_replied',updated_at=now() WHERE id=v_draft.rfq_case_id AND status='awaiting_supplier';
  RETURN jsonb_build_object('event_id',v_event,'draft',public.rfq_outreach_draft_json(v_draft.id));
END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_rfq_cases(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb; v_outreach_enabled boolean;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(value='true',false) INTO v_outreach_enabled FROM public.platform_settings WHERE key='outreach_templates_enabled';
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',c.id,'case_no',c.case_no,'title',c.title,'brief',c.brief,'status',c.status,
    'buyer_profile_id',c.buyer_profile_id,'buyer_name',COALESCE(pr.company_name,pr.full_name),'buyer_email',u.email::text,
    'match_count',(SELECT count(*) FROM public.rfq_supplier_matches m WHERE m.rfq_case_id=c.id),
    'quote_count',(SELECT count(*) FROM public.rfq_quotes q WHERE q.rfq_case_id=c.id AND q.status<>'draft'),
    'lifecycle_state',(SELECT l.state FROM public.rfq_lifecycles l WHERE l.rfq_case_id=c.id),
    'order',(SELECT jsonb_build_object('id',o.id,'order_no',o.order_no,'status',o.status::text,
      'production_stage',(SELECT ofl.production_stage FROM public.order_fulfillments ofl WHERE ofl.order_id=o.id ORDER BY ofl.created_at LIMIT 1)
    ) FROM public.orders o WHERE o.rfq_case_id=c.id ORDER BY o.created_at DESC LIMIT 1),
    'outreach_enabled',v_outreach_enabled,
    'submitted_at',c.submitted_at,'created_at',c.created_at,'updated_at',c.updated_at
  ) ORDER BY c.updated_at DESC),'[]'::jsonb) INTO v_result
  FROM public.rfq_cases c JOIN public.profiles pr ON pr.id=c.buyer_profile_id JOIN auth.users u ON u.id=c.buyer_profile_id
  WHERE c.source='workspace' AND (p_status IS NULL OR c.status=p_status);
  RETURN v_result;
END; $$;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_target_table_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_target_table_check CHECK (target_table IN (
  'factories','products','content_pages','widget_instances','intools_media_assets','country_shipping_rates','rfq_cases',
  'rfq_outreach_template_versions','rfq_supplier_outreach_drafts','rfq_quotes','rfq_qc_inspections'
));

REVOKE ALL ON FUNCTION public.rfq_outreach_match_is_eligible(uuid,uuid), public.rfq_outreach_draft_json(uuid),
  public.intools_get_rfq_outreach_settings(), public.intools_save_rfq_outreach_template(text,text,integer),
  public.intools_activate_rfq_outreach_template(uuid), public.intools_prepare_rfq_outreach_draft(uuid,uuid),
  public.intools_update_rfq_outreach_draft(uuid,text,text,integer), public.intools_reset_rfq_outreach_draft(uuid,integer),
  public.intools_record_rfq_outreach_copy(uuid,text), public.intools_mark_rfq_supplier_contacted(uuid,text),
  public.intools_record_rfq_supplier_response(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_get_rfq_outreach_settings(), public.intools_save_rfq_outreach_template(text,text,integer),
  public.intools_activate_rfq_outreach_template(uuid), public.intools_prepare_rfq_outreach_draft(uuid,uuid),
  public.intools_update_rfq_outreach_draft(uuid,text,text,integer), public.intools_reset_rfq_outreach_draft(uuid,integer),
  public.intools_record_rfq_outreach_copy(uuid,text), public.intools_mark_rfq_supplier_contacted(uuid,text),
  public.intools_record_rfq_supplier_response(uuid,text,text) TO authenticated;
