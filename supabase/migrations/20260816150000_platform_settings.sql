-- ============================================================================
-- ARCANA — Platform settings (key-value config)
-- Real-time flags admins can toggle from intools.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_public_read ON public.platform_settings
  FOR SELECT USING (true);

CREATE POLICY settings_admin_write ON public.platform_settings
  FOR ALL USING (public.is_admin());

-- Seed: payment method defaults to bank_transfer
INSERT INTO public.platform_settings (key, value)
VALUES ('payment_method', 'bank_transfer')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Public read — any authenticated or anon user can read a setting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_setting(p_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT value FROM public.platform_settings WHERE key = p_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_setting(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin write — only admins can update settings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intools_update_platform_setting(p_key text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.intools_require_admin();
  UPDATE public.platform_settings
    SET value = p_value, updated_at = now()
  WHERE key = p_key;
  IF NOT FOUND THEN
    INSERT INTO public.platform_settings (key, value) VALUES (p_key, p_value);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_update_platform_setting(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_update_platform_setting(text, text) TO authenticated;
