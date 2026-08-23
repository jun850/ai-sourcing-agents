-- Phase 5: broker-led supplier operations.  This is deliberately additive:
-- catalogue compatibility remains, while new intake/matching work is private
-- and mediated by guarded RPCs.

ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS provenance_url text,
  ADD COLUMN IF NOT EXISTS provenance_sha256 text,
  ADD COLUMN IF NOT EXISTS provenance_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_payload) = 'object'),
  ADD COLUMN IF NOT EXISTS broker_status text NOT NULL DEFAULT 'review' CHECK (broker_status IN ('review','approved','rejected','archived')),
  ADD COLUMN IF NOT EXISTS curation_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS broker_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS factories_broker_source_identity_unique
  ON public.factories(source_system, source_record_id)
  WHERE source_system IS NOT NULL AND btrim(source_system) <> ''
    AND source_record_id IS NOT NULL AND btrim(source_record_id) <> '';
CREATE INDEX IF NOT EXISTS factories_broker_eligible_idx
  ON public.factories(broker_status, verify_state, region)
  WHERE archived_at IS NULL;

-- Only newly introduced provenance fields are filled.  Existing names,
-- statuses, owner_profile_id and curated facts are never backfilled over.
UPDATE public.factories f
SET source_system = s.slug,
    source_record_id = i.source_key,
    source_reference = i.source_url,
    provenance_url = i.source_url,
    provenance_sha256 = i.last_content_sha256,
    provenance_captured_at = i.last_seen_at,
    imported_at = COALESCE(f.imported_at, i.first_seen_at)
FROM public.catalog_source_identities i
JOIN public.catalog_import_sources s ON s.id = i.source_id
WHERE i.entity_type = 'supplier'
  AND i.entity_id = f.id
  AND f.source_system IS NULL
  AND f.source_record_id IS NULL;

UPDATE public.factories
SET broker_status = CASE
  WHEN archived_at IS NOT NULL THEN 'archived'
  WHEN verify_state = 'verified' THEN 'approved'
  ELSE 'review'
END
WHERE broker_status = 'review';

CREATE TABLE IF NOT EXISTS public.broker_supplier_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'validated' CHECK (status IN ('validated','applied','failed')),
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run','promote')),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 50),
  accepted_count integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  source_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_summary)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.broker_supplier_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.broker_supplier_import_runs(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number BETWEEN 1 AND 50),
  source_system text,
  source_record_id text,
  source_reference text,
  normalized_name text,
  normalized_region text,
  source_url text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_payload)='object'),
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(normalized_payload)='object'),
  status text NOT NULL CHECK (status IN ('accepted','rejected','ambiguous','promoted','failed')),
  factory_id uuid REFERENCES public.factories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz,
  UNIQUE(run_id, row_number)
);

