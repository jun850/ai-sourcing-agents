-- Allow the service-role worker bootstrap to configure its own Vault-backed
-- schedule. Human callers still pass the existing confirmed-admin guard.
CREATE OR REPLACE FUNCTION public.intools_configure_qc_worker_schedule(
  p_worker_url text,
  p_bearer_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing uuid;
  v_job_id bigint;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    PERFORM public.intools_require_admin();
  END IF;

  IF p_worker_url !~ '^https://[A-Za-z0-9.-]+/run$'
    OR char_length(p_bearer_secret) < 32 THEN
    RAISE EXCEPTION 'A HTTPS /run URL and strong bearer secret are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing
  FROM vault.secrets
  WHERE name = 'atelix_qc_worker_url';

  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      p_worker_url,
      'atelix_qc_worker_url',
      'Vercel QC worker endpoint'
    );
  ELSE
    PERFORM vault.update_secret(
      v_existing,
      p_worker_url,
      'atelix_qc_worker_url',
      'Vercel QC worker endpoint'
    );
  END IF;

  SELECT id INTO v_existing
  FROM vault.secrets
  WHERE name = 'atelix_qc_worker_bearer';

  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      p_bearer_secret,
      'atelix_qc_worker_bearer',
      'Vercel QC worker bearer'
    );
  ELSE
    PERFORM vault.update_secret(
      v_existing,
      p_bearer_secret,
      'atelix_qc_worker_bearer',
      'Vercel QC worker bearer'
    );
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'atelix-qc-worker';

  SELECT cron.schedule('atelix-qc-worker', '*/2 * * * *', $job$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'atelix_qc_worker_url'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'atelix_qc_worker_bearer'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 250000
    );
  $job$) INTO v_job_id;

  RETURN jsonb_build_object(
    'scheduled', true,
    'job_id', v_job_id,
    'cadence', '*/2 * * * *'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.intools_configure_qc_worker_schedule(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_configure_qc_worker_schedule(text, text)
  TO authenticated, service_role;
