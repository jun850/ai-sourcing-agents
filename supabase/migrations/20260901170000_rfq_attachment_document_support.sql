-- Extend the existing private RFQ reference path. Rows, RLS, immutable object
-- paths, and the existing 25 MB limit are unchanged.
ALTER TABLE public.rfq_attachments
  DROP CONSTRAINT IF EXISTS rfq_attachments_content_type_check;
ALTER TABLE public.rfq_attachments
  ADD CONSTRAINT rfq_attachments_content_type_check CHECK (content_type IN (
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'application/json', 'text/markdown'
  ));

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'application/json', 'text/markdown'
]
WHERE id = 'rfq-attachments';

ALTER TABLE public.rfq_reference_extraction_runs
  ADD COLUMN IF NOT EXISTS resolved_model text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS reported_cost numeric,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parser_engine text,
  ADD COLUMN IF NOT EXISTS fallback_reason text;