CREATE TABLE IF NOT EXISTS public.broker_supplier_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_row_id uuid NOT NULL REFERENCES public.broker_supplier_import_rows(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (char_length(btrim(path)) BETWEEN 1 AND 160),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broker_supplier_import_rows_run_idx ON public.broker_supplier_import_rows(run_id, row_number);
CREATE INDEX IF NOT EXISTS broker_supplier_import_errors_row_idx ON public.broker_supplier_import_errors(import_row_id);

ALTER TABLE public.broker_supplier_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_supplier_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_supplier_import_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broker_supplier_import_runs_admin ON public.broker_supplier_import_runs;
DROP POLICY IF EXISTS broker_supplier_import_rows_admin ON public.broker_supplier_import_rows;
DROP POLICY IF EXISTS broker_supplier_import_errors_admin ON public.broker_supplier_import_errors;
CREATE POLICY broker_supplier_import_runs_admin ON public.broker_supplier_import_runs FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY broker_supplier_import_rows_admin ON public.broker_supplier_import_rows FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY broker_supplier_import_errors_admin ON public.broker_supplier_import_errors FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.broker_normalize_identity(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT NULLIF(regexp_replace(lower(btrim(COALESCE(p_value,''))), '[^a-z0-9]+', '', 'g'), '');
$$;

-- A source system is an explicit trust boundary.  The importer accepts only
-- manual broker intake (without a URL) or the existing verified ApparelX host.
CREATE OR REPLACE FUNCTION public.broker_valid_source(p_system text, p_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE lower(btrim(COALESCE(p_system,'')))
    WHEN 'manual' THEN p_url IS NULL OR btrim(p_url) = ''
    WHEN 'apparelx' THEN COALESCE(p_url,'') ~ '^https://(www\.)?apparel-x\.com/'
    ELSE false
  END;
$$;

DO $$
BEGIN
  IF NOT public.broker_valid_source('apparelx','https://www.apparel-x.com/supplier/example')
    OR NOT public.broker_valid_source('apparelx','https://apparel-x.com/supplier/example')
    OR public.broker_valid_source('apparelx','https://apparel-x.com.evil.test/supplier/example')
    OR public.broker_valid_source('apparelx','http://apparel-x.com/supplier/example') THEN
    RAISE EXCEPTION 'broker supplier source validation assertion failed';
  END IF;
END;
$$;

-- Existing owner policies permit direct writes.  This trigger closes the
-- verification/approval escalation path even when a request bypasses Intools.
CREATE OR REPLACE FUNCTION public.broker_guard_factory_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT public.is_admin() AND auth.uid() IS NOT NULL THEN
    IF NEW.verify_state <> 'pending'::public.verify_state OR NEW.broker_status <> 'review' THEN
      RAISE EXCEPTION 'Factory owners cannot self-verify or approve a supplier' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT public.is_admin() AND auth.uid() IS NOT NULL
    AND (NEW.verify_state IS DISTINCT FROM OLD.verify_state
      OR NEW.broker_status IS DISTINCT FROM OLD.broker_status
      OR NEW.curation_locked IS DISTINCT FROM OLD.curation_locked
      OR NEW.broker_reviewed_by IS DISTINCT FROM OLD.broker_reviewed_by
      OR NEW.broker_reviewed_at IS DISTINCT FROM OLD.broker_reviewed_at) THEN
    RAISE EXCEPTION 'Factory owners cannot change supplier verification or broker approval' USING ERRCODE='42501';
  END IF;
  -- A locked record may still receive provenance, but source imports cannot
  -- overwrite the curated operating facts or revive/archive it.
  IF TG_OP = 'UPDATE' AND OLD.curation_locked
    AND (NEW.slug IS DISTINCT FROM OLD.slug OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.type IS DISTINCT FROM OLD.type OR NEW.region IS DISTINCT FROM OLD.region
      OR NEW.loc IS DISTINCT FROM OLD.loc OR NEW.verify_state IS DISTINCT FROM OLD.verify_state
      OR NEW.years IS DISTINCT FROM OLD.years OR NEW.moq IS DISTINCT FROM OLD.moq
      OR NEW.lead IS DISTINCT FROM OLD.lead OR NEW.capacity IS DISTINCT FROM OLD.capacity
      OR NEW.certs IS DISTINCT FROM OLD.certs OR NEW.tags IS DISTINCT FROM OLD.tags
      OR NEW.sales IS DISTINCT FROM OLD.sales OR NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.web IS DISTINCT FROM OLD.web OR NEW.bio IS DISTINCT FROM OLD.bio
      OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'Curated supplier is locked against source overwrite' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS broker_guard_factory_write ON public.factories;
CREATE TRIGGER broker_guard_factory_write BEFORE INSERT OR UPDATE ON public.factories
  FOR EACH ROW EXECUTE FUNCTION public.broker_guard_factory_write();

-- Suggested matches are private operational data.  They become visible to a
-- buyer or factory owner only after an administrator explicitly approves them.
CREATE TABLE IF NOT EXISTS public.rfq_supplier_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','selected','approved','rejected')),
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(eligibility)='object'),
  score numeric(8,3) NOT NULL DEFAULT 0,
  matched_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rfq_case_id, factory_id)
);
CREATE INDEX IF NOT EXISTS rfq_supplier_matches_case_status_idx ON public.rfq_supplier_matches(rfq_case_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS rfq_supplier_matches_factory_status_idx ON public.rfq_supplier_matches(factory_id,status,updated_at DESC);
ALTER TABLE public.rfq_supplier_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rfq_supplier_matches_admin_all ON public.rfq_supplier_matches;
DROP POLICY IF EXISTS rfq_supplier_matches_released_participant_read ON public.rfq_supplier_matches;
CREATE POLICY rfq_supplier_matches_admin_all ON public.rfq_supplier_matches FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY rfq_supplier_matches_released_participant_read ON public.rfq_supplier_matches FOR SELECT TO authenticated
  USING (status = 'approved' AND (
    EXISTS (SELECT 1 FROM public.rfq_cases c WHERE c.id=rfq_case_id AND c.buyer_profile_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.factories f WHERE f.id=factory_id AND f.owner_profile_id=auth.uid())
  ));

-- Public compatibility paths can still read approved catalogue records, but
-- pending/rejected/internal broker records no longer leak through table RLS.
DROP POLICY IF EXISTS factories_select ON public.factories;
CREATE POLICY factories_select ON public.factories FOR SELECT TO authenticated, anon
  USING ((SELECT public.is_admin()) OR owner_profile_id = (SELECT auth.uid())
    OR (broker_status='approved' AND verify_state='verified' AND archived_at IS NULL));

CREATE OR REPLACE FUNCTION public.intools_supplier_import_dry_run(p_rows jsonb, p_overwrite boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_run uuid; v_row jsonb; v_no integer:=0; v_payload jsonb; v_system text; v_record text; v_url text;
  v_name text; v_region text; v_type text; v_status text; v_row_id uuid; v_errors jsonb; v_result jsonb; v_candidates uuid[]; v_candidate uuid;
BEGIN
  PERFORM public.intools_require_admin();
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Supplier import requires 1..50 rows' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.broker_supplier_import_runs(submitted_by,row_count,source_summary)
  VALUES(auth.uid(),jsonb_array_length(p_rows),jsonb_build_object('overwrite_requested',COALESCE(p_overwrite,false))) RETURNING id INTO v_run;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_candidate:=NULL; v_candidates:=NULL;
    v_no:=v_no+1; v_payload:=COALESCE(v_row->'supplier','{}'::jsonb);
    v_system:=lower(btrim(v_row->>'source_system')); v_record:=btrim(v_row->>'source_record_id'); v_url:=NULLIF(btrim(v_row->>'source_url'),'');
    v_name:=NULLIF(btrim(v_payload->>'name'),''); v_region:=NULLIF(btrim(v_payload->>'region'),''); v_type:=v_payload->>'type';
    v_errors:='[]'::jsonb;
    IF v_system IS NULL OR v_system='' OR v_record IS NULL OR v_record='' THEN v_errors:=v_errors||jsonb_build_array(jsonb_build_object('path','source_record_id','message','source_system and source_record_id are required')); END IF;
    IF NOT public.broker_valid_source(v_system,v_url) THEN v_errors:=v_errors||jsonb_build_array(jsonb_build_object('path','source_url','message','untrusted source system or URL')); END IF;
    IF v_name IS NULL THEN v_errors:=v_errors||jsonb_build_array(jsonb_build_object('path','supplier.name','message','supplier name is required')); END IF;
    IF v_type NOT IN ('fabric_mill','garment_manufacturer','trim_supplier','accessories_supplier','yarn_supplier','textile_trading_company','material_innovator') THEN v_errors:=v_errors||jsonb_build_array(jsonb_build_object('path','supplier.type','message','supplier type is invalid')); END IF;
    v_status:=CASE WHEN jsonb_array_length(v_errors)>0 THEN 'rejected' ELSE 'accepted' END;
    -- Dry-run resolves identity with the exact promotion precedence but does
    -- not touch factories. URL is deliberately excluded from matching.
    IF v_status='accepted' THEN
      SELECT id INTO v_candidate FROM public.factories WHERE source_system=v_system AND source_record_id=v_record;
      IF FOUND THEN
        NULL;
      ELSE
        SELECT array_agg(id ORDER BY id) INTO v_candidates FROM public.factories
          WHERE public.broker_normalize_identity(name)=public.broker_normalize_identity(v_name)
            AND public.broker_normalize_identity(region)=public.broker_normalize_identity(v_region);
        IF cardinality(v_candidates)>1 THEN
          v_status:='ambiguous';
          v_errors:=v_errors||jsonb_build_array(jsonb_build_object('path','identity','message','ambiguous normalized company name and region'));
        ELSIF cardinality(v_candidates)=1 THEN v_candidate:=v_candidates[1]; END IF;
      END IF;
      IF EXISTS (SELECT 1 FROM public.broker_supplier_import_rows r WHERE r.run_id=v_run AND r.source_system=v_system AND r.source_record_id=v_record) THEN
        v_status:='rejected';
        v_errors:=v_errors||jsonb_build_array(jsonb_build_object('path','source_record_id','message','duplicate source identity in this run'));
      END IF;
    END IF;
    INSERT INTO public.broker_supplier_import_rows(run_id,row_number,source_system,source_record_id,source_reference,normalized_name,normalized_region,source_url,source_payload,normalized_payload,status)
    VALUES(v_run,v_no,v_system,v_record,v_url,public.broker_normalize_identity(v_name),public.broker_normalize_identity(v_region),v_url,v_row,
      jsonb_build_object('slug',COALESCE(NULLIF(btrim(v_payload->>'slug'),''),'broker-'||substr(md5(COALESCE(v_system,'')||':'||COALESCE(v_record,'')),1,24)),
        'name',v_name,'type',v_type,'region',v_region,'loc',NULLIF(btrim(v_payload->>'loc'),''),'years',v_payload->'years','moq',v_payload->'moq','lead',v_payload->'lead','capacity',v_payload->'capacity','certs',COALESCE(v_payload->'certs','[]'::jsonb),'tags',COALESCE(v_payload->'tags','[]'::jsonb),'web',v_payload->'web','bio',v_payload->'bio'),v_status)
      RETURNING id INTO v_row_id;
    UPDATE public.broker_supplier_import_rows SET factory_id=v_candidate WHERE id=v_row_id AND v_candidate IS NOT NULL;
    INSERT INTO public.broker_supplier_import_errors(import_row_id,path,message)
      SELECT v_row_id,e->>'path',e->>'message' FROM jsonb_array_elements(v_errors) e;
  END LOOP;
  UPDATE public.broker_supplier_import_runs r SET accepted_count=(SELECT count(*) FROM public.broker_supplier_import_rows x WHERE x.run_id=v_run AND x.status='accepted'),
    rejected_count=(SELECT count(*) FROM public.broker_supplier_import_rows x WHERE x.run_id=v_run AND x.status='rejected') WHERE id=v_run;
  SELECT jsonb_build_object('run_id',v_run,'status','validated','rows',COALESCE(jsonb_agg(jsonb_build_object('row_number',x.row_number,'status',x.status,'source_record_id',x.source_record_id,
    'supplier_id',x.factory_id,'candidate_ids','[]'::jsonb,'errors',COALESCE((SELECT jsonb_agg(jsonb_build_object('path',e.path,'message',e.message)) FROM public.broker_supplier_import_errors e WHERE e.import_row_id=x.id),'[]'::jsonb)) ORDER BY x.row_number),'[]'::jsonb)) INTO v_result
  FROM public.broker_supplier_import_rows x WHERE x.run_id=v_run;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_promote_supplier_import_rows(p_run_id uuid, p_row_numbers integer[], p_overwrite boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_run public.broker_supplier_import_runs; v_row public.broker_supplier_import_rows; v_existing public.factories;
  v_matches uuid[]; v_factory uuid; v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_run FROM public.broker_supplier_import_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import run not found' USING ERRCODE='22023'; END IF;
  IF v_run.status='applied' THEN NULL; END IF;
  IF p_row_numbers IS NULL OR cardinality(p_row_numbers) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Select 1..50 import rows' USING ERRCODE='22023'; END IF;
  FOR v_row IN SELECT * FROM public.broker_supplier_import_rows WHERE run_id=p_run_id AND row_number=ANY(p_row_numbers) ORDER BY row_number FOR UPDATE LOOP
    IF v_row.status NOT IN ('accepted','ambiguous') THEN CONTINUE; END IF;
    -- Identity precedence is intentional: source IDs win.  A URL is only
    -- retained as provenance and never participates in record matching.
    SELECT * INTO v_existing FROM public.factories WHERE source_system=v_row.source_system AND source_record_id=v_row.source_record_id FOR UPDATE;
    IF FOUND THEN
      v_factory:=v_existing.id;
    ELSE
      SELECT array_agg(id ORDER BY id) INTO v_matches FROM public.factories
        WHERE public.broker_normalize_identity(name)=v_row.normalized_name
          AND public.broker_normalize_identity(region)=v_row.normalized_region;
      IF cardinality(v_matches)>1 THEN
        UPDATE public.broker_supplier_import_rows SET status='ambiguous' WHERE id=v_row.id;
        INSERT INTO public.broker_supplier_import_errors(import_row_id,path,message) VALUES(v_row.id,'identity','ambiguous normalized company name and region');
        CONTINUE;
      ELSIF cardinality(v_matches)=1 THEN
        v_factory:=v_matches[1];
      ELSE
        INSERT INTO public.factories(slug,name,type,region,loc,years,moq,lead,capacity,certs,tags,web,bio,verify_state,broker_status,source_system,source_record_id,source_reference,provenance_url,source_payload,imported_at)
        VALUES(v_row.normalized_payload->>'slug',v_row.normalized_payload->>'name',(v_row.normalized_payload->>'type')::public.factory_type,
          v_row.normalized_payload->>'region',v_row.normalized_payload->>'loc',(v_row.normalized_payload->>'years')::integer,v_row.normalized_payload->>'moq',v_row.normalized_payload->>'lead',v_row.normalized_payload->>'capacity',
          ARRAY(SELECT jsonb_array_elements_text(v_row.normalized_payload->'certs')),ARRAY(SELECT jsonb_array_elements_text(v_row.normalized_payload->'tags')),v_row.normalized_payload->>'web',v_row.normalized_payload->>'bio',
          'pending','review',v_row.source_system,v_row.source_record_id,v_row.source_reference,v_row.source_url,v_row.source_payload,now()) RETURNING id INTO v_factory;
      END IF;
    END IF;
    SELECT * INTO v_existing FROM public.factories WHERE id=v_factory FOR UPDATE;
    IF v_existing.curation_locked THEN
      UPDATE public.factories SET source_system=COALESCE(source_system,v_row.source_system),source_record_id=COALESCE(source_record_id,v_row.source_record_id),source_reference=v_row.source_reference,provenance_url=v_row.source_url,source_payload=v_row.source_payload,imported_at=now(),updated_at=now() WHERE id=v_factory;
    ELSIF v_existing.source_system=v_row.source_system AND v_existing.source_record_id=v_row.source_record_id THEN
      -- Existing source identity: retain curated facts; only fill blanks in
      -- source-owned fields.  Overwrite is deliberately ignored for facts.
      UPDATE public.factories SET source_reference=v_row.source_reference,provenance_url=v_row.source_url,source_payload=v_row.source_payload,
        region=CASE WHEN p_overwrite THEN COALESCE(v_row.normalized_payload->>'region',region) ELSE COALESCE(NULLIF(region,''),v_row.normalized_payload->>'region') END,
        loc=CASE WHEN p_overwrite THEN COALESCE(v_row.normalized_payload->>'loc',loc) ELSE COALESCE(NULLIF(loc,''),v_row.normalized_payload->>'loc') END,
        years=CASE WHEN p_overwrite THEN COALESCE((v_row.normalized_payload->>'years')::integer,years) ELSE COALESCE(years,(v_row.normalized_payload->>'years')::integer) END,
        moq=CASE WHEN p_overwrite THEN COALESCE(v_row.normalized_payload->>'moq',moq) ELSE COALESCE(moq,v_row.normalized_payload->>'moq') END,
        lead=CASE WHEN p_overwrite THEN COALESCE(v_row.normalized_payload->>'lead',lead) ELSE COALESCE(lead,v_row.normalized_payload->>'lead') END,
        capacity=CASE WHEN p_overwrite THEN COALESCE(v_row.normalized_payload->>'capacity',capacity) ELSE COALESCE(capacity,v_row.normalized_payload->>'capacity') END,
        certs=CASE WHEN p_overwrite AND v_row.normalized_payload ? 'certs' THEN ARRAY(SELECT jsonb_array_elements_text(v_row.normalized_payload->'certs')) ELSE COALESCE(certs,ARRAY(SELECT jsonb_array_elements_text(v_row.normalized_payload->'certs'))) END,
        tags=CASE WHEN p_overwrite AND v_row.normalized_payload ? 'tags' THEN ARRAY(SELECT jsonb_array_elements_text(v_row.normalized_payload->'tags')) ELSE COALESCE(tags,ARRAY(SELECT jsonb_array_elements_text(v_row.normalized_payload->'tags'))) END,
        web=CASE WHEN p_overwrite THEN COALESCE(v_row.normalized_payload->>'web',web) ELSE COALESCE(web,v_row.normalized_payload->>'web') END,
        bio=CASE WHEN p_overwrite THEN COALESCE(v_row.normalized_payload->>'bio',bio) ELSE COALESCE(bio,v_row.normalized_payload->>'bio') END,
        imported_at=now(),updated_at=now() WHERE id=v_factory;
    ELSE
      -- Name+region fallback may attach provenance but cannot replace identity
      -- or any curated supplier field.
      UPDATE public.factories SET source_system=COALESCE(source_system,v_row.source_system),source_record_id=COALESCE(source_record_id,v_row.source_record_id),source_reference=v_row.source_reference,provenance_url=v_row.source_url,source_payload=v_row.source_payload,imported_at=now(),updated_at=now() WHERE id=v_factory;
    END IF;
    UPDATE public.broker_supplier_import_rows SET status='promoted',factory_id=v_factory,promoted_at=now() WHERE id=v_row.id;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'factories',v_factory,'update','Promoted supplier import row '||v_row.row_number);
  END LOOP;
  UPDATE public.broker_supplier_import_runs SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM public.broker_supplier_import_rows WHERE run_id=p_run_id AND status='accepted') THEN 'applied' ELSE status END,
    mode='promote',applied_at=CASE WHEN NOT EXISTS(SELECT 1 FROM public.broker_supplier_import_rows WHERE run_id=p_run_id AND status='accepted') THEN now() ELSE applied_at END WHERE id=p_run_id;
  SELECT jsonb_build_object('run_id',p_run_id,'status',(SELECT status FROM public.broker_supplier_import_runs WHERE id=p_run_id),'rows',COALESCE(jsonb_agg(jsonb_build_object('row_number',x.row_number,'status',x.status,'source_record_id',x.source_record_id,'supplier_id',x.factory_id,
    'candidate_ids','[]'::jsonb,'errors',COALESCE((SELECT jsonb_agg(jsonb_build_object('path',e.path,'message',e.message)) FROM public.broker_supplier_import_errors e WHERE e.import_row_id=x.id),'[]'::jsonb)) ORDER BY x.row_number),'[]'::jsonb)) INTO v_result FROM public.broker_supplier_import_rows x WHERE x.run_id=p_run_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_get_supplier_detail(p_supplier_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT to_jsonb(f) || jsonb_build_object(
    'products',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'category',p.category,'listing_status',p.listing_status,'is_private',p.is_private) ORDER BY p.created_at DESC) FROM public.products p WHERE p.factory_id=f.id),'[]'::jsonb),
    'rfq_associations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'rfq_case_id',m.rfq_case_id,'case_no',c.case_no,'title',c.title,'status',m.status,'sent_at',m.created_at,'last_activity_at',m.updated_at) ORDER BY m.updated_at DESC) FROM public.rfq_supplier_matches m JOIN public.rfq_cases c ON c.id=m.rfq_case_id WHERE m.factory_id=f.id),'[]'::jsonb),
    'provenance',COALESCE((SELECT jsonb_agg(jsonb_build_object('field_name',p.field_name,'source_url',p.source_url,'value_origin',p.value_origin,'observed_at',p.observed_at) ORDER BY p.field_name) FROM public.catalog_field_provenance p WHERE p.entity_type='supplier' AND p.entity_id=f.id),'[]'::jsonb),
    'source_contacts',COALESCE((SELECT jsonb_agg(jsonb_build_object('contact_type',c.contact_type,'normalized_value',c.normalized_value,'source_url',c.source_url,'validation_status',c.validation_status,'usage_status',c.usage_status,'outreach_allowed',c.outreach_allowed) ORDER BY c.created_at DESC) FROM public.supplier_source_contacts c WHERE c.factory_id=f.id),'[]'::jsonb),
    'audit',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'summary',a.summary,'admin_name',p.full_name,'created_at',a.created_at) ORDER BY a.created_at DESC) FROM public.admin_audit_log a LEFT JOIN public.profiles p ON p.id=a.admin_id WHERE a.target_table='factories' AND a.target_id=f.id),'[]'::jsonb)
  ) INTO v_result FROM public.factories f WHERE f.id=p_supplier_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_promote_supplier_intake(p_intake_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_intake public.supplier_intakes; v_supplier public.factories;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_intake FROM public.supplier_intakes WHERE id=p_intake_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier intake not found' USING ERRCODE='22023'; END IF;
  INSERT INTO public.factories(slug,name,type,region,loc,years,moq,capacity,tags,verify_state,broker_status,source_system,source_record_id,source_payload)
  VALUES('intake-'||substr(replace(v_intake.id::text,'-',''),1,20),v_intake.company_name,'garment_manufacturer',v_intake.country_code,v_intake.address,v_intake.years_in_business,v_intake.moq,v_intake.monthly_capacity,v_intake.categories,'pending','review','manual','intake:'||v_intake.id,v_intake.payload)
  ON CONFLICT(source_system,source_record_id) WHERE source_system IS NOT NULL AND source_record_id IS NOT NULL DO UPDATE SET source_payload=EXCLUDED.source_payload,updated_at=now()
  RETURNING * INTO v_supplier;
  UPDATE public.supplier_intakes SET status=CASE WHEN status='archived' THEN 'archived' ELSE 'pending_manual_review' END,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=v_intake.id;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'factories',v_supplier.id,'create','Promoted supplier intake for review');
  RETURN to_jsonb(v_supplier);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_set_supplier_broker_status(p_supplier_id uuid,p_status text,p_curation_locked boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_supplier public.factories;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_status NOT IN ('review','approved','rejected','archived') THEN RAISE EXCEPTION 'Invalid broker status' USING ERRCODE='22023'; END IF;
  UPDATE public.factories SET broker_status=p_status,verify_state=CASE WHEN p_status='approved' THEN 'verified'::public.verify_state WHEN p_status IN ('review','rejected') THEN 'pending'::public.verify_state ELSE verify_state END,
    archived_at=CASE WHEN p_status='archived' THEN COALESCE(archived_at,now()) ELSE archived_at END,curation_locked=COALESCE(p_curation_locked,curation_locked),broker_reviewed_by=auth.uid(),broker_reviewed_at=now(),updated_at=now()
  WHERE id=p_supplier_id RETURNING * INTO v_supplier;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023'; END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'factories',v_supplier.id,'verify_state_change',p_status);
  RETURN to_jsonb(v_supplier);
END;
$$;

CREATE OR REPLACE FUNCTION public.broker_factory_is_eligible(p_factory public.factories,p_brief jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT p_factory.verify_state='verified' AND p_factory.broker_status='approved' AND p_factory.archived_at IS NULL
    AND (NOT (COALESCE(p_brief,'{}'::jsonb) ? 'region') OR public.broker_normalize_identity(p_factory.region)=public.broker_normalize_identity(p_brief->>'region'))
    AND (NOT (COALESCE(p_brief,'{}'::jsonb) ? 'required_tags') OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_brief->'required_tags') t WHERE NOT (lower(t)=ANY(COALESCE(p_factory.tags,ARRAY[]::text[])))));
