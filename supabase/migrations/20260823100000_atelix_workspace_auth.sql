-- Atelix Phase 2: browser-authenticated workspace records.
-- This is additive: historical catalogue, order, and payment surfaces remain intact.

CREATE TABLE IF NOT EXISTS public.registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  email text NOT NULL CHECK (char_length(btrim(email)) BETWEEN 3 AND 320),
  company_name text NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 1 AND 200),
  sourcing text NOT NULL CHECK (char_length(btrim(sourcing)) BETWEEN 1 AND 4000),
  annual_revenue text NOT NULL CHECK (char_length(btrim(annual_revenue)) BETWEEN 1 AND 120),
  phone text,
  country_code text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','declined','invited')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  invitation_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registration_requests_status_created_idx ON public.registration_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.supplier_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 1 AND 200),
  contact_name text NOT NULL CHECK (char_length(btrim(contact_name)) BETWEEN 1 AND 160),
  email text NOT NULL CHECK (char_length(btrim(email)) BETWEEN 3 AND 320),
  phone text NOT NULL CHECK (char_length(btrim(phone)) BETWEEN 6 AND 80),
  country_code text,
  address text NOT NULL CHECK (char_length(btrim(address)) BETWEEN 1 AND 1000),
  categories text[] NOT NULL CHECK (cardinality(categories) > 0),
  language text NOT NULL CHECK (char_length(btrim(language)) BETWEEN 1 AND 80),
  years_in_business integer CHECK (years_in_business IS NULL OR years_in_business BETWEEN 0 AND 500),
  lead_time_days integer CHECK (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 3650),
  moq text NOT NULL,
  monthly_capacity text NOT NULL,
  exports_abroad boolean NOT NULL,
  export_regions text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending_manual_review' CHECK (status IN ('pending_manual_review','approved','declined','archived')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_intakes_status_created_idx ON public.supplier_intakes(status, created_at DESC);

