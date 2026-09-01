-- AI-assisted supplier routing engine: audit ledger, Algolia sync queue, and
-- the RFQ-submission routing job queue. All additive. Deterministic eligibility
-- stays server-authoritative; these tables only record and schedule work.

-- 1. Per-run audit ledger (mirrors rfq_reference_extraction_runs). Every routing
--    generation writes one row: engine used, retrieval source, model metadata,
--    token/cost/latency, candidate counts, and the derived routing signals.
CREATE TABLE IF NOT EXISTS public.rfq_routing_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id            uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  mode                   text NOT NULL CHECK (mode IN ('ensure','refresh')),
  engine                 text NOT NULL CHECK (engine IN ('ai','deterministic','hard_fallback')),
  retrieval_source       text NOT NULL DEFAULT 'sql_fallback' CHECK (retrieval_source IN ('algolia','sql_fallback')),
  provider               text,
  model                  text,
  input_tokens           integer,
  output_tokens          integer,
  reported_cost          numeric(10,6),
  latency_ms             integer,
  candidate_count        integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  returned_count         integer NOT NULL DEFAULT 0 CHECK (returned_count >= 0),
  fallback_reason        text CHECK (fallback_reason IS NULL OR char_length(fallback_reason) <= 200),
  routing_engine_version integer NOT NULL DEFAULT 1 CHECK (routing_engine_version > 0),
  policy_version         integer,
  prompt_hash            text CHECK (prompt_hash IS NULL OR char_length(prompt_hash) <= 80),
  signals                jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(signals) = 'object'),
  created_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rfq_routing_runs_case_idx ON public.rfq_routing_runs(rfq_case_id, created_at DESC);
ALTER TABLE public.rfq_routing_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rfq_routing_runs_admin_all ON public.rfq_routing_runs;
CREATE POLICY rfq_routing_runs_admin_all ON public.rfq_routing_runs FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
REVOKE ALL ON public.rfq_routing_runs FROM PUBLIC, anon;

-- 2. Algolia supplier-index sync queue. A trigger on public.factories enqueues
--    an upsert when a row is/became eligible and a delete when it left the
--    eligible set (or was removed). Drained in bounded batches by the
--    algolia-supplier-sync edge function.
CREATE TABLE IF NOT EXISTS public.supplier_search_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id    uuid NOT NULL,
  op            text NOT NULL CHECK (op IN ('upsert','delete')),
  enqueued_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  attempts      integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error    text CHECK (last_error IS NULL OR char_length(last_error) <= 1000)
);
CREATE INDEX IF NOT EXISTS supplier_search_outbox_pending_idx
  ON public.supplier_search_outbox(enqueued_at) WHERE processed_at IS NULL;
ALTER TABLE public.supplier_search_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_search_outbox FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_supplier_search_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op text; v_factory uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_factory := OLD.id; v_op := 'delete';
  ELSE
    v_factory := NEW.id;
    v_op := CASE WHEN public.broker_factory_is_eligible(NEW, '{}'::jsonb) THEN 'upsert' ELSE 'delete' END;
  END IF;
  INSERT INTO public.supplier_search_outbox(factory_id, op) VALUES (v_factory, v_op);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS enqueue_supplier_search_sync_after_write ON public.factories;
CREATE TRIGGER enqueue_supplier_search_sync_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.factories
FOR EACH ROW EXECUTE FUNCTION public.enqueue_supplier_search_sync();

-- 3. RFQ-submission routing job queue. When an RFQ transitions to
--    'needs_research' a job is enqueued so matches can be pre-warmed before an
--    operator opens the drawer. The lazy 'ensure' path on drawer open is the
--    backstop when no scheduler drains this queue.
CREATE TABLE IF NOT EXISTS public.rfq_routing_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id   uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  enqueued_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  attempts      integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claim_token   uuid,
  claim_expires_at timestamptz,
  last_error    text CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  UNIQUE (rfq_case_id)
);
CREATE INDEX IF NOT EXISTS rfq_routing_jobs_pending_idx
  ON public.rfq_routing_jobs(enqueued_at) WHERE processed_at IS NULL;
ALTER TABLE public.rfq_routing_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfq_routing_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_rfq_routing_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status = 'needs_research' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.rfq_routing_jobs(rfq_case_id) VALUES (NEW.id)
    ON CONFLICT (rfq_case_id) DO UPDATE SET
      processed_at = NULL, attempts = 0, claim_token = NULL, claim_expires_at = NULL,
      last_error = NULL, enqueued_at = now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enqueue_rfq_routing_job_after_write ON public.rfq_cases;
CREATE TRIGGER enqueue_rfq_routing_job_after_write
AFTER INSERT OR UPDATE OF status ON public.rfq_cases
FOR EACH ROW EXECUTE FUNCTION public.enqueue_rfq_routing_job();

REVOKE ALL ON FUNCTION public.enqueue_supplier_search_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_rfq_routing_job() FROM PUBLIC, anon, authenticated;

-- Scheduling (configured as a managed pg_cron job in the Supabase dashboard,
-- following the precedent of the retired reply-reminder dispatcher — it needs the
-- project ref + service key and so is not committed here). Reference wiring:
--
--   select cron.schedule('atelix-algolia-supplier-drain', '*/5 * * * *', $$
--     select net.http_post(
--       url    := 'https://<ref>.supabase.co/functions/v1/algolia-supplier-sync',
--       headers:= jsonb_build_object('Content-Type','application/json',
--                   'Authorization','Bearer '||current_setting('app.settings.service_role_key', true)),
--       body   := '{"mode":"drain","limit":200}'::jsonb) $$);
--
--   select cron.schedule('atelix-rfq-routing-jobs', '*/2 * * * *', $$
--     select net.http_post(
--       url    := 'https://<ref>.supabase.co/functions/v1/rfq-supplier-routing',
--       headers:= jsonb_build_object('Content-Type','application/json',
--                   'Authorization','Bearer '||current_setting('app.settings.service_role_key', true)),
--       body   := '{"mode":"drain_jobs","limit":20}'::jsonb) $$);
