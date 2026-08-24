-- Agentic RFQ copilot. This is deliberately additive: the browser never gets
-- direct write access to agent ledgers, knowledge sources, or RFQ revisions.

ALTER TABLE public.rfq_cases
  ADD COLUMN IF NOT EXISTS agent_revision integer NOT NULL DEFAULT 0
    CHECK (agent_revision >= 0);

-- The conversational endpoint owns the initial buyer and assistant messages.
-- Replacing this existing RPC prevents the original canned pair from being
-- duplicated when a newly-created RFQ starts its first copilot turn.
CREATE OR REPLACE FUNCTION public.create_workspace_rfq(p_title text, p_brief jsonb)
RETURNS public.rfq_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_case public.rfq_cases; v_thread public.athelia_threads;
BEGIN
  IF auth.uid() IS NULL OR char_length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 240 OR jsonb_typeof(p_brief) <> 'object' THEN
    RAISE EXCEPTION 'Invalid RFQ' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.athelia_threads(buyer_profile_id,title,brief)
  VALUES (auth.uid(),btrim(p_title),p_brief) RETURNING * INTO v_thread;
  INSERT INTO public.rfq_cases(buyer_profile_id,thread_id,title,brief,source,last_saved_at)
  VALUES (auth.uid(),v_thread.id,btrim(p_title),p_brief,'workspace',now()) RETURNING * INTO v_case;
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_workspace_rfq(p_case_id uuid, p_title text, p_brief jsonb, p_status text DEFAULT NULL)
RETURNS public.rfq_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_case public.rfq_cases;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(p_brief) <> 'object' OR char_length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft','needs_research','closed') THEN RAISE EXCEPTION 'Invalid RFQ status' USING ERRCODE='22023'; END IF;
  UPDATE public.rfq_cases SET title=btrim(p_title),brief=p_brief,status=COALESCE(p_status,status),submitted_at=CASE WHEN p_status='needs_research' THEN now() ELSE submitted_at END,last_saved_at=now(),updated_at=now(),agent_revision=agent_revision+1 WHERE id=p_case_id RETURNING * INTO v_case;
  RETURN v_case;
END;
$$;

CREATE OR REPLACE VIEW public.atelix_rfq_workspace WITH (security_invoker = true) AS
SELECT id,case_no,title,brief,status,created_at,updated_at,submitted_at,last_saved_at,agent_revision
FROM public.rfq_cases WHERE source='workspace';

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Admin-curated knowledge is private. Objects are immutable versions and are
-- only retrievable through a service-role RPC after publication.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-knowledge', 'agent-knowledge', false, 26214400,
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/markdown','text/plain']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS agent_knowledge_admin_select ON storage.objects;
CREATE POLICY agent_knowledge_admin_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agent-knowledge' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS agent_knowledge_admin_insert ON storage.objects;
CREATE POLICY agent_knowledge_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-knowledge'
    AND (SELECT public.is_admin())
    AND name ~ '^global/(buyer-safe|operator-only)/(rfq|sourcing|operations|payments-orders|policies|support)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  );
DROP POLICY IF EXISTS agent_knowledge_admin_update ON storage.objects;
DROP POLICY IF EXISTS agent_knowledge_admin_delete ON storage.objects;
-- Versioned source objects are immutable: replacement, overwrite, and delete
-- are intentionally unavailable to browser roles. Archive metadata instead.

CREATE TABLE IF NOT EXISTS public.agent_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  visibility text NOT NULL CHECK (visibility IN ('buyer-safe','operator-only')),
  domain text NOT NULL CHECK (domain IN ('rfq','sourcing','operations','payments-orders','policies','support')),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_knowledge_documents_active_idx
  ON public.agent_knowledge_documents(visibility, domain, updated_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.agent_knowledge_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.agent_knowledge_documents(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  storage_path text NOT NULL UNIQUE CHECK (storage_path ~ '^global/(buyer-safe|operator-only)/(rfq|sourcing|operations|payments-orders|policies|support)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'),
  original_name text NOT NULL CHECK (char_length(btrim(original_name)) BETWEEN 1 AND 255),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/markdown','text/plain')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  content_hash text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','processing','ready','published','failed','archived')),
  extraction_error text CHECK (extraction_error IS NULL OR char_length(extraction_error) <= 1000),
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_no),
  CHECK ((status = 'published') = (published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS agent_knowledge_versions_retrieval_idx
  ON public.agent_knowledge_versions(document_id, status, version_no DESC);
CREATE UNIQUE INDEX IF NOT EXISTS agent_knowledge_versions_hash_idx
  ON public.agent_knowledge_versions(document_id, content_hash) WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.agent_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.agent_knowledge_versions(id) ON DELETE CASCADE,
  chunk_no integer NOT NULL CHECK (chunk_no >= 0),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 8000),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  embedding extensions.vector(384),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(version_id, chunk_no)
);
CREATE INDEX IF NOT EXISTS agent_knowledge_chunks_search_idx
  ON public.agent_knowledge_chunks USING gin(search_vector);

