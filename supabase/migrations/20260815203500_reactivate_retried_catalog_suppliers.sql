-- Allow a source-free supplier batch to retry deterministic factory IDs that a
-- previous failed release archived, while preserving exact rollback state.
DO $$
DECLARE
  v_definition text;
  v_patched text;
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_finalize_source_free_batch(uuid,uuid,text,integer,text,text,bigint,jsonb)'::regprocedure
  ) INTO v_definition;

  v_patched := replace(
    v_definition,
    $$jsonb_build_object('id',f.id,'copy_i18n',f.copy_i18n,'bio',f.bio)$$,
    $$jsonb_build_object('id',f.id,'copy_i18n',f.copy_i18n,'bio',f.bio,'verify_state',f.verify_state,'archived_at',f.archived_at)$$
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'catalog supplier snapshot patch target not found';
  END IF;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    $$ON CONFLICT(id) DO UPDATE SET copy_i18n=excluded.copy_i18n,bio=excluded.bio,updated_at=now()$$,
    $$ON CONFLICT(id) DO UPDATE SET copy_i18n=excluded.copy_i18n,bio=excluded.bio,verify_state=excluded.verify_state,archived_at=NULL,updated_at=now()$$
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'catalog supplier reactivation patch target not found';
  END IF;

  EXECUTE v_patched;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_patched text;
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_rollback_source_free_batch(uuid,text)'::regprocedure
  ) INTO v_definition;

  v_patched := replace(
    v_definition,
    $$UPDATE public.factories SET copy_i18n=COALESCE(v_previous->'copy_i18n','{}'::jsonb),bio=v_previous->>'bio',updated_at=now() WHERE id=(v_previous->>'id')::uuid;$$,
    $$UPDATE public.factories SET copy_i18n=COALESCE(v_previous->'copy_i18n','{}'::jsonb),bio=v_previous->>'bio',verify_state=(v_previous->>'verify_state')::public.verify_state,archived_at=(v_previous->>'archived_at')::timestamptz,updated_at=now() WHERE id=(v_previous->>'id')::uuid;$$
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'catalog supplier rollback patch target not found';
  END IF;

  EXECUTE v_patched;
END;
$$;
