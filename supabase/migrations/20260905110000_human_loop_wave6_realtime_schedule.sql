-- AI-native human-loop Wave 6: private invalidation broadcasts and a Vault-
-- backed Supabase Pro scheduler configuration seam for the Vercel worker.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.rfq_activity_can_access_topic(p_topic text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_topic ~ '^rfq:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:activity$'
    AND EXISTS(SELECT 1 FROM public.rfq_cases c WHERE c.id=split_part(p_topic,':',2)::uuid AND (c.buyer_profile_id=auth.uid() OR public.is_admin()));
$$;
REVOKE ALL ON FUNCTION public.rfq_activity_can_access_topic(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rfq_activity_can_access_topic(text) TO authenticated;

DROP POLICY IF EXISTS rfq_activity_receive_private_broadcast ON realtime.messages;
CREATE POLICY rfq_activity_receive_private_broadcast ON realtime.messages FOR SELECT TO authenticated USING (
  realtime.messages.extension='broadcast' AND public.rfq_activity_can_access_topic(realtime.topic()));

CREATE OR REPLACE FUNCTION public.rfq_activity_broadcast_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='rfq_activity_realtime_enabled'),false) THEN
    PERFORM realtime.send(jsonb_build_object('event_id',NEW.id,'event_type',NEW.event_type,'revision',COALESCE((NEW.metadata->>'revision')::integer,0)),'rfq_activity_changed','rfq:'||NEW.rfq_case_id::text||':activity',true);
  END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation THEN
  PERFORM realtime.send(jsonb_build_object('event_id',NEW.id,'event_type',NEW.event_type,'revision',0),'rfq_activity_changed','rfq:'||NEW.rfq_case_id::text||':activity',true);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rfq_activity_broadcast_after_event ON public.rfq_lifecycle_events;
CREATE TRIGGER rfq_activity_broadcast_after_event AFTER INSERT ON public.rfq_lifecycle_events FOR EACH ROW EXECUTE FUNCTION public.rfq_activity_broadcast_event();

CREATE OR REPLACE FUNCTION public.intools_get_human_loop_feature_flags()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_object_agg(key,value='true'),'{}'::jsonb) INTO v_result FROM public.platform_settings WHERE key IN ('outreach_templates_enabled','atomic_quote_publication_enabled','production_updates_enabled','qc_evidence_upload_enabled','qc_ai_shadow_enabled','qc_buyer_visibility_enabled','rfq_activity_realtime_enabled');
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_set_human_loop_feature_flag(p_key text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_key NOT IN ('outreach_templates_enabled','atomic_quote_publication_enabled','production_updates_enabled','qc_evidence_upload_enabled','qc_ai_shadow_enabled','qc_buyer_visibility_enabled','rfq_activity_realtime_enabled') THEN RAISE EXCEPTION 'Unknown human-loop feature flag' USING ERRCODE='22023'; END IF;
  IF p_enabled AND p_key='atomic_quote_publication_enabled' AND NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='outreach_templates_enabled'),false) THEN RAISE EXCEPTION 'Enable supplier outreach before atomic quote publication' USING ERRCODE='55000'; END IF;
  IF p_enabled AND p_key IN ('qc_ai_shadow_enabled','qc_buyer_visibility_enabled') AND NOT COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_evidence_upload_enabled'),false) THEN RAISE EXCEPTION 'Enable QC evidence upload first' USING ERRCODE='55000'; END IF;
  IF NOT p_enabled AND p_key='outreach_templates_enabled' AND COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='atomic_quote_publication_enabled'),false) THEN RAISE EXCEPTION 'Disable atomic quote publication first' USING ERRCODE='55000'; END IF;
  IF NOT p_enabled AND p_key='qc_evidence_upload_enabled' AND EXISTS(SELECT 1 FROM public.platform_settings WHERE key IN ('qc_ai_shadow_enabled','qc_buyer_visibility_enabled') AND value='true') THEN RAISE EXCEPTION 'Disable QC AI shadow and buyer visibility first' USING ERRCODE='55000'; END IF;
  UPDATE public.platform_settings SET value=CASE WHEN p_enabled THEN 'true' ELSE 'false' END,updated_at=now() WHERE key=p_key;
  SELECT md5(p_key)::uuid INTO v_id;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata) VALUES(auth.uid(),'platform_settings',v_id,'update','Updated human-loop rollout flag',jsonb_build_object('key',p_key,'enabled',p_enabled));
  RETURN public.intools_get_human_loop_feature_flags();
END; $$;

-- Called once by an admin after the separate Vercel worker is deployed. Values
-- are encrypted in Vault; the cron command resolves them only at execution.
CREATE OR REPLACE FUNCTION public.intools_configure_qc_worker_schedule(p_worker_url text,p_bearer_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing uuid; v_job_id bigint;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_worker_url !~ '^https://[A-Za-z0-9.-]+/run$' OR char_length(p_bearer_secret)<32 THEN RAISE EXCEPTION 'A HTTPS /run URL and strong bearer secret are required' USING ERRCODE='22023'; END IF;
  SELECT id INTO v_existing FROM vault.secrets WHERE name='atelix_qc_worker_url';
  IF v_existing IS NULL THEN PERFORM vault.create_secret(p_worker_url,'atelix_qc_worker_url','Vercel QC worker endpoint'); ELSE PERFORM vault.update_secret(v_existing,p_worker_url,'atelix_qc_worker_url','Vercel QC worker endpoint'); END IF;
  SELECT id INTO v_existing FROM vault.secrets WHERE name='atelix_qc_worker_bearer';
  IF v_existing IS NULL THEN PERFORM vault.create_secret(p_bearer_secret,'atelix_qc_worker_bearer','Vercel QC worker bearer'); ELSE PERFORM vault.update_secret(v_existing,p_bearer_secret,'atelix_qc_worker_bearer','Vercel QC worker bearer'); END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='atelix-qc-worker';
  SELECT cron.schedule('atelix-qc-worker','*/2 * * * *',$job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='atelix_qc_worker_url'),
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='atelix_qc_worker_bearer')),
      body := '{}'::jsonb,
      timeout_milliseconds := 250000
    );
  $job$) INTO v_job_id;
  RETURN jsonb_build_object('scheduled',true,'job_id',v_job_id,'cadence','*/2 * * * *');
