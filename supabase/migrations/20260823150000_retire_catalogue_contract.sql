-- Phase 6: retire the product catalogue while retaining broker, RFQ, and
-- financial history. Applied migrations remain immutable; this contract is
-- deliberately additive and runs only after the pre-cutover rehearsal export.

BEGIN;

CREATE TABLE IF NOT EXISTS public.broker_retirement_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retired_at timestamptz NOT NULL DEFAULT now(),
  contract_version text NOT NULL,
  row_counts jsonb NOT NULL,
  notes text NOT NULL
);
ALTER TABLE public.broker_retirement_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.broker_retirement_audit FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS broker_retirement_audit_admin_read ON public.broker_retirement_audit;
CREATE POLICY broker_retirement_audit_admin_read ON public.broker_retirement_audit
  FOR SELECT USING ((SELECT public.is_admin()));

-- The active agent uses the neutral broker name. The historical identifier is
-- retained only as a compatibility wrapper until the post-cutover baseline.
CREATE OR REPLACE FUNCTION public.reserve_broker_usage(
  p_profile_id uuid,
  p_max_calls integer
)
RETURNS TABLE(allowed boolean, call_count integer, total_tokens integer, usage_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reserved public.copilot_usage%ROWTYPE;
BEGIN
  INSERT INTO public.copilot_usage AS cu(profile_id,usage_date,call_count,total_tokens)
  VALUES (p_profile_id,current_date,1,0)
  ON CONFLICT (profile_id) DO UPDATE SET
    call_count=CASE WHEN cu.usage_date=current_date THEN cu.call_count+1 ELSE 1 END,
    total_tokens=CASE WHEN cu.usage_date=current_date THEN cu.total_tokens ELSE 0 END,
    usage_date=current_date,updated_at=now()
  WHERE cu.usage_date<>current_date OR cu.call_count<GREATEST(p_max_calls,1)
  RETURNING cu.* INTO reserved;
  IF reserved.profile_id IS NOT NULL THEN
    RETURN QUERY SELECT true,reserved.call_count,reserved.total_tokens,reserved.usage_date;
    RETURN;
  END IF;
  RETURN QUERY SELECT false,cu.call_count,cu.total_tokens,cu.usage_date
    FROM public.copilot_usage cu WHERE cu.profile_id=p_profile_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.reserve_athelia_usage(
  p_profile_id uuid,
  p_max_calls integer
)
RETURNS TABLE(allowed boolean, call_count integer, total_tokens integer, usage_date date)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT * FROM public.reserve_broker_usage(p_profile_id,p_max_calls);
$$;
REVOKE ALL ON FUNCTION public.reserve_broker_usage(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_athelia_usage(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_broker_usage(uuid,integer) TO service_role;

INSERT INTO public.broker_retirement_audit(contract_version,row_counts,notes)
SELECT
  'phase-6-catalogue-retirement-v1',
  jsonb_build_object(
    'products',(SELECT count(*) FROM public.products),
    'product_variants',(SELECT count(*) FROM public.product_variants),
    'price_breaks',(SELECT count(*) FROM public.price_breaks),
    'product_media',(SELECT count(*) FROM public.product_media),
    'catalog_media_records',(SELECT count(*) FROM public.catalog_media_records),
    'cart_items',(SELECT count(*) FROM public.cart_items),
    'saved_items',(SELECT count(*) FROM public.saved_items),
    'outbox_jobs',(SELECT count(*) FROM public.algolia_sync_outbox)
  ),
  'Catalogue records and local search outbox were explicitly retired; immutable order snapshots, payments, refunds, invoices, RFQs, factories, conversations, notifications, and supplier provenance remain.';

-- Preserve the only supplier provenance needed by broker operations under
-- broker names. Product provenance is retired with the catalogue.
DELETE FROM public.catalog_field_provenance WHERE entity_type <> 'supplier';
ALTER TABLE public.catalog_import_sources RENAME TO supplier_provenance_sources;
ALTER TABLE public.supplier_provenance_sources RENAME COLUMN trusted_for_auto_publish TO trusted_for_import;
UPDATE public.supplier_provenance_sources SET trusted_for_import=false;
ALTER TABLE public.catalog_field_provenance RENAME TO supplier_field_provenance;

-- Financial history keeps a detached legacy identifier, but it must never
-- query a current product again. Its snapshots become write-once.
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
COMMENT ON COLUMN public.order_items.product_id IS
  'Detached historical product identifier; no live product relationship remains.';

CREATE OR REPLACE FUNCTION public.guard_order_item_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Order item snapshots are immutable' USING ERRCODE='55000';
END;
$$;
DROP TRIGGER IF EXISTS order_items_catalog_guard ON public.order_items;
DROP TRIGGER IF EXISTS order_items_immutable ON public.order_items;
CREATE TRIGGER order_items_immutable
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_item_immutable();
DROP FUNCTION IF EXISTS public.catalog_guard_order_item();

-- A buyer can still retrieve an existing order for a legacy payment handoff,
-- but every amount and line is read from immutable server records.
CREATE OR REPLACE FUNCTION public.get_historical_order_checkout(p_order_no text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_order public.orders; v_items jsonb;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE order_no=p_order_no AND buyer_profile_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',i.id,'sku',i.sku_snapshot,'name',i.name_snapshot,
    'seller',i.seller_snapshot,'unit_price',i.unit_price,'qty',i.qty,
    'line_total',i.line_total,'options',i.option_selection
  ) ORDER BY i.created_at,i.id),'[]'::jsonb) INTO v_items
  FROM public.order_items i WHERE i.order_id=v_order.id;
  IF jsonb_array_length(v_items)=0 THEN
    RAISE EXCEPTION 'Order has no immutable line snapshots' USING ERRCODE='55000';
  END IF;
  RETURN jsonb_build_object(
    'id',v_order.id,'order_no',v_order.order_no,'status',v_order.status,
    'payment_path',v_order.payment_path,'currency','USD','subtotal',v_order.subtotal,
    'fee',v_order.fee,'ship',v_order.ship,'qc_fee',v_order.qc_fee,
    'ins_fee',v_order.ins_fee,'total',v_order.total,'items',v_items
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_historical_order_checkout(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_historical_order_checkout(text) TO authenticated;

-- Retire cart-derived order creation. Existing orders, payment records, and
-- refunds stay intact; no browser-supplied amount can create an order.
DROP FUNCTION IF EXISTS public.place_order(uuid,text,boolean,boolean);
DROP FUNCTION IF EXISTS public.place_order(text,text,text,text,boolean,boolean);
DROP TRIGGER IF EXISTS orders_enforce_cart_moq ON public.orders;
DROP FUNCTION IF EXISTS public.enforce_order_cart_moq();
DROP TRIGGER IF EXISTS cart_items_line_type_guard ON public.cart_items;
DROP FUNCTION IF EXISTS public.cart_item_line_type_guard();
DROP TRIGGER IF EXISTS order_items_snapshot_buyer_note ON public.order_items;
DROP FUNCTION IF EXISTS public.snapshot_order_item_buyer_note();

-- RFQ requests become one reviewed factory per RFQ. Copy a detached historic
-- identifier before removing the old product dependency so prior outreach is
-- still auditable.
ALTER TABLE public.rfq_supplier_requests ADD COLUMN IF NOT EXISTS legacy_product_id uuid;
UPDATE public.rfq_supplier_requests SET legacy_product_id=product_id WHERE legacy_product_id IS NULL;
ALTER TABLE public.rfq_supplier_requests DROP CONSTRAINT IF EXISTS rfq_supplier_requests_rfq_case_id_factory_id_product_id_key;
ALTER TABLE public.rfq_supplier_requests DROP CONSTRAINT IF EXISTS rfq_supplier_requests_product_id_fkey;
ALTER TABLE public.rfq_supplier_requests DROP COLUMN IF EXISTS product_id;
ALTER TABLE public.rfq_supplier_requests DROP CONSTRAINT IF EXISTS rfq_supplier_requests_rfq_case_factory_key;
ALTER TABLE public.rfq_supplier_requests ADD CONSTRAINT rfq_supplier_requests_rfq_case_factory_key UNIQUE(rfq_case_id,factory_id);
COMMENT ON COLUMN public.rfq_supplier_requests.legacy_product_id IS
  'Detached historical identifier retained for pre-retirement RFQ audit only.';

CREATE OR REPLACE FUNCTION public.dispatch_athelia_rfq(p_case_id uuid,p_requests jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_case public.rfq_cases;
  v_request jsonb;
  v_factory public.factories;
  v_conversation public.conversations;
  v_link public.rfq_supplier_requests;
  v_message public.messages;
  v_result jsonb:='[]'::jsonb;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases
  WHERE id=p_case_id AND buyer_profile_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ case not found' USING ERRCODE='42501'; END IF;
  IF v_case.status NOT IN ('draft','needs_research') THEN RAISE EXCEPTION 'RFQ has already been dispatched'; END IF;
  IF jsonb_typeof(p_requests)<>'array' OR jsonb_array_length(p_requests) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Select one to five approved matches';
  END IF;
  FOR v_request IN SELECT value FROM jsonb_array_elements(p_requests) LOOP
    SELECT f.* INTO v_factory
    FROM public.factories f
    JOIN public.rfq_supplier_matches m ON m.factory_id=f.id
    WHERE f.id=(v_request->>'factory_id')::uuid
      AND m.rfq_case_id=v_case.id AND m.status='approved'
      AND public.broker_factory_is_eligible(f,v_case.brief);
    IF NOT FOUND THEN RAISE EXCEPTION 'Selected factory is no longer an approved match'; END IF;
    IF NULLIF(btrim(v_request->>'body'),'') IS NULL THEN RAISE EXCEPTION 'RFQ message is required'; END IF;
    INSERT INTO public.conversations(buyer_profile_id,factory_id) VALUES(auth.uid(),v_factory.id)
      ON CONFLICT (buyer_profile_id,factory_id) DO NOTHING;
    SELECT * INTO v_conversation FROM public.conversations
      WHERE buyer_profile_id=auth.uid() AND factory_id=v_factory.id;
    INSERT INTO public.rfq_supplier_requests(rfq_case_id,factory_id,conversation_id,outbound_body)
      VALUES(p_case_id,v_factory.id,v_conversation.id,left(btrim(v_request->>'body'),12000))
      RETURNING * INTO v_link;
    INSERT INTO public.messages(conversation_id,sender_profile_id,body,rfq_supplier_request_id)
      VALUES(v_conversation.id,auth.uid(),v_link.outbound_body,v_link.id)
      RETURNING * INTO v_message;
    UPDATE public.rfq_supplier_requests SET initial_message_id=v_message.id WHERE id=v_link.id;
    v_result:=v_result||jsonb_build_array(jsonb_build_object(
      'request_id',v_link.id,'conversation_id',v_conversation.id,'factory_id',v_factory.id));
  END LOOP;
  UPDATE public.rfq_cases SET status='awaiting_supplier',updated_at=now() WHERE id=p_case_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_athelia_rfq(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_athelia_rfq(uuid,jsonb) TO authenticated;

-- Supplier details retain private RFQ, source-contact, and audit context but
-- no longer expose or query a retired product table.
CREATE OR REPLACE FUNCTION public.intools_list_suppliers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object('product_count',0)
    ORDER BY f.updated_at DESC),'[]'::jsonb)
  INTO v_result FROM public.factories f;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_get_supplier_detail(p_supplier_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT to_jsonb(f) || jsonb_build_object(
    'products','[]'::jsonb,
    'rfq_associations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'rfq_case_id',m.rfq_case_id,'case_no',c.case_no,'title',c.title,'status',m.status,'sent_at',m.created_at,'last_activity_at',m.updated_at) ORDER BY m.updated_at DESC) FROM public.rfq_supplier_matches m JOIN public.rfq_cases c ON c.id=m.rfq_case_id WHERE m.factory_id=f.id),'[]'::jsonb),
    'provenance',COALESCE((SELECT jsonb_agg(jsonb_build_object('field_name',p.field_name,'source_url',p.source_url,'value_origin',p.value_origin,'observed_at',p.observed_at) ORDER BY p.field_name) FROM public.supplier_field_provenance p WHERE p.entity_type='supplier' AND p.entity_id=f.id),'[]'::jsonb),
    'source_contacts',COALESCE((SELECT jsonb_agg(jsonb_build_object('contact_type',c.contact_type,'normalized_value',c.normalized_value,'source_url',c.source_url,'validation_status',c.validation_status,'usage_status',c.usage_status,'outreach_allowed',c.outreach_allowed) ORDER BY c.created_at DESC) FROM public.supplier_source_contacts c WHERE c.factory_id=f.id),'[]'::jsonb),
    'audit',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'summary',a.summary,'admin_name',p.full_name,'created_at',a.created_at) ORDER BY a.created_at DESC) FROM public.admin_audit_log a LEFT JOIN public.profiles p ON p.id=a.admin_id WHERE a.target_table='factories' AND a.target_id=f.id),'[]'::jsonb)
  ) INTO v_result FROM public.factories f WHERE f.id=p_supplier_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023'; END IF;
  RETURN v_result;
