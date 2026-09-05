-- PostgREST exposes current JWT claims through auth.jwt(). Keep the legacy
-- setting fallback for compatibility with older runtimes and local fixtures.
CREATE OR REPLACE FUNCTION public.qc_require_service_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  ) <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.qc_require_service_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qc_require_service_role() TO service_role;
