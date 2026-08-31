-- Reference-derived content is private to the RFQ owner and Atelix. It is
-- stored separately from the buyer's own prompt so Operations can distinguish
-- visual/OCR evidence from buyer-confirmed requirements.
ALTER TABLE public.rfq_attachments
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','processing','ready','failed')),
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extraction_error text
    CHECK (extraction_error IS NULL OR char_length(extraction_error) <= 1000),
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

CREATE INDEX IF NOT EXISTS rfq_attachments_extraction_pending_idx
  ON public.rfq_attachments(rfq_case_id, extraction_status, created_at)
  WHERE extraction_status IN ('pending', 'processing');
