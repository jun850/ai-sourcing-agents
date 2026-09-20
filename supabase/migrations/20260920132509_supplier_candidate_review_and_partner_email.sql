-- Supplier registration review is kept inside the existing private Intools
-- Suppliers workspace. Candidate approval is bounded, idempotent, and creates
-- the authoritative factory row before any partner email is attempted.

ALTER TABLE public.supplier_intakes
  ADD COLUMN IF NOT EXISTS accepted_supplier_id uuid REFERENCES public.factories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_email_status text NOT NULL DEFAULT 'not_sent'
    CHECK (partner_email_status IN ('not_sent','pending','sent','failed')),
  ADD COLUMN IF NOT EXISTS partner_email_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_email_provider_id text,
  ADD COLUMN IF NOT EXISTS partner_email_last_error text;

CREATE INDEX IF NOT EXISTS supplier_intakes_partner_email_retry_idx
  ON public.supplier_intakes(partner_email_status, reviewed_at DESC)
  WHERE status = 'approved' AND partner_email_sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.intools_list_supplier_candidates(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Candidate limit must be 1..500' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(candidate) ORDER BY candidate.created_at DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT i.*,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN NULLIF(btrim(i.company_name),'') IS NULL THEN 'companyName' END,
        CASE WHEN NULLIF(btrim(i.contact_name),'') IS NULL THEN 'contactName' END,
        CASE WHEN NULLIF(btrim(i.email),'') IS NULL THEN 'email' END,
        CASE WHEN NULLIF(btrim(i.phone),'') IS NULL THEN 'phone' END,
        CASE WHEN NULLIF(btrim(i.country_code),'') IS NULL THEN 'countryCode' END,
        CASE WHEN NULLIF(btrim(i.address),'') IS NULL THEN 'address' END,
        CASE WHEN i.years_in_business IS NULL THEN 'yearsInBusiness' END,
        CASE WHEN NULLIF(btrim(i.payload->>'website'),'') IS NULL THEN 'website' END,
        CASE WHEN NULLIF(btrim(i.language),'') IS NULL THEN 'language' END,
        CASE WHEN NULLIF(btrim(i.payload->>'companyOverview'),'') IS NULL THEN 'companyOverview' END,
        CASE WHEN COALESCE(cardinality(i.categories),0)=0 THEN 'categories' END,
        CASE WHEN i.lead_time_days IS NULL THEN 'leadTime' END,
        CASE WHEN NULLIF(btrim(i.moq),'') IS NULL THEN 'moq' END,
        CASE WHEN NULLIF(btrim(i.monthly_capacity),'') IS NULL THEN 'monthlyCapacity' END,
        CASE WHEN NULLIF(btrim(i.payload->>'externalQc'),'') IS NULL THEN 'externalQc' END,
        CASE WHEN NULLIF(btrim(i.payload->>'exportsAbroad'),'') IS NULL THEN 'exportsAbroad' END,
        CASE WHEN NULLIF(btrim(i.payload->>'certifications'),'') IS NULL THEN 'certifications' END,
        CASE WHEN NULLIF(btrim(i.payload->>'thirdPartyQc'),'') IS NULL THEN 'thirdPartyQc' END,
        CASE WHEN NULLIF(btrim(i.payload->>'catalog'),'') IS NULL THEN 'catalog' END,
        CASE WHEN NULLIF(btrim(i.payload->>'paymentTerms'),'') IS NULL THEN 'paymentTerms' END,
        CASE WHEN NULLIF(btrim(i.payload->>'notes'),'') IS NULL THEN 'notes' END
      ],NULL)::text[] AS missing_fields,
      21 - cardinality(ARRAY_REMOVE(ARRAY[
        CASE WHEN NULLIF(btrim(i.company_name),'') IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.contact_name),'') IS NULL THEN 'x' END,
        CASE WHEN NULLIF(btrim(i.email),'') IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.phone),'') IS NULL THEN 'x' END,
        CASE WHEN NULLIF(btrim(i.country_code),'') IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.address),'') IS NULL THEN 'x' END,
        CASE WHEN i.years_in_business IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.payload->>'website'),'') IS NULL THEN 'x' END,
        CASE WHEN NULLIF(btrim(i.language),'') IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.payload->>'companyOverview'),'') IS NULL THEN 'x' END,
        CASE WHEN COALESCE(cardinality(i.categories),0)=0 THEN 'x' END, CASE WHEN i.lead_time_days IS NULL THEN 'x' END,
        CASE WHEN NULLIF(btrim(i.moq),'') IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.monthly_capacity),'') IS NULL THEN 'x' END,
        CASE WHEN NULLIF(btrim(i.payload->>'externalQc'),'') IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.payload->>'exportsAbroad'),'') IS NULL THEN 'x' END,
        CASE WHEN NULLIF(btrim(i.payload->>'certifications'),'') IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.payload->>'thirdPartyQc'),'') IS NULL THEN 'x' END,
        CASE WHEN NULLIF(btrim(i.payload->>'catalog'),'') IS NULL THEN 'x' END, CASE WHEN NULLIF(btrim(i.payload->>'paymentTerms'),'') IS NULL THEN 'x' END,
        CASE WHEN NULLIF(btrim(i.payload->>'notes'),'') IS NULL THEN 'x' END
      ],NULL)) AS completed_field_count,
      21 AS total_field_count
    FROM public.supplier_intakes i
    WHERE i.status IN ('pending_manual_review','declined')
       OR (i.status='approved' AND i.partner_email_sent_at IS NULL)
    ORDER BY i.created_at DESC LIMIT p_limit
  ) candidate;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_get_supplier_candidate(p_candidate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT entry INTO v_result
  FROM jsonb_array_elements(public.intools_list_supplier_candidates(500)) entry
  WHERE entry->>'id'=p_candidate_id::text LIMIT 1;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Supplier candidate not found' USING ERRCODE='P0002'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_update_supplier_candidate(p_candidate_id uuid,p_payload jsonb,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.supplier_intakes;
BEGIN
  PERFORM public.intools_require_admin();
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Candidate update must be an object' USING ERRCODE='22023'; END IF;
  UPDATE public.supplier_intakes i SET
    company_name=COALESCE(NULLIF(btrim(p_payload->>'companyName'),''),i.company_name),
    contact_name=COALESCE(NULLIF(btrim(p_payload->>'contactName'),''),i.contact_name),
    email=COALESCE(NULLIF(lower(btrim(p_payload->>'email')),''),i.email),
    phone=COALESCE(NULLIF(btrim(p_payload->>'phone'),''),i.phone),
    country_code=CASE WHEN p_payload ? 'countryCode' THEN NULLIF(lower(btrim(p_payload->>'countryCode')),'') ELSE i.country_code END,
    address=COALESCE(NULLIF(btrim(p_payload->>'address'),''),i.address),
    categories=CASE WHEN p_payload ? 'categories' THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'categories')) ELSE i.categories END,
    language=COALESCE(NULLIF(btrim(p_payload->>'language'),''),i.language),
    years_in_business=CASE WHEN p_payload ? 'yearsInBusiness' THEN NULLIF(regexp_replace(p_payload->>'yearsInBusiness','[^0-9]','','g'),'')::integer ELSE i.years_in_business END,
    lead_time_days=CASE WHEN p_payload ? 'leadTime' THEN NULLIF(regexp_replace(p_payload->>'leadTime','[^0-9]','','g'),'')::integer ELSE i.lead_time_days END,
    moq=COALESCE(NULLIF(btrim(p_payload->>'moq'),''),i.moq),
    monthly_capacity=COALESCE(NULLIF(btrim(p_payload->>'monthlyCapacity'),''),i.monthly_capacity),
    exports_abroad=CASE WHEN p_payload ? 'exportsAbroad' THEN lower(p_payload->>'exportsAbroad')='yes' ELSE i.exports_abroad END,
    payload=i.payload || p_payload,
    updated_at=now()
  WHERE i.id=p_candidate_id AND i.status IN ('pending_manual_review','declined') AND i.updated_at=p_expected_updated_at
  RETURNING i.* INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Candidate changed or is no longer editable' USING ERRCODE='40001'; END IF;
  RETURN to_jsonb(v_row);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_decline_supplier_intakes(p_candidate_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ids uuid[]; v_count integer;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT array_agg(DISTINCT input.id) INTO v_ids FROM unnest(COALESCE(p_candidate_ids,'{}'::uuid[])) input(id);
  IF COALESCE(cardinality(v_ids),0) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Select 1..50 candidates' USING ERRCODE='22023'; END IF;
  UPDATE public.supplier_intakes SET status='declined',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  WHERE id=ANY(v_ids) AND status='pending_manual_review';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('updated_count',v_count,'status','declined');
END; $$;

CREATE OR REPLACE FUNCTION public.intools_update_supplier_candidates_bulk(p_candidate_ids uuid[],p_field text,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ids uuid[]; v_count integer;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT array_agg(DISTINCT input.id) INTO v_ids FROM unnest(COALESCE(p_candidate_ids,'{}'::uuid[])) input(id);
  IF COALESCE(cardinality(v_ids),0) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Select 1..50 candidates' USING ERRCODE='22023'; END IF;
  IF p_field NOT IN ('countryCode','categories','language','externalQc','thirdPartyQc','catalog','paymentTerms') THEN RAISE EXCEPTION 'Field is not available for bulk editing' USING ERRCODE='22023'; END IF;
  IF p_field='categories' AND (jsonb_typeof(p_value)<>'array' OR jsonb_array_length(p_value)=0) THEN RAISE EXCEPTION 'Choose at least one category' USING ERRCODE='22023'; END IF;
  IF p_field<>'categories' AND NULLIF(btrim(p_value#>>'{}'),'') IS NULL THEN RAISE EXCEPTION 'Bulk edit value is required' USING ERRCODE='22023'; END IF;
  UPDATE public.supplier_intakes i SET
    country_code=CASE WHEN p_field='countryCode' THEN lower(btrim(p_value#>>'{}')) ELSE i.country_code END,
    categories=CASE WHEN p_field='categories' THEN ARRAY(SELECT jsonb_array_elements_text(p_value)) ELSE i.categories END,
    language=CASE WHEN p_field='language' THEN btrim(p_value#>>'{}') ELSE i.language END,
    payload=i.payload || jsonb_build_object(p_field,p_value),updated_at=now()
  WHERE i.id=ANY(v_ids) AND i.status IN ('pending_manual_review','declined');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('updated_count',v_count,'field',p_field);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_accept_supplier_intakes(p_candidate_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ids uuid[]; v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT array_agg(DISTINCT input.id) INTO v_ids FROM unnest(COALESCE(p_candidate_ids,'{}'::uuid[])) input(id);
  IF COALESCE(cardinality(v_ids),0) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Select 1..50 candidates' USING ERRCODE='22023'; END IF;

  WITH eligible AS (
    SELECT i.*,
      CASE
        WHEN lower(COALESCE(i.categories[1],'')) LIKE '%fabric%' OR lower(COALESCE(i.categories[1],'')) LIKE '%textile%' THEN 'fabric_mill'::public.factory_type
        WHEN lower(COALESCE(i.categories[1],'')) LIKE '%trim%' OR lower(COALESCE(i.categories[1],'')) LIKE '%label%' THEN 'trim_supplier'::public.factory_type
        WHEN lower(COALESCE(i.categories[1],'')) LIKE '%accessor%' OR lower(COALESCE(i.categories[1],'')) LIKE '%footwear%' OR lower(COALESCE(i.categories[1],'')) LIKE '%packag%' THEN 'accessories_supplier'::public.factory_type
        ELSE 'garment_manufacturer'::public.factory_type END AS supplier_type
    FROM public.supplier_intakes i
    WHERE i.id=ANY(v_ids) AND i.status='pending_manual_review'
      AND NULLIF(btrim(i.company_name),'') IS NOT NULL AND NULLIF(btrim(i.email),'') IS NOT NULL
      AND lower(btrim(COALESCE(i.country_code,'')))=ANY(ARRAY['brunei','cambodia','china','hong kong','indonesia','japan','laos','macau','malaysia','mongolia','myanmar','north korea','philippines','singapore','south korea','taiwan','thailand','timor-leste','vietnam','italy','switzerland','united kingdom'])
  ), upserted AS (
    INSERT INTO public.factories(slug,name,type,region,loc,verify_state,years,moq,lead,capacity,certs,tags,sales,phone,web,bio,source_system,source_record_id,source_payload,broker_status,broker_reviewed_by,broker_reviewed_at,imported_at)
    SELECT 'intake-'||replace(i.id::text,'-',''),i.company_name,i.supplier_type,lower(btrim(i.country_code)),i.address,'verified',i.years_in_business,i.moq,
      CASE WHEN i.lead_time_days IS NULL THEN NULL ELSE i.lead_time_days||' days' END,i.monthly_capacity,
      regexp_split_to_array(NULLIF(btrim(i.payload->>'certifications'),''),'\s*[,;]\s*'),i.categories,i.email,i.phone,NULLIF(btrim(i.payload->>'website'),''),
      NULLIF(btrim(i.payload->>'companyOverview'),''),'manual','intake:'||i.id::text,i.payload,'approved',auth.uid(),now(),now()
    FROM eligible i
    ON CONFLICT (source_system,source_record_id) WHERE source_system IS NOT NULL AND btrim(source_system)<>'' AND source_record_id IS NOT NULL AND btrim(source_record_id)<>''
    DO UPDATE SET broker_status='approved',verify_state='verified',broker_reviewed_by=auth.uid(),broker_reviewed_at=now(),updated_at=now()
    RETURNING id,source_record_id
  ), accepted AS (
    UPDATE public.supplier_intakes i SET status='approved',accepted_supplier_id=u.id,reviewed_by=auth.uid(),reviewed_at=now(),partner_email_status='pending',partner_email_attempted_at=now(),partner_email_last_error=NULL,updated_at=now()
    FROM upserted u WHERE u.source_record_id='intake:'||i.id::text RETURNING i.id,u.id AS supplier_id
  ), audited AS (
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
    SELECT auth.uid(),'factories',a.supplier_id,'create','Accepted supplier candidate as Atelix partner',jsonb_build_object('supplier_intake_id',a.id)
    FROM accepted a RETURNING id
  ) SELECT jsonb_build_object(
    'accepted',COALESCE((SELECT jsonb_agg(jsonb_build_object('intake_id',i.id,'supplier_id',i.accepted_supplier_id,'email',i.email,'contact_name',i.contact_name,'company_name',i.company_name)) FROM public.supplier_intakes i WHERE i.id=ANY(v_ids) AND i.status='approved' AND i.partner_email_sent_at IS NULL),'[]'::jsonb),
    'skipped',COALESCE((SELECT jsonb_agg(jsonb_build_object('intake_id',i.id,'reason',CASE WHEN i.status<>'pending_manual_review' THEN 'Candidate is no longer pending review' WHEN NULLIF(btrim(i.country_code),'') IS NULL THEN 'Country is required before acceptance' ELSE 'Country is not in the supported supplier region list' END)) FROM public.supplier_intakes i WHERE i.id=ANY(v_ids) AND NOT (i.status='approved' AND i.partner_email_sent_at IS NULL)),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_record_supplier_partner_email(p_candidate_ids uuid[],p_status text,p_provider_ids jsonb DEFAULT '{}'::jsonb,p_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('sent','failed') THEN RAISE EXCEPTION 'Invalid email status' USING ERRCODE='22023'; END IF;
  IF COALESCE(cardinality(p_candidate_ids),0) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Select 1..50 candidates' USING ERRCODE='22023'; END IF;
  UPDATE public.supplier_intakes i SET partner_email_status=p_status,partner_email_attempted_at=now(),
    partner_email_sent_at=CASE WHEN p_status='sent' THEN now() ELSE i.partner_email_sent_at END,
    partner_email_provider_id=CASE WHEN p_status='sent' THEN NULLIF(p_provider_ids->>i.id::text,'') ELSE i.partner_email_provider_id END,
    partner_email_last_error=CASE WHEN p_status='failed' THEN left(COALESCE(p_error,'Email delivery failed'),1000) ELSE NULL END,updated_at=now()
  WHERE i.id=ANY(p_candidate_ids) AND i.status='approved' AND i.partner_email_sent_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('updated_count',v_count,'status',p_status);
END; $$;

REVOKE ALL ON FUNCTION public.intools_list_supplier_candidates(integer),public.intools_get_supplier_candidate(uuid),public.intools_update_supplier_candidate(uuid,jsonb,timestamptz),public.intools_update_supplier_candidates_bulk(uuid[],text,jsonb),public.intools_decline_supplier_intakes(uuid[]),public.intools_accept_supplier_intakes(uuid[]),public.intools_record_supplier_partner_email(uuid[],text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_supplier_candidates(integer),public.intools_get_supplier_candidate(uuid),public.intools_update_supplier_candidate(uuid,jsonb,timestamptz),public.intools_update_supplier_candidates_bulk(uuid[],text,jsonb),public.intools_decline_supplier_intakes(uuid[]),public.intools_accept_supplier_intakes(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_record_supplier_partner_email(uuid[],text,jsonb,text) TO service_role;
