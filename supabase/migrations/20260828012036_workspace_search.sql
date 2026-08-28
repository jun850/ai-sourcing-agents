-- Workspace command-palette search. The signed-in buyer searches only their own
-- RFQ cases and invoices; results are navigational metadata (reference, title,
-- status) and never expose supplier, quote, or payment facts. Owner scoping is
-- explicit here and also enforced by RLS on both base tables.
CREATE OR REPLACE FUNCTION public.workspace_search(p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE (
  kind text,
  id uuid,
  ref text,
  title text,
  status text,
  updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_term text := btrim(COALESCE(p_query, ''));
  v_limit integer := least(greatest(COALESCE(p_limit, 8), 1), 25);
  v_pattern text;
BEGIN
  IF v_term = '' THEN
    RETURN;
  END IF;
  v_pattern := '%' || v_term || '%';

  RETURN QUERY
  SELECT hits.kind, hits.id, hits.ref, hits.title, hits.status, hits.updated_at
  FROM (
    SELECT 'rfq'::text AS kind, c.id, c.case_no AS ref, c.title,
           c.status::text AS status, c.updated_at
    FROM public.rfq_cases c
    WHERE c.buyer_profile_id = auth.uid()
      AND c.source = 'workspace'
      AND (c.title ILIKE v_pattern OR c.case_no ILIKE v_pattern)
    UNION ALL
    SELECT 'invoice'::text AS kind, i.id, i.invoice_no AS ref,
           COALESCE(r.title, i.invoice_no) AS title,
           i.status::text AS status, i.updated_at
    FROM public.invoices i
    LEFT JOIN public.rfq_cases r ON r.id = i.rfq_case_id
    WHERE i.buyer_profile_id = auth.uid()
      AND (i.invoice_no ILIKE v_pattern OR r.title ILIKE v_pattern)
  ) hits
  ORDER BY hits.updated_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_search(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_search(text, integer) TO authenticated;
