-- ============================================================================
-- ARCANA — admin supplier verification audit trail
-- Verification changes and their audit rows are committed together through an
-- admin-only RPC. Regular profile/SKU edits continue to use existing RLS.
-- ============================================================================

CREATE TABLE public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES public.profiles(id),
  target_table text NOT NULL CHECK (target_table IN ('factories', 'products')),
  target_id    uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('update', 'verify_state_change', 'archive', 'create')),
  summary      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_target_idx
  ON public.admin_audit_log (target_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_log_admin_read
  ON public.admin_audit_log
  FOR SELECT USING (public.is_admin());

CREATE FUNCTION public.admin_list_audit(p_target_id uuid)
RETURNS TABLE (admin_name text, action text, summary text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p.full_name, p.company_name, 'Admin') AS admin_name,
         a.action, a.summary, a.created_at
  FROM public.admin_audit_log a
  JOIN public.profiles p ON p.id = a.admin_id
  WHERE a.target_id = p_target_id AND public.is_admin()
  ORDER BY a.created_at DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.admin_list_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_audit(uuid) TO authenticated;

CREATE FUNCTION public.admin_set_factory_verification(
  p_factory_id uuid,
  p_verify_state public.verify_state
)
RETURNS public.factories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.verify_state;
  v_row public.factories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT verify_state INTO v_old
  FROM public.factories
  WHERE id = p_factory_id;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'factory not found';
  END IF;

  UPDATE public.factories
  SET verify_state = p_verify_state
  WHERE id = p_factory_id
  RETURNING * INTO v_row;

  IF v_old IS DISTINCT FROM p_verify_state THEN
    INSERT INTO public.admin_audit_log (admin_id, target_table, target_id, action, summary)
    VALUES (
      auth.uid(), 'factories', p_factory_id, 'verify_state_change',
      format('verify_state: %s → %s', v_old, p_verify_state)
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_factory_verification(uuid, public.verify_state) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_factory_verification(uuid, public.verify_state) TO authenticated;
