-- Only business email domains may create an Atelix account. This runs in the
-- auth schema so the policy cannot be bypassed by calling Supabase Auth directly.
CREATE OR REPLACE FUNCTION public.is_atelix_business_email(candidate text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH domain AS (
    SELECT lower(split_part(trim(candidate), '@', 2)) AS value
  )
  SELECT value <> ''
    AND value NOT IN (
      'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com','rocketmail.com',
      'outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','mac.com',
      'aol.com','proton.me','protonmail.com','gmx.com','mail.com'
    )
    AND value !~ '(^|\.)edu(\.|$)'
  FROM domain;
$$;

CREATE OR REPLACE FUNCTION public.enforce_atelix_business_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_atelix_business_email(NEW.email) THEN
    RAISE EXCEPTION 'Use a company email address. Personal and education domains are not eligible for Atelix registration.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_atelix_business_email_on_signup ON auth.users;
CREATE TRIGGER enforce_atelix_business_email_on_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_atelix_business_email();

REVOKE ALL ON FUNCTION public.is_atelix_business_email(text) FROM PUBLIC, anon, authenticated;