ALTER TABLE public.rfq_cases
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'workspace' CHECK (source IN ('workspace','athelia','admin')),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_saved_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.rfq_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE CHECK (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'),
  original_name text NOT NULL CHECK (char_length(btrim(original_name)) BETWEEN 1 AND 255),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rfq_case_id, storage_path)
);
CREATE INDEX IF NOT EXISTS rfq_attachments_case_created_idx ON public.rfq_attachments(rfq_case_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rfq-attachments', 'rfq-attachments', false, 26214400, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_attachments ENABLE ROW LEVEL SECURITY;

-- Intake records are written through validation RPCs only. They are never browser-readable.
DROP POLICY IF EXISTS registration_requests_admin_all ON public.registration_requests;
CREATE POLICY registration_requests_admin_all ON public.registration_requests FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS supplier_intakes_admin_all ON public.supplier_intakes;
CREATE POLICY supplier_intakes_admin_all ON public.supplier_intakes FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS rfq_attachments_owner_all ON public.rfq_attachments;
CREATE POLICY rfq_attachments_owner_all ON public.rfq_attachments FOR ALL TO authenticated
  USING (owner_profile_id = (SELECT auth.uid())) WITH CHECK (owner_profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS rfq_attachments_owner_select ON storage.objects;
CREATE POLICY rfq_attachments_owner_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'rfq-attachments' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND EXISTS (
    SELECT 1 FROM public.rfq_cases r
    WHERE r.id = CASE WHEN name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/' THEN split_part(name, '/', 2)::uuid ELSE NULL END AND r.buyer_profile_id = (SELECT auth.uid())
  )
);
DROP POLICY IF EXISTS rfq_attachments_owner_insert ON storage.objects;
CREATE POLICY rfq_attachments_owner_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'rfq-attachments'
  AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.rfq_cases r WHERE r.id = CASE WHEN name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/' THEN split_part(name, '/', 2)::uuid ELSE NULL END AND r.buyer_profile_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS rfq_attachments_owner_update ON storage.objects;
CREATE POLICY rfq_attachments_owner_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'rfq-attachments' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND EXISTS (SELECT 1 FROM public.rfq_cases r WHERE r.id = CASE WHEN name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/' THEN split_part(name, '/', 2)::uuid ELSE NULL END AND r.buyer_profile_id = (SELECT auth.uid()))
) WITH CHECK (
  bucket_id = 'rfq-attachments' AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.rfq_cases r WHERE r.id = CASE WHEN name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/' THEN split_part(name, '/', 2)::uuid ELSE NULL END AND r.buyer_profile_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS rfq_attachments_owner_delete ON storage.objects;
CREATE POLICY rfq_attachments_owner_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'rfq-attachments' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND EXISTS (SELECT 1 FROM public.rfq_cases r WHERE r.id = CASE WHEN name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/' THEN split_part(name, '/', 2)::uuid ELSE NULL END AND r.buyer_profile_id = (SELECT auth.uid()))
);

-- Do not accept a role from public Auth metadata, and prevent self-escalation by profile update.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_terms_version text := NULLIF(btrim(new.raw_user_meta_data->>'terms_version'), '');
BEGIN
  INSERT INTO public.profiles (id, role, full_name, company_name, country, terms_version_accepted, terms_accepted_at)
  VALUES (new.id, 'buyer', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'company_name', new.raw_user_meta_data->>'country',
    CASE WHEN v_terms_version = '2026-08-21' THEN v_terms_version END,
    CASE WHEN v_terms_version = '2026-08-21' THEN now() END);
  RETURN new;
END;
$$;
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change a profile role' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_role_escalation BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

CREATE OR REPLACE FUNCTION public.submit_registration_request(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Invalid registration request' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.registration_requests(name,email,company_name,sourcing,annual_revenue,phone,country_code)
  VALUES (
    NULLIF(btrim(p_payload->>'name'), ''), NULLIF(lower(btrim(p_payload->>'email')), ''), NULLIF(btrim(p_payload->>'companyName'), ''),
    NULLIF(btrim(p_payload->>'sourcing'), ''), NULLIF(btrim(p_payload->>'annualRevenue'), ''), NULLIF(btrim(p_payload->>'phone'), ''), NULLIF(btrim(p_payload->>'countryCode'), '')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.submit_supplier_intake(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_exports boolean;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Invalid supplier intake' USING ERRCODE = '22023'; END IF;
  v_exports := lower(COALESCE(p_payload->>'exportsAbroad','')) = 'yes';
  INSERT INTO public.supplier_intakes(company_name,contact_name,email,phone,country_code,address,categories,language,years_in_business,lead_time_days,moq,monthly_capacity,exports_abroad,export_regions,payload)
  VALUES (
    NULLIF(btrim(p_payload->>'companyName'), ''), NULLIF(btrim(p_payload->>'contactName'), ''), NULLIF(lower(btrim(p_payload->>'email')), ''),
    NULLIF(btrim(p_payload->>'phone'), ''), NULLIF(btrim(p_payload->>'countryCode'), ''), NULLIF(btrim(p_payload->>'address'), ''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'categories','[]'::jsonb))), NULLIF(btrim(p_payload->>'language'), ''),
    NULLIF(regexp_replace(COALESCE(p_payload->>'yearsInBusiness',''), '[^0-9]', '', 'g'), '')::integer,
    NULLIF(regexp_replace(COALESCE(p_payload->>'leadTime',''), '[^0-9]', '', 'g'), '')::integer,
    NULLIF(btrim(p_payload->>'moq'), ''), NULLIF(btrim(p_payload->>'monthlyCapacity'), ''), v_exports,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'exportRegions','[]'::jsonb))), p_payload
  ) RETURNING id INTO v_id;
  IF v_exports AND NOT EXISTS (SELECT 1 FROM unnest((SELECT export_regions FROM public.supplier_intakes WHERE id=v_id)) AS r) THEN
    RAISE EXCEPTION 'Choose at least one export region' USING ERRCODE = '22023';
  END IF;
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.create_workspace_rfq(p_title text, p_brief jsonb)
RETURNS public.rfq_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_case public.rfq_cases;
BEGIN
  IF auth.uid() IS NULL OR char_length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 240 OR jsonb_typeof(p_brief) <> 'object' THEN
    RAISE EXCEPTION 'Invalid RFQ' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.rfq_cases(buyer_profile_id,title,brief,source,last_saved_at) VALUES (auth.uid(), btrim(p_title), p_brief, 'workspace', now()) RETURNING * INTO v_case;
  RETURN v_case;