$$;

CREATE OR REPLACE FUNCTION public.intools_generate_rfq_supplier_matches(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='22023'; END IF;
  INSERT INTO public.rfq_supplier_matches(rfq_case_id,factory_id,status,eligibility,score,matched_by)
  SELECT v_case.id,f.id,'suggested',jsonb_build_object('verified',true,'broker_approved',true,'not_archived',true),0,auth.uid()
  FROM public.factories f WHERE public.broker_factory_is_eligible(f,v_case.brief)
  ON CONFLICT(rfq_case_id,factory_id) DO UPDATE SET eligibility=EXCLUDED.eligibility,score=EXCLUDED.score,updated_at=now();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'factory_id',m.factory_id,'status',m.status,'eligibility',m.eligibility,'score',m.score) ORDER BY m.updated_at DESC),'[]'::jsonb) INTO v_result FROM public.rfq_supplier_matches m WHERE m.rfq_case_id=v_case.id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_set_rfq_supplier_match_status(p_match_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_match public.rfq_supplier_matches;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_status NOT IN ('suggested','selected','approved','rejected') THEN RAISE EXCEPTION 'Invalid RFQ supplier match status' USING ERRCODE='22023'; END IF;
  UPDATE public.rfq_supplier_matches SET status=p_status,
    approved_by=CASE WHEN p_status='approved' THEN auth.uid() ELSE approved_by END,
    approved_at=CASE WHEN p_status='approved' THEN now() ELSE approved_at END,
    updated_at=now() WHERE id=p_match_id RETURNING * INTO v_match;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ supplier match not found' USING ERRCODE='22023'; END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    VALUES(auth.uid(),'factories',v_match.factory_id,'update','Set RFQ supplier match status to '||p_status);
  RETURN to_jsonb(v_match);
END;
$$;

-- Edge functions use this service-only source of canonical facts after they
-- authenticate the caller.  It is intentionally not callable from the browser.
CREATE OR REPLACE FUNCTION public.broker_rfq_agent_context(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_result jsonb;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('rfq',jsonb_build_object('id',v_case.id,'buyer_profile_id',v_case.buyer_profile_id,'title',v_case.title,'brief',v_case.brief),
    'factories',COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'type',f.type,'region',f.region,'capacity',f.capacity,'certs',f.certs,'tags',f.tags,'lead',f.lead,'moq',f.moq) ORDER BY f.name),'[]'::jsonb)) INTO v_result
  FROM public.factories f WHERE public.broker_factory_is_eligible(f,v_case.brief);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_supplier_import_dry_run(jsonb,boolean), public.intools_promote_supplier_import_rows(uuid,integer[],boolean), public.intools_get_supplier_detail(uuid), public.intools_promote_supplier_intake(uuid), public.intools_set_supplier_broker_status(uuid,text,boolean), public.intools_generate_rfq_supplier_matches(uuid), public.intools_set_rfq_supplier_match_status(uuid,text), public.broker_rfq_agent_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_supplier_import_dry_run(jsonb,boolean), public.intools_promote_supplier_import_rows(uuid,integer[],boolean), public.intools_get_supplier_detail(uuid), public.intools_promote_supplier_intake(uuid), public.intools_set_supplier_broker_status(uuid,text,boolean), public.intools_generate_rfq_supplier_matches(uuid), public.intools_set_rfq_supplier_match_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broker_rfq_agent_context(uuid) TO service_role;
-- RLS, not missing table privileges, controls buyer/owner reads. Factory
-- owners retain their existing direct edit lane but cannot escalate status.
GRANT INSERT, UPDATE ON public.factories TO authenticated;
GRANT SELECT ON public.rfq_supplier_matches TO authenticated;