ALTER TABLE public.agent_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;
-- No browser policies: authenticated Intools uses the admin RPCs below and
-- buyer retrieval is service-only.

CREATE TABLE IF NOT EXISTS public.agent_rfq_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_message_id uuid NOT NULL,
  buyer_message text NOT NULL CHECK (char_length(btrim(buyer_message)) BETWEEN 1 AND 4000),
  agent_reply text,
  kind text CHECK (kind IN ('answer','clarifying_question','draft_updated','support_handoff','unavailable')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','reserved','settled','unavailable','failed')),
  preset text NOT NULL DEFAULT '@preset/marketplace-copilot',
  resolved_model text,
  provider text,
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  reserved_microusd integer NOT NULL DEFAULT 0 CHECK (reserved_microusd BETWEEN 0 AND 10000),
  budget_month_start date,
  reported_cost_microusd integer CHECK (reported_cost_microusd IS NULL OR reported_cost_microusd >= 0),
  request_evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(request_evidence) = 'array'),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  fallback_reason text CHECK (fallback_reason IS NULL OR char_length(fallback_reason) <= 120),
  saved_patch jsonb,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(profile_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS agent_rfq_turns_case_created_idx ON public.agent_rfq_turns(rfq_case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_rfq_undo_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES public.agent_rfq_turns(id) ON DELETE RESTRICT,
  revision_after integer NOT NULL CHECK (revision_after > 0),
  before_fields jsonb NOT NULL CHECK (jsonb_typeof(before_fields) = 'object'),
  after_fields jsonb NOT NULL CHECK (jsonb_typeof(after_fields) = 'object'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_rfq_monthly_fleet_budgets (
  month_start date PRIMARY KEY,
  active_user_count integer NOT NULL DEFAULT 0 CHECK (active_user_count >= 0),
  settled_microusd bigint NOT NULL DEFAULT 0 CHECK (settled_microusd >= 0),
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  unknown_microusd bigint NOT NULL DEFAULT 0 CHECK (unknown_microusd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.agent_rfq_monthly_user_budgets (
  month_start date NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  paid_calls integer NOT NULL DEFAULT 0 CHECK (paid_calls BETWEEN 0 AND 5),
  settled_microusd integer NOT NULL DEFAULT 0 CHECK (settled_microusd >= 0),
  reserved_microusd integer NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  unknown_microusd integer NOT NULL DEFAULT 0 CHECK (unknown_microusd >= 0),
  PRIMARY KEY(month_start, profile_id)
);

ALTER TABLE public.agent_rfq_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rfq_undo_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rfq_monthly_fleet_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rfq_monthly_user_budgets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.agent_rfq_get_context(p_case_id uuid, p_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_case public.rfq_cases; v_result jsonb;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases WHERE id = p_case_id AND buyer_profile_id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'rfq', jsonb_build_object('id',v_case.id,'title',v_case.title,'brief',v_case.brief,'status',v_case.status,'revision',v_case.agent_revision,'threadId',v_case.thread_id),
    'operation', jsonb_build_object(
      'order', (SELECT jsonb_build_object('id',o.id,'orderNo',o.order_no,'status',o.status,'productionStage',(SELECT f.production_stage FROM public.order_fulfillments f WHERE f.order_id=o.id LIMIT 1)) FROM public.orders o WHERE o.rfq_case_id=v_case.id AND o.buyer_profile_id=p_profile_id ORDER BY o.created_at DESC LIMIT 1),
      'invoice', (SELECT jsonb_build_object('id',i.id,'invoiceNo',i.invoice_no,'status',i.status::text,'totalCents',i.total_cents,'currency',i.currency,'dueDate',i.due_date) FROM public.invoices i WHERE i.rfq_case_id=v_case.id AND i.buyer_profile_id=p_profile_id ORDER BY i.created_at DESC LIMIT 1)
    ),
    'recentTurns', COALESCE((SELECT jsonb_agg(jsonb_build_object('role','buyer','content',t.buyer_message,'createdAt',t.created_at) ORDER BY t.created_at DESC) FROM (SELECT * FROM public.agent_rfq_turns WHERE rfq_case_id=v_case.id AND profile_id=p_profile_id ORDER BY created_at DESC LIMIT 8) t),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_rfq_retrieve_knowledge(p_query text, p_visibility text DEFAULT 'buyer-safe', p_limit integer DEFAULT 6)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('chunkId',q.id,'content',q.content,'documentId',q.document_id,'versionId',q.version_id) ORDER BY q.rank DESC),'[]'::jsonb)
  FROM (
    SELECT c.id,c.content,v.id AS version_id,d.id AS document_id,ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', left(btrim(p_query),1000))) AS rank
    FROM public.agent_knowledge_chunks c
    JOIN public.agent_knowledge_versions v ON v.id=c.version_id AND v.status='published'
    JOIN public.agent_knowledge_documents d ON d.id=v.document_id AND d.archived_at IS NULL
    WHERE d.visibility=p_visibility AND p_visibility IN ('buyer-safe','operator-only')
      AND c.search_vector @@ websearch_to_tsquery('simple', left(btrim(p_query),1000))
    ORDER BY rank DESC,c.id LIMIT LEAST(GREATEST(p_limit,1),6)
  ) q;
$$;

CREATE OR REPLACE FUNCTION public.agent_rfq_reserve_budget(p_profile_id uuid, p_turn_id uuid, p_reservation_microusd integer DEFAULT 10000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_month date:=date_trunc('month', now() AT TIME ZONE 'UTC')::date; v_user public.agent_rfq_monthly_user_budgets; v_fleet public.agent_rfq_monthly_fleet_budgets; v_rows integer:=0;
BEGIN
  IF p_reservation_microusd NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid agent reservation' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_month::text));
  INSERT INTO public.agent_rfq_monthly_fleet_budgets(month_start) VALUES(v_month) ON CONFLICT DO NOTHING;
  SELECT * INTO v_fleet FROM public.agent_rfq_monthly_fleet_budgets WHERE month_start=v_month FOR UPDATE;
  INSERT INTO public.agent_rfq_monthly_user_budgets(month_start,profile_id) VALUES(v_month,p_profile_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    UPDATE public.agent_rfq_monthly_fleet_budgets SET active_user_count=active_user_count+1,updated_at=now() WHERE month_start=v_month RETURNING * INTO v_fleet;
  END IF;
  SELECT * INTO v_user FROM public.agent_rfq_monthly_user_budgets WHERE month_start=v_month AND profile_id=p_profile_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.agent_rfq_turns WHERE id=p_turn_id AND profile_id=p_profile_id AND status='created') THEN
    RAISE EXCEPTION 'Agent turn is not reservable' USING ERRCODE='42501';
  END IF;
  IF v_user.paid_calls >= 5 OR v_user.settled_microusd+v_user.reserved_microusd+v_user.unknown_microusd+p_reservation_microusd > 50000
     OR v_fleet.settled_microusd+v_fleet.reserved_microusd+v_fleet.unknown_microusd+p_reservation_microusd > v_fleet.active_user_count*50000 THEN
    RETURN jsonb_build_object('allowed',false,'remainingTurns',GREATEST(0,5-v_user.paid_calls));
  END IF;
  UPDATE public.agent_rfq_monthly_user_budgets SET paid_calls=paid_calls+1,reserved_microusd=reserved_microusd+p_reservation_microusd WHERE month_start=v_month AND profile_id=p_profile_id;
  UPDATE public.agent_rfq_monthly_fleet_budgets SET reserved_microusd=reserved_microusd+p_reservation_microusd,updated_at=now() WHERE month_start=v_month;
  UPDATE public.agent_rfq_turns SET status='reserved',reserved_microusd=p_reservation_microusd,budget_month_start=v_month WHERE id=p_turn_id;
  RETURN jsonb_build_object('allowed',true,'remainingTurns',GREATEST(0,4-v_user.paid_calls));
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_rfq_settle_budget(p_turn_id uuid, p_reported_cost_microusd integer, p_resolved_model text DEFAULT NULL, p_provider text DEFAULT NULL, p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_turn public.agent_rfq_turns; v_month date; v_settle integer; v_unknown integer;
BEGIN
  SELECT * INTO v_turn FROM public.agent_rfq_turns WHERE id=p_turn_id FOR UPDATE;
  IF NOT FOUND OR v_turn.status <> 'reserved' THEN RETURN; END IF;
  v_month:=v_turn.budget_month_start;
  IF v_month IS NULL THEN RAISE EXCEPTION 'Reserved turn has no budget month' USING ERRCODE='55000'; END IF;
  -- Record the provider's full reported cost. Never hide an over-reservation;
  -- any overspend exhausts subsequent application reservations and is visible
  -- for the provider-side hard-cap alert/release gate.
  v_settle:=CASE WHEN p_reported_cost_microusd IS NULL THEN 0 ELSE GREATEST(p_reported_cost_microusd,0) END;
  v_unknown:=CASE WHEN p_reported_cost_microusd IS NULL THEN v_turn.reserved_microusd ELSE 0 END;
  UPDATE public.agent_rfq_monthly_user_budgets SET reserved_microusd=reserved_microusd-v_turn.reserved_microusd,settled_microusd=settled_microusd+v_settle,unknown_microusd=unknown_microusd+v_unknown WHERE month_start=v_month AND profile_id=v_turn.profile_id;
  UPDATE public.agent_rfq_monthly_fleet_budgets SET reserved_microusd=reserved_microusd-v_turn.reserved_microusd,settled_microusd=settled_microusd+v_settle,unknown_microusd=unknown_microusd+v_unknown,updated_at=now() WHERE month_start=v_month;
  UPDATE public.agent_rfq_turns SET status='settled',reported_cost_microusd=p_reported_cost_microusd,resolved_model=left(p_resolved_model,240),provider=left(p_provider,240),input_tokens=p_input_tokens,output_tokens=p_output_tokens,completed_at=now() WHERE id=p_turn_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_rfq_apply_patch(p_case_id uuid, p_profile_id uuid, p_expected_revision integer, p_patch jsonb, p_turn_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_case public.rfq_cases; v_before jsonb; v_after jsonb; v_bad text; v_undo uuid:=gen_random_uuid(); v_changed text[];
BEGIN
  IF jsonb_typeof(p_patch) <> 'object' OR p_patch='{}'::jsonb THEN RAISE EXCEPTION 'Invalid RFQ patch' USING ERRCODE='22023'; END IF;
  SELECT key INTO v_bad FROM jsonb_object_keys(p_patch) AS keys(key) WHERE key NOT IN ('product','quantity','material','certifications','colors','sizes','budget','timeline') LIMIT 1;
  IF v_bad IS NOT NULL OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) AS entries(key,value) WHERE jsonb_typeof(value)<>'string' OR char_length(value #>> '{}') > 500) THEN RAISE EXCEPTION 'Unsupported RFQ patch' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  IF v_case.status <> 'draft' THEN RAISE EXCEPTION 'Only draft RFQs can be changed' USING ERRCODE='55000'; END IF;
  IF v_case.agent_revision <> p_expected_revision THEN RAISE EXCEPTION 'RFQ was updated elsewhere' USING ERRCODE='40001'; END IF;
  v_before:=CASE WHEN jsonb_typeof(v_case.brief->'fields')='object' THEN v_case.brief->'fields' ELSE v_case.brief END;
  v_after:=v_before || p_patch;
  SELECT array_agg(key ORDER BY key) INTO v_changed FROM jsonb_object_keys(p_patch) AS keys(key) WHERE (v_before->key) IS DISTINCT FROM (v_after->key);
  UPDATE public.rfq_cases SET brief=jsonb_set(v_case.brief,'{fields}',v_after,true),agent_revision=agent_revision+1,last_saved_at=now(),updated_at=now() WHERE id=v_case.id RETURNING * INTO v_case;
  INSERT INTO public.agent_rfq_undo_records(id,rfq_case_id,profile_id,turn_id,revision_after,before_fields,after_fields) VALUES(v_undo,v_case.id,p_profile_id,p_turn_id,v_case.agent_revision,v_before,v_after);
  RETURN jsonb_build_object('savedPatch',p_patch,'changedFields',COALESCE(to_jsonb(v_changed),'[]'::jsonb),'revision',v_case.agent_revision,'undoToken',v_undo);
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_rfq_undo_patch(p_case_id uuid, p_profile_id uuid, p_undo_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_undo public.agent_rfq_undo_records; v_case public.rfq_cases;
BEGIN
  SELECT * INTO v_undo FROM public.agent_rfq_undo_records WHERE id=p_undo_token AND rfq_case_id=p_case_id AND profile_id=p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_undo.used_at IS NOT NULL THEN RAISE EXCEPTION 'Undo is unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'draft' OR v_case.agent_revision <> v_undo.revision_after THEN RAISE EXCEPTION 'Undo is no longer safe' USING ERRCODE='40001'; END IF;
  UPDATE public.rfq_cases SET brief=jsonb_set(v_case.brief,'{fields}',v_undo.before_fields,true),agent_revision=agent_revision+1,last_saved_at=now(),updated_at=now() WHERE id=v_case.id RETURNING * INTO v_case;
  UPDATE public.agent_rfq_undo_records SET used_at=now() WHERE id=v_undo.id;
  RETURN jsonb_build_object('revision',v_case.agent_revision,'restoredFields',v_undo.before_fields);
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_rfq_record_thread_message(p_case_id uuid, p_profile_id uuid, p_role text, p_content text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_thread uuid;
BEGIN
  IF p_role NOT IN ('buyer','agent') OR char_length(btrim(coalesce(p_content,''))) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Invalid agent message' USING ERRCODE='22023'; END IF;
  SELECT thread_id INTO v_thread FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=p_profile_id FOR UPDATE;
  IF v_thread IS NULL THEN
    INSERT INTO public.athelia_threads(buyer_profile_id,title) SELECT buyer_profile_id,title FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=p_profile_id RETURNING id INTO v_thread;
    UPDATE public.rfq_cases SET thread_id=v_thread WHERE id=p_case_id AND buyer_profile_id=p_profile_id;
  END IF;
  IF v_thread IS NULL THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  INSERT INTO public.athelia_thread_messages(thread_id,role,content) VALUES(v_thread,p_role,btrim(p_content));
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_list_agent_knowledge(p_status text DEFAULT NULL, p_visibility text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('documentId',x.document_id,'title',x.title,'visibility',x.visibility,'domain',x.domain,'archivedAt',x.archived_at,'versionId',x.version_id,'versionNo',x.version_no,'storagePath',x.storage_path,'originalName',x.original_name,'contentType',x.content_type,'byteSize',x.byte_size,'status',x.status,'extractionError',x.extraction_error,'publishedAt',x.published_at,'createdAt',x.created_at) ORDER BY x.created_at DESC),'[]'::jsonb)
  INTO v_result
  FROM (SELECT d.id document_id,d.title,d.visibility,d.domain,d.archived_at,v.id version_id,v.version_no,v.storage_path,v.original_name,v.content_type,v.byte_size,v.status,v.extraction_error,v.published_at,v.created_at FROM public.agent_knowledge_documents d LEFT JOIN LATERAL (SELECT av.* FROM public.agent_knowledge_versions av WHERE av.document_id=d.id ORDER BY av.version_no DESC LIMIT 1) v ON true WHERE (p_status IS NULL OR v.status=p_status) AND (p_visibility IS NULL OR d.visibility=p_visibility)) x;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_create_agent_knowledge_version(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.agent_knowledge_documents; v_version public.agent_knowledge_versions; v_doc_id uuid; v_version_id uuid:=gen_random_uuid(); v_name text; v_type text; v_size bigint; v_no integer;
BEGIN
  PERFORM public.intools_require_admin();
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Invalid knowledge payload' USING ERRCODE='22023'; END IF;
  v_doc_id:=NULLIF(p_payload->>'documentId','')::uuid;
  IF v_doc_id IS NULL THEN
    INSERT INTO public.agent_knowledge_documents(title,visibility,domain,created_by) VALUES (btrim(p_payload->>'title'),p_payload->>'visibility',p_payload->>'domain',auth.uid()) RETURNING * INTO v_doc;
  ELSE
    SELECT * INTO v_doc FROM public.agent_knowledge_documents WHERE id=v_doc_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge document not found' USING ERRCODE='42501'; END IF;
    IF (p_payload ? 'visibility' AND p_payload->>'visibility'<>v_doc.visibility) OR (p_payload ? 'domain' AND p_payload->>'domain'<>v_doc.domain) THEN RAISE EXCEPTION 'Document classification is immutable' USING ERRCODE='22023'; END IF;
  END IF;
  v_name:=regexp_replace(coalesce(p_payload->>'originalName',''),'[^A-Za-z0-9._-]','_','g'); v_type:=p_payload->>'contentType'; v_size:=NULLIF(p_payload->>'byteSize','')::bigint;
  IF char_length(v_name) NOT BETWEEN 1 AND 255 OR v_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/markdown','text/plain') OR v_size NOT BETWEEN 1 AND 26214400 THEN RAISE EXCEPTION 'Invalid knowledge file metadata' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(max(version_no),0)+1 INTO v_no FROM public.agent_knowledge_versions WHERE document_id=v_doc.id;
  INSERT INTO public.agent_knowledge_versions(id,document_id,version_no,storage_path,original_name,content_type,byte_size,content_hash,created_by) VALUES(v_version_id,v_doc.id,v_no,'global/'||v_doc.visibility||'/'||v_doc.domain||'/'||v_doc.id||'/'||v_version_id||'/'||v_name,v_name,v_type,v_size,NULLIF(p_payload->>'contentHash',''),auth.uid()) RETURNING * INTO v_version;
  RETURN jsonb_build_object('documentId',v_doc.id,'versionId',v_version.id,'storagePath',v_version.storage_path,'status',v_version.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_mark_agent_knowledge_version_ready(p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_version public.agent_knowledge_versions;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT v.* INTO v_version FROM public.agent_knowledge_versions v WHERE v.id=p_version_id FOR UPDATE;
  IF NOT FOUND OR v_version.status NOT IN ('processing','failed') OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='agent-knowledge' AND o.name=v_version.storage_path) OR NOT EXISTS(SELECT 1 FROM public.agent_knowledge_chunks c WHERE c.version_id=v_version.id) THEN RAISE EXCEPTION 'Extracted knowledge chunks are required' USING ERRCODE='55000'; END IF;
  UPDATE public.agent_knowledge_versions SET status='ready',extraction_error=NULL,updated_at=now() WHERE id=v_version.id;
  RETURN jsonb_build_object('versionId',p_version_id,'status','ready');
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_publish_agent_knowledge_version(p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_version public.agent_knowledge_versions;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_version FROM public.agent_knowledge_versions WHERE id=p_version_id FOR UPDATE;
  IF NOT FOUND OR v_version.status <> 'ready' THEN RAISE EXCEPTION 'Only ready knowledge can be published' USING ERRCODE='55000'; END IF;
  UPDATE public.agent_knowledge_versions SET status='archived',published_at=NULL,updated_at=now() WHERE document_id=v_version.document_id AND status='published';
  UPDATE public.agent_knowledge_versions SET status='published',published_at=now(),updated_at=now() WHERE id=v_version.id;
  RETURN jsonb_build_object('versionId',v_version.id,'status','published');
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_archive_agent_knowledge_document(p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.intools_require_admin();
  UPDATE public.agent_knowledge_documents SET archived_at=COALESCE(archived_at,now()),updated_at=now() WHERE id=p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge document not found' USING ERRCODE='42501'; END IF;
  UPDATE public.agent_knowledge_versions SET status='archived',published_at=NULL,updated_at=now() WHERE document_id=p_document_id AND status <> 'archived';
END;
$$;

REVOKE ALL ON TABLE public.agent_knowledge_documents,public.agent_knowledge_versions,public.agent_knowledge_chunks,public.agent_rfq_turns,public.agent_rfq_undo_records,public.agent_rfq_monthly_fleet_budgets,public.agent_rfq_monthly_user_budgets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_rfq_get_context(uuid,uuid),public.agent_rfq_retrieve_knowledge(text,text,integer),public.agent_rfq_reserve_budget(uuid,uuid,integer),public.agent_rfq_settle_budget(uuid,integer,text,text,integer,integer),public.agent_rfq_apply_patch(uuid,uuid,integer,jsonb,uuid),public.agent_rfq_undo_patch(uuid,uuid,uuid),public.agent_rfq_record_thread_message(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rfq_get_context(uuid,uuid),public.agent_rfq_retrieve_knowledge(text,text,integer),public.agent_rfq_reserve_budget(uuid,uuid,integer),public.agent_rfq_settle_budget(uuid,integer,text,text,integer,integer),public.agent_rfq_apply_patch(uuid,uuid,integer,jsonb,uuid),public.agent_rfq_undo_patch(uuid,uuid,uuid),public.agent_rfq_record_thread_message(uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.intools_list_agent_knowledge(text,text),public.intools_create_agent_knowledge_version(jsonb),public.intools_mark_agent_knowledge_version_ready(uuid),public.intools_publish_agent_knowledge_version(uuid),public.intools_archive_agent_knowledge_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_list_agent_knowledge(text,text),public.intools_create_agent_knowledge_version(jsonb),public.intools_mark_agent_knowledge_version_ready(uuid),public.intools_publish_agent_knowledge_version(uuid),public.intools_archive_agent_knowledge_document(uuid) TO authenticated;
