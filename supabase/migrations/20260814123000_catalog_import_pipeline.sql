-- Atelix catalog import pipeline: private provenance, deterministic prices,
-- resumable batches, and transactional publication into the existing catalog.

ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS copy_i18n jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(copy_i18n) = 'object');

CREATE TABLE public.catalog_import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  base_url text NOT NULL CHECK (base_url ~ '^https://'),
  trusted_for_auto_publish boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.catalog_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.catalog_import_sources(id),
  scope text NOT NULL CHECK (scope IN ('suppliers','oem','fabrics','interlining','trims','accessories','yarns')),
  mode text NOT NULL DEFAULT 'sync' CHECK (mode IN ('sync','crawl_only')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  discovery_closed_at timestamptz,
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object')
);

CREATE TABLE public.catalog_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.catalog_import_runs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('supplier','product','archive')),
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','publishing','published','live_verified','failed','rolled_back')),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count BETWEEN 0 AND 50),
  git_commit_sha text NOT NULL CHECK (git_commit_sha ~ '^[a-f0-9]{40}$'),
  storage_manifest jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(storage_manifest)='array'),
  error_message text,
  published_at timestamptz,
  live_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, kind, sequence_no)
);

CREATE TABLE public.catalog_staged_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.catalog_import_runs(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.catalog_import_batches(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('supplier','product')),
  source_key text NOT NULL CHECK (btrim(source_key)<>''),
  state text NOT NULL DEFAULT 'publish_ready' CHECK (state IN ('publish_ready','publishing','published','review_required','retryable_error','permanent_error')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND pg_column_size(payload)<=1048576),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, entity_type, source_key)
);

CREATE TABLE public.catalog_source_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.catalog_import_sources(id),
  entity_type text NOT NULL CHECK (entity_type IN ('supplier','product')),
  source_key text NOT NULL,
  entity_id uuid NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_content_sha256 text CHECK (last_content_sha256 IS NULL OR last_content_sha256 ~ '^[a-f0-9]{64}$'),
  consecutive_complete_misses integer NOT NULL DEFAULT 0 CHECK (consecutive_complete_misses >= 0),
  UNIQUE (source_id, entity_type, source_key),
  UNIQUE (source_id, entity_type, entity_id)
);

CREATE TABLE public.catalog_field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('supplier','product')),
  entity_id uuid NOT NULL,
  field_name text NOT NULL CHECK (field_name ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid NOT NULL REFERENCES public.catalog_import_sources(id),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  source_value jsonb,
  value_origin text NOT NULL DEFAULT 'source' CHECK (value_origin IN ('source','normalized','codex_generated','human')),
  input_sha256 text CHECK (input_sha256 IS NULL OR input_sha256 ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field_name, source_id)
);

CREATE TABLE public.supplier_taxonomy_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  l2 text NOT NULL CHECK (l2 ~ '^[a-z0-9][a-z0-9_-]*$'),
  l3 text NOT NULL CHECK (l3 ~ '^[a-z0-9][a-z0-9_-]*$'),
  is_primary boolean NOT NULL DEFAULT false,
  classification_method text NOT NULL DEFAULT 'source' CHECK (classification_method IN ('source','rule','codex','human')),
  classification_evidence text NOT NULL CHECK (btrim(classification_evidence)<>''),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  manual_lock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id,l2,l3)
);
CREATE UNIQUE INDEX supplier_taxonomy_one_primary ON public.supplier_taxonomy_memberships(factory_id) WHERE is_primary;

CREATE TABLE public.catalog_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency IN ('USD','JPY','CNY')),
  source_amount numeric(18,6) NOT NULL CHECK (source_amount > 0),
  source_currency text NOT NULL CHECK (source_currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(20,10) NOT NULL CHECK (fx_rate > 0),
  fx_snapshot_id text NOT NULL CHECK (btrim(fx_snapshot_id)<>''),
  markup_bps integer NOT NULL DEFAULT 2000 CHECK (markup_bps >= 2000),
  unrounded_amount numeric(18,6) NOT NULL CHECK (unrounded_amount > 0),
  rounding_increment numeric(18,6) NOT NULL CHECK (rounding_increment > 0),
  catalog_amount numeric(18,2) NOT NULL CHECK (catalog_amount > 0),
  calculation_version text NOT NULL DEFAULT 'apparelx-v1',
  manual_lock boolean NOT NULL DEFAULT false,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id,currency)
);

CREATE TABLE public.catalog_price_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency IN ('USD','JPY','CNY')),
  min_qty numeric(18,4) NOT NULL CHECK (min_qty > 0),
  source_amount numeric(18,6) NOT NULL CHECK (source_amount > 0),
  source_currency text NOT NULL CHECK (source_currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(20,10) NOT NULL CHECK (fx_rate > 0),
  fx_snapshot_id text NOT NULL CHECK (btrim(fx_snapshot_id)<>''),
  markup_bps integer NOT NULL DEFAULT 2000 CHECK (markup_bps >= 2000),
  catalog_amount numeric(18,2) NOT NULL CHECK (catalog_amount > 0),
  calculation_version text NOT NULL DEFAULT 'apparelx-v1',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id,currency,min_qty)
);

