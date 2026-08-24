-- The supplier intake form no longer collects export regions (the redesigned
-- form only asks a plain yes/no "exported to the USA" question), so the RPC
-- must stop requiring at least one region when exports_abroad is true.
CREATE OR REPLACE FUNCTION public.submit_supplier_intake(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Invalid supplier intake' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.supplier_intakes(company_name,contact_name,email,phone,country_code,address,categories,language,years_in_business,lead_time_days,moq,monthly_capacity,exports_abroad,export_regions,payload)
  VALUES (
    NULLIF(btrim(p_payload->>'companyName'), ''), NULLIF(btrim(p_payload->>'contactName'), ''), NULLIF(lower(btrim(p_payload->>'email')), ''),
    NULLIF(btrim(p_payload->>'phone'), ''), NULLIF(btrim(p_payload->>'countryCode'), ''), NULLIF(btrim(p_payload->>'address'), ''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'categories','[]'::jsonb))), NULLIF(btrim(p_payload->>'language'), ''),
    NULLIF(regexp_replace(COALESCE(p_payload->>'yearsInBusiness',''), '[^0-9]', '', 'g'), '')::integer,
    NULLIF(regexp_replace(COALESCE(p_payload->>'leadTime',''), '[^0-9]', '', 'g'), '')::integer,
    NULLIF(btrim(p_payload->>'moq'), ''), NULLIF(btrim(p_payload->>'monthlyCapacity'), ''), lower(COALESCE(p_payload->>'exportsAbroad','')) = 'yes',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'exportRegions','[]'::jsonb))), p_payload
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
