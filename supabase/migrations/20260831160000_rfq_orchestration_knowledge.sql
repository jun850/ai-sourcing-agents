-- Prompt-engineering support for category-aware RFQs. Existing knowledge and
-- historical intake values remain valid; this only adds metadata and guards.
ALTER TABLE public.agent_knowledge_documents
  ADD COLUMN IF NOT EXISTS applies_to jsonb NOT NULL DEFAULT '{"categories":[],"procurementModes":[]}'::jsonb
  CHECK (jsonb_typeof(applies_to) = 'object'
    AND jsonb_typeof(COALESCE(applies_to->'categories','[]'::jsonb)) = 'array'
    AND jsonb_typeof(COALESCE(applies_to->'procurementModes','[]'::jsonb)) = 'array');

DROP FUNCTION IF EXISTS public.agent_rfq_retrieve_knowledge(text,text,integer);
CREATE OR REPLACE FUNCTION public.agent_rfq_retrieve_knowledge(
  p_query text,
  p_visibility text DEFAULT 'buyer-safe',
  p_limit integer DEFAULT 6,
  p_category text DEFAULT NULL,
  p_procurement_mode text DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('chunkId',q.id,'content',q.content,'documentId',q.document_id,'versionId',q.version_id) ORDER BY q.rank DESC),'[]'::jsonb)
  FROM (
    SELECT c.id,c.content,v.id AS version_id,d.id AS document_id,
      ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', left(btrim(p_query),1000))) AS rank
    FROM public.agent_knowledge_chunks c
    JOIN public.agent_knowledge_versions v ON v.id=c.version_id AND v.status='published'
    JOIN public.agent_knowledge_documents d ON d.id=v.document_id AND d.archived_at IS NULL
    WHERE d.visibility=p_visibility AND p_visibility='buyer-safe'
      AND (COALESCE(d.applies_to->'categories','[]'::jsonb)='[]'::jsonb OR COALESCE(d.applies_to->'categories','[]'::jsonb) ? p_category)
      AND (COALESCE(d.applies_to->'procurementModes','[]'::jsonb)='[]'::jsonb OR COALESCE(d.applies_to->'procurementModes','[]'::jsonb) ? p_procurement_mode)
      AND c.search_vector @@ websearch_to_tsquery('simple', left(btrim(p_query),1000))
    ORDER BY rank DESC,c.id LIMIT LEAST(GREATEST(p_limit,1),6)
  ) q;
$$;

CREATE OR REPLACE FUNCTION public.intools_list_agent_knowledge(p_status text DEFAULT NULL, p_visibility text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('documentId',x.document_id,'title',x.title,'visibility',x.visibility,'domain',x.domain,'appliesTo',x.applies_to,'archivedAt',x.archived_at,'versionId',x.version_id,'versionNo',x.version_no,'storagePath',x.storage_path,'originalName',x.original_name,'contentType',x.content_type,'byteSize',x.byte_size,'status',x.status,'extractionError',x.extraction_error,'publishedAt',x.published_at,'createdAt',x.created_at) ORDER BY x.created_at DESC),'[]'::jsonb)
  INTO v_result
  FROM (SELECT d.id document_id,d.title,d.visibility,d.domain,d.applies_to,d.archived_at,v.id version_id,v.version_no,v.storage_path,v.original_name,v.content_type,v.byte_size,v.status,v.extraction_error,v.published_at,v.created_at FROM public.agent_knowledge_documents d LEFT JOIN LATERAL (SELECT av.* FROM public.agent_knowledge_versions av WHERE av.document_id=d.id ORDER BY av.version_no DESC LIMIT 1) v ON true WHERE (p_status IS NULL OR v.status=p_status) AND (p_visibility IS NULL OR d.visibility=p_visibility)) x;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_create_agent_knowledge_version(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.agent_knowledge_documents; v_version public.agent_knowledge_versions; v_doc_id uuid; v_version_id uuid:=gen_random_uuid(); v_name text; v_type text; v_size bigint; v_no integer; v_applies jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Invalid knowledge payload' USING ERRCODE='22023'; END IF;
  v_applies:=COALESCE(p_payload->'appliesTo','{"categories":[],"procurementModes":[]}'::jsonb);
  IF jsonb_typeof(v_applies)<>'object' OR jsonb_typeof(COALESCE(v_applies->'categories','[]'::jsonb))<>'array' OR jsonb_typeof(COALESCE(v_applies->'procurementModes','[]'::jsonb))<>'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_applies->'categories','[]'::jsonb)) value WHERE value NOT IN ('apparel','footwear','bags_accessories','jewelry','beauty_personal_care','home_textiles','fibre_yarn','fabric','leather','interlining','trims_labels','packaging','other')) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_applies->'procurementModes','[]'::jsonb)) value WHERE value NOT IN ('wholesale','blank','private_label','white_label','oem','odm','cmt')) THEN RAISE EXCEPTION 'Invalid knowledge applicability' USING ERRCODE='22023'; END IF;
  v_doc_id:=NULLIF(p_payload->>'documentId','')::uuid;
  IF v_doc_id IS NULL THEN
    INSERT INTO public.agent_knowledge_documents(title,visibility,domain,applies_to,created_by) VALUES (btrim(p_payload->>'title'),p_payload->>'visibility',p_payload->>'domain',v_applies,auth.uid()) RETURNING * INTO v_doc;
  ELSE
    SELECT * INTO v_doc FROM public.agent_knowledge_documents WHERE id=v_doc_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge document not found' USING ERRCODE='42501'; END IF;
    IF (p_payload ? 'visibility' AND p_payload->>'visibility'<>v_doc.visibility) OR (p_payload ? 'domain' AND p_payload->>'domain'<>v_doc.domain) OR v_applies<>v_doc.applies_to THEN RAISE EXCEPTION 'Document classification is immutable' USING ERRCODE='22023'; END IF;
  END IF;
  v_name:=regexp_replace(coalesce(p_payload->>'originalName',''),'[^A-Za-z0-9._-]','_','g'); v_type:=p_payload->>'contentType'; v_size:=NULLIF(p_payload->>'byteSize','')::bigint;
  IF char_length(v_name) NOT BETWEEN 1 AND 255 OR v_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/markdown','text/plain') OR v_size NOT BETWEEN 1 AND 26214400 THEN RAISE EXCEPTION 'Invalid knowledge file metadata' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(max(version_no),0)+1 INTO v_no FROM public.agent_knowledge_versions WHERE document_id=v_doc.id;
  INSERT INTO public.agent_knowledge_versions(id,document_id,version_no,storage_path,original_name,content_type,byte_size,content_hash,created_by) VALUES(v_version_id,v_doc.id,v_no,'global/'||v_doc.visibility||'/'||v_doc.domain||'/'||v_doc.id||'/'||v_version_id||'/'||v_name,v_name,v_type,v_size,NULLIF(p_payload->>'contentHash',''),auth.uid()) RETURNING * INTO v_version;
  RETURN jsonb_build_object('documentId',v_doc.id,'versionId',v_version.id,'storagePath',v_version.storage_path,'status',v_version.status);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_rfq_retrieve_knowledge(text,text,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rfq_retrieve_knowledge(text,text,integer,text,text) TO service_role;
