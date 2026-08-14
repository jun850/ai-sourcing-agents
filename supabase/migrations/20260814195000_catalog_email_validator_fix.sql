-- Permit the approved central CTA inside mailto URLs while continuing to reject
-- every other email value recursively from public supplier/product payloads.
CREATE OR REPLACE FUNCTION public.catalog_jsonb_has_email_key(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_key text; v_child jsonb; v_match text[];
BEGIN
  IF p_value IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(p_value)='object' THEN
    FOR v_key,v_child IN SELECT key,value FROM jsonb_each(p_value) LOOP
      IF v_key ~* 'email' OR public.catalog_jsonb_has_email_key(v_child) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value)='array' THEN
    FOR v_child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      IF public.catalog_jsonb_has_email_key(v_child) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value)='string' THEN
    FOR v_match IN SELECT regexp_matches(p_value #>> '{}','[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}','gi') LOOP
      IF lower(v_match[1]) <> 'info@arcanawangsa.com' THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;
