-- AI-native human-loop Wave 4: versioned production updates, private QC
-- evidence, manual review authority, and a fail-closed shipment gate.

CREATE TABLE public.rfq_production_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  phase text NOT NULL CHECK (phase IN ('sample','bulk')),
  stage text NOT NULL CHECK (stage IN ('sampling','bulk_production','quality_inspection','shipped','delivered')),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 4000),
  source text NOT NULL CHECK (char_length(btrim(source)) BETWEEN 1 AND 500),
  received_at timestamptz NOT NULL,
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_references)='array'),
  next_expected_at timestamptz,
  exception_severity text CHECK (exception_severity IN ('low','medium','high','critical')),
  mitigation text CHECK (mitigation IS NULL OR char_length(mitigation)<=2000),
  required_buyer_action text CHECK (required_buyer_action IS NULL OR char_length(required_buyer_action)<=1000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','superseded')),
  revision integer NOT NULL CHECK (revision>0),
  supersedes_id uuid REFERENCES public.rfq_production_updates(id) ON DELETE RESTRICT,
  published_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rfq_case_id,revision)
);
CREATE UNIQUE INDEX rfq_production_updates_one_current_idx ON public.rfq_production_updates(rfq_case_id) WHERE status='published';
CREATE INDEX rfq_production_updates_case_revision_idx ON public.rfq_production_updates(rfq_case_id,revision DESC);

CREATE TABLE public.rfq_qc_checklist_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('apparel','fabric','trim','fashion_accessory','skincare','beauty')),
  stage text NOT NULL DEFAULT 'quality_inspection',
  version integer NOT NULL CHECK (version>0),
  required_views jsonb NOT NULL CHECK (jsonb_typeof(required_views)='array'),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria)='array'),
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exclusions)='array'),
  capture_instructions text NOT NULL CHECK (char_length(btrim(capture_instructions)) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  activated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE(category,stage,version)
);
CREATE UNIQUE INDEX rfq_qc_checklists_one_active_idx ON public.rfq_qc_checklist_versions(category,stage) WHERE status='active';

-- Conservative capture-only baselines: these specify evidence coverage, not a
-- product verdict. Category-specific defect criteria can be versioned by Ops.
INSERT INTO public.rfq_qc_checklist_versions(category,version,required_views,criteria,exclusions,capture_instructions,status,activated_at)
SELECT category,1,
  '["overall front","overall back","label or identifier","close-up of each reported concern"]'::jsonb,
  '["Evidence is attributable to this RFQ and inspection","Images are in focus and sufficiently lit","Required views are present"]'::jsonb,
  '["No destructive testing","No inference about non-visible composition, performance, safety, or certification"]'::jsonb,
  'Capture the actual inspected goods in even light. Include a scale or measurement tool only when the approved specification requires measurement evidence. Do not reuse evidence from another order.',
  'active',now()
FROM unnest(ARRAY['apparel','fabric','trim','fashion_accessory','skincare','beauty']) AS categories(category)
ON CONFLICT(category,stage,version) DO NOTHING;

CREATE TABLE public.rfq_qc_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  phase text NOT NULL DEFAULT 'bulk' CHECK (phase IN ('sample','bulk')),
  category text NOT NULL CHECK (category IN ('apparel','fabric','trim','fashion_accessory','skincare','beauty')),
  checklist_version_id uuid NOT NULL REFERENCES public.rfq_qc_checklist_versions(id) ON DELETE RESTRICT,
  substate text NOT NULL DEFAULT 'awaiting_evidence' CHECK (substate IN ('awaiting_evidence','uploading','analysis_queued','analyzing','review_required','approved','rework_required','reinspection_required','insufficient_evidence','analysis_failed')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
  current_analysis_run_id uuid,
  current_review_id uuid,
  closed_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rfq_qc_inspections_one_active_idx ON public.rfq_qc_inspections(rfq_case_id,phase,checklist_version_id) WHERE closed_at IS NULL;

CREATE TABLE public.rfq_qc_upload_reservations (
  id uuid PRIMARY KEY,
  inspection_id uuid NOT NULL REFERENCES public.rfq_qc_inspections(id) ON DELETE CASCADE,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 262144000),
  uploader_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rfq_qc_upload_reservations_active_idx ON public.rfq_qc_upload_reservations(uploader_profile_id,expires_at) WHERE consumed_at IS NULL;

CREATE TABLE public.rfq_qc_assets (
  id uuid PRIMARY KEY,
  inspection_id uuid NOT NULL REFERENCES public.rfq_qc_inspections(id) ON DELETE CASCADE,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  capture_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capture_metadata)='object'),
  processing_state text NOT NULL DEFAULT 'queued' CHECK (processing_state IN ('queued','processing','ready','failed')),
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  buyer_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rfq_qc_assets_inspection_created_idx ON public.rfq_qc_assets(inspection_id,created_at);

