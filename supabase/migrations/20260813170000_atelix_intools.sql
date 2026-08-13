-- Atelix Intools: versioned content, widgets, media and RPC-only administration.
-- Intools authorization is enforced in the database for confirmed admin sessions.

CREATE TABLE public.content_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route text NOT NULL UNIQUE CHECK (route ~ '^/[a-z0-9/_-]*$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  template text NOT NULL DEFAULT 'standard' CHECK (template ~ '^[a-z0-9_-]+$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  current_revision integer NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  published_revision_id uuid,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE public.content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.content_pages(id) ON DELETE CASCADE,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  locale_readiness jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (page_id, revision_no)
);

ALTER TABLE public.content_pages
  ADD CONSTRAINT content_pages_published_revision_fk
  FOREIGN KEY (published_revision_id) REFERENCES public.content_revisions(id);

CREATE TABLE public.widget_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_key text NOT NULL UNIQUE CHECK (widget_key ~ '^[a-z0-9_-]+$'),
  widget_type text NOT NULL CHECK (widget_type IN ('discount','announcement','image_callout')),
  zone text NOT NULL CHECK (zone ~ '^[a-z0-9_-]+$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  current_revision integer NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  published_revision_id uuid,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE public.widget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id uuid NOT NULL REFERENCES public.widget_instances(id) ON DELETE CASCADE,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  locale_readiness jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (widget_id, revision_no)
);

ALTER TABLE public.widget_instances
  ADD CONSTRAINT widget_instances_published_revision_fk
  FOREIGN KEY (published_revision_id) REFERENCES public.widget_revisions(id);

CREATE TABLE public.intools_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  storage_path text NOT NULL UNIQUE CHECK (storage_path <> ''),
  public_url text NOT NULL CHECK (public_url ~ '^https://'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/gif','image/avif')),
  bytes bigint NOT NULL CHECK (bytes > 0 AND bytes <= 15728640),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  alt_text jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(alt_text) = 'object'),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Archive/draft visibility is enforced at the data boundary, not only by UI filters.
