-- A sent timestamp is retained as immutable history after settlement or cancellation.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_check1;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_sent_timestamp_state_check
  CHECK (status NOT IN ('sent', 'paid') OR sent_at IS NOT NULL);