CREATE TABLE public.rfq_qc_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.rfq_qc_inspections(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','retry','completed','failed')),
  stage text NOT NULL DEFAULT 'queued',
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cursor)='object'),
  derived_manifest jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(derived_manifest)='array'),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  asset_set_hash text NOT NULL,
  analyzer_version text NOT NULL,
  checklist_version_id uuid NOT NULL REFERENCES public.rfq_qc_checklist_versions(id) ON DELETE RESTRICT,
  last_error text CHECK (last_error IS NULL OR char_length(last_error)<=2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(inspection_id,asset_set_hash,checklist_version_id,analyzer_version)
);
CREATE INDEX rfq_qc_jobs_claim_idx ON public.rfq_qc_analysis_jobs(state,next_attempt_at,created_at);

CREATE TABLE public.rfq_qc_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.rfq_qc_analysis_jobs(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.rfq_qc_inspections(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('completed','failed')),
  engine_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  model text,
  prompt_hash text,
  schema_version text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  provider_cost_usd numeric(12,6),
  latency_ms integer,
  attempt_count integer NOT NULL,
  preprocessing_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rfq_qc_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.rfq_qc_analysis_runs(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.rfq_qc_inspections(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.rfq_qc_assets(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('evidence_quality','reference_mismatch','construction_or_workmanship','surface_damage','contamination_or_foreign_matter','color_or_finish_variation','measurement_evidence','label_or_packaging','seal_or_leakage','quantity_or_coverage','process_or_safety_observation','unknown')),
  severity text NOT NULL CHECK (severity IN ('info','low','medium','high')),
  summary text NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
  checklist_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rfq_qc_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.rfq_qc_inspections(id) ON DELETE CASCADE,
  analysis_run_id uuid REFERENCES public.rfq_qc_analysis_runs(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version>0),
  decision text NOT NULL CHECK (decision IN ('approved','rework_required','reinspection_required','insufficient_evidence')),
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 4000),
  accepted_finding_ids uuid[] NOT NULL DEFAULT '{}',
  dismissed_finding_ids uuid[] NOT NULL DEFAULT '{}',
  amendments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(amendments)='array'),
  checklist_version_id uuid NOT NULL REFERENCES public.rfq_qc_checklist_versions(id) ON DELETE RESTRICT,
  reviewed_asset_ids uuid[] NOT NULL DEFAULT '{}',
  buyer_visible_summary text CHECK (buyer_visible_summary IS NULL OR char_length(buyer_visible_summary)<=2000),
  buyer_visible_asset_ids uuid[] NOT NULL DEFAULT '{}',
  expected_next_update timestamptz,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(inspection_id,version)
);
ALTER TABLE public.rfq_qc_inspections ADD CONSTRAINT rfq_qc_inspections_current_run_fk FOREIGN KEY(current_analysis_run_id) REFERENCES public.rfq_qc_analysis_runs(id) ON DELETE SET NULL;
ALTER TABLE public.rfq_qc_inspections ADD CONSTRAINT rfq_qc_inspections_current_review_fk FOREIGN KEY(current_review_id) REFERENCES public.rfq_qc_reviews(id) ON DELETE SET NULL;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('rfq-qc-evidence','rfq-qc-evidence',false,262144000,ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

ALTER TABLE public.rfq_production_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_qc_checklist_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_qc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_qc_upload_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_qc_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_qc_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_qc_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_qc_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_qc_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfq_production_updates, public.rfq_qc_checklist_versions, public.rfq_qc_inspections,
  public.rfq_qc_upload_reservations, public.rfq_qc_assets, public.rfq_qc_analysis_jobs,
  public.rfq_qc_analysis_runs, public.rfq_qc_findings, public.rfq_qc_reviews FROM anon, authenticated;
GRANT SELECT ON public.rfq_production_updates, public.rfq_qc_assets TO authenticated;
CREATE POLICY rfq_production_updates_read ON public.rfq_production_updates FOR SELECT TO authenticated USING (
  public.is_admin() OR (status='published' AND EXISTS(SELECT 1 FROM public.rfq_cases c WHERE c.id=rfq_case_id AND c.buyer_profile_id=auth.uid())));
CREATE POLICY rfq_qc_assets_read ON public.rfq_qc_assets FOR SELECT TO authenticated USING (
  public.is_admin() OR (buyer_visible AND EXISTS(SELECT 1 FROM public.rfq_cases c WHERE c.id=rfq_case_id AND c.buyer_profile_id=auth.uid())));

DROP POLICY IF EXISTS rfq_qc_storage_admin_read ON storage.objects;
CREATE POLICY rfq_qc_storage_admin_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='rfq-qc-evidence' AND (public.is_admin() OR EXISTS(SELECT 1 FROM public.rfq_qc_assets a JOIN public.rfq_cases c ON c.id=a.rfq_case_id WHERE a.storage_path=name AND a.buyer_visible AND c.buyer_profile_id=auth.uid())));
DROP POLICY IF EXISTS rfq_qc_storage_admin_insert ON storage.objects;
CREATE POLICY rfq_qc_storage_admin_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='rfq-qc-evidence' AND public.is_admin() AND EXISTS(SELECT 1 FROM public.rfq_qc_upload_reservations r WHERE r.storage_path=name AND r.uploader_profile_id=auth.uid() AND r.consumed_at IS NULL AND r.expires_at>now()));

