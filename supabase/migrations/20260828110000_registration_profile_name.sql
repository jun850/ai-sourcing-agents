-- An approved access request is the canonical source for the buyer's initial
-- personal display name. Auth metadata may be absent on invitation flows.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_terms_version text := NULLIF(btrim(new.raw_user_meta_data->>'terms_version'), '');
  v_request public.registration_requests;
BEGIN
  SELECT * INTO v_request
  FROM public.registration_requests
  WHERE lower(email) = lower(new.email)
    AND status IN ('approved', 'invited')
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.profiles (id, role, full_name, company_name, country, terms_version_accepted, terms_accepted_at)
  VALUES (
    new.id, 'buyer',
    COALESCE(NULLIF(btrim(v_request.name), ''), NULLIF(btrim(new.raw_user_meta_data->>'full_name'), '')),
    COALESCE(NULLIF(btrim(v_request.company_name), ''), NULLIF(btrim(new.raw_user_meta_data->>'company_name'), '')),
    new.raw_user_meta_data->>'country',
    CASE WHEN v_terms_version = '2026-08-21' THEN v_terms_version END,
    CASE WHEN v_terms_version = '2026-08-21' THEN now() END
  );
  RETURN new;
END;
$$;

-- Repair eligible profiles created before the registration name handoff.
WITH approved_names AS (
  SELECT p.id, (
    SELECT rr.name FROM auth.users u
    JOIN public.registration_requests rr ON lower(rr.email) = lower(u.email)
    WHERE u.id = p.id AND rr.status IN ('approved', 'invited')
    ORDER BY rr.created_at DESC LIMIT 1
  ) AS name
  FROM public.profiles p
  WHERE NULLIF(btrim(p.full_name), '') IS NULL
)
UPDATE public.profiles p SET full_name = approved_names.name
FROM approved_names
WHERE p.id = approved_names.id AND NULLIF(btrim(approved_names.name), '') IS NOT NULL;
