-- Bulk knowledge sources remain immutable and private, while ingestion gains
-- source types that can be converted to searchable text server-side.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/markdown',
  'text/plain'
]
WHERE id = 'agent-knowledge';

ALTER TABLE public.agent_knowledge_versions
  DROP CONSTRAINT IF EXISTS agent_knowledge_versions_content_type_check;
ALTER TABLE public.agent_knowledge_versions
  ADD CONSTRAINT agent_knowledge_versions_content_type_check CHECK (content_type IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv','text/markdown','text/plain'
  ));

CREATE OR REPLACE FUNCTION public.intools_create_agent_knowledge_version(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.agent_knowledge_documents; v_version public.agent_knowledge_versions; v_doc_id uuid; v_version_id uuid:=gen_random_uuid(); v_name text; v_type text; v_size bigint; v_no integer; v_applies jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Invalid knowledge payload' USING ERRCODE='22023'; END IF;
  v_applies:=COALESCE(p_payload->'appliesTo','{"categories":[],"procurementModes":[]}'::jsonb);
  IF jsonb_typeof(v_applies)<>'object' OR jsonb_typeof(COALESCE(v_applies->'categories','[]'::jsonb))<>'array' OR jsonb_typeof(COALESCE(v_applies->'procurementModes','[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Invalid knowledge applicability' USING ERRCODE='22023'; END IF;
  v_doc_id:=NULLIF(p_payload->>'documentId','')::uuid;
  IF v_doc_id IS NULL THEN
    INSERT INTO public.agent_knowledge_documents(title,visibility,domain,applies_to,created_by) VALUES (btrim(p_payload->>'title'),p_payload->>'visibility',p_payload->>'domain',v_applies,auth.uid()) RETURNING * INTO v_doc;
  ELSE
    SELECT * INTO v_doc FROM public.agent_knowledge_documents WHERE id=v_doc_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge document not found' USING ERRCODE='42501'; END IF;
    IF (p_payload ? 'visibility' AND p_payload->>'visibility'<>v_doc.visibility) OR (p_payload ? 'domain' AND p_payload->>'domain'<>v_doc.domain) OR v_applies<>v_doc.applies_to THEN RAISE EXCEPTION 'Document classification is immutable' USING ERRCODE='22023'; END IF;
  END IF;
  v_name:=regexp_replace(coalesce(p_payload->>'originalName',''),'[^A-Za-z0-9._-]','_','g'); v_type:=p_payload->>'contentType'; v_size:=NULLIF(p_payload->>'byteSize','')::bigint;
  IF char_length(v_name) NOT BETWEEN 1 AND 255 OR v_type NOT IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/markdown','text/plain') OR v_size NOT BETWEEN 1 AND 26214400 THEN RAISE EXCEPTION 'Invalid knowledge file metadata' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(max(version_no),0)+1 INTO v_no FROM public.agent_knowledge_versions WHERE document_id=v_doc.id;
  INSERT INTO public.agent_knowledge_versions(id,document_id,version_no,storage_path,original_name,content_type,byte_size,content_hash,created_by) VALUES(v_version_id,v_doc.id,v_no,'global/'||v_doc.visibility||'/'||v_doc.domain||'/'||v_doc.id||'/'||v_version_id||'/'||v_name,v_name,v_type,v_size,NULLIF(p_payload->>'contentHash',''),auth.uid()) RETURNING * INTO v_version;
  RETURN jsonb_build_object('documentId',v_doc.id,'versionId',v_version.id,'storagePath',v_version.storage_path,'status',v_version.status);
END;
$$;