CREATE OR REPLACE FUNCTION public.intools_publish_rfq_production_update(p_case_id uuid,p_payload jsonb,p_expected_revision integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_order public.orders; v_previous public.rfq_production_updates; v_update public.rfq_production_updates; v_revision integer; v_order_stage text;
BEGIN
  PERFORM public.intools_require_admin();
  IF NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='production_updates_enabled'),false) THEN RAISE EXCEPTION 'Production updates are not enabled' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id FOR UPDATE;
  SELECT * INTO v_order FROM public.orders WHERE rfq_case_id=p_case_id ORDER BY created_at DESC LIMIT 1;
  SELECT production_stage INTO v_order_stage FROM public.order_fulfillments WHERE order_id=v_order.id ORDER BY created_at LIMIT 1;
  SELECT * INTO v_previous FROM public.rfq_production_updates WHERE rfq_case_id=p_case_id AND status='published' FOR UPDATE;
  IF v_case.id IS NULL OR v_order.id IS NULL THEN RAISE EXCEPTION 'An active RFQ order is required' USING ERRCODE='55000'; END IF;
  IF COALESCE(v_previous.revision,0)<>COALESCE(p_expected_revision,0) THEN RAISE EXCEPTION 'Production update changed; reload before publishing' USING ERRCODE='40001'; END IF;
  IF COALESCE(p_payload->>'phase','') NOT IN ('sample','bulk') OR COALESCE(p_payload->>'stage','') NOT IN ('sampling','bulk_production','quality_inspection','shipped','delivered')
    OR char_length(btrim(COALESCE(p_payload->>'note',''))) NOT BETWEEN 1 AND 4000 OR char_length(btrim(COALESCE(p_payload->>'source',''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Production update is incomplete' USING ERRCODE='22023';
  END IF;
  IF p_payload ? 'evidence_references' AND jsonb_typeof(p_payload->'evidence_references')<>'array' THEN RAISE EXCEPTION 'Evidence references must be an array' USING ERRCODE='22023'; END IF;
  IF p_payload->>'stage' IS DISTINCT FROM v_order_stage THEN RAISE EXCEPTION 'Production update stage must match the authoritative order stage' USING ERRCODE='55000'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'evidence_references','[]'::jsonb))>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'evidence_references','[]'::jsonb)) item WHERE jsonb_typeof(item)<>'string' OR char_length(item#>>'{}') NOT BETWEEN 1 AND 500) THEN RAISE EXCEPTION 'Evidence references must contain at most 20 short text references' USING ERRCODE='22023'; END IF;
  IF NULLIF(p_payload->>'exception_severity','') IS NOT NULL AND NULLIF(p_payload->>'mitigation','') IS NULL THEN RAISE EXCEPTION 'An exception requires mitigation or follow-up' USING ERRCODE='22023'; END IF;
  v_revision:=COALESCE(v_previous.revision,0)+1;
  IF v_previous.id IS NOT NULL THEN UPDATE public.rfq_production_updates SET status='superseded' WHERE id=v_previous.id; END IF;
  INSERT INTO public.rfq_production_updates(rfq_case_id,order_id,phase,stage,note,source,received_at,evidence_references,next_expected_at,exception_severity,mitigation,required_buyer_action,revision,supersedes_id,published_by)
  VALUES(p_case_id,v_order.id,p_payload->>'phase',p_payload->>'stage',btrim(p_payload->>'note'),btrim(p_payload->>'source'),COALESCE(NULLIF(p_payload->>'received_at','')::timestamptz,now()),COALESCE(p_payload->'evidence_references','[]'::jsonb),NULLIF(p_payload->>'next_expected_at','')::timestamptz,NULLIF(p_payload->>'exception_severity',''),NULLIF(btrim(p_payload->>'mitigation'),''),NULLIF(btrim(p_payload->>'required_buyer_action'),''),v_revision,v_previous.id,auth.uid()) RETURNING * INTO v_update;
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,actor_profile_id,note,metadata) VALUES(p_case_id,'production_update_published',p_payload->>'phase',auth.uid(),v_update.note,jsonb_build_object('production_update_id',v_update.id,'revision',v_revision,'stage',v_update.stage));
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata) VALUES(auth.uid(),'rfq_production_updates',v_update.id,'publish','Published production update',jsonb_build_object('rfq_case_id',p_case_id,'revision',v_revision));
  PERFORM public.notification_emit(v_case.buyer_profile_id,'production','Production update for '||v_case.case_no,v_update.note,'rfq_case',p_case_id,NULL,false,'normal',jsonb_build_object('revision',v_revision,'stage',v_update.stage),'production-update:'||v_update.id::text);
  RETURN to_jsonb(v_update);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_begin_manual_qc_review(p_case_id uuid,p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders; v_checklist public.rfq_qc_checklist_versions; v_inspection public.rfq_qc_inspections;
BEGIN
  PERFORM public.intools_require_admin();
  IF NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_evidence_upload_enabled'),false) THEN RAISE EXCEPTION 'QC evidence upload is not enabled' USING ERRCODE='55000'; END IF;
  IF p_category NOT IN ('apparel','fabric','trim','fashion_accessory','skincare','beauty') THEN RAISE EXCEPTION 'Unsupported QC category' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE rfq_case_id=p_case_id ORDER BY created_at DESC LIMIT 1;
  IF v_order.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.order_fulfillments WHERE order_id=v_order.id AND production_stage='quality_inspection') THEN RAISE EXCEPTION 'Order must be in quality inspection' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_checklist FROM public.rfq_qc_checklist_versions WHERE category=p_category AND stage='quality_inspection' AND status='active';
  IF v_checklist.id IS NULL THEN RAISE EXCEPTION 'No active checklist exists for this category' USING ERRCODE='55000'; END IF;
  INSERT INTO public.rfq_qc_inspections(rfq_case_id,order_id,category,checklist_version_id,created_by)
  VALUES(p_case_id,v_order.id,p_category,v_checklist.id,auth.uid()) ON CONFLICT DO NOTHING;
  SELECT * INTO v_inspection FROM public.rfq_qc_inspections WHERE rfq_case_id=p_case_id AND phase='bulk' AND checklist_version_id=v_checklist.id AND closed_at IS NULL;
  RETURN to_jsonb(v_inspection);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_reserve_qc_upload(p_case_id uuid,p_inspection_id uuid,p_asset_id uuid,p_filename text,p_content_type text,p_byte_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_path text; v_image_count integer; v_video_count integer; v_inspection public.rfq_qc_inspections;
BEGIN
  PERFORM public.intools_require_admin();
  IF NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_evidence_upload_enabled'),false) THEN RAISE EXCEPTION 'QC evidence upload is not enabled' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_inspection FROM public.rfq_qc_inspections WHERE id=p_inspection_id AND rfq_case_id=p_case_id AND closed_at IS NULL FOR UPDATE;
  IF v_inspection.id IS NULL THEN RAISE EXCEPTION 'Active inspection not found' USING ERRCODE='42501'; END IF;
  IF p_asset_id IS NULL OR char_length(btrim(COALESCE(p_filename,''))) NOT BETWEEN 1 AND 255 OR p_filename ~ '[/\\]' OR p_content_type NOT IN ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm') OR p_byte_size NOT BETWEEN 1 AND 262144000 THEN RAISE EXCEPTION 'Invalid QC upload' USING ERRCODE='22023'; END IF;
  SELECT storage_path INTO v_path FROM public.rfq_qc_upload_reservations WHERE id=p_asset_id AND inspection_id=p_inspection_id AND original_name=btrim(p_filename) AND content_type=p_content_type AND byte_size=p_byte_size AND uploader_profile_id=auth.uid() AND consumed_at IS NULL;
  IF v_path IS NOT NULL THEN
    UPDATE public.rfq_qc_upload_reservations SET expires_at=now()+interval '30 minutes' WHERE id=p_asset_id;
    RETURN jsonb_build_object('asset_id',p_asset_id,'bucket','rfq-qc-evidence','storage_path',v_path,'expires_at',now()+interval '30 minutes');
  END IF;
  SELECT count(*) FILTER(WHERE content_type LIKE 'image/%'),count(*) FILTER(WHERE content_type LIKE 'video/%') INTO v_image_count,v_video_count FROM public.rfq_qc_upload_reservations WHERE inspection_id=p_inspection_id AND consumed_at IS NULL AND expires_at>now();
  SELECT v_image_count+count(*) FILTER(WHERE content_type LIKE 'image/%'),v_video_count+count(*) FILTER(WHERE content_type LIKE 'video/%') INTO v_image_count,v_video_count FROM public.rfq_qc_assets WHERE inspection_id=p_inspection_id;
  IF (p_content_type LIKE 'image/%' AND v_image_count>=10) OR (p_content_type LIKE 'video/%' AND v_video_count>=1) THEN RAISE EXCEPTION 'QC evidence limit reached' USING ERRCODE='23514'; END IF;
  v_path:=p_case_id::text||'/'||p_inspection_id::text||'/'||p_asset_id::text||'/'||regexp_replace(p_filename,'[^A-Za-z0-9._-]','_','g');
  INSERT INTO public.rfq_qc_upload_reservations(id,inspection_id,rfq_case_id,storage_path,original_name,content_type,byte_size,uploader_profile_id,expires_at) VALUES(p_asset_id,p_inspection_id,p_case_id,v_path,btrim(p_filename),p_content_type,p_byte_size,auth.uid(),now()+interval '30 minutes');
  UPDATE public.rfq_qc_inspections SET substate='uploading',updated_at=now() WHERE id=p_inspection_id AND substate='awaiting_evidence';
  RETURN jsonb_build_object('asset_id',p_asset_id,'bucket','rfq-qc-evidence','storage_path',v_path,'expires_at',now()+interval '30 minutes');
END; $$;

CREATE OR REPLACE FUNCTION public.intools_finalize_qc_upload(p_asset_id uuid,p_storage_path text,p_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_res public.rfq_qc_upload_reservations; v_metadata jsonb; v_size bigint; v_mime text; v_asset public.rfq_qc_assets; v_hash text; v_job public.rfq_qc_analysis_jobs;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_asset FROM public.rfq_qc_assets WHERE id=p_asset_id;
  IF v_asset.id IS NOT NULL THEN
    IF v_asset.storage_path=p_storage_path AND v_asset.sha256=p_sha256 THEN RETURN jsonb_build_object('asset',to_jsonb(v_asset),'analysis_job_id',NULL); END IF;
    RAISE EXCEPTION 'QC asset identifier was already finalized' USING ERRCODE='23505';
  END IF;
  SELECT * INTO v_res FROM public.rfq_qc_upload_reservations WHERE id=p_asset_id AND storage_path=p_storage_path AND uploader_profile_id=auth.uid() AND consumed_at IS NULL AND expires_at>now() FOR UPDATE;
  IF v_res.id IS NULL OR COALESCE(p_sha256,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Valid upload reservation and SHA-256 are required' USING ERRCODE='22023'; END IF;
  SELECT metadata INTO v_metadata FROM storage.objects WHERE bucket_id='rfq-qc-evidence' AND name=p_storage_path;
  IF v_metadata IS NULL OR COALESCE(v_metadata->>'size','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Uploaded object metadata not found' USING ERRCODE='P0002'; END IF;
  v_size:=(v_metadata->>'size')::bigint; v_mime:=COALESCE(v_metadata->>'mimetype',v_metadata->>'contentType');
  IF v_size<>v_res.byte_size OR v_mime<>v_res.content_type THEN RAISE EXCEPTION 'Uploaded object does not match its reservation' USING ERRCODE='22023'; END IF;
  INSERT INTO public.rfq_qc_assets(id,inspection_id,rfq_case_id,storage_path,original_name,content_type,byte_size,sha256,uploaded_by) VALUES(v_res.id,v_res.inspection_id,v_res.rfq_case_id,v_res.storage_path,v_res.original_name,v_res.content_type,v_res.byte_size,p_sha256,auth.uid()) RETURNING * INTO v_asset;
  UPDATE public.rfq_qc_upload_reservations SET consumed_at=now() WHERE id=v_res.id;
  SELECT md5(string_agg(a.sha256,',' ORDER BY a.id)) INTO v_hash FROM public.rfq_qc_assets a WHERE a.inspection_id=v_res.inspection_id;
  IF COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_ai_shadow_enabled'),false) THEN
    UPDATE public.rfq_qc_analysis_jobs SET state='failed',last_error='Superseded by a newer immutable asset set',updated_at=now() WHERE inspection_id=v_res.inspection_id AND state IN ('queued','retry');
    INSERT INTO public.rfq_qc_analysis_jobs(inspection_id,asset_set_hash,analyzer_version,checklist_version_id)
    SELECT i.id,v_hash,'qc-v1',i.checklist_version_id FROM public.rfq_qc_inspections i WHERE i.id=v_res.inspection_id ON CONFLICT DO NOTHING RETURNING * INTO v_job;
  END IF;
  UPDATE public.rfq_qc_inspections SET substate=CASE WHEN COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_ai_shadow_enabled'),false) THEN 'analysis_queued' ELSE 'review_required' END,revision=revision+1,updated_at=now() WHERE id=v_res.inspection_id;
  RETURN jsonb_build_object('asset',to_jsonb(v_asset),'analysis_job_id',v_job.id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_review_qc_inspection(p_inspection_id uuid,p_analysis_run_id uuid,p_decision text,p_note text,p_buyer_visible_asset_ids uuid[],p_expected_revision integer,p_finding_dispositions jsonb DEFAULT '[]'::jsonb,p_buyer_visible_summary text DEFAULT NULL,p_expected_next_update timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_i public.rfq_qc_inspections; v_review public.rfq_qc_reviews; v_version integer; v_case public.rfq_cases; v_item jsonb; v_finding_id uuid; v_accepted uuid[]:='{}'; v_dismissed uuid[]:='{}'; v_amendments jsonb:='[]'::jsonb; v_reviewed_assets uuid[];
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_i FROM public.rfq_qc_inspections WHERE id=p_inspection_id FOR UPDATE;
  IF v_i.id IS NULL OR v_i.revision<>p_expected_revision THEN RAISE EXCEPTION 'QC inspection changed; reload before reviewing' USING ERRCODE='40001'; END IF;
  IF p_decision NOT IN ('approved','rework_required','reinspection_required','insufficient_evidence') OR char_length(btrim(COALESCE(p_note,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'QC review requires a valid decision and rationale' USING ERRCODE='22023'; END IF;
  IF p_decision<>'approved' AND p_expected_next_update IS NULL THEN RAISE EXCEPTION 'A non-approved QC decision requires the next expected update' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.rfq_qc_assets WHERE inspection_id=p_inspection_id) THEN RAISE EXCEPTION 'QC review requires inspection evidence' USING ERRCODE='55000'; END IF;
  IF p_analysis_run_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rfq_qc_analysis_runs WHERE id=p_analysis_run_id AND inspection_id=p_inspection_id AND status='completed') THEN RAISE EXCEPTION 'Analysis run does not belong to this inspection' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(COALESCE(p_buyer_visible_asset_ids,'{}')) x WHERE NOT EXISTS(SELECT 1 FROM public.rfq_qc_assets a WHERE a.id=x AND a.inspection_id=p_inspection_id)) THEN RAISE EXCEPTION 'Buyer-visible evidence does not belong to this inspection' USING ERRCODE='22023'; END IF;
  IF cardinality(COALESCE(p_buyer_visible_asset_ids,'{}'))>0 AND NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_buyer_visibility_enabled'),false) THEN RAISE EXCEPTION 'Buyer-visible QC evidence is not enabled' USING ERRCODE='55000'; END IF;
  IF jsonb_typeof(COALESCE(p_finding_dispositions,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Finding dispositions must be an array' USING ERRCODE='22023'; END IF;
  IF p_analysis_run_id IS NULL AND jsonb_array_length(COALESCE(p_finding_dispositions,'[]'::jsonb))>0 THEN RAISE EXCEPTION 'Manual review cannot reference AI findings without a run' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_finding_dispositions,'[]'::jsonb)) LOOP
    BEGIN v_finding_id:=(v_item->>'finding_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid finding disposition' USING ERRCODE='22023'; END;
    IF COALESCE(v_item->>'disposition','') NOT IN ('accepted','dismissed','amended') OR NOT EXISTS(SELECT 1 FROM public.rfq_qc_findings WHERE id=v_finding_id AND run_id=p_analysis_run_id AND inspection_id=p_inspection_id) OR v_finding_id=ANY(v_accepted||v_dismissed) OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_amendments) a WHERE a->>'finding_id'=v_finding_id::text) THEN RAISE EXCEPTION 'Finding disposition does not belong to the current run or is duplicated' USING ERRCODE='22023'; END IF;
    IF v_item->>'disposition'='accepted' THEN v_accepted:=array_append(v_accepted,v_finding_id);
    ELSIF v_item->>'disposition'='dismissed' THEN v_dismissed:=array_append(v_dismissed,v_finding_id);
    ELSE
      IF char_length(btrim(COALESCE(v_item->>'note',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'An amended finding requires a note' USING ERRCODE='22023'; END IF;
      v_amendments:=v_amendments||jsonb_build_array(jsonb_build_object('finding_id',v_finding_id,'note',btrim(v_item->>'note')));
    END IF;
  END LOOP;
  IF p_analysis_run_id IS NOT NULL AND jsonb_array_length(COALESCE(p_finding_dispositions,'[]'::jsonb))<>(SELECT count(*) FROM public.rfq_qc_findings WHERE run_id=p_analysis_run_id AND inspection_id=p_inspection_id) THEN RAISE EXCEPTION 'Every AI finding requires one human disposition' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO v_reviewed_assets FROM public.rfq_qc_assets WHERE inspection_id=p_inspection_id;
  SELECT COALESCE(max(version),0)+1 INTO v_version FROM public.rfq_qc_reviews WHERE inspection_id=p_inspection_id;
  INSERT INTO public.rfq_qc_reviews(inspection_id,analysis_run_id,version,decision,rationale,accepted_finding_ids,dismissed_finding_ids,amendments,checklist_version_id,reviewed_asset_ids,buyer_visible_summary,buyer_visible_asset_ids,expected_next_update,reviewer_id) VALUES(p_inspection_id,p_analysis_run_id,v_version,p_decision,btrim(p_note),v_accepted,v_dismissed,v_amendments,v_i.checklist_version_id,v_reviewed_assets,COALESCE(NULLIF(btrim(p_buyer_visible_summary),''),CASE p_decision WHEN 'approved' THEN 'Atelix reviewed the submitted quality evidence and approved this inspection.' WHEN 'rework_required' THEN 'Atelix reviewed the submitted quality evidence and requested rework.' WHEN 'reinspection_required' THEN 'Atelix requested a further inspection before shipment.' ELSE 'Atelix requested replacement quality evidence.' END),COALESCE(p_buyer_visible_asset_ids,'{}'),p_expected_next_update,auth.uid()) RETURNING * INTO v_review;
  UPDATE public.rfq_qc_assets SET buyer_visible=(id=ANY(COALESCE(p_buyer_visible_asset_ids,'{}'))) WHERE inspection_id=p_inspection_id;
  UPDATE public.rfq_qc_inspections SET current_review_id=v_review.id,current_analysis_run_id=COALESCE(p_analysis_run_id,current_analysis_run_id),substate=p_decision,revision=revision+1,updated_at=now() WHERE id=p_inspection_id;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=v_i.rfq_case_id;
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,actor_profile_id,note,metadata) VALUES(v_i.rfq_case_id,'qc_review_published',v_i.phase,auth.uid(),btrim(p_note),jsonb_build_object('inspection_id',p_inspection_id,'review_id',v_review.id,'decision',p_decision,'revision',v_i.revision+1));
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata) VALUES(auth.uid(),'rfq_qc_reviews',v_review.id,'publish','Published human QC review',jsonb_build_object('inspection_id',p_inspection_id,'decision',p_decision));
  IF COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_buyer_visibility_enabled'),false) THEN
    PERFORM public.notification_emit(v_case.buyer_profile_id,'production','Quality review for '||v_case.case_no,CASE WHEN p_decision='approved' THEN 'Atelix approved the reviewed quality evidence.' ELSE 'Atelix published a quality review update.' END,'rfq_case',v_case.id,NULL,false,'high',jsonb_build_object('inspection_id',p_inspection_id,'decision',p_decision),'qc-review:'||v_review.id::text);
  END IF;
  RETURN to_jsonb(v_review);
END; $$;

-- Shipment is a server-authoritative transition and fails closed unless the
-- current inspection review is an Ops-published approval.
CREATE OR REPLACE FUNCTION public.intools_update_order_production_stage(p_order_id uuid,p_stage text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders; v_case_id uuid; v_state text; v_fulfillment public.order_fulfillments;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_stage NOT IN ('quality_inspection','shipped','delivered') THEN RAISE EXCEPTION 'Only paid bulk fulfillment stages may be advanced here' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id; v_case_id:=v_order.rfq_case_id;
  SELECT state INTO v_state FROM public.rfq_lifecycles WHERE rfq_case_id=v_case_id FOR UPDATE;
  IF v_order.id IS NULL OR v_state NOT IN ('bulk_in_production','quality_inspection','shipped') THEN RAISE EXCEPTION 'Bulk production is not paid and active' USING ERRCODE='55000'; END IF;
  IF (v_state='bulk_in_production' AND p_stage<>'quality_inspection') OR (v_state='quality_inspection' AND p_stage<>'shipped') OR (v_state='shipped' AND p_stage<>'delivered') THEN RAISE EXCEPTION 'Fulfillment stages must advance in order' USING ERRCODE='55000'; END IF;
  IF p_stage='shipped' AND NOT EXISTS(SELECT 1 FROM public.rfq_qc_inspections i JOIN public.rfq_qc_reviews r ON r.id=i.current_review_id WHERE i.rfq_case_id=v_case_id AND i.order_id=p_order_id AND i.closed_at IS NULL AND i.substate='approved' AND r.decision='approved') THEN RAISE EXCEPTION 'Shipment requires a current approved QC review' USING ERRCODE='55000'; END IF;
  UPDATE public.order_fulfillments SET production_stage=p_stage WHERE order_id=p_order_id RETURNING * INTO v_fulfillment;
  UPDATE public.rfq_lifecycles SET state=p_stage,updated_at=now() WHERE rfq_case_id=v_case_id;
  INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,actor_profile_id,note,metadata) VALUES(v_case_id,'stage_changed','bulk',auth.uid(),NULLIF(btrim(p_note),''),jsonb_build_object('stage',p_stage));
  RETURN to_jsonb(v_fulfillment);
END; $$;

ALTER TABLE public.rfq_lifecycle_events DROP CONSTRAINT IF EXISTS rfq_lifecycle_events_event_type_check;
ALTER TABLE public.rfq_lifecycle_events ADD CONSTRAINT rfq_lifecycle_events_event_type_check CHECK(event_type IN ('proposal_selected','invoice_created','invoice_sent','invoice_paid','sample_ready','sample_approved','sample_declined','outreach_contacted','supplier_response_recorded','quote_published','bulk_started','stage_changed','production_update_published','qc_analysis_ready','qc_review_published','cancelled'));
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_target_table_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_target_table_check CHECK(target_table IN ('factories','products','content_pages','widget_instances','intools_media_assets','country_shipping_rates','rfq_cases','platform_settings','rfq_outreach_template_versions','rfq_supplier_outreach_drafts','rfq_supplier_outreach_events','rfq_quotes','rfq_qc_inspections','rfq_production_updates','rfq_qc_checklist_versions','rfq_qc_reviews'));

CREATE OR REPLACE FUNCTION public.intools_get_rfq_operations(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id;
  IF v_case.id IS NULL THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='P0002'; END IF;
  SELECT jsonb_build_object(
    'case',jsonb_build_object('id',v_case.id,'case_no',v_case.case_no,'title',v_case.title,'brief',v_case.brief,'status',v_case.status,'buyer_profile_id',v_case.buyer_profile_id,
      'buyer_name',(SELECT COALESCE(p.company_name,p.full_name) FROM public.profiles p WHERE p.id=v_case.buyer_profile_id),
      'buyer_email',(SELECT u.email::text FROM auth.users u WHERE u.id=v_case.buyer_profile_id),
      'match_count',(SELECT count(*) FROM public.rfq_supplier_matches WHERE rfq_case_id=p_case_id),
      'quote_count',(SELECT count(*) FROM public.rfq_quotes WHERE rfq_case_id=p_case_id AND status<>'draft'),
      'submitted_at',v_case.submitted_at,'created_at',v_case.created_at,'updated_at',v_case.updated_at,
      'lifecycle_state',(SELECT state FROM public.rfq_lifecycles WHERE rfq_case_id=p_case_id),
      'order',(SELECT jsonb_build_object('id',o.id,'order_no',o.order_no,'status',o.status::text,'production_stage',(SELECT production_stage FROM public.order_fulfillments WHERE order_id=o.id ORDER BY created_at LIMIT 1)) FROM public.orders o WHERE o.rfq_case_id=p_case_id ORDER BY o.created_at DESC LIMIT 1),
      'outreach_enabled',COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='outreach_templates_enabled'),false)),
    'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',m.id,'rfq_case_id',m.rfq_case_id,'factory_id',m.factory_id,'status',m.status,'eligibility',m.eligibility,'score',m.score,'recommendation','{}'::jsonb,'created_at',m.created_at,'updated_at',m.updated_at,
      'supplier',jsonb_build_object('id',f.id,'slug',f.slug,'name',f.name,'type',f.type,'region',f.region,'loc',f.loc,'verify_state',f.verify_state,'moq',f.moq,'lead',f.lead,'broker_status',f.broker_status,'owner_profile_id',f.owner_profile_id,'archived_at',f.archived_at,'created_at',f.created_at,'updated_at',f.updated_at),
      'quote',(SELECT jsonb_build_object('id',q.id,'status',q.status,'unit_price_cents',q.unit_price_cents,'quote_total_cents',q.quote_total_cents,'moq',q.moq,'lead_time_days',q.lead_time_days,'certifications',to_jsonb(q.certifications),'certification_note',q.certification_note,'recommended',q.recommended,'notes',q.notes,'selected_at',q.selected_at,'factory_id',q.factory_id,'factory_name',f.name,'factory_region',f.region,'revision',q.revision,'supplier_response_event_id',q.supplier_response_event_id,'reviewed_by',q.reviewed_by,'reviewed_at',q.reviewed_at) FROM public.rfq_quotes q WHERE q.rfq_case_id=p_case_id AND q.factory_id=m.factory_id ORDER BY q.updated_at DESC LIMIT 1)
    ) ORDER BY CASE m.status WHEN 'selected' THEN 0 WHEN 'approved' THEN 1 WHEN 'suggested' THEN 2 ELSE 3 END,m.score DESC) FROM public.rfq_supplier_matches m JOIN public.factories f ON f.id=m.factory_id WHERE m.rfq_case_id=p_case_id),'[]'::jsonb),
    'production_updates',COALESCE((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.revision DESC) FROM public.rfq_production_updates u WHERE u.rfq_case_id=p_case_id),'[]'::jsonb),
    'features',jsonb_build_object('production_updates_enabled',COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='production_updates_enabled'),false),'qc_evidence_upload_enabled',COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_evidence_upload_enabled'),false),'qc_ai_shadow_enabled',COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_ai_shadow_enabled'),false),'qc_buyer_visibility_enabled',COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_buyer_visibility_enabled'),false)),
    'qc_inspection',(SELECT jsonb_build_object('id',i.id,'rfq_case_id',i.rfq_case_id,'order_id',i.order_id,'phase',i.phase,'category',i.category,'substate',i.substate,'revision',i.revision,'current_analysis_run_id',i.current_analysis_run_id,'current_review_id',i.current_review_id,'updated_at',i.updated_at,
      'checklist',(SELECT jsonb_build_object('id',c.id,'version',c.version,'required_views',c.required_views,'criteria',c.criteria,'capture_instructions',c.capture_instructions) FROM public.rfq_qc_checklist_versions c WHERE c.id=i.checklist_version_id),
      'assets',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'original_name',a.original_name,'content_type',a.content_type,'byte_size',a.byte_size,'processing_state',a.processing_state,'buyer_visible',a.buyer_visible,'created_at',a.created_at) ORDER BY a.created_at) FROM public.rfq_qc_assets a WHERE a.inspection_id=i.id),'[]'::jsonb),
      'findings',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'category',f.category,'severity',f.severity,'summary',f.summary,'evidence',f.evidence,'checklist_reference',f.checklist_reference) ORDER BY CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,f.created_at) FROM public.rfq_qc_findings f WHERE f.inspection_id=i.id AND f.run_id=i.current_analysis_run_id),'[]'::jsonb),
      'review',(SELECT to_jsonb(r) FROM public.rfq_qc_reviews r WHERE r.id=i.current_review_id)
    ) FROM public.rfq_qc_inspections i WHERE i.rfq_case_id=p_case_id AND i.closed_at IS NULL ORDER BY i.created_at DESC LIMIT 1),
    'next_actions',jsonb_build_object('can_start_qc',EXISTS(SELECT 1 FROM public.orders o JOIN public.order_fulfillments ofl ON ofl.order_id=o.id WHERE o.rfq_case_id=p_case_id AND ofl.production_stage='quality_inspection'),'can_ship',EXISTS(SELECT 1 FROM public.rfq_qc_inspections i JOIN public.rfq_qc_reviews r ON r.id=i.current_review_id WHERE i.rfq_case_id=p_case_id AND i.substate='approved' AND r.decision='approved'))
  ) INTO v_result;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.intools_publish_rfq_production_update(uuid,jsonb,integer), public.intools_begin_manual_qc_review(uuid,text), public.intools_reserve_qc_upload(uuid,uuid,uuid,text,text,bigint), public.intools_finalize_qc_upload(uuid,text,text), public.intools_review_qc_inspection(uuid,uuid,text,text,uuid[],integer,jsonb,text,timestamptz), public.intools_update_order_production_stage(uuid,text,text), public.intools_get_rfq_operations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.intools_publish_rfq_production_update(uuid,jsonb,integer), public.intools_begin_manual_qc_review(uuid,text), public.intools_reserve_qc_upload(uuid,uuid,uuid,text,text,bigint), public.intools_finalize_qc_upload(uuid,text,text), public.intools_review_qc_inspection(uuid,uuid,text,text,uuid[],integer,jsonb,text,timestamptz), public.intools_update_order_production_stage(uuid,text,text), public.intools_get_rfq_operations(uuid) TO authenticated;
