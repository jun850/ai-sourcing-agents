-- Preserve source-confirmed directory contacts privately while supplier
-- verification remains a broker-only decision. This is additive.

ALTER TABLE public.supplier_source_contacts
  DROP CONSTRAINT IF EXISTS supplier_source_contacts_contact_type_check;
ALTER TABLE public.supplier_source_contacts
  ADD CONSTRAINT supplier_source_contacts_contact_type_check CHECK (contact_type IN ('email','phone'));

INSERT INTO public.supplier_provenance_sources(slug,base_url,trusted_for_import)
VALUES ('apparelx-makerlist','https://www.apparel-x.com',false)
ON CONFLICT (slug) DO UPDATE SET base_url=EXCLUDED.base_url, trusted_for_import=false, updated_at=now();

CREATE OR REPLACE FUNCTION public.intools_import_supplier_source_contacts(p_run_id uuid,p_row_numbers integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.broker_supplier_import_rows; v_contact jsonb; v_source_id uuid; v_inserted integer:=0;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_row_numbers IS NULL OR cardinality(p_row_numbers) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Select 1..50 import rows' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_source_id FROM public.supplier_provenance_sources WHERE slug='apparelx-makerlist';
  IF v_source_id IS NULL THEN RAISE EXCEPTION 'ApparelX provenance source is missing' USING ERRCODE='23503'; END IF;
  FOR v_row IN SELECT * FROM public.broker_supplier_import_rows WHERE run_id=p_run_id AND row_number=ANY(p_row_numbers) AND status='promoted' AND factory_id IS NOT NULL FOR UPDATE LOOP
    FOR v_contact IN SELECT value FROM jsonb_array_elements(COALESCE(v_row.source_payload->'private_contacts','[]'::jsonb)) LOOP
      IF v_contact->>'contact_type' NOT IN ('email','phone') OR NULLIF(btrim(v_contact->>'normalized_value'),'') IS NULL OR COALESCE(v_contact->>'source_url','') !~ '^https://[^[:space:]]+$' THEN
        RAISE EXCEPTION 'Invalid private contact in supplier import row %',v_row.row_number USING ERRCODE='22023';
      END IF;
      INSERT INTO public.supplier_source_contacts(factory_id,source_id,contact_type,original_value,normalized_value,source_url,source_location,crawled_at,validation_status,usage_status,outreach_allowed,public_visibility)
      VALUES(v_row.factory_id,v_source_id,v_contact->>'contact_type',v_contact->>'original_value',v_contact->>'normalized_value',v_contact->>'source_url',NULLIF(btrim(v_contact->>'source_location'),''),COALESCE((v_contact->>'crawled_at')::timestamptz,now()),COALESCE(NULLIF(v_contact->>'validation_status',''),'unverified'),'documented_only',false,false)
      ON CONFLICT(factory_id,source_id,contact_type,normalized_value) DO UPDATE SET original_value=EXCLUDED.original_value,source_url=EXCLUDED.source_url,source_location=EXCLUDED.source_location,crawled_at=EXCLUDED.crawled_at,validation_status=EXCLUDED.validation_status;
      v_inserted:=v_inserted+1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('run_id',p_run_id,'contacts_documented',v_inserted,'usage_status','documented_only','outreach_allowed',false,'public_visibility',false);
END;
$$;

REVOKE ALL ON FUNCTION public.intools_import_supplier_source_contacts(uuid,integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_import_supplier_source_contacts(uuid,integer[]) TO authenticated;