END;
$$;

-- Explicitly retire local search delivery rather than draining catalogue jobs
-- to an external provider. Factories remain broker-private and unindexed.
DROP TRIGGER IF EXISTS factories_enqueue_algolia_sync ON public.factories;
DROP TRIGGER IF EXISTS order_items_enqueue_algolia_sync ON public.order_items;
DROP TRIGGER IF EXISTS orders_enqueue_algolia_sync ON public.orders;
DROP TRIGGER IF EXISTS products_enqueue_algolia_sync ON public.products;
DROP TRIGGER IF EXISTS saved_items_enqueue_algolia_sync ON public.saved_items;
DROP FUNCTION IF EXISTS public.enqueue_algolia_sync();
DELETE FROM public.algolia_sync_outbox;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.algolia_sync_outbox) THEN
    RAISE EXCEPTION 'Search outbox must be empty before retirement';
  END IF;
END;
$$;

-- No product RPC, publishing pipeline, public directory, cart, or item
-- option path survives the broker RFQ/invoice boundary.
DROP FUNCTION IF EXISTS public.admin_set_private_product_assignments(uuid,text[]);
DROP FUNCTION IF EXISTS public.catalog_calculate_price(numeric,numeric,text,integer);
DROP FUNCTION IF EXISTS public.catalog_close_complete_run(uuid);
DROP FUNCTION IF EXISTS public.catalog_finalize_product_batch(uuid,uuid);
DROP FUNCTION IF EXISTS public.catalog_finalize_source_free_batch(uuid,uuid,text,integer,text,text,bigint,jsonb);
DROP FUNCTION IF EXISTS public.catalog_finalize_supplier_batch(uuid,uuid);
DROP FUNCTION IF EXISTS public.catalog_jsonb_has_email_key(jsonb);
DROP FUNCTION IF EXISTS public.catalog_locale_complete(jsonb);
DROP FUNCTION IF EXISTS public.catalog_mark_batch_live_verified(uuid,text);
DROP FUNCTION IF EXISTS public.catalog_mark_media_live_verified(text,text);
DROP FUNCTION IF EXISTS public.catalog_public_prices(text);
DROP FUNCTION IF EXISTS public.catalog_require_publisher();
DROP FUNCTION IF EXISTS public.catalog_resolved_faqs(uuid,text);
DROP FUNCTION IF EXISTS public.catalog_rollback_source_free_batch(uuid,text);
DROP FUNCTION IF EXISTS public.catalog_save_product_content(uuid,jsonb,text,jsonb,jsonb);
DROP FUNCTION IF EXISTS public.catalog_save_supplier_content(uuid,jsonb,jsonb);
DROP FUNCTION IF EXISTS public.catalog_save_supplier_faqs(uuid,jsonb);
DROP FUNCTION IF EXISTS public.catalog_storage_usage();
DROP FUNCTION IF EXISTS public.catalog_upsert_provenance(text,uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS public.catalog_verify_source_free_batch(uuid);
DROP FUNCTION IF EXISTS public.intools_archive_product(uuid,timestamptz,boolean);
DROP FUNCTION IF EXISTS public.intools_list_products();
DROP FUNCTION IF EXISTS public.intools_save_product(uuid,jsonb,timestamptz);
DROP FUNCTION IF EXISTS public.intools_save_product_legacy(uuid,jsonb,timestamptz);
DROP FUNCTION IF EXISTS public.intools_save_product_with_images(uuid,jsonb,timestamptz);
DROP FUNCTION IF EXISTS public.public_get_product(text,text);
DROP FUNCTION IF EXISTS public.public_list_catalog_factories(text);
DROP FUNCTION IF EXISTS public.public_list_catalog_products(public.product_category,text,integer,integer,text,text[],text,text[],text,numeric,numeric,text,text);
DROP FUNCTION IF EXISTS public.supplier_set_product_options(uuid,jsonb);

-- Product and cart records have no retained runtime contract. Delete them in
-- dependency order, assert their local closure, then remove the schema.
DROP POLICY IF EXISTS products_delete ON public.products;
DROP POLICY IF EXISTS products_insert ON public.products;
DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_update ON public.products;
DELETE FROM public.catalog_faqs;
DELETE FROM public.catalog_price_breaks;
DELETE FROM public.catalog_prices;
DELETE FROM public.product_brand_assignments;
DO $$
BEGIN
  IF to_regclass('public.product_materials') IS NOT NULL THEN
    DELETE FROM public.product_materials;
  END IF;
END;
$$;
DELETE FROM public.product_media;
DELETE FROM public.product_variants;
DELETE FROM public.price_breaks;
DELETE FROM public.cart_items;
DELETE FROM public.saved_items;
DELETE FROM public.carts;
DELETE FROM public.products;
DELETE FROM public.catalog_media_records;
DELETE FROM public.catalog_source_identities;
DELETE FROM public.catalog_staged_entities;
DELETE FROM public.catalog_release_batches;
DELETE FROM public.catalog_import_batches;
DELETE FROM public.catalog_import_runs;
DELETE FROM public.catalog_constructions;
DO $$
BEGIN
  IF to_regclass('public.catalog_materials') IS NOT NULL THEN
    DELETE FROM public.catalog_materials;
  END IF;
END;
$$;
DELETE FROM public.supplier_taxonomy_memberships;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.products)
     OR EXISTS (SELECT 1 FROM public.product_variants)
     OR EXISTS (SELECT 1 FROM public.price_breaks)
     OR EXISTS (SELECT 1 FROM public.cart_items)
     OR EXISTS (SELECT 1 FROM public.saved_items)
     OR EXISTS (SELECT 1 FROM public.catalog_media_records) THEN
    RAISE EXCEPTION 'Catalogue closure requires empty local tables before drop';
  END IF;
