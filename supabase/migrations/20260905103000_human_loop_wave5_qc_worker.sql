-- AI-native human-loop Wave 5: bounded service-role QC job contracts.

CREATE OR REPLACE FUNCTION public.qc_require_service_role()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.qc_claim_analysis_jobs(p_limit integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.qc_require_service_role();
  IF p_limit NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Claim limit must be between 1 and 2' USING ERRCODE='22023'; END IF;
  IF NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_ai_shadow_enabled'),false) THEN RETURN '[]'::jsonb; END IF;
  WITH candidates AS (
    SELECT id FROM public.rfq_qc_analysis_jobs
    WHERE state IN ('queued','retry') AND next_attempt_at<=now() AND attempt_count<3
    ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.rfq_qc_analysis_jobs j SET state='leased',stage=CASE WHEN stage='queued' THEN 'validating' ELSE stage END,
      lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',attempt_count=attempt_count+1,updated_at=now()
    FROM candidates c WHERE j.id=c.id RETURNING j.id
  ) SELECT COALESCE(jsonb_agg(id),'[]'::jsonb) INTO v_result FROM claimed;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.qc_get_analysis_context(p_job_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.qc_require_service_role();
  IF cardinality(p_job_ids) NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'One or two job IDs are required' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'job_id',j.id,'lease_token',j.lease_token,'lease_expires_at',j.lease_expires_at,'stage',j.stage,'cursor',j.cursor,'derived_manifest',j.derived_manifest,
    'attempt_count',j.attempt_count,'asset_set_hash',j.asset_set_hash,'analyzer_version',j.analyzer_version,
    'inspection',jsonb_build_object('id',i.id,'rfq_case_id',i.rfq_case_id,'category',i.category,'phase',i.phase,'revision',i.revision),
    'checklist',jsonb_build_object('id',c.id,'version',c.version,'required_views',c.required_views,'criteria',c.criteria,'exclusions',c.exclusions,'capture_instructions',c.capture_instructions),
    'approved_specification',(SELECT rc.brief FROM public.rfq_cases rc WHERE rc.id=i.rfq_case_id),
    'assets',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'storage_path',a.storage_path,'content_type',a.content_type,'byte_size',a.byte_size,'sha256',a.sha256) ORDER BY a.id) FROM public.rfq_qc_assets a WHERE a.inspection_id=i.id),'[]'::jsonb)
  ) ORDER BY j.created_at),'[]'::jsonb) INTO v_result
  FROM public.rfq_qc_analysis_jobs j JOIN public.rfq_qc_inspections i ON i.id=j.inspection_id JOIN public.rfq_qc_checklist_versions c ON c.id=j.checklist_version_id
  WHERE j.id=ANY(p_job_ids) AND j.state='leased' AND j.lease_expires_at>now();
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.qc_checkpoint_analysis_jobs(p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_item jsonb; v_job public.rfq_qc_analysis_jobs; v_count integer:=0; v_retry boolean;
BEGIN
  PERFORM public.qc_require_service_role();
  IF jsonb_typeof(p_results)<>'array' OR jsonb_array_length(p_results) NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Checkpoint requires one or two results' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    SELECT * INTO v_job FROM public.rfq_qc_analysis_jobs WHERE id=(v_item->>'job_id')::uuid AND lease_token=(v_item->>'lease_token')::uuid AND state='leased' AND lease_expires_at>now() FOR UPDATE;
    IF v_job.id IS NULL THEN RAISE EXCEPTION 'Active QC lease not found' USING ERRCODE='40001'; END IF;
    IF jsonb_typeof(COALESCE(v_item->'cursor','{}'::jsonb))<>'object' OR jsonb_typeof(COALESCE(v_item->'derived_manifest','[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Invalid checkpoint payload' USING ERRCODE='22023'; END IF;
    v_retry:=COALESCE((v_item->>'release')::boolean,false);
    UPDATE public.rfq_qc_analysis_jobs SET stage=left(COALESCE(NULLIF(v_item->>'stage',''),stage),80),cursor=COALESCE(v_item->'cursor',cursor),derived_manifest=COALESCE(v_item->'derived_manifest',derived_manifest),
      last_error=left(NULLIF(v_item->>'error',''),2000),state=CASE WHEN v_retry THEN CASE WHEN attempt_count>=3 THEN 'failed' ELSE 'retry' END ELSE 'leased' END,
      next_attempt_at=CASE WHEN v_retry THEN now()+LEAST(interval '30 minutes',interval '30 seconds'*power(2,attempt_count)) ELSE next_attempt_at END,
      lease_token=CASE WHEN v_retry THEN NULL ELSE lease_token END,lease_expires_at=CASE WHEN v_retry THEN NULL ELSE now()+interval '5 minutes' END,updated_at=now()
    WHERE id=v_job.id;
    IF v_retry AND v_job.attempt_count>=3 THEN UPDATE public.rfq_qc_inspections SET substate='analysis_failed',updated_at=now() WHERE id=v_job.inspection_id; END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('checkpointed',v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.qc_complete_analysis_jobs(p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_item jsonb; v_finding jsonb; v_job public.rfq_qc_analysis_jobs; v_run public.rfq_qc_analysis_runs; v_count integer:=0; v_case public.rfq_cases;
BEGIN
  PERFORM public.qc_require_service_role();
  IF jsonb_typeof(p_results)<>'array' OR jsonb_array_length(p_results) NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Completion requires one or two results' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    SELECT * INTO v_job FROM public.rfq_qc_analysis_jobs WHERE id=(v_item->>'job_id')::uuid AND lease_token=(v_item->>'lease_token')::uuid AND state='leased' AND lease_expires_at>now() FOR UPDATE;
    IF v_job.id IS NULL THEN RAISE EXCEPTION 'Active QC lease not found' USING ERRCODE='40001'; END IF;
    IF jsonb_typeof(COALESCE(v_item->'findings','[]'::jsonb))<>'array' OR jsonb_array_length(COALESCE(v_item->'findings','[]'::jsonb))>100 THEN RAISE EXCEPTION 'Invalid QC findings' USING ERRCODE='22023'; END IF;
    IF jsonb_typeof(COALESCE(v_item->'derived_manifest','[]'::jsonb))<>'array' OR jsonb_array_length(COALESCE(v_item->'derived_manifest','[]'::jsonb))>72 THEN RAISE EXCEPTION 'Invalid derived manifest' USING ERRCODE='22023'; END IF;
    INSERT INTO public.rfq_qc_analysis_runs(job_id,inspection_id,status,engine_versions,provider,model,prompt_hash,schema_version,input_tokens,output_tokens,provider_cost_usd,latency_ms,attempt_count,preprocessing_report)
    VALUES(v_job.id,v_job.inspection_id,'completed',COALESCE(v_item->'engine_versions','{}'::jsonb),NULLIF(v_item->>'provider',''),NULLIF(v_item->>'model',''),NULLIF(v_item->>'prompt_hash',''),COALESCE(NULLIF(v_item->>'schema_version',''),'qc-risk-v1'),NULLIF(v_item->>'input_tokens','')::integer,NULLIF(v_item->>'output_tokens','')::integer,NULLIF(v_item->>'provider_cost_usd','')::numeric,NULLIF(v_item->>'latency_ms','')::integer,v_job.attempt_count,COALESCE(v_item->'preprocessing_report','{}'::jsonb)) RETURNING * INTO v_run;
    FOR v_finding IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'findings','[]'::jsonb)) LOOP
      IF COALESCE(v_finding->>'category','') NOT IN ('evidence_quality','reference_mismatch','construction_or_workmanship','surface_damage','contamination_or_foreign_matter','color_or_finish_variation','measurement_evidence','label_or_packaging','seal_or_leakage','quantity_or_coverage','process_or_safety_observation','unknown')
        OR COALESCE(v_finding->>'severity','') NOT IN ('info','low','medium','high') OR char_length(btrim(COALESCE(v_finding->>'summary',''))) NOT BETWEEN 1 AND 1000
        OR jsonb_typeof(COALESCE(v_finding->'evidence','null'::jsonb))<>'object'
        OR NOT EXISTS(SELECT 1 FROM public.rfq_qc_assets a WHERE a.id=(v_finding->>'asset_id')::uuid AND a.inspection_id=v_job.inspection_id)
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(v_item->'derived_manifest','[]'::jsonb)) d WHERE d->>'asset_id'=v_finding->>'asset_id' AND d->>'frame_id'=v_finding->'evidence'->>'frame_id')
        OR (NULLIF(v_finding->>'checklist_reference','') IS NOT NULL AND v_finding->>'checklist_reference' NOT LIKE 'checklist:'||v_job.checklist_version_id::text||':criterion:%')
      THEN RAISE EXCEPTION 'Finding failed evidence validation' USING ERRCODE='22023'; END IF;
      INSERT INTO public.rfq_qc_findings(run_id,inspection_id,asset_id,category,severity,summary,evidence,checklist_reference)
      VALUES(v_run.id,v_job.inspection_id,(v_finding->>'asset_id')::uuid,v_finding->>'category',v_finding->>'severity',btrim(v_finding->>'summary'),COALESCE(v_finding->'evidence','{}'::jsonb),NULLIF(v_finding->>'checklist_reference',''));
    END LOOP;
    UPDATE public.rfq_qc_analysis_jobs SET state='completed',stage='completed',derived_manifest=COALESCE(v_item->'derived_manifest','[]'::jsonb),lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE id=v_job.id;
    UPDATE public.rfq_qc_assets SET processing_state='ready' WHERE inspection_id=v_job.inspection_id;
    UPDATE public.rfq_qc_inspections SET current_analysis_run_id=v_run.id,substate='review_required',revision=revision+1,updated_at=now() WHERE id=v_job.inspection_id;
    SELECT c.* INTO v_case FROM public.rfq_cases c JOIN public.rfq_qc_inspections i ON i.rfq_case_id=c.id WHERE i.id=v_job.inspection_id;
    INSERT INTO public.rfq_lifecycle_events(rfq_case_id,event_type,phase,note,metadata) SELECT i.rfq_case_id,'qc_analysis_ready',i.phase,'Automated visual-risk triage is ready for human review.',jsonb_build_object('inspection_id',i.id,'analysis_run_id',v_run.id) FROM public.rfq_qc_inspections i WHERE i.id=v_job.inspection_id;
    PERFORM public.notification_emit_to_admins('production','QC analysis ready for '||v_case.case_no,'Review the evidence-linked risks before publishing any QC decision.','rfq_case',v_case.id,'high',jsonb_build_object('inspection_id',v_job.inspection_id),'qc-analysis:'||v_run.id::text);
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('completed',v_count);
END; $$;

REVOKE ALL ON FUNCTION public.qc_require_service_role(), public.qc_claim_analysis_jobs(integer), public.qc_get_analysis_context(uuid[]), public.qc_checkpoint_analysis_jobs(jsonb), public.qc_complete_analysis_jobs(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qc_require_service_role(), public.qc_claim_analysis_jobs(integer), public.qc_get_analysis_context(uuid[]), public.qc_checkpoint_analysis_jobs(jsonb), public.qc_complete_analysis_jobs(jsonb) TO service_role;
