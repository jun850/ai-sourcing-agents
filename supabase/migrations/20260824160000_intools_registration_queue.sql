-- Keep registration requests in Supabase and expose them only to administrators.
CREATE OR REPLACE FUNCTION public.intools_list_registration_requests(p_status text DEFAULT 'pending_review')
RETURNS SETOF public.registration_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending_review','approved','declined','invited') THEN
    RAISE EXCEPTION 'Invalid registration status' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT r.*
    FROM public.registration_requests r
    WHERE p_status IS NULL OR r.status = p_status
    ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_list_registration_requests(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_registration_requests(text) TO authenticated;