DROP POLICY IF EXISTS factories_select ON public.factories;
CREATE POLICY factories_select ON public.factories FOR SELECT USING (
  (archived_at IS NULL AND verify_state = 'verified')
  OR owner_profile_id = (SELECT auth.uid()) OR (SELECT public.is_admin())
);
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT USING (
  (listing_status = 'active' AND EXISTS (
    SELECT 1 FROM public.factories visible_factory
    WHERE visible_factory.id = factory_id AND visible_factory.archived_at IS NULL
  ) AND (
    is_private = false OR EXISTS (
      SELECT 1 FROM public.product_brand_assignments pba
      WHERE pba.product_id = products.id AND pba.profile_id = (SELECT auth.uid())
    )
  )) OR (SELECT public.is_admin()) OR EXISTS (
    SELECT 1 FROM public.factories f
    WHERE f.id = factory_id AND f.owner_profile_id = (SELECT auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS factories_set_updated_at ON public.factories;
CREATE TRIGGER factories_set_updated_at BEFORE UPDATE ON public.factories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Some early production environments recorded the legacy audit migration
-- without retaining its table. Recreate the compatible base table when needed.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  action text NOT NULL,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_audit_log_admin_read ON public.admin_audit_log;
CREATE POLICY admin_audit_log_admin_read ON public.admin_audit_log
  FOR SELECT USING (public.is_admin());

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_target_table_check,
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT admin_audit_log_target_table_check CHECK (
    target_table IN ('factories','products','content_pages','widget_instances','intools_media_assets')
  ),
  ADD CONSTRAINT admin_audit_log_action_check CHECK (
    action IN ('create','update','publish','rollback','archive','restore','verify_state_change')
  );

CREATE INDEX content_pages_status_idx ON public.content_pages (status, route);
CREATE INDEX content_revisions_page_idx ON public.content_revisions (page_id, revision_no DESC);
CREATE INDEX widget_instances_status_idx ON public.widget_instances (status, zone);
CREATE INDEX widget_revisions_widget_idx ON public.widget_revisions (widget_id, revision_no DESC);
CREATE INDEX intools_media_assets_active_idx ON public.intools_media_assets (updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intools_media_assets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.content_pages, public.content_revisions,
  public.widget_instances, public.widget_revisions, public.intools_media_assets
  FROM anon, authenticated;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;

-- The named platform owner receives the database role. Password and magic-link
-- sessions are accepted after Supabase confirms the email address.
UPDATE public.profiles p SET role = 'admin'
FROM auth.users u
WHERE u.id = p.id AND lower(u.email) = 'jun@arcanawangsa.com';

CREATE OR REPLACE FUNCTION public.intools_require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'intools unavailable' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_locale_readiness(p_document jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'en', jsonb_typeof(p_document->'locales'->'en') = 'object' AND p_document->'locales'->'en' <> '{}'::jsonb,
    'ja', jsonb_typeof(p_document->'locales'->'ja') = 'object' AND p_document->'locales'->'ja' <> '{}'::jsonb,
    'zh', jsonb_typeof(p_document->'locales'->'zh') = 'object' AND p_document->'locales'->'zh' <> '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.intools_validate_document(p_document jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_document IS NULL OR jsonb_typeof(p_document) <> 'object' THEN
    RAISE EXCEPTION 'document must be an object' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_document) > 1048576 THEN
    RAISE EXCEPTION 'document exceeds 1 MB' USING ERRCODE = '22023';
  END IF;
  IF p_document ? 'html' OR p_document ? 'script' OR p_document ? 'css'
    OR p_document::text ~* '"(html|script|css)"[[:space:]]*:' THEN
    RAISE EXCEPTION 'raw html, script and css fields are not allowed' USING ERRCODE = '22023';
  END IF;
  IF p_document::text ~* '"(href|src)"[[:space:]]*:[[:space:]]*"(javascript|vbscript|data:text/html):' THEN
    RAISE EXCEPTION 'unsafe URL scheme' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_document->'locales') <> 'object' THEN
    RAISE EXCEPTION 'document.locales must be an object' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_require_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_locale_readiness(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_validate_document(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.intools_page_json(p_page_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'route', p.route, 'title', p.title, 'template', p.template,
    'status', p.status, 'current_revision', p.current_revision,
    'published_revision_id', p.published_revision_id, 'updated_at', p.updated_at,
    'document', r.document, 'locale_readiness', r.locale_readiness
  )
  FROM public.content_pages p
  LEFT JOIN public.content_revisions r
    ON r.page_id = p.id AND r.revision_no = p.current_revision
  WHERE p.id = p_page_id;
$$;

CREATE OR REPLACE FUNCTION public.intools_widget_json(p_widget_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', w.id, 'key', w.widget_key, 'type', w.widget_type, 'zone', w.zone,
    'status', w.status, 'current_revision', w.current_revision,
    'published_revision_id', w.published_revision_id, 'updated_at', w.updated_at,
    'document', r.document, 'locale_readiness', r.locale_readiness
  )
  FROM public.widget_instances w
  LEFT JOIN public.widget_revisions r
    ON r.widget_id = w.id AND r.revision_no = w.current_revision
  WHERE w.id = p_widget_id;
$$;

REVOKE ALL ON FUNCTION public.intools_page_json(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intools_widget_json(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.public_get_content_page(p_route text, p_locale text DEFAULT 'en')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE v_page jsonb;
BEGIN
  IF p_locale NOT IN ('en','ja','zh') THEN p_locale := 'en'; END IF;
  SELECT jsonb_build_object(
    'route', p.route, 'title', p.title, 'template', p.template,
    'locale', p_locale, 'content', r.document->'locales'->p_locale,
    'seo', r.document->'seo'->p_locale, 'revision', r.revision_no,
    'widgets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', w.widget_key, 'type', w.widget_type, 'zone', w.zone,
        'content', wr.document->'locales'->p_locale,
        'settings', wr.document->'settings', 'targeting', wr.document->'targeting'
      ) ORDER BY COALESCE((wr.document->'settings'->>'order')::integer, 0), w.widget_key)
      FROM public.widget_instances w
      JOIN public.widget_revisions wr ON wr.id = w.published_revision_id
      WHERE w.status = 'published'
        AND COALESCE(NULLIF(wr.document->'schedule'->>'starts_at','')::timestamptz, '-infinity') <= now()
        AND COALESCE(NULLIF(wr.document->'schedule'->>'ends_at','')::timestamptz, 'infinity') > now()
        AND (
          COALESCE(jsonb_array_length(wr.document->'targeting'->'routes'), 0) = 0
          OR (wr.document->'targeting'->'routes') ? p_route
        )
    ), '[]'::jsonb)
  ) INTO v_page
  FROM public.content_pages p
  JOIN public.content_revisions r ON r.id = p.published_revision_id
  WHERE p.route = p_route AND p.status = 'published';
  RETURN v_page;
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_content_page(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_content_page(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.intools_list_pages()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'route', route, 'title', title, 'template', template, 'status', status,
    'current_revision', current_revision, 'published_revision_id', published_revision_id,
    'updated_at', updated_at
  ) ORDER BY route), '[]'::jsonb) INTO v_result FROM public.content_pages;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_load_page(p_route text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_page_id uuid; v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT id INTO v_page_id FROM public.content_pages WHERE route = p_route;
  IF v_page_id IS NULL THEN RETURN NULL; END IF;
  SELECT public.intools_page_json(v_page_id) || jsonb_build_object('revisions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', id, 'revision_no', revision_no,
      'locale_readiness', locale_readiness, 'created_at', created_at, 'published_at', published_at)
      ORDER BY revision_no DESC) FROM public.content_revisions WHERE page_id = v_page_id
  ), '[]'::jsonb)) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_save_page(
  p_route text, p_title text, p_template text, p_document jsonb, p_expected_revision integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_page public.content_pages; v_next integer; v_ready jsonb;
BEGIN
  PERFORM public.intools_require_admin(); PERFORM public.intools_validate_document(p_document);
  IF p_route !~ '^/[a-z0-9/_-]*$' OR length(btrim(p_title)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'invalid route or title' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_page FROM public.content_pages WHERE route = p_route FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.content_pages(route,title,template,created_by,updated_by)
    VALUES (p_route,btrim(p_title),COALESCE(NULLIF(p_template,''),'standard'),auth.uid(),auth.uid()) RETURNING * INTO v_page;
    v_next := 1;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
      VALUES(auth.uid(),'content_pages',v_page.id,'create','Created content page ' || p_route);
  ELSE
    IF v_page.current_revision <> p_expected_revision THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE = '40001'; END IF;
    v_next := v_page.current_revision + 1;
    UPDATE public.content_pages SET title=btrim(p_title), template=COALESCE(NULLIF(p_template,''),'standard'),
      current_revision=v_next, updated_by=auth.uid(), updated_at=now() WHERE id=v_page.id RETURNING * INTO v_page;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
      VALUES(auth.uid(),'content_pages',v_page.id,'update','Saved revision ' || v_next);
  END IF;
  v_ready := public.intools_locale_readiness(p_document);
  INSERT INTO public.content_revisions(page_id,revision_no,document,locale_readiness,created_by)
    VALUES(v_page.id,v_next,p_document,v_ready,auth.uid());
  IF v_page.current_revision = 0 THEN UPDATE public.content_pages SET current_revision=v_next WHERE id=v_page.id; END IF;
  RETURN public.intools_page_json(v_page.id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_publish_page(p_page_id uuid, p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_page public.content_pages; v_revision public.content_revisions;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_page FROM public.content_pages WHERE id=p_page_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'page not found'; END IF;
  IF v_page.current_revision <> p_expected_revision THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_revision FROM public.content_revisions WHERE page_id=p_page_id AND revision_no=v_page.current_revision;
  IF v_revision.locale_readiness <> '{"en":true,"ja":true,"zh":true}'::jsonb THEN
    RAISE EXCEPTION 'English, Japanese and Chinese content are required' USING ERRCODE='22023';
  END IF;
  UPDATE public.content_revisions SET published_at=now() WHERE id=v_revision.id;
  UPDATE public.content_pages SET status='published',published_revision_id=v_revision.id,
    archived_at=NULL,updated_by=auth.uid(),updated_at=now() WHERE id=p_page_id;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    VALUES(auth.uid(),'content_pages',p_page_id,'publish','Published revision ' || v_page.current_revision);
  RETURN public.intools_page_json(p_page_id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_rollback_page(p_page_id uuid, p_revision_no integer, p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_page public.content_pages; v_source public.content_revisions; v_new integer; v_new_id uuid;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_page FROM public.content_pages WHERE id=p_page_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'page not found'; END IF;
  IF v_page.current_revision <> p_expected_revision THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_source FROM public.content_revisions WHERE page_id=p_page_id AND revision_no=p_revision_no;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found'; END IF;
  IF v_source.locale_readiness <> '{"en":true,"ja":true,"zh":true}'::jsonb THEN RAISE EXCEPTION 'revision is not publishable'; END IF;
  v_new := v_page.current_revision + 1;
  INSERT INTO public.content_revisions(page_id,revision_no,document,locale_readiness,created_by,published_at)
    VALUES(p_page_id,v_new,v_source.document,v_source.locale_readiness,auth.uid(),now()) RETURNING id INTO v_new_id;
  UPDATE public.content_pages SET current_revision=v_new,published_revision_id=v_new_id,status='published',
    archived_at=NULL,updated_by=auth.uid(),updated_at=now() WHERE id=p_page_id;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
    VALUES(auth.uid(),'content_pages',p_page_id,'rollback','Rolled back revision '||p_revision_no,
      jsonb_build_object('source_revision',p_revision_no,'new_revision',v_new));
  RETURN public.intools_page_json(p_page_id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_archive_page(p_page_id uuid,p_expected_revision integer,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_page public.content_pages; v_action text; BEGIN PERFORM public.intools_require_admin();
  v_action:=CASE WHEN p_restore THEN 'restore' ELSE 'archive' END;
  UPDATE public.content_pages SET status=CASE WHEN p_restore THEN 'draft' ELSE 'archived' END,
    archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,updated_by=auth.uid(),updated_at=now()
    WHERE id=p_page_id AND current_revision=p_expected_revision RETURNING * INTO v_page;
  IF NOT FOUND THEN RAISE EXCEPTION 'page conflict or not found' USING ERRCODE='40001'; END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    VALUES(auth.uid(),'content_pages',p_page_id,v_action,v_action||' page '||v_page.route);
  RETURN public.intools_page_json(p_page_id); END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_widgets()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; BEGIN PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',w.id,'key',w.widget_key,'name',r.document->'settings'->>'name',
    'type',w.widget_type,'zone',w.zone,'target_type',r.document->'targeting'->>'type',
    'status',w.status,'current_revision',w.current_revision,'published_revision_id',w.published_revision_id,'updated_at',w.updated_at)
    ORDER BY w.zone,w.widget_key),'[]'::jsonb) INTO v_result
  FROM public.widget_instances w
  LEFT JOIN public.widget_revisions r ON r.widget_id=w.id AND r.revision_no=w.current_revision;
  RETURN v_result; END; $$;

CREATE OR REPLACE FUNCTION public.intools_load_widget(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_id uuid; v_result jsonb; BEGIN PERFORM public.intools_require_admin();
  SELECT id INTO v_id FROM public.widget_instances WHERE widget_key=p_key; IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT public.intools_widget_json(v_id)||jsonb_build_object('revisions',COALESCE((SELECT jsonb_agg(
    jsonb_build_object('id',id,'revision_no',revision_no,'locale_readiness',locale_readiness,'created_at',created_at,'published_at',published_at)
    ORDER BY revision_no DESC) FROM public.widget_revisions WHERE widget_id=v_id),'[]'::jsonb)) INTO v_result;
  RETURN v_result; END; $$;

CREATE OR REPLACE FUNCTION public.intools_save_widget(p_key text,p_type text,p_zone text,p_document jsonb,p_expected_revision integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_widget public.widget_instances; v_next integer; v_ready jsonb; BEGIN
  PERFORM public.intools_require_admin(); PERFORM public.intools_validate_document(p_document);
  IF p_document->'targeting'->'routes' IS NOT NULL AND jsonb_typeof(p_document->'targeting'->'routes') <> 'array' THEN
    RAISE EXCEPTION 'targeting.routes must be an array' USING ERRCODE='22023';
  END IF;
  IF p_document->'settings'->>'order' IS NOT NULL THEN
    PERFORM (p_document->'settings'->>'order')::integer;
  END IF;
  IF NULLIF(p_document->'schedule'->>'starts_at','') IS NOT NULL THEN
    PERFORM (p_document->'schedule'->>'starts_at')::timestamptz;
  END IF;
  IF NULLIF(p_document->'schedule'->>'ends_at','') IS NOT NULL THEN
    PERFORM (p_document->'schedule'->>'ends_at')::timestamptz;
  END IF;
  SELECT * INTO v_widget FROM public.widget_instances WHERE widget_key=p_key FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_revision<>0 THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
    INSERT INTO public.widget_instances(widget_key,widget_type,zone,created_by,updated_by)
      VALUES(p_key,p_type,p_zone,auth.uid(),auth.uid()) RETURNING * INTO v_widget; v_next:=1;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
      VALUES(auth.uid(),'widget_instances',v_widget.id,'create','Created widget '||p_key);
  ELSE
    IF v_widget.current_revision<>p_expected_revision THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
    v_next:=v_widget.current_revision+1;
    UPDATE public.widget_instances SET widget_type=p_type,zone=p_zone,current_revision=v_next,
      updated_by=auth.uid(),updated_at=now() WHERE id=v_widget.id RETURNING * INTO v_widget;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
      VALUES(auth.uid(),'widget_instances',v_widget.id,'update','Saved revision '||v_next);
  END IF;
  v_ready:=public.intools_locale_readiness(p_document);
  INSERT INTO public.widget_revisions(widget_id,revision_no,document,locale_readiness,created_by)
    VALUES(v_widget.id,v_next,p_document,v_ready,auth.uid());
  IF v_widget.current_revision=0 THEN UPDATE public.widget_instances SET current_revision=v_next WHERE id=v_widget.id; END IF;
  RETURN public.intools_widget_json(v_widget.id); END; $$;

CREATE OR REPLACE FUNCTION public.intools_publish_widget(p_widget_id uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_widget public.widget_instances; v_revision public.widget_revisions; BEGIN PERFORM public.intools_require_admin();
  SELECT * INTO v_widget FROM public.widget_instances WHERE id=p_widget_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'widget not found'; END IF;
  IF v_widget.current_revision<>p_expected_revision THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_revision FROM public.widget_revisions WHERE widget_id=p_widget_id AND revision_no=v_widget.current_revision;
  IF v_revision.locale_readiness<>'{"en":true,"ja":true,"zh":true}'::jsonb THEN RAISE EXCEPTION 'English, Japanese and Chinese content are required'; END IF;
  UPDATE public.widget_revisions SET published_at=now() WHERE id=v_revision.id;
  UPDATE public.widget_instances SET status='published',published_revision_id=v_revision.id,archived_at=NULL,
    updated_by=auth.uid(),updated_at=now() WHERE id=p_widget_id;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    VALUES(auth.uid(),'widget_instances',p_widget_id,'publish','Published revision '||v_widget.current_revision);
  RETURN public.intools_widget_json(p_widget_id); END; $$;

CREATE OR REPLACE FUNCTION public.intools_rollback_widget(p_widget_id uuid,p_revision_no integer,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_widget public.widget_instances; v_source public.widget_revisions; v_new integer; v_new_id uuid; BEGIN PERFORM public.intools_require_admin();
  SELECT * INTO v_widget FROM public.widget_instances WHERE id=p_widget_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'widget not found'; END IF;
  IF v_widget.current_revision<>p_expected_revision THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_source FROM public.widget_revisions WHERE widget_id=p_widget_id AND revision_no=p_revision_no;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found'; END IF;
  IF v_source.locale_readiness<>'{"en":true,"ja":true,"zh":true}'::jsonb THEN RAISE EXCEPTION 'revision is not publishable'; END IF;
  v_new:=v_widget.current_revision+1;
  INSERT INTO public.widget_revisions(widget_id,revision_no,document,locale_readiness,created_by,published_at)
    VALUES(p_widget_id,v_new,v_source.document,v_source.locale_readiness,auth.uid(),now()) RETURNING id INTO v_new_id;
  UPDATE public.widget_instances SET current_revision=v_new,published_revision_id=v_new_id,status='published',archived_at=NULL,
    updated_by=auth.uid(),updated_at=now() WHERE id=p_widget_id;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary,metadata)
    VALUES(auth.uid(),'widget_instances',p_widget_id,'rollback','Rolled back revision '||p_revision_no,
      jsonb_build_object('source_revision',p_revision_no,'new_revision',v_new));
  RETURN public.intools_widget_json(p_widget_id); END; $$;

CREATE OR REPLACE FUNCTION public.intools_archive_widget(p_widget_id uuid,p_expected_revision integer,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_widget public.widget_instances; v_action text; BEGIN PERFORM public.intools_require_admin();
  v_action:=CASE WHEN p_restore THEN 'restore' ELSE 'archive' END;
  UPDATE public.widget_instances SET status=CASE WHEN p_restore THEN 'draft' ELSE 'archived' END,
    archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,updated_by=auth.uid(),updated_at=now()
    WHERE id=p_widget_id AND current_revision=p_expected_revision RETURNING * INTO v_widget;
  IF NOT FOUND THEN RAISE EXCEPTION 'widget conflict or not found' USING ERRCODE='40001'; END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary)
    VALUES(auth.uid(),'widget_instances',p_widget_id,v_action,v_action||' widget '||v_widget.widget_key);
  RETURN public.intools_widget_json(p_widget_id); END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_media()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; BEGIN PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.updated_at DESC),'[]'::jsonb) INTO v_result FROM public.intools_media_assets a;
  RETURN v_result; END; $$;

CREATE OR REPLACE FUNCTION public.intools_save_media(p_id uuid,p_name text,p_path text,p_public_url text,p_mime_type text,p_bytes bigint,
  p_width integer,p_height integer,p_alt_text jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_asset public.intools_media_assets; BEGIN PERFORM public.intools_require_admin();
  IF p_id IS NULL THEN
    INSERT INTO public.intools_media_assets(name,storage_path,public_url,mime_type,bytes,width,height,alt_text,created_by,updated_by)
      VALUES(btrim(p_name),p_path,p_public_url,p_mime_type,p_bytes,p_width,p_height,COALESCE(p_alt_text,'{}'),auth.uid(),auth.uid()) RETURNING * INTO v_asset;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'intools_media_assets',v_asset.id,'create','Created media metadata');
  ELSE
    UPDATE public.intools_media_assets SET name=btrim(p_name),storage_path=p_path,public_url=p_public_url,mime_type=p_mime_type,bytes=p_bytes,
      width=p_width,height=p_height,alt_text=COALESCE(p_alt_text,'{}'),updated_by=auth.uid(),updated_at=now()
      WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_asset;
    IF NOT FOUND THEN RAISE EXCEPTION 'media conflict or not found' USING ERRCODE='40001'; END IF;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'intools_media_assets',v_asset.id,'update','Updated media metadata');
  END IF; RETURN to_jsonb(v_asset); END; $$;

CREATE OR REPLACE FUNCTION public.intools_archive_media(p_id uuid,p_expected_updated_at timestamptz,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_asset public.intools_media_assets; v_action text; BEGIN PERFORM public.intools_require_admin();
  UPDATE public.intools_media_assets SET archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,
    updated_by=auth.uid(),updated_at=now() WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_asset;
  IF NOT FOUND THEN RAISE EXCEPTION 'media conflict or not found' USING ERRCODE='40001'; END IF;
  v_action:=CASE WHEN p_restore THEN 'restore' ELSE 'archive' END;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'intools_media_assets',p_id,v_action,v_action||' media');
  RETURN to_jsonb(v_asset); END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_products()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; BEGIN PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(p)||jsonb_build_object('supplier_name',f.name,
    'price_breaks',COALESCE((SELECT jsonb_agg(jsonb_build_object('min_qty',pb.min_qty,'unit_price',pb.unit_price) ORDER BY pb.min_qty)
      FROM public.price_breaks pb WHERE pb.product_id=p.id),'[]'::jsonb),
    'variants',COALESCE((SELECT jsonb_agg(v.colorway ORDER BY v.created_at) FROM public.product_variants v WHERE v.product_id=p.id),'[]'::jsonb),
    'brand_emails',COALESCE((SELECT jsonb_agg(u.email ORDER BY u.email) FROM public.product_brand_assignments ba
      JOIN auth.users u ON u.id=ba.profile_id WHERE ba.product_id=p.id),'[]'::jsonb)) ORDER BY p.updated_at DESC),'[]'::jsonb)
    INTO v_result FROM public.products p JOIN public.factories f ON f.id=p.factory_id; RETURN v_result; END; $$;

CREATE OR REPLACE FUNCTION public.intools_save_product(p_product_id uuid,p_payload jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_product public.products; v_unknown text[]; BEGIN PERFORM public.intools_require_admin();
  SELECT array_agg(key) INTO v_unknown FROM jsonb_object_keys(p_payload) AS fields(key) WHERE key <> ALL (ARRAY[
    'sku','name','category','unit_type','pricing_mode','price','moq','factory_id','loc','comp','description','subcategory','construction',
    'applications','season','color_family','origin_country','lead_time','handling_notes','gsm','fabric_width','roll_length','style_code',
    'listing_status','is_private','img','badge','price_breaks','variants','brand_emails']);
  IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'unsupported product fields: %',v_unknown USING ERRCODE='22023'; END IF;
  IF p_product_id IS NULL THEN
    INSERT INTO public.products(sku,name,category,unit_type,pricing_mode,price,moq,factory_id,loc,comp,description,subcategory,
      construction,applications,season,color_family,origin_country,lead_time,handling_notes,gsm,fabric_width,roll_length,style_code,
      listing_status,is_private,img,badge,updated_at)
    VALUES(p_payload->>'sku',p_payload->>'name',(p_payload->>'category')::public.product_category,
      (p_payload->>'unit_type')::public.unit_type,COALESCE((p_payload->>'pricing_mode')::public.pricing_mode,'fixed'),
      COALESCE((p_payload->>'price')::numeric,0),(p_payload->>'moq')::numeric,(p_payload->>'factory_id')::uuid,
      p_payload->>'loc',p_payload->>'comp',p_payload->>'description',p_payload->>'subcategory',p_payload->>'construction',
      p_payload->>'applications',p_payload->>'season',p_payload->>'color_family',p_payload->>'origin_country',p_payload->>'lead_time',
      p_payload->>'handling_notes',p_payload->>'gsm',p_payload->>'fabric_width',p_payload->>'roll_length',p_payload->>'style_code',
      COALESCE((p_payload->>'listing_status')::public.listing_status,'draft'),COALESCE((p_payload->>'is_private')::boolean,false),
      p_payload->>'img',p_payload->>'badge',now()) RETURNING * INTO v_product;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'products',v_product.id,'create','Created SKU '||v_product.sku);
  ELSE
    UPDATE public.products p SET
      sku=CASE WHEN p_payload?'sku' THEN p_payload->>'sku' ELSE p.sku END,
      name=CASE WHEN p_payload?'name' THEN p_payload->>'name' ELSE p.name END,
      category=CASE WHEN p_payload?'category' THEN (p_payload->>'category')::public.product_category ELSE p.category END,
      unit_type=CASE WHEN p_payload?'unit_type' THEN (p_payload->>'unit_type')::public.unit_type ELSE p.unit_type END,
      pricing_mode=CASE WHEN p_payload?'pricing_mode' THEN (p_payload->>'pricing_mode')::public.pricing_mode ELSE p.pricing_mode END,
      price=CASE WHEN p_payload?'price' THEN (p_payload->>'price')::numeric ELSE p.price END,
      moq=CASE WHEN p_payload?'moq' THEN (p_payload->>'moq')::numeric ELSE p.moq END,
      factory_id=CASE WHEN p_payload?'factory_id' THEN (p_payload->>'factory_id')::uuid ELSE p.factory_id END,
      loc=CASE WHEN p_payload?'loc' THEN p_payload->>'loc' ELSE p.loc END,
      comp=CASE WHEN p_payload?'comp' THEN p_payload->>'comp' ELSE p.comp END,
      description=CASE WHEN p_payload?'description' THEN p_payload->>'description' ELSE p.description END,
      subcategory=CASE WHEN p_payload?'subcategory' THEN p_payload->>'subcategory' ELSE p.subcategory END,
      construction=CASE WHEN p_payload?'construction' THEN p_payload->>'construction' ELSE p.construction END,
      applications=CASE WHEN p_payload?'applications' THEN p_payload->>'applications' ELSE p.applications END,
      season=CASE WHEN p_payload?'season' THEN p_payload->>'season' ELSE p.season END,
      color_family=CASE WHEN p_payload?'color_family' THEN p_payload->>'color_family' ELSE p.color_family END,
      origin_country=CASE WHEN p_payload?'origin_country' THEN p_payload->>'origin_country' ELSE p.origin_country END,
      lead_time=CASE WHEN p_payload?'lead_time' THEN p_payload->>'lead_time' ELSE p.lead_time END,
      handling_notes=CASE WHEN p_payload?'handling_notes' THEN p_payload->>'handling_notes' ELSE p.handling_notes END,
      gsm=CASE WHEN p_payload?'gsm' THEN p_payload->>'gsm' ELSE p.gsm END,
      fabric_width=CASE WHEN p_payload?'fabric_width' THEN p_payload->>'fabric_width' ELSE p.fabric_width END,
      roll_length=CASE WHEN p_payload?'roll_length' THEN p_payload->>'roll_length' ELSE p.roll_length END,
      style_code=CASE WHEN p_payload?'style_code' THEN p_payload->>'style_code' ELSE p.style_code END,
      listing_status=CASE WHEN p_payload?'listing_status' THEN (p_payload->>'listing_status')::public.listing_status ELSE p.listing_status END,
      is_private=CASE WHEN p_payload?'is_private' THEN (p_payload->>'is_private')::boolean ELSE p.is_private END,
      img=CASE WHEN p_payload?'img' THEN p_payload->>'img' ELSE p.img END,
      badge=CASE WHEN p_payload?'badge' THEN p_payload->>'badge' ELSE p.badge END,updated_at=now()
    WHERE p.id=p_product_id AND p.updated_at=p_expected_updated_at RETURNING p.* INTO v_product;
    IF NOT FOUND THEN RAISE EXCEPTION 'product conflict or not found' USING ERRCODE='40001'; END IF;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'products',v_product.id,'update','Updated SKU '||v_product.sku);
  END IF;
  IF p_payload?'price_breaks' THEN
    IF jsonb_typeof(p_payload->'price_breaks')<>'array' THEN RAISE EXCEPTION 'price_breaks must be an array'; END IF;
    DELETE FROM public.price_breaks WHERE product_id=v_product.id;
    INSERT INTO public.price_breaks(product_id,min_qty,unit_price)
      SELECT v_product.id,x.min_qty,x.unit_price FROM jsonb_to_recordset(p_payload->'price_breaks') AS x(min_qty numeric,unit_price numeric);
  END IF;
  IF p_payload?'variants' THEN
    IF jsonb_typeof(p_payload->'variants')<>'array' THEN RAISE EXCEPTION 'variants must be an array'; END IF;
    DELETE FROM public.product_variants WHERE product_id=v_product.id;
    INSERT INTO public.product_variants(product_id,colorway)
      SELECT v_product.id,btrim(colorway) FROM jsonb_array_elements_text(p_payload->'variants') AS values_list(colorway) WHERE btrim(colorway)<>'';
  END IF;
  IF p_payload?'brand_emails' THEN
    IF jsonb_typeof(p_payload->'brand_emails')<>'array' THEN RAISE EXCEPTION 'brand_emails must be an array'; END IF;
    IF NOT v_product.is_private AND jsonb_array_length(p_payload->'brand_emails')>0 THEN RAISE EXCEPTION 'assignments require a private product'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_payload->'brand_emails') AS emails(email)
      WHERE NOT EXISTS (SELECT 1 FROM public.profiles pr JOIN auth.users u ON u.id=pr.id
        WHERE pr.role='buyer' AND lower(u.email)=lower(btrim(emails.email)))) THEN
      RAISE EXCEPTION 'every assigned email must belong to a registered brand owner';
    END IF;
    DELETE FROM public.product_brand_assignments WHERE product_id=v_product.id;
    INSERT INTO public.product_brand_assignments(product_id,profile_id,assigned_by)
      SELECT v_product.id,pr.id,auth.uid() FROM public.profiles pr JOIN auth.users u ON u.id=pr.id
      WHERE pr.role='buyer' AND lower(u.email)=ANY(ARRAY(SELECT lower(btrim(emails.email))
        FROM jsonb_array_elements_text(p_payload->'brand_emails') AS emails(email)));
  END IF;
  RETURN to_jsonb(v_product); END; $$;