END; $$;
REVOKE ALL ON FUNCTION public.intools_configure_qc_worker_schedule(text,text), public.intools_get_human_loop_feature_flags(), public.intools_set_human_loop_feature_flag(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.intools_configure_qc_worker_schedule(text,text), public.intools_get_human_loop_feature_flags(), public.intools_set_human_loop_feature_flag(text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.workspace_get_rfq_production(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid()) THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'quote',(SELECT jsonb_build_object('id',q.id,'unit_price_cents',q.unit_price_cents,'moq',q.moq,'lead_time_days',q.lead_time_days,'selected_at',q.selected_at,'factory_name',f.name,'factory_region',f.region) FROM public.rfq_quotes q JOIN public.factories f ON f.id=q.factory_id WHERE q.id=l.selected_quote_id),
    'lifecycle',jsonb_build_object('state',l.state,'sample_ready_at',l.sample_ready_at,'sample_decision',l.sample_decision,'sample_decided_at',l.sample_decided_at,'updated_at',l.updated_at),
    'invoices',COALESCE((SELECT jsonb_object_agg(pi.phase,jsonb_build_object('id',i.id,'invoice_no',i.invoice_no,'phase',pi.phase,'status',i.status::text,'effective_status',CASE WHEN i.status='sent' AND i.due_date<current_date THEN 'overdue' ELSE i.status::text END,'total_cents',i.total_cents,'balance_cents',i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),'due_date',i.due_date)) FROM public.rfq_phase_invoices pi JOIN public.invoices i ON i.id=pi.invoice_id WHERE pi.rfq_case_id=p_case_id),'{}'::jsonb),
    'order',(SELECT jsonb_build_object('id',o.id,'order_no',o.order_no,'status',o.status::text,'total',o.total,'placed_at',o.placed_at,'production_stage',(SELECT production_stage FROM public.order_fulfillments WHERE order_id=o.id ORDER BY created_at LIMIT 1)) FROM public.orders o WHERE o.rfq_case_id=p_case_id ORDER BY o.created_at DESC LIMIT 1),
    'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'phase',e.phase,'actor_profile_id',e.actor_profile_id,'actor_name',COALESCE(NULLIF(btrim(p.full_name),''),NULLIF(btrim(p.company_name),'')),'note',e.note,'metadata',e.metadata,'created_at',e.created_at) ORDER BY e.created_at,e.id) FROM public.rfq_lifecycle_events e LEFT JOIN public.profiles p ON p.id=e.actor_profile_id WHERE e.rfq_case_id=p_case_id),'[]'::jsonb),
    'production_update',(SELECT jsonb_build_object('id',u.id,'phase',u.phase,'stage',u.stage,'note',u.note,'source',u.source,'received_at',u.received_at,'evidence_count',jsonb_array_length(u.evidence_references),'next_expected_at',u.next_expected_at,'exception_severity',u.exception_severity,'mitigation',u.mitigation,'required_buyer_action',u.required_buyer_action,'revision',u.revision,'published_at',u.published_at) FROM public.rfq_production_updates u WHERE u.rfq_case_id=p_case_id AND u.status='published'),
    'qc_review',(SELECT jsonb_build_object('id',r.id,'version',r.version,'decision',r.decision,'summary',r.buyer_visible_summary,'reviewed_at',r.reviewed_at,'expected_next_update',r.expected_next_update,'assets',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'storage_path',a.storage_path,'original_name',a.original_name,'content_type',a.content_type,'byte_size',a.byte_size,'created_at',a.created_at) ORDER BY a.created_at) FROM public.rfq_qc_assets a WHERE a.id=ANY(r.buyer_visible_asset_ids) AND a.buyer_visible),'[]'::jsonb)) FROM public.rfq_qc_inspections qi JOIN public.rfq_qc_reviews r ON r.id=qi.current_review_id WHERE qi.rfq_case_id=p_case_id AND qi.closed_at IS NULL AND COALESCE((SELECT value='true' FROM public.platform_settings WHERE key='qc_buyer_visibility_enabled'),false) ORDER BY qi.created_at DESC LIMIT 1)
  ) INTO v_result FROM public.rfq_lifecycles l WHERE l.rfq_case_id=p_case_id;
  RETURN COALESCE(v_result,jsonb_build_object('quote',null,'lifecycle',null,'invoices','{}'::jsonb,'order',null,'events','[]'::jsonb,'production_update',null,'qc_review',null));
END; $$;
REVOKE ALL ON FUNCTION public.workspace_get_rfq_production(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workspace_get_rfq_production(uuid) TO authenticated;
