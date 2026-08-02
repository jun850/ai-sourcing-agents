-- ============================================================================
-- ARCANA — 0011 cap company_name at 100 chars (matches the My Account form's
-- maxlength; DB-level so the limit holds even if a client bypasses the UI).
-- ============================================================================

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_company_name_length CHECK (char_length(company_name) <= 100);
