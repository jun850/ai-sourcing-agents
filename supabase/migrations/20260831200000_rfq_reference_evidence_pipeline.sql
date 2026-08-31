-- Versioned, owner-scoped reference evidence. Buyer text stays in rfq_cases;
-- OCR, model extraction, chunks, and BOM candidates remain auditable here.
CREATE TABLE IF NOT EXISTS public.rfq_reference_extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_attachment_id uuid NOT NULL REFERENCES public.rfq_attachments(id) ON DELETE CASCADE,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('processing','ready','failed')),
  extractor_model text,
  embedding_model text,
  source_hash text,
  error text CHECK (error IS NULL OR char_length(error) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS rfq_reference_runs_attachment_idx ON public.rfq_reference_extraction_runs(rfq_attachment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rfq_reference_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_run_id uuid NOT NULL REFERENCES public.rfq_reference_extraction_runs(id) ON DELETE CASCADE,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES public.rfq_attachments(id) ON DELETE CASCADE,
  chunk_no integer NOT NULL CHECK (chunk_no >= 0),
  page_no integer,
  section text,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 8000),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  embedding extensions.vector(384),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(extraction_run_id, chunk_no)
);
CREATE INDEX IF NOT EXISTS rfq_reference_chunks_case_search_idx ON public.rfq_reference_chunks USING gin(search_vector);
CREATE INDEX IF NOT EXISTS rfq_reference_chunks_case_embedding_idx ON public.rfq_reference_chunks USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 40) WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rfq_reference_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_run_id uuid NOT NULL REFERENCES public.rfq_reference_extraction_runs(id) ON DELETE CASCADE,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_key text NOT NULL CHECK (field_key IN ('product','quantity','material','certifications','colors','sizes','budget','timeline','construction','weight','width','dimensions','finish','branding','packaging','care','stage','tech_pack')),
  value text NOT NULL CHECK (char_length(btrim(value)) BETWEEN 1 AND 500),
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  source_chunk_id uuid REFERENCES public.rfq_reference_chunks(id) ON DELETE SET NULL,
  source_page integer,
  source_excerpt text NOT NULL CHECK (char_length(btrim(source_excerpt)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_reference_facts_case_idx ON public.rfq_reference_facts(rfq_case_id, field_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rfq_reference_bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_run_id uuid NOT NULL REFERENCES public.rfq_reference_extraction_runs(id) ON DELETE CASCADE,
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  component text NOT NULL CHECK (char_length(btrim(component)) BETWEEN 1 AND 300),
  specification text,
  color_finish text,
  placement text,
  quantity_unit text,
  source_page integer,
  source_excerpt text NOT NULL CHECK (char_length(btrim(source_excerpt)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_reference_bom_case_idx ON public.rfq_reference_bom_lines(rfq_case_id, created_at DESC);

ALTER TABLE public.rfq_reference_extraction_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_reference_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_reference_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_reference_bom_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.agent_rfq_retrieve_reference(
  p_case_id uuid,
  p_profile_id uuid,
  p_query text,
  p_embedding extensions.vector(384),
  p_limit integer DEFAULT 8
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=p_profile_id) THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('chunkId',id,'attachmentId',attachment_id,'page',page_no,'section',section,'content',content,'score',score) ORDER BY score DESC)
    FROM (
      SELECT c.*, (0.72 * (1 - (c.embedding OPERATOR(extensions.<=>) p_embedding)) + 0.28 * ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', left(btrim(p_query),1000)))) AS score
      FROM public.rfq_reference_chunks c
      WHERE c.rfq_case_id=p_case_id AND c.owner_profile_id=p_profile_id
        AND (c.embedding IS NOT NULL OR c.search_vector @@ websearch_to_tsquery('simple', left(btrim(p_query),1000)))
      ORDER BY score DESC NULLS LAST, c.created_at DESC
      LIMIT LEAST(GREATEST(p_limit,1),8)
    ) ranked), '[]'::jsonb);
END;
$$;

REVOKE ALL ON TABLE public.rfq_reference_extraction_runs, public.rfq_reference_chunks, public.rfq_reference_facts, public.rfq_reference_bom_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_rfq_retrieve_reference(uuid,uuid,text,extensions.vector,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rfq_retrieve_reference(uuid,uuid,text,extensions.vector,integer) TO service_role;

-- Published Knowledge Center documents can be retrieved semantically when
-- embeddings are available, with lexical retrieval as a graceful fallback
-- for existing or text-only chunks.
CREATE INDEX IF NOT EXISTS agent_knowledge_chunks_embedding_idx
  ON public.agent_knowledge_chunks USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 40) WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.agent_rfq_retrieve_knowledge_hybrid(
  p_query text,
  p_visibility text DEFAULT 'buyer-safe',
  p_limit integer DEFAULT 6,
  p_category text DEFAULT NULL,
  p_procurement_mode text DEFAULT NULL,
  p_embedding extensions.vector(384) DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('chunkId',q.id,'content',q.content,'documentId',q.document_id,'versionId',q.version_id,'score',q.score) ORDER BY q.score DESC),'[]'::jsonb)
  FROM (
    SELECT c.id,c.content,v.id AS version_id,d.id AS document_id,
      CASE WHEN p_embedding IS NULL THEN ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', left(btrim(p_query),1000)))
        ELSE (0.72 * (1 - (c.embedding OPERATOR(extensions.<=>) p_embedding)) + 0.28 * ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', left(btrim(p_query),1000)))) END AS score
    FROM public.agent_knowledge_chunks c
    JOIN public.agent_knowledge_versions v ON v.id=c.version_id AND v.status='published'
    JOIN public.agent_knowledge_documents d ON d.id=v.document_id AND d.archived_at IS NULL
    WHERE d.visibility=p_visibility AND p_visibility IN ('buyer-safe','operator-only')
      AND (COALESCE(d.applies_to->'categories','[]'::jsonb)='[]'::jsonb OR COALESCE(d.applies_to->'categories','[]'::jsonb) ? p_category)
      AND (COALESCE(d.applies_to->'procurementModes','[]'::jsonb)='[]'::jsonb OR COALESCE(d.applies_to->'procurementModes','[]'::jsonb) ? p_procurement_mode)
      AND (c.embedding IS NOT NULL OR c.search_vector @@ websearch_to_tsquery('simple', left(btrim(p_query),1000)))
    ORDER BY score DESC NULLS LAST,c.id LIMIT LEAST(GREATEST(p_limit,1),6)
  ) q;
$$;
REVOKE ALL ON FUNCTION public.agent_rfq_retrieve_knowledge_hybrid(text,text,integer,text,text,extensions.vector) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rfq_retrieve_knowledge_hybrid(text,text,integer,text,text,extensions.vector) TO service_role;
