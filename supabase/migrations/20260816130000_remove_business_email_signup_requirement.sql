-- Brand-owner accounts may register with any valid email address. Remove the
-- auth-level domain allowlist so direct Supabase Auth sign-ups match the form.
DROP TRIGGER IF EXISTS enforce_atelix_business_email_on_signup ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_atelix_business_email();
DROP FUNCTION IF EXISTS public.is_atelix_business_email(text);