END;
$$;
CREATE OR REPLACE FUNCTION public.update_workspace_rfq(p_case_id uuid, p_title text, p_brief jsonb, p_status text DEFAULT NULL)
RETURNS public.rfq_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_case public.rfq_cases;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(p_brief) <> 'object' OR char_length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE = '42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft','needs_research','closed') THEN RAISE EXCEPTION 'Invalid RFQ status' USING ERRCODE = '22023'; END IF;
  UPDATE public.rfq_cases SET title=btrim(p_title),brief=p_brief,status=COALESCE(p_status,status),submitted_at=CASE WHEN p_status='needs_research' THEN now() ELSE submitted_at END,last_saved_at=now(),updated_at=now() WHERE id=p_case_id RETURNING * INTO v_case;
  RETURN v_case;
END;
$$;
CREATE OR REPLACE FUNCTION public.record_rfq_attachment(p_case_id uuid, p_storage_path text, p_original_name text, p_content_type text, p_byte_size bigint)
RETURNS public.rfq_attachments LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_attachment public.rfq_attachments;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid()) THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE = '42501'; END IF;
  IF p_storage_path !~ ('^' || auth.uid()::text || '/' || p_case_id::text || '/[0-9a-f-]{36}/[^/]+$') THEN RAISE EXCEPTION 'Invalid attachment path' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.rfq_attachments(rfq_case_id,owner_profile_id,storage_path,original_name,content_type,byte_size)
  VALUES(p_case_id,auth.uid(),p_storage_path,btrim(p_original_name),p_content_type,p_byte_size) RETURNING * INTO v_attachment;
  RETURN v_attachment;
END;
$$;
CREATE OR REPLACE FUNCTION public.approve_registration_request(p_request_id uuid)
RETURNS public.registration_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_request public.registration_requests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  UPDATE public.registration_requests SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),invitation_requested_at=now(),updated_at=now()
  WHERE id=p_request_id AND status='pending_review' RETURNING * INTO v_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration request not available' USING ERRCODE = 'P0002'; END IF;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE VIEW public.atelix_rfq_workspace WITH (security_invoker = true) AS
SELECT id, case_no, title, brief, status, created_at, updated_at, submitted_at, last_saved_at
FROM public.rfq_cases WHERE source = 'workspace';

GRANT SELECT ON public.atelix_rfq_workspace TO authenticated;
-- Reads remain owner-scoped by RLS; these privileges are required for the
-- security-invoker view and composite RPC results used by the browser client.
GRANT SELECT ON public.rfq_cases, public.rfq_attachments TO authenticated;
-- Existing storage policies for catalogue media join factories during policy
-- evaluation, which in turn evaluates the established private-product policy.
-- RLS remains the access boundary for both compatibility reads.
GRANT SELECT ON public.factories, public.product_brand_assignments TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_atelix_terms(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_athelia_rfq(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_registration_request(jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.submit_supplier_intake(jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.create_workspace_rfq(text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_workspace_rfq(uuid,text,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_rfq_attachment(uuid,text,text,text,bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_registration_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_atelix_terms(text), public.dispatch_athelia_rfq(uuid,jsonb), public.create_workspace_rfq(text,jsonb), public.update_workspace_rfq(uuid,text,jsonb,text), public.record_rfq_attachment(uuid,text,text,text,bigint), public.approve_registration_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_registration_request(jsonb), public.submit_supplier_intake(jsonb) TO anon, authenticated;