CREATE OR REPLACE FUNCTION public.intools_archive_product(p_product_id uuid,p_expected_updated_at timestamptz,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_product public.products; v_action text; BEGIN PERFORM public.intools_require_admin(); v_action:=CASE WHEN p_restore THEN 'restore' ELSE 'archive' END;
  UPDATE public.products SET listing_status=CASE WHEN p_restore THEN 'draft'::public.listing_status ELSE 'archived'::public.listing_status END,
    archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,updated_at=now()
    WHERE id=p_product_id AND updated_at=p_expected_updated_at RETURNING * INTO v_product;
  IF NOT FOUND THEN RAISE EXCEPTION 'product conflict or not found' USING ERRCODE='40001'; END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'products',v_product.id,v_action,v_action||' SKU '||v_product.sku);
  RETURN to_jsonb(v_product); END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_suppliers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; BEGIN PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object('product_count',(SELECT count(*) FROM public.products p WHERE p.factory_id=f.id))
    ORDER BY f.updated_at DESC),'[]'::jsonb) INTO v_result FROM public.factories f; RETURN v_result; END; $$;

CREATE OR REPLACE FUNCTION public.intools_save_supplier(p_supplier_id uuid,p_payload jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_supplier public.factories; v_unknown text[]; v_old_verify public.verify_state; BEGIN PERFORM public.intools_require_admin();
  SELECT array_agg(key) INTO v_unknown FROM jsonb_object_keys(p_payload) AS fields(key) WHERE key <> ALL (ARRAY['slug','name','type','region','loc','verify_state',
    'years','moq','lead','capacity','certs','tags','sales','phone','web','founded','employees','area','port','bio','img','owner_profile_id']);
  IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'unsupported supplier fields: %',v_unknown USING ERRCODE='22023'; END IF;
  IF p_supplier_id IS NULL THEN
    INSERT INTO public.factories(slug,name,type,region,loc,verify_state,years,moq,lead,capacity,certs,tags,sales,phone,web,founded,
      employees,area,port,bio,img,owner_profile_id,updated_at)
    VALUES(p_payload->>'slug',p_payload->>'name',(p_payload->>'type')::public.factory_type,p_payload->>'region',p_payload->>'loc',
      COALESCE((p_payload->>'verify_state')::public.verify_state,'unverified'),(p_payload->>'years')::integer,p_payload->>'moq',p_payload->>'lead',
      p_payload->>'capacity',ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'certs','[]'))),ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'tags','[]'))),
      p_payload->>'sales',p_payload->>'phone',p_payload->>'web',(p_payload->>'founded')::integer,p_payload->>'employees',p_payload->>'area',
      p_payload->>'port',p_payload->>'bio',p_payload->>'img',(p_payload->>'owner_profile_id')::uuid,now()) RETURNING * INTO v_supplier;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'factories',v_supplier.id,'create','Created supplier '||v_supplier.name);
  ELSE
    SELECT verify_state INTO v_old_verify FROM public.factories WHERE id=p_supplier_id FOR UPDATE;
    UPDATE public.factories f SET
      slug=CASE WHEN p_payload?'slug' THEN p_payload->>'slug' ELSE f.slug END,name=CASE WHEN p_payload?'name' THEN p_payload->>'name' ELSE f.name END,
      type=CASE WHEN p_payload?'type' THEN (p_payload->>'type')::public.factory_type ELSE f.type END,region=CASE WHEN p_payload?'region' THEN p_payload->>'region' ELSE f.region END,
      loc=CASE WHEN p_payload?'loc' THEN p_payload->>'loc' ELSE f.loc END,verify_state=CASE WHEN p_payload?'verify_state' THEN (p_payload->>'verify_state')::public.verify_state ELSE f.verify_state END,
      years=CASE WHEN p_payload?'years' THEN (p_payload->>'years')::integer ELSE f.years END,moq=CASE WHEN p_payload?'moq' THEN p_payload->>'moq' ELSE f.moq END,
      lead=CASE WHEN p_payload?'lead' THEN p_payload->>'lead' ELSE f.lead END,capacity=CASE WHEN p_payload?'capacity' THEN p_payload->>'capacity' ELSE f.capacity END,
      certs=CASE WHEN p_payload?'certs' THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'certs')) ELSE f.certs END,
      tags=CASE WHEN p_payload?'tags' THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')) ELSE f.tags END,
      sales=CASE WHEN p_payload?'sales' THEN p_payload->>'sales' ELSE f.sales END,phone=CASE WHEN p_payload?'phone' THEN p_payload->>'phone' ELSE f.phone END,
      web=CASE WHEN p_payload?'web' THEN p_payload->>'web' ELSE f.web END,founded=CASE WHEN p_payload?'founded' THEN (p_payload->>'founded')::integer ELSE f.founded END,
      employees=CASE WHEN p_payload?'employees' THEN p_payload->>'employees' ELSE f.employees END,area=CASE WHEN p_payload?'area' THEN p_payload->>'area' ELSE f.area END,
      port=CASE WHEN p_payload?'port' THEN p_payload->>'port' ELSE f.port END,bio=CASE WHEN p_payload?'bio' THEN p_payload->>'bio' ELSE f.bio END,
      img=CASE WHEN p_payload?'img' THEN p_payload->>'img' ELSE f.img END,owner_profile_id=CASE WHEN p_payload?'owner_profile_id' THEN (p_payload->>'owner_profile_id')::uuid ELSE f.owner_profile_id END,
      updated_at=now() WHERE f.id=p_supplier_id AND f.updated_at=p_expected_updated_at RETURNING f.* INTO v_supplier;
    IF NOT FOUND THEN RAISE EXCEPTION 'supplier conflict or not found' USING ERRCODE='40001'; END IF;
    INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(
      auth.uid(),'factories',v_supplier.id,
      CASE WHEN v_old_verify IS DISTINCT FROM v_supplier.verify_state THEN 'verify_state_change' ELSE 'update' END,
      CASE WHEN v_old_verify IS DISTINCT FROM v_supplier.verify_state
        THEN format('verify_state: %s → %s',v_old_verify,v_supplier.verify_state)
        ELSE 'Updated supplier '||v_supplier.name END
    );
  END IF; RETURN to_jsonb(v_supplier); END; $$;

