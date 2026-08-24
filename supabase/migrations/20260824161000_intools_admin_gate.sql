-- Make the Intools entry gate explicit for every authenticated route.
CREATE OR REPLACE FUNCTION public.intools_assert_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_assert_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intools_assert_admin() TO authenticated;
