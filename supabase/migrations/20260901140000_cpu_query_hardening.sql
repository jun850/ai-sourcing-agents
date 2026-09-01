-- Current operational read paths only. The public catalogue RPCs that caused
-- the historic temp-file spills were retired in 20260823150000, so do not add
-- indexes for their dropped tables/functions.

-- The notification center performs this exact full-text predicate whenever a
-- user searches their notifications. Without an expression index PostgreSQL
-- tokenizes every candidate row on each request.
CREATE INDEX IF NOT EXISTS notifications_search_idx
  ON public.notifications
  USING gin (to_tsvector('simple', title || ' ' || body));

-- Analytics is admin-only, but its date-bounded aggregates should not scan
-- the full operational history as the workspace grows.
CREATE INDEX IF NOT EXISTS rfq_cases_workspace_created_idx
  ON public.rfq_cases (created_at)
  WHERE source = 'workspace';

CREATE INDEX IF NOT EXISTS rfq_quotes_reportable_created_idx
  ON public.rfq_quotes (created_at, rfq_case_id)
  INCLUDE (quote_total_cents)
  WHERE status IN ('published', 'selected');

CREATE INDEX IF NOT EXISTS invoices_reportable_created_idx
  ON public.invoices (created_at)
  INCLUDE (total_cents)
  WHERE status <> 'cancelled';

-- The analytics exclusion checks the status of orders attached to an RFQ.
-- This covers that lookup without widening the existing RFQ lookup index.
CREATE INDEX IF NOT EXISTS orders_rfq_case_status_idx
  ON public.orders (rfq_case_id, status)
  WHERE rfq_case_id IS NOT NULL;