CREATE OR REPLACE FUNCTION public.intools_archive_supplier(p_supplier_id uuid,p_expected_updated_at timestamptz,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_supplier public.factories; v_action text; BEGIN PERFORM public.intools_require_admin(); v_action:=CASE WHEN p_restore THEN 'restore' ELSE 'archive' END;
  UPDATE public.factories SET archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,updated_at=now()
    WHERE id=p_supplier_id AND updated_at=p_expected_updated_at RETURNING * INTO v_supplier;
  IF NOT FOUND THEN RAISE EXCEPTION 'supplier conflict or not found' USING ERRCODE='40001'; END IF;
  INSERT INTO public.admin_audit_log(admin_id,target_table,target_id,action,summary) VALUES(auth.uid(),'factories',v_supplier.id,v_action,v_action||' supplier '||v_supplier.name);
  RETURN to_jsonb(v_supplier); END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_audit(p_target_type text DEFAULT NULL,p_target_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; BEGIN PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'admin_id',a.admin_id,
    'admin_name',COALESCE(p.full_name,p.company_name,'Admin'),'target_type',a.target_table,'target_id',a.target_id,
    'action',a.action,'summary',a.summary,'metadata',a.metadata,'created_at',a.created_at) ORDER BY a.created_at DESC),'[]'::jsonb)
  INTO v_result FROM (SELECT * FROM public.admin_audit_log WHERE (p_target_type IS NULL OR target_table=p_target_type)
    AND (p_target_id IS NULL OR target_id=p_target_id) ORDER BY created_at DESC LIMIT LEAST(GREATEST(p_limit,1),500)) a
  JOIN public.profiles p ON p.id=a.admin_id; RETURN v_result; END; $$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'intools_%'
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.signature); END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.intools_list_pages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_load_page(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_save_page(text,text,text,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_publish_page(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_rollback_page(uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_archive_page(uuid,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_widgets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_load_widget(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_save_widget(text,text,text,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_publish_widget(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_rollback_widget(uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_archive_widget(uuid,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_media() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_save_media(uuid,text,text,text,text,bigint,integer,integer,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_archive_media(uuid,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_save_product(uuid,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_archive_product(uuid,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_suppliers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_save_supplier(uuid,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_archive_supplier(uuid,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intools_list_audit(text,uuid,integer) TO authenticated;