CREATE TABLE public.supplier_source_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.catalog_import_sources(id),
  contact_type text NOT NULL CHECK (contact_type IN ('email')),
  original_value text NOT NULL CHECK (btrim(original_value)<>''),
  normalized_value text NOT NULL CHECK (btrim(normalized_value)<>''),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  source_location text,
  crawled_at timestamptz NOT NULL,
  validation_status text NOT NULL DEFAULT 'unverified' CHECK (validation_status IN ('unverified','syntax_valid','invalid')),
  usage_status text NOT NULL DEFAULT 'documented_only' CHECK (usage_status='documented_only'),
  outreach_allowed boolean NOT NULL DEFAULT false CHECK (outreach_allowed=false),
  public_visibility boolean NOT NULL DEFAULT false CHECK (public_visibility=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id,source_id,contact_type,normalized_value)
);

CREATE TABLE public.catalog_media_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('supplier','product')),
  entity_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('logo','page','primary','gallery')),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  storage_path text NOT NULL UNIQUE CHECK (storage_path<>''),
  public_url text NOT NULL CHECK (public_url ~ '^https://'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/avif')),
  bytes bigint NOT NULL CHECK (bytes > 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  upload_verified_at timestamptz NOT NULL,
  live_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type,entity_id,role,sha256)
);

CREATE INDEX catalog_staged_batch_state_idx ON public.catalog_staged_entities(batch_id,state);
CREATE INDEX catalog_source_identity_entity_idx ON public.catalog_source_identities(entity_type,entity_id);
CREATE INDEX catalog_media_entity_idx ON public.catalog_media_records(entity_type,entity_id);

ALTER TABLE public.catalog_import_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_staged_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_source_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_field_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_taxonomy_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_price_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_source_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_media_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_sources_admin_all ON public.catalog_import_sources FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY catalog_runs_admin_all ON public.catalog_import_runs FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY catalog_batches_admin_all ON public.catalog_import_batches FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY catalog_staged_admin_all ON public.catalog_staged_entities FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY catalog_identities_admin_all ON public.catalog_source_identities FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY catalog_provenance_admin_all ON public.catalog_field_provenance FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY catalog_prices_admin_all ON public.catalog_prices FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY catalog_price_breaks_admin_all ON public.catalog_price_breaks FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY supplier_contacts_admin_all ON public.supplier_source_contacts FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY catalog_media_admin_all ON public.catalog_media_records FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY supplier_taxonomy_public_read ON public.supplier_taxonomy_memberships FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.factories f WHERE f.id=factory_id AND f.archived_at IS NULL AND f.verify_state='verified')
);
CREATE POLICY supplier_taxonomy_admin_write ON public.supplier_taxonomy_memberships FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

REVOKE ALL ON public.catalog_import_sources,public.catalog_import_runs,public.catalog_import_batches,
  public.catalog_staged_entities,public.catalog_source_identities,public.catalog_field_provenance,
  public.catalog_prices,public.catalog_price_breaks,public.supplier_source_contacts,public.catalog_media_records
  FROM anon,authenticated;
GRANT SELECT ON public.supplier_taxonomy_memberships TO anon,authenticated;
GRANT SELECT ON public.catalog_import_sources,public.catalog_import_runs,public.catalog_import_batches,
  public.catalog_staged_entities,public.catalog_source_identities,public.catalog_field_provenance,
  public.catalog_prices,public.catalog_price_breaks,public.supplier_source_contacts,public.catalog_media_records TO authenticated;

