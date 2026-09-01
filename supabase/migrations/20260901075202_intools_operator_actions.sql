-- Operator actions for the redesigned Intools workspace. Additive only.
--
-- The new Requests queue lets an operator mark a reviewed case as `reviewed` or
-- `archived` from the bulk-action toolbar, and the Sign-up requests queue needs a
-- decline action to mirror the existing approve path. Nothing here changes or
-- removes existing rows, columns, or grants.

-- 1. Widen the rfq_cases status vocabulary. The prior constraint is replaced with
--    the same set plus the two operator-only terminal states.
ALTER TABLE public.rfq_cases DROP CONSTRAINT IF EXISTS rfq_cases_status_check;
ALTER TABLE public.rfq_cases ADD CONSTRAINT rfq_cases_status_check
  CHECK (status IN (
    'draft','awaiting_supplier','supplier_replied','buyer_review','needs_research',
    'closed','quote_selected','in_production','reviewed','archived'
  ));

-- 2. Operator RFQ status transition. src/supabase.ts already calls
--    `intools_update_rfq_status`; define it explicitly as a SECURITY DEFINER
--    admin action (rfq_cases has buyer-only RLS by design).
CREATE OR REPLACE FUNCTION public.intools_update_rfq_status(
  p_case_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.rfq_cases;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_status NOT IN (
    'awaiting_supplier','supplier_replied','buyer_review','needs_research',
    'closed','quote_selected','in_production','reviewed','archived'
  ) THEN
    RAISE EXCEPTION 'Unsupported RFQ status %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.rfq_cases
     SET status = p_status,
         updated_at = now()
   WHERE id = p_case_id
   RETURNING * INTO v_case;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ case not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_case.id,
    'case_no', v_case.case_no,
    'status', v_case.status,
    'note', p_note,
    'updated_at', v_case.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.intools_update_rfq_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_update_rfq_status(uuid, text, text) TO authenticated;

-- 3. Decline a pending sign-up request. Mirrors approve_registration_request.
CREATE OR REPLACE FUNCTION public.intools_decline_registration_request(p_request_id uuid)
RETURNS public.registration_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.registration_requests;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.registration_requests
     SET status = 'declined',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_request_id AND status = 'pending_review'
   RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request not available' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_decline_registration_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_decline_registration_request(uuid) TO authenticated;
