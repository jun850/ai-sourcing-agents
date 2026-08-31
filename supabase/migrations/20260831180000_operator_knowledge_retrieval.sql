-- Operator-only knowledge is curated internal guidance for the service-role
-- RFQ agent. It remains unavailable to browser roles and is never returned
-- by a client-facing RPC.
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
    WHERE d.visibility=p_visibility AND p_visibility IN ('buyer-safe','operator-only')
      AND (COALESCE(d.applies_to->'categories','[]'::jsonb)='[]'::jsonb OR COALESCE(d.applies_to->'categories','[]'::jsonb) ? p_category)
      AND (COALESCE(d.applies_to->'procurementModes','[]'::jsonb)='[]'::jsonb OR COALESCE(d.applies_to->'procurementModes','[]'::jsonb) ? p_procurement_mode)
      AND c.search_vector @@ websearch_to_tsquery('simple', left(btrim(p_query),1000))
    ORDER BY rank DESC,c.id LIMIT LEAST(GREATEST(p_limit,1),6)
  ) q;
$$;

REVOKE ALL ON FUNCTION public.agent_rfq_retrieve_knowledge(text,text,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rfq_retrieve_knowledge(text,text,integer,text,text) TO service_role;
