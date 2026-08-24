-- Correct two existing function declarations reported by linked database lint.
-- This is additive and leaves applied migration history immutable.

CREATE OR REPLACE FUNCTION public.my_notification_preferences()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path='' AS $$
DECLARE v_pref public.notification_preferences;
BEGIN
  INSERT INTO public.notification_preferences(profile_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
  SELECT * INTO v_pref FROM public.notification_preferences WHERE profile_id=auth.uid();
  RETURN to_jsonb(v_pref)-'profile_id'-'updated_at';
END; $$;

CREATE OR REPLACE FUNCTION public.intools_promote_supplier_intake(p_intake_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_intake public.supplier_intakes; v_supplier public.factories;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_intake FROM public.supplier_intakes WHERE id=p_intake_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier intake not found' USING ERRCODE='22023'; END IF;
  INSERT INTO public.factories(slug,name,type,region,loc,years,moq,capacity,tags,verify_state,broker_status,source_system,source_record_id,source_payload)
  VALUES('intake-'||substr(replace(v_intake.id::text,'-',''),1,20),v_intake.company_name,'garment_manufacturer',v_intake.country_code,v_intake.address,v_intake.years_in_business,v_intake.moq,v_intake.monthly_capacity,v_intake.categories,'pending','review','manual','intake:'||v_intake.id,v_intake.payload)
  ON CONFLICT(source_system,source_record_id)
    WHERE source_system IS NOT NULL AND btrim(source_system)<>'' AND source_record_id IS NOT NULL AND btrim(source_record_id)<>''
  DO UPDATE SET source_payload=EXCLUDED.source_payload,updated_at=now()
  RETURNING * INTO v_supplier;
  UPDATE public.supplier_intakes SET status=CASE WHEN status='archived' THEN 'archived' ELSE 'pending_manual_review' END,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=v_intake.id;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'factories',v_supplier.id,'create','Promoted supplier intake for review');
  RETURN to_jsonb(v_supplier);
END; $$;
