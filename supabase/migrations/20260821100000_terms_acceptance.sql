-- Versioned acceptance for the published Atelix Terms & Conditions.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_version_accepted text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION public.accept_atelix_terms(p_version text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_version <> '2026-08-21' THEN
    RAISE EXCEPTION 'This terms version is not available for acceptance';
  END IF;
  UPDATE public.profiles
  SET terms_version_accepted = p_version,
      terms_accepted_at = now()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.accept_atelix_terms(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_atelix_terms(text) TO authenticated;

-- New accounts accept the same version through the existing signup checkbox.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_terms_version text := NULLIF(btrim(new.raw_user_meta_data->>'terms_version'), '');
BEGIN
  INSERT INTO public.profiles (
    id, role, full_name, company_name, country,
    terms_version_accepted, terms_accepted_at
  ) VALUES (
    new.id,
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'buyer'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'country',
    CASE WHEN v_terms_version = '2026-08-21' THEN v_terms_version END,
    CASE WHEN v_terms_version = '2026-08-21' THEN now() END
  );
  RETURN new;
END;
$$;
