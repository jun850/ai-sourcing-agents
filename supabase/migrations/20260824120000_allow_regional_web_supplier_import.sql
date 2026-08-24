-- Allow the regional supplier research pipeline to enter the existing
-- administrator-only dry-run/promotion flow. Records remain pending/review
-- until an admin promotes them; this does not make arbitrary web data public.
CREATE OR REPLACE FUNCTION public.broker_valid_source(p_system text, p_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE lower(btrim(COALESCE(p_system,'')))
    WHEN 'manual' THEN p_url IS NULL OR btrim(p_url) = ''
    WHEN 'apparelx' THEN COALESCE(p_url,'') ~ '^https://(www\.)?apparel-x\.com/'
    WHEN 'regional_web' THEN COALESCE(p_url,'') ~ '^https://[^[:space:]]+$'
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.broker_valid_source(text,text) IS
'Source trust boundary for supplier intake. regional_web accepts HTTPS evidence only for administrator review; it does not confer supplier verification or publication eligibility.';