END;
$$;

-- Legacy catalogue assets are retained until a separate, backed-up Storage
-- API cleanup. They must not block retiring the database catalogue contract.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='catalog-media') THEN
    RAISE NOTICE 'catalog-media contains retained legacy assets; preserving objects and making the bucket private';
  END IF;
END;
$$;
DROP POLICY IF EXISTS catalog_media_admin_delete ON storage.objects;
DROP POLICY IF EXISTS catalog_media_admin_insert ON storage.objects;
DROP POLICY IF EXISTS catalog_media_admin_update ON storage.objects;
DROP POLICY IF EXISTS catalog_media_product_owner_delete ON storage.objects;
DROP POLICY IF EXISTS catalog_media_product_owner_insert ON storage.objects;
DROP POLICY IF EXISTS catalog_media_product_owner_update ON storage.objects;
DROP POLICY IF EXISTS catalog_media_public_read ON storage.objects;
-- Storage protects bucket deletion from SQL; after asserting no objects, make
-- the legacy bucket non-public. The protected storage API removes the empty
-- bucket only in Phase 7C after rotation, backup, observation, and verification.
UPDATE storage.buckets SET public=false WHERE id='catalog-media';

DROP TABLE IF EXISTS public.algolia_sync_outbox;
DROP TABLE IF EXISTS public.catalog_faqs;
DROP TABLE IF EXISTS public.catalog_price_breaks;
DROP TABLE IF EXISTS public.catalog_prices;
DROP TABLE IF EXISTS public.product_brand_assignments;
DROP TABLE IF EXISTS public.product_materials;
DROP TABLE IF EXISTS public.product_media;
DROP TABLE IF EXISTS public.product_variants;
DROP TABLE IF EXISTS public.price_breaks;
DROP TABLE IF EXISTS public.cart_items;
DROP TABLE IF EXISTS public.saved_items;
DROP TABLE IF EXISTS public.carts;
DROP TABLE IF EXISTS public.products;
DROP TABLE IF EXISTS public.catalog_media_records;
DROP TABLE IF EXISTS public.catalog_source_identities;
DROP TABLE IF EXISTS public.catalog_staged_entities;
DROP TABLE IF EXISTS public.catalog_release_batches;
DROP TABLE IF EXISTS public.catalog_import_batches;
DROP TABLE IF EXISTS public.catalog_import_runs;
DROP TABLE IF EXISTS public.catalog_constructions;
DROP TABLE IF EXISTS public.catalog_materials;
DROP TABLE IF EXISTS public.supplier_taxonomy_memberships;
DROP TYPE IF EXISTS public.product_category;
DROP TYPE IF EXISTS public.listing_status;
DROP TYPE IF EXISTS public.pricing_mode;
DROP TYPE IF EXISTS public.unit_type;

COMMIT;
