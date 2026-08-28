-- Additive, operator-reviewed learning records. No raw prompts, PII, supplier
-- identity, pricing, invoice totals, or payment references are retained here.
CREATE TABLE IF NOT EXISTS public.rfq_intake_learning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL UNIQUE REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  intake_route text NOT NULL CHECK (intake_route IN ('finished_goods','production_or_materials','unclassified')),
  intake_subtype text NOT NULL CHECK (intake_subtype IN ('wholesale','blank','private_label','white_label','cmt','fabric','leather','buttons_trims_labels','unclassified')),
  completeness jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(completeness)='object'),
  correction_labels jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(correction_labels)='array'),
  retrieval_version_ids uuid[] NOT NULL DEFAULT '{}',
  latency_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(latency_summary)='object'),
  lifecycle jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(lifecycle)='object'),
  review_status text NOT NULL DEFAULT 'candidate' CHECK (review_status IN ('candidate','approved','rejected','promoted')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((review_status IN ('candidate','rejected')) OR reviewed_by IS NOT NULL)
);
ALTER TABLE public.rfq_intake_learning_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.capture_rfq_intake_learning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_intake jsonb:=NEW.brief->'intake'; v_route text; v_subtype text;
BEGIN
  IF jsonb_typeof(v_intake) <> 'object' THEN RETURN NEW; END IF;
  v_route:=v_intake->>'route'; v_subtype:=v_intake->>'subtype';
  IF v_route NOT IN ('finished_goods','production_or_materials','unclassified') OR v_subtype NOT IN ('wholesale','blank','private_label','white_label','cmt','fabric','leather','buttons_trims_labels','unclassified') THEN RETURN NEW; END IF;
  INSERT INTO public.rfq_intake_learning_records(rfq_case_id,intake_route,intake_subtype,completeness,lifecycle)
  VALUES (NEW.id,v_route,v_subtype,jsonb_build_object('itemCount',COALESCE(jsonb_array_length(v_intake->'items'),0)),jsonb_build_object('rfqStatus',NEW.status))
  ON CONFLICT (rfq_case_id) DO UPDATE SET intake_route=EXCLUDED.intake_route,intake_subtype=EXCLUDED.intake_subtype,completeness=EXCLUDED.completeness,lifecycle=public.rfq_intake_learning_records.lifecycle || EXCLUDED.lifecycle,updated_at=now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS capture_rfq_intake_learning_after_write ON public.rfq_cases;
CREATE TRIGGER capture_rfq_intake_learning_after_write
AFTER INSERT OR UPDATE OF brief,status ON public.rfq_cases
FOR EACH ROW EXECUTE FUNCTION public.capture_rfq_intake_learning();

CREATE OR REPLACE FUNCTION public.intools_review_rfq_intake_learning(p_record_id uuid, p_status text, p_corrections jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_record public.rfq_intake_learning_records;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_status NOT IN ('approved','rejected','promoted') OR jsonb_typeof(p_corrections) <> 'array' THEN RAISE EXCEPTION 'Invalid learning review' USING ERRCODE='22023'; END IF;
  UPDATE public.rfq_intake_learning_records SET review_status=p_status,correction_labels=p_corrections,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=p_record_id RETURNING * INTO v_record;
  IF NOT FOUND THEN RAISE EXCEPTION 'Learning record not found' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('id',v_record.id,'status',v_record.review_status);
END;
$$;
REVOKE ALL ON FUNCTION public.intools_review_rfq_intake_learning(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_review_rfq_intake_learning(uuid,text,jsonb) TO authenticated;
