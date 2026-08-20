-- Athelia transcript attachments (catalogue cards and RFQ drafts) belong to
-- their originating chat turn, so a signed-in buyer sees the same history
-- after refreshing or reopening a sourcing chat.
ALTER TABLE public.athelia_thread_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(metadata) = 'object');
