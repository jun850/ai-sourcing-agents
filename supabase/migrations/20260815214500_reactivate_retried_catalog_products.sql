-- Deterministic source-free product IDs survive rollback as archived rows.
-- Reactivate those rows through the existing finalize transaction on retry.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
BEGIN
  SELECT pg_get_functiondef(
    'public.catalog_finalize_source_free_batch(uuid,uuid,text,integer,text,text,bigint,jsonb)'::regprocedure
  ) INTO v_definition;

  v_patched := replace(
    v_definition,
    $$,v_data->>'img',ARRAY(SELECT jsonb_array_elements_text(v_data->'images')),now(),NULL)
      RETURNING id INTO v_id;$$,
    $$,v_data->>'img',ARRAY(SELECT jsonb_array_elements_text(v_data->'images')),now(),NULL)
      ON CONFLICT(id) DO UPDATE SET
        sku=excluded.sku,name=excluded.name,description=excluded.description,copy_i18n=excluded.copy_i18n,
        category=excluded.category,construction_slug=excluded.construction_slug,construction=excluded.construction,
        subcategory=excluded.subcategory,comp=excluded.comp,spec=excluded.spec,gsm=excluded.gsm,
        applications=excluded.applications,season=excluded.season,handling_notes=excluded.handling_notes,
        pricing_mode=excluded.pricing_mode,price=excluded.price,unit_type=excluded.unit_type,moq=excluded.moq,
        factory_id=excluded.factory_id,listing_status=excluded.listing_status,is_private=excluded.is_private,
        img=excluded.img,images=excluded.images,updated_at=now(),archived_at=NULL
      RETURNING id INTO v_id;$$
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'catalog product retry patch target not found';
  END IF;

  EXECUTE v_patched;
END;
$migration$;