CREATE OR REPLACE FUNCTION public.catalog_require_publisher()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
BEGIN
  IF COALESCE(auth.role(),'')='service_role' THEN RETURN; END IF;
  PERFORM public.intools_require_admin();
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_jsonb_has_email_key(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_key text; v_child jsonb; v_match text[];
BEGIN
  IF p_value IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(p_value)='object' THEN
    FOR v_key,v_child IN SELECT key,value FROM jsonb_each(p_value) LOOP
      IF v_key ~* 'email' OR public.catalog_jsonb_has_email_key(v_child) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value)='array' THEN
    FOR v_child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      IF public.catalog_jsonb_has_email_key(v_child) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value)='string' THEN
    FOR v_match IN SELECT regexp_matches(p_value #>> '{}','[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}','gi') LOOP
      IF lower(v_match[1]) <> 'info@arcanawangsa.com' THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_calculate_price(p_source_amount numeric,p_fx_rate numeric,p_currency text,p_markup_bps integer DEFAULT 2000)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_increment numeric; v_unrounded numeric;
BEGIN
  IF p_source_amount<=0 OR p_fx_rate<=0 OR p_markup_bps<2000 THEN RAISE EXCEPTION 'invalid catalog price inputs' USING ERRCODE='22023'; END IF;
  v_increment:=CASE upper(p_currency) WHEN 'USD' THEN 0.1 WHEN 'JPY' THEN 100 WHEN 'CNY' THEN 0.1 ELSE NULL END;
  IF v_increment IS NULL THEN RAISE EXCEPTION 'unsupported catalog currency: %',p_currency USING ERRCODE='22023'; END IF;
  v_unrounded:=p_source_amount*p_fx_rate*(1+(p_markup_bps::numeric/10000));
  RETURN ceil(v_unrounded/v_increment)*v_increment;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_upsert_provenance(p_entity_type text,p_entity_id uuid,p_source_id uuid,p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_item jsonb;
BEGIN
  IF p_items IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'provenance must be an array' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.catalog_field_provenance(entity_type,entity_id,field_name,source_id,source_url,source_value,value_origin,input_sha256,observed_at)
    VALUES(p_entity_type,p_entity_id,v_item->>'field_name',p_source_id,v_item->>'source_url',v_item->'source_value',
      COALESCE(v_item->>'value_origin','source'),v_item->>'input_sha256',COALESCE((v_item->>'observed_at')::timestamptz,now()))
    ON CONFLICT(entity_type,entity_id,field_name,source_id) DO UPDATE SET source_url=excluded.source_url,
      source_value=excluded.source_value,value_origin=excluded.value_origin,input_sha256=excluded.input_sha256,observed_at=excluded.observed_at;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_finalize_supplier_batch(p_run_id uuid,p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_batch public.catalog_import_batches; v_source_id uuid; v_base_url text; v_stage public.catalog_staged_entities; v_doc jsonb; v_data jsonb;
  v_factory public.factories; v_entity_id uuid; v_tax jsonb; v_contact jsonb; v_media jsonb; v_count integer:=0;
BEGIN
  PERFORM public.catalog_require_publisher();
  SELECT * INTO v_batch FROM public.catalog_import_batches WHERE id=p_batch_id AND run_id=p_run_id AND kind='supplier' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supplier batch not found' USING ERRCODE='22023'; END IF;
  IF v_batch.status IN ('published','live_verified') THEN RETURN jsonb_build_object('batch_id',v_batch.id,'status',v_batch.status,'count',v_batch.item_count,'idempotent',true); END IF;
  IF v_batch.status<>'staged' THEN RAISE EXCEPTION 'supplier batch is not staged'; END IF;
  SELECT r.source_id,s.base_url INTO v_source_id,v_base_url FROM public.catalog_import_runs r
    JOIN public.catalog_import_sources s ON s.id=r.source_id AND s.trusted_for_auto_publish
    WHERE r.id=p_run_id AND r.mode='sync';
  IF v_source_id IS NULL THEN RAISE EXCEPTION 'sync run not found'; END IF;
  SELECT count(*) INTO v_count FROM public.catalog_staged_entities WHERE batch_id=p_batch_id AND run_id=p_run_id AND entity_type='supplier' AND state='publish_ready';
  IF v_count<1 OR v_count>50 OR v_count<>v_batch.item_count THEN RAISE EXCEPTION 'supplier batch must contain 1..50 ready items matching item_count'; END IF;
  UPDATE public.catalog_import_batches SET status='publishing',updated_at=now() WHERE id=p_batch_id;
  FOR v_stage IN SELECT * FROM public.catalog_staged_entities WHERE batch_id=p_batch_id AND state='publish_ready' ORDER BY source_key FOR UPDATE LOOP
    v_doc:=v_stage.payload; v_data:=v_doc->'supplier';
    IF v_doc->>'source_url' NOT LIKE v_base_url||'/%' THEN RAISE EXCEPTION 'supplier source URL does not match trusted source'; END IF;
    IF jsonb_typeof(v_data)<>'object' OR public.catalog_jsonb_has_email_key(v_data) THEN RAISE EXCEPTION 'supplier public payload invalid or contains email'; END IF;
    SELECT entity_id INTO v_entity_id FROM public.catalog_source_identities WHERE source_id=v_source_id AND entity_type='supplier' AND source_key=v_stage.source_key;
    IF v_entity_id IS NULL THEN
      INSERT INTO public.factories(slug,name,type,region,loc,verify_state,years,moq,lead,capacity,certs,tags,sales,phone,web,founded,employees,area,port,bio,img,logo_img,page_img,copy_i18n,updated_at)
      VALUES(v_data->>'slug',v_data->>'name',(v_data->>'type')::public.factory_type,v_data->>'region',v_data->>'loc',
        COALESCE((v_data->>'verify_state')::public.verify_state,'pending'),(v_data->>'years')::integer,v_data->>'moq',v_data->>'lead',v_data->>'capacity',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_data->'certs','[]'::jsonb))),ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_data->'tags','[]'::jsonb))),
        v_data->>'sales',v_data->>'phone',v_data->>'web',(v_data->>'founded')::integer,v_data->>'employees',v_data->>'area',v_data->>'port',v_data->>'bio',
        v_data->>'img',v_data->>'logo_img',v_data->>'page_img',COALESCE(v_data->'copy_i18n','{}'::jsonb),now())
      ON CONFLICT(slug) DO UPDATE SET name=excluded.name,type=excluded.type,region=excluded.region,loc=excluded.loc,
        verify_state=excluded.verify_state,years=excluded.years,moq=excluded.moq,lead=excluded.lead,capacity=excluded.capacity,
        certs=excluded.certs,tags=excluded.tags,sales=excluded.sales,phone=excluded.phone,web=excluded.web,founded=excluded.founded,
        employees=excluded.employees,area=excluded.area,port=excluded.port,bio=excluded.bio,img=excluded.img,logo_img=excluded.logo_img,page_img=excluded.page_img,
        copy_i18n=excluded.copy_i18n,archived_at=NULL,updated_at=now()
      RETURNING * INTO v_factory;
      v_entity_id:=v_factory.id;
    ELSE
      UPDATE public.factories f SET slug=COALESCE(v_data->>'slug',f.slug),name=COALESCE(v_data->>'name',f.name),
        type=COALESCE((v_data->>'type')::public.factory_type,f.type),region=CASE WHEN v_data?'region' THEN v_data->>'region' ELSE f.region END,
        loc=CASE WHEN v_data?'loc' THEN v_data->>'loc' ELSE f.loc END,verify_state=COALESCE((v_data->>'verify_state')::public.verify_state,f.verify_state),
        years=CASE WHEN v_data?'years' THEN (v_data->>'years')::integer ELSE f.years END,moq=CASE WHEN v_data?'moq' THEN v_data->>'moq' ELSE f.moq END,
        lead=CASE WHEN v_data?'lead' THEN v_data->>'lead' ELSE f.lead END,capacity=CASE WHEN v_data?'capacity' THEN v_data->>'capacity' ELSE f.capacity END,
        certs=CASE WHEN v_data?'certs' THEN ARRAY(SELECT jsonb_array_elements_text(v_data->'certs')) ELSE f.certs END,
        tags=CASE WHEN v_data?'tags' THEN ARRAY(SELECT jsonb_array_elements_text(v_data->'tags')) ELSE f.tags END,
        sales=CASE WHEN v_data?'sales' THEN v_data->>'sales' ELSE f.sales END,phone=CASE WHEN v_data?'phone' THEN v_data->>'phone' ELSE f.phone END,
        web=CASE WHEN v_data?'web' THEN v_data->>'web' ELSE f.web END,founded=CASE WHEN v_data?'founded' THEN (v_data->>'founded')::integer ELSE f.founded END,
        employees=CASE WHEN v_data?'employees' THEN v_data->>'employees' ELSE f.employees END,area=CASE WHEN v_data?'area' THEN v_data->>'area' ELSE f.area END,
        port=CASE WHEN v_data?'port' THEN v_data->>'port' ELSE f.port END,
        bio=CASE WHEN v_data?'bio' THEN v_data->>'bio' ELSE f.bio END,img=CASE WHEN v_data?'img' THEN v_data->>'img' ELSE f.img END,
        logo_img=CASE WHEN v_data?'logo_img' THEN v_data->>'logo_img' ELSE f.logo_img END,page_img=CASE WHEN v_data?'page_img' THEN v_data->>'page_img' ELSE f.page_img END,
        copy_i18n=CASE WHEN v_data?'copy_i18n' THEN v_data->'copy_i18n' ELSE f.copy_i18n END,archived_at=NULL,updated_at=now()
      WHERE f.id=v_entity_id RETURNING * INTO v_factory;
    END IF;
    INSERT INTO public.catalog_source_identities(source_id,entity_type,source_key,entity_id,source_url,last_content_sha256)
    VALUES(v_source_id,'supplier',v_stage.source_key,v_entity_id,v_doc->>'source_url',v_stage.input_sha256)
    ON CONFLICT(source_id,entity_type,source_key) DO UPDATE SET entity_id=excluded.entity_id,source_url=excluded.source_url,last_seen_at=now(),last_content_sha256=excluded.last_content_sha256,consecutive_complete_misses=0;
    IF NOT EXISTS(SELECT 1 FROM public.supplier_taxonomy_memberships WHERE factory_id=v_entity_id AND manual_lock) THEN
      IF jsonb_typeof(v_doc->'taxonomy')<>'array' OR (SELECT count(*) FROM jsonb_array_elements(v_doc->'taxonomy') x WHERE COALESCE((x->>'is_primary')::boolean,false))<>1 THEN
        RAISE EXCEPTION 'supplier % requires exactly one primary taxonomy',v_stage.source_key;
      END IF;
      DELETE FROM public.supplier_taxonomy_memberships WHERE factory_id=v_entity_id;
      FOR v_tax IN SELECT value FROM jsonb_array_elements(v_doc->'taxonomy') LOOP
        INSERT INTO public.supplier_taxonomy_memberships(factory_id,l2,l3,is_primary,classification_method,classification_evidence,source_url)
        VALUES(v_entity_id,v_tax->>'l2',v_tax->>'l3',COALESCE((v_tax->>'is_primary')::boolean,false),COALESCE(v_tax->>'classification_method','source'),v_tax->>'classification_evidence',v_tax->>'source_url');
      END LOOP;
    END IF;
    FOR v_contact IN SELECT value FROM jsonb_array_elements(COALESCE(v_doc->'private_contacts','[]'::jsonb)) LOOP
      INSERT INTO public.supplier_source_contacts(factory_id,source_id,contact_type,original_value,normalized_value,source_url,source_location,crawled_at,validation_status)
      VALUES(v_entity_id,v_source_id,'email',v_contact->>'original_value',lower(btrim(v_contact->>'normalized_value')),v_contact->>'source_url',v_contact->>'source_location',
        COALESCE((v_contact->>'crawled_at')::timestamptz,now()),COALESCE(v_contact->>'validation_status','unverified'))
      ON CONFLICT(factory_id,source_id,contact_type,normalized_value) DO UPDATE SET original_value=excluded.original_value,source_url=excluded.source_url,
        source_location=excluded.source_location,crawled_at=excluded.crawled_at,validation_status=excluded.validation_status;
    END LOOP;
    FOR v_media IN SELECT value FROM jsonb_array_elements(COALESCE(v_doc->'media','[]'::jsonb)) LOOP
      INSERT INTO public.catalog_media_records(entity_type,entity_id,role,source_url,storage_path,public_url,sha256,mime_type,bytes,width,height,upload_verified_at)
      VALUES('supplier',v_entity_id,v_media->>'role',v_media->>'source_url',v_media->>'storage_path',v_media->>'public_url',v_media->>'sha256',v_media->>'mime_type',
        (v_media->>'bytes')::bigint,(v_media->>'width')::integer,(v_media->>'height')::integer,(v_media->>'upload_verified_at')::timestamptz)
      ON CONFLICT(storage_path) DO UPDATE SET entity_id=excluded.entity_id,role=excluded.role,public_url=excluded.public_url,upload_verified_at=excluded.upload_verified_at;
    END LOOP;
    PERFORM public.catalog_upsert_provenance('supplier',v_entity_id,v_source_id,v_doc->'provenance');
    UPDATE public.catalog_staged_entities SET state='published',updated_at=now() WHERE id=v_stage.id;
  END LOOP;
  UPDATE public.catalog_import_batches SET status='published',published_at=now(),updated_at=now() WHERE id=p_batch_id;
  RETURN jsonb_build_object('batch_id',p_batch_id,'status','published','count',v_count,'idempotent',false);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.catalog_import_batches SET status='failed',error_message=SQLERRM,updated_at=now() WHERE id=p_batch_id;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_finalize_product_batch(p_run_id uuid,p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_batch public.catalog_import_batches; v_source_id uuid; v_base_url text; v_stage public.catalog_staged_entities; v_doc jsonb; v_data jsonb;
  v_product public.products; v_entity_id uuid; v_factory_id uuid; v_price jsonb; v_break jsonb; v_media jsonb;
  v_currency text; v_catalog numeric; v_usd numeric; v_count integer:=0; v_price_locked boolean:=false;
BEGIN
  PERFORM public.catalog_require_publisher();
  SELECT * INTO v_batch FROM public.catalog_import_batches WHERE id=p_batch_id AND run_id=p_run_id AND kind='product' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product batch not found' USING ERRCODE='22023'; END IF;
  IF v_batch.status IN ('published','live_verified') THEN RETURN jsonb_build_object('batch_id',v_batch.id,'status',v_batch.status,'count',v_batch.item_count,'idempotent',true); END IF;
  IF v_batch.status<>'staged' THEN RAISE EXCEPTION 'product batch is not staged'; END IF;
  SELECT r.source_id,s.base_url INTO v_source_id,v_base_url FROM public.catalog_import_runs r
    JOIN public.catalog_import_sources s ON s.id=r.source_id AND s.trusted_for_auto_publish
    WHERE r.id=p_run_id AND r.mode='sync';
  SELECT count(*) INTO v_count FROM public.catalog_staged_entities WHERE batch_id=p_batch_id AND run_id=p_run_id AND entity_type='product' AND state='publish_ready';
  IF v_source_id IS NULL OR v_count<1 OR v_count>50 OR v_count<>v_batch.item_count THEN RAISE EXCEPTION 'product batch must contain 1..50 ready items matching item_count'; END IF;
  UPDATE public.catalog_import_batches SET status='publishing',updated_at=now() WHERE id=p_batch_id;
  FOR v_stage IN SELECT * FROM public.catalog_staged_entities WHERE batch_id=p_batch_id AND state='publish_ready' ORDER BY source_key FOR UPDATE LOOP
    v_doc:=v_stage.payload; v_data:=v_doc->'product'; v_usd:=NULL;
    IF v_doc->>'source_url' NOT LIKE v_base_url||'/%' THEN RAISE EXCEPTION 'product source URL does not match trusted source'; END IF;
    IF jsonb_typeof(v_data)<>'object' OR public.catalog_jsonb_has_email_key(v_data) THEN RAISE EXCEPTION 'product public payload invalid or contains email'; END IF;
    SELECT si.entity_id INTO v_factory_id FROM public.catalog_source_identities si WHERE si.source_id=v_source_id AND si.entity_type='supplier' AND si.source_key=v_doc->>'supplier_source_key';
    IF v_factory_id IS NULL THEN RAISE EXCEPTION 'supplier dependency not published for product %',v_stage.source_key; END IF;
    IF jsonb_typeof(COALESCE(v_doc->'prices','[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'prices must be an array'; END IF;
    FOR v_price IN SELECT value FROM jsonb_array_elements(COALESCE(v_doc->'prices','[]'::jsonb)) LOOP
      v_currency:=upper(v_price->>'currency');
      v_catalog:=public.catalog_calculate_price((v_price->>'source_amount')::numeric,(v_price->>'fx_rate')::numeric,v_currency,COALESCE((v_price->>'markup_bps')::integer,2000));
      IF v_currency='USD' THEN v_usd:=v_catalog; END IF;
    END LOOP;
    IF jsonb_array_length(COALESCE(v_doc->'prices','[]'::jsonb))>0 AND v_usd IS NULL THEN RAISE EXCEPTION 'fixed product % requires a USD compatibility price',v_stage.source_key; END IF;
    SELECT entity_id INTO v_entity_id FROM public.catalog_source_identities WHERE source_id=v_source_id AND entity_type='product' AND source_key=v_stage.source_key;
    IF v_entity_id IS NULL THEN SELECT id INTO v_entity_id FROM public.products WHERE sku=v_data->>'sku'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.catalog_prices WHERE product_id=v_entity_id AND manual_lock) INTO v_price_locked;
    IF v_price_locked THEN SELECT price INTO v_usd FROM public.products WHERE id=v_entity_id; END IF;
    IF v_entity_id IS NULL THEN
      INSERT INTO public.products(sku,name,comp,spec,price,pricing_mode,unit_type,moq,factory_id,category,badge,img,images,loc,listing_status,
        description,subcategory,construction,applications,season,color_family,origin_country,lead_time,handling_notes,gsm,fabric_width,roll_length,style_code,is_private,updated_at)
      VALUES(v_data->>'sku',v_data->>'name',v_data->>'comp',v_data->>'spec',COALESCE(v_usd,0),CASE WHEN v_usd IS NULL THEN 'quote' ELSE 'fixed' END::public.pricing_mode,
        (v_data->>'unit_type')::public.unit_type,(v_data->>'moq')::numeric,v_factory_id,(v_data->>'category')::public.product_category,v_data->>'badge',v_data->>'img',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_data->'images','[]'::jsonb))),v_data->>'loc',COALESCE((v_data->>'listing_status')::public.listing_status,'draft'),
        v_data->>'description',v_data->>'subcategory',v_data->>'construction',v_data->>'applications',v_data->>'season',v_data->>'color_family',v_data->>'origin_country',
        v_data->>'lead_time',v_data->>'handling_notes',v_data->>'gsm',v_data->>'fabric_width',v_data->>'roll_length',v_data->>'style_code',COALESCE((v_data->>'is_private')::boolean,false),now())
      ON CONFLICT(sku) DO UPDATE SET name=excluded.name,comp=excluded.comp,spec=excluded.spec,price=excluded.price,pricing_mode=excluded.pricing_mode,unit_type=excluded.unit_type,
        moq=excluded.moq,factory_id=excluded.factory_id,category=excluded.category,badge=excluded.badge,img=excluded.img,images=excluded.images,loc=excluded.loc,
        listing_status=excluded.listing_status,description=excluded.description,subcategory=excluded.subcategory,construction=excluded.construction,applications=excluded.applications,
        season=excluded.season,color_family=excluded.color_family,origin_country=excluded.origin_country,lead_time=excluded.lead_time,handling_notes=excluded.handling_notes,
        gsm=excluded.gsm,fabric_width=excluded.fabric_width,roll_length=excluded.roll_length,style_code=excluded.style_code,is_private=excluded.is_private,archived_at=NULL,updated_at=now()
      RETURNING * INTO v_product;
      v_entity_id:=v_product.id;
    ELSE
      UPDATE public.products p SET name=COALESCE(v_data->>'name',p.name),comp=CASE WHEN v_data?'comp' THEN v_data->>'comp' ELSE p.comp END,
        spec=CASE WHEN v_data?'spec' THEN v_data->>'spec' ELSE p.spec END,price=COALESCE(v_usd,0),pricing_mode=CASE WHEN v_usd IS NULL THEN 'quote' ELSE 'fixed' END::public.pricing_mode,
        unit_type=CASE WHEN v_data?'unit_type' THEN (v_data->>'unit_type')::public.unit_type ELSE p.unit_type END,
        moq=CASE WHEN v_data?'moq' THEN (v_data->>'moq')::numeric ELSE p.moq END,factory_id=v_factory_id,category=COALESCE((v_data->>'category')::public.product_category,p.category),
        badge=CASE WHEN v_data?'badge' THEN v_data->>'badge' ELSE p.badge END,loc=CASE WHEN v_data?'loc' THEN v_data->>'loc' ELSE p.loc END,
        img=CASE WHEN v_data?'img' THEN v_data->>'img' ELSE p.img END,images=CASE WHEN v_data?'images' THEN ARRAY(SELECT jsonb_array_elements_text(v_data->'images')) ELSE p.images END,
        listing_status=COALESCE((v_data->>'listing_status')::public.listing_status,p.listing_status),description=CASE WHEN v_data?'description' THEN v_data->>'description' ELSE p.description END,
        subcategory=CASE WHEN v_data?'subcategory' THEN v_data->>'subcategory' ELSE p.subcategory END,construction=CASE WHEN v_data?'construction' THEN v_data->>'construction' ELSE p.construction END,
        applications=CASE WHEN v_data?'applications' THEN v_data->>'applications' ELSE p.applications END,season=CASE WHEN v_data?'season' THEN v_data->>'season' ELSE p.season END,
        color_family=CASE WHEN v_data?'color_family' THEN v_data->>'color_family' ELSE p.color_family END,origin_country=CASE WHEN v_data?'origin_country' THEN v_data->>'origin_country' ELSE p.origin_country END,
        lead_time=CASE WHEN v_data?'lead_time' THEN v_data->>'lead_time' ELSE p.lead_time END,handling_notes=CASE WHEN v_data?'handling_notes' THEN v_data->>'handling_notes' ELSE p.handling_notes END,
        gsm=CASE WHEN v_data?'gsm' THEN v_data->>'gsm' ELSE p.gsm END,fabric_width=CASE WHEN v_data?'fabric_width' THEN v_data->>'fabric_width' ELSE p.fabric_width END,
        roll_length=CASE WHEN v_data?'roll_length' THEN v_data->>'roll_length' ELSE p.roll_length END,style_code=CASE WHEN v_data?'style_code' THEN v_data->>'style_code' ELSE p.style_code END,
        is_private=CASE WHEN v_data?'is_private' THEN (v_data->>'is_private')::boolean ELSE p.is_private END,archived_at=NULL,updated_at=now()
      WHERE p.id=v_entity_id RETURNING * INTO v_product;
    END IF;
    INSERT INTO public.catalog_source_identities(source_id,entity_type,source_key,entity_id,source_url,last_content_sha256)
    VALUES(v_source_id,'product',v_stage.source_key,v_entity_id,v_doc->>'source_url',v_stage.input_sha256)
    ON CONFLICT(source_id,entity_type,source_key) DO UPDATE SET entity_id=excluded.entity_id,source_url=excluded.source_url,last_seen_at=now(),last_content_sha256=excluded.last_content_sha256,consecutive_complete_misses=0;
    IF NOT v_price_locked THEN
      FOR v_price IN SELECT value FROM jsonb_array_elements(COALESCE(v_doc->'prices','[]'::jsonb)) LOOP
        v_currency:=upper(v_price->>'currency'); v_catalog:=public.catalog_calculate_price((v_price->>'source_amount')::numeric,(v_price->>'fx_rate')::numeric,v_currency,COALESCE((v_price->>'markup_bps')::integer,2000));
        INSERT INTO public.catalog_prices(product_id,currency,source_amount,source_currency,fx_rate,fx_snapshot_id,markup_bps,unrounded_amount,rounding_increment,catalog_amount,calculation_version)
        VALUES(v_entity_id,v_currency,(v_price->>'source_amount')::numeric,upper(v_price->>'source_currency'),(v_price->>'fx_rate')::numeric,v_price->>'fx_snapshot_id',
          COALESCE((v_price->>'markup_bps')::integer,2000),(v_price->>'source_amount')::numeric*(v_price->>'fx_rate')::numeric*(1+COALESCE((v_price->>'markup_bps')::integer,2000)::numeric/10000),
          CASE v_currency WHEN 'JPY' THEN 100 ELSE 0.1 END,v_catalog,COALESCE(v_price->>'calculation_version','apparelx-v1'))
        ON CONFLICT(product_id,currency) DO UPDATE SET source_amount=excluded.source_amount,source_currency=excluded.source_currency,
          fx_rate=excluded.fx_rate,fx_snapshot_id=excluded.fx_snapshot_id,markup_bps=excluded.markup_bps,unrounded_amount=excluded.unrounded_amount,
          rounding_increment=excluded.rounding_increment,catalog_amount=excluded.catalog_amount,calculation_version=excluded.calculation_version,calculated_at=now();
      END LOOP;
      DELETE FROM public.catalog_price_breaks WHERE product_id=v_entity_id;
      DELETE FROM public.price_breaks WHERE product_id=v_entity_id;
      FOR v_break IN SELECT value FROM jsonb_array_elements(COALESCE(v_doc->'price_breaks','[]'::jsonb)) LOOP
        v_currency:=upper(v_break->>'currency'); v_catalog:=public.catalog_calculate_price((v_break->>'source_amount')::numeric,(v_break->>'fx_rate')::numeric,v_currency,COALESCE((v_break->>'markup_bps')::integer,2000));
        INSERT INTO public.catalog_price_breaks(product_id,currency,min_qty,source_amount,source_currency,fx_rate,fx_snapshot_id,markup_bps,catalog_amount,calculation_version)
        VALUES(v_entity_id,v_currency,(v_break->>'min_qty')::numeric,(v_break->>'source_amount')::numeric,upper(v_break->>'source_currency'),(v_break->>'fx_rate')::numeric,
          v_break->>'fx_snapshot_id',COALESCE((v_break->>'markup_bps')::integer,2000),v_catalog,COALESCE(v_break->>'calculation_version','apparelx-v1'));
        IF v_currency='USD' THEN INSERT INTO public.price_breaks(product_id,min_qty,unit_price) VALUES(v_entity_id,(v_break->>'min_qty')::numeric,v_catalog); END IF;
      END LOOP;
    END IF;
    IF EXISTS(SELECT 1 FROM (SELECT min_qty,catalog_amount,lag(catalog_amount) OVER(ORDER BY min_qty) prior FROM public.catalog_price_breaks WHERE product_id=v_entity_id AND currency='USD') q WHERE prior IS NOT NULL AND catalog_amount>prior) THEN
      RAISE EXCEPTION 'non-monotonic USD price breaks for product %',v_stage.source_key;
    END IF;
    FOR v_media IN SELECT value FROM jsonb_array_elements(COALESCE(v_doc->'media','[]'::jsonb)) LOOP
      INSERT INTO public.catalog_media_records(entity_type,entity_id,role,source_url,storage_path,public_url,sha256,mime_type,bytes,width,height,upload_verified_at)
      VALUES('product',v_entity_id,v_media->>'role',v_media->>'source_url',v_media->>'storage_path',v_media->>'public_url',v_media->>'sha256',v_media->>'mime_type',
        (v_media->>'bytes')::bigint,(v_media->>'width')::integer,(v_media->>'height')::integer,(v_media->>'upload_verified_at')::timestamptz)
      ON CONFLICT(storage_path) DO UPDATE SET entity_id=excluded.entity_id,role=excluded.role,public_url=excluded.public_url,upload_verified_at=excluded.upload_verified_at;
    END LOOP;
    PERFORM public.catalog_upsert_provenance('product',v_entity_id,v_source_id,v_doc->'provenance');
    UPDATE public.catalog_staged_entities SET state='published',updated_at=now() WHERE id=v_stage.id;
  END LOOP;
  UPDATE public.catalog_import_batches SET status='published',published_at=now(),updated_at=now() WHERE id=p_batch_id;
  RETURN jsonb_build_object('batch_id',p_batch_id,'status','published','count',v_count,'idempotent',false);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.catalog_import_batches SET status='failed',error_message=SQLERRM,updated_at=now() WHERE id=p_batch_id;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_mark_batch_live_verified(p_batch_id uuid,p_manifest_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_batch public.catalog_import_batches;
BEGIN
  PERFORM public.catalog_require_publisher();
  SELECT * INTO v_batch FROM public.catalog_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND OR v_batch.manifest_sha256<>p_manifest_sha256 THEN RAISE EXCEPTION 'batch or manifest hash mismatch'; END IF;
  IF v_batch.status='live_verified' THEN RETURN jsonb_build_object('batch_id',v_batch.id,'status',v_batch.status,'idempotent',true); END IF;
  IF v_batch.status<>'published' THEN RAISE EXCEPTION 'batch is not published'; END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_batch.storage_manifest) item
    LEFT JOIN public.catalog_media_records m ON m.storage_path=item->>'storage_path' AND m.sha256=item->>'sha256'
    WHERE m.id IS NULL OR m.live_verified_at IS NULL
  ) THEN RAISE EXCEPTION 'batch media is not live verified'; END IF;
  UPDATE public.catalog_import_batches SET status='live_verified',live_verified_at=now(),updated_at=now() WHERE id=p_batch_id;
  RETURN jsonb_build_object('batch_id',p_batch_id,'status','live_verified','idempotent',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_mark_media_live_verified(p_storage_path text,p_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.catalog_require_publisher();
  UPDATE public.catalog_media_records SET live_verified_at=now() WHERE storage_path=p_storage_path AND sha256=p_sha256 AND upload_verified_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'media path or hash mismatch'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_close_complete_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_run public.catalog_import_runs; v_entity_type text; v_incremented integer:=0; v_archived integer:=0;
BEGIN
  PERFORM public.catalog_require_publisher();
  SELECT * INTO v_run FROM public.catalog_import_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog run not found'; END IF;
  IF v_run.status='completed' THEN RETURN jsonb_build_object('run_id',p_run_id,'status','completed','idempotent',true); END IF;
  IF v_run.mode<>'sync' OR COALESCE((v_run.metadata->>'complete_discovery')::boolean,false)<>true THEN
    RAISE EXCEPTION 'run is not declared complete discovery';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.catalog_import_batches WHERE run_id=p_run_id)
    OR EXISTS(SELECT 1 FROM public.catalog_import_batches WHERE run_id=p_run_id AND status<>'live_verified') THEN
    RAISE EXCEPTION 'all run batches must be live verified before closure';
  END IF;
  v_entity_type:=CASE WHEN v_run.scope IN ('suppliers','oem') THEN 'supplier' ELSE 'product' END;
  UPDATE public.catalog_source_identities identity SET consecutive_complete_misses=identity.consecutive_complete_misses+1
  WHERE identity.source_id=v_run.source_id AND identity.entity_type=v_entity_type
    AND NOT EXISTS(SELECT 1 FROM public.catalog_staged_entities staged
      WHERE staged.run_id=p_run_id AND staged.entity_type=v_entity_type AND staged.source_key=identity.source_key AND staged.state='published');
  GET DIAGNOSTICS v_incremented=ROW_COUNT;
  IF v_entity_type='supplier' THEN
    UPDATE public.factories factory SET archived_at=COALESCE(factory.archived_at,now()),updated_at=now()
    FROM public.catalog_source_identities identity WHERE identity.entity_id=factory.id AND identity.source_id=v_run.source_id
      AND identity.entity_type='supplier' AND identity.consecutive_complete_misses>=3 AND factory.archived_at IS NULL;
  ELSE
    UPDATE public.products product SET archived_at=COALESCE(product.archived_at,now()),updated_at=now()
    FROM public.catalog_source_identities identity WHERE identity.entity_id=product.id AND identity.source_id=v_run.source_id
      AND identity.entity_type='product' AND identity.consecutive_complete_misses>=3 AND product.archived_at IS NULL;
  END IF;
  GET DIAGNOSTICS v_archived=ROW_COUNT;
  UPDATE public.catalog_import_runs SET status='completed',discovery_closed_at=now(),finished_at=now(),metadata=metadata||jsonb_build_object('misses_incremented',v_incremented,'archived',v_archived)
  WHERE id=p_run_id;
  RETURN jsonb_build_object('run_id',p_run_id,'status','completed','misses_incremented',v_incremented,'archived',v_archived,'idempotent',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_public_prices(p_currency text DEFAULT 'USD')
RETURNS TABLE(product_id uuid,currency text,catalog_amount numeric)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT cp.product_id,cp.currency,cp.catalog_amount FROM public.catalog_prices cp
  JOIN public.products p ON p.id=cp.product_id JOIN public.factories f ON f.id=p.factory_id
  WHERE cp.currency=upper(p_currency) AND p.listing_status='active' AND NOT p.is_private AND p.archived_at IS NULL
    AND f.verify_state='verified' AND f.archived_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.catalog_require_publisher() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_jsonb_has_email_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_calculate_price(numeric,numeric,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_upsert_provenance(text,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_finalize_supplier_batch(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_finalize_product_batch(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_mark_batch_live_verified(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_mark_media_live_verified(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_close_complete_run(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_public_prices(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_finalize_supplier_batch(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalog_finalize_product_batch(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalog_mark_batch_live_verified(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalog_mark_media_live_verified(text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalog_close_complete_run(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalog_public_prices(text) TO anon,authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('catalog-media','catalog-media',true,15728640,ARRAY['image/jpeg','image/png','image/webp','image/avif'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
DROP POLICY IF EXISTS catalog_media_public_read ON storage.objects;
CREATE POLICY catalog_media_public_read ON storage.objects FOR SELECT USING (bucket_id='catalog-media');
DROP POLICY IF EXISTS catalog_media_admin_insert ON storage.objects;
CREATE POLICY catalog_media_admin_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id='catalog-media' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS catalog_media_admin_update ON storage.objects;
CREATE POLICY catalog_media_admin_update ON storage.objects FOR UPDATE USING (bucket_id='catalog-media' AND (SELECT public.is_admin())) WITH CHECK (bucket_id='catalog-media' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS catalog_media_admin_delete ON storage.objects;
CREATE POLICY catalog_media_admin_delete ON storage.objects FOR DELETE USING (bucket_id='catalog-media' AND (SELECT public.is_admin()));

INSERT INTO public.catalog_import_sources(slug,base_url,trusted_for_auto_publish)
VALUES('apparelx','https://www.apparel-x.com',true)
ON CONFLICT(slug) DO UPDATE SET base_url=excluded.base_url,trusted_for_auto_publish=excluded.trusted_for_auto_publish,updated_at=now();
