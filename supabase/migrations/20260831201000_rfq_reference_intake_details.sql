-- Reference-derived detail values live in the draft intake alongside the
-- buyer's brief. This RPC fills only blanks: typed buyer values continue to
-- win, and conflicting generic facts are handled by the agent as a question.
CREATE OR REPLACE FUNCTION public.agent_rfq_apply_reference_details(
  p_case_id uuid,
  p_profile_id uuid,
  p_expected_revision integer,
  p_details jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_intake jsonb; v_items jsonb; v_changed text[];
BEGIN
  IF jsonb_typeof(p_details) <> 'object' OR p_details='{}'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_each(p_details) AS entries(key,value) WHERE jsonb_typeof(value) <> 'string' OR char_length(value #>> '{}') > 500) THEN
    RAISE EXCEPTION 'Invalid reference detail patch' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  IF v_case.status <> 'draft' THEN RAISE EXCEPTION 'Only draft RFQs can be changed' USING ERRCODE='55000'; END IF;
  IF v_case.agent_revision <> p_expected_revision THEN RAISE EXCEPTION 'RFQ was updated elsewhere' USING ERRCODE='40001'; END IF;
  v_intake:=v_case.brief->'intake';
  IF jsonb_typeof(v_intake->'items') <> 'array' THEN RETURN jsonb_build_object('revision',v_case.agent_revision,'intake',v_intake,'changedDetails','[]'::jsonb); END IF;
  SELECT COALESCE(array_agg(DISTINCT key ORDER BY key),'{}') INTO v_changed
  FROM jsonb_each_text(p_details) entries(key,value)
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_intake->'items') item, jsonb_array_elements(item->'fields') field
    WHERE field->>'key'=entries.key AND coalesce(field->>'value','')='' AND btrim(entries.value)<>''
  );
  IF cardinality(v_changed)=0 THEN RETURN jsonb_build_object('revision',v_case.agent_revision,'intake',v_intake,'changedDetails','[]'::jsonb); END IF;
  SELECT jsonb_agg(jsonb_set(item,'{fields}',(
    SELECT jsonb_agg(CASE WHEN p_details ? (field->>'key') AND coalesce(field->>'value','')='' AND btrim(p_details->>(field->>'key'))<>''
      THEN jsonb_set(jsonb_set(field,'{value}',to_jsonb(p_details->>(field->>'key')),true),'{state}','"provided"'::jsonb,true)
      ELSE field END)
    FROM jsonb_array_elements(item->'fields') field
  ),true)) INTO v_items FROM jsonb_array_elements(v_intake->'items') item;
  v_intake:=jsonb_set(v_intake,'{items}',COALESCE(v_items,'[]'::jsonb),true);
  UPDATE public.rfq_cases SET brief=jsonb_set(v_case.brief,'{intake}',v_intake,true),agent_revision=agent_revision+1,last_saved_at=now(),updated_at=now()
  WHERE id=v_case.id RETURNING * INTO v_case;
  RETURN jsonb_build_object('revision',v_case.agent_revision,'intake',v_intake,'changedDetails',to_jsonb(v_changed));
END;
$$;
REVOKE ALL ON FUNCTION public.agent_rfq_apply_reference_details(uuid,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rfq_apply_reference_details(uuid,uuid,integer,jsonb) TO service_role;
