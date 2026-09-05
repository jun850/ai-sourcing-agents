-- AI-native human-loop Wave 1: restore authoritative lifecycle reads and
-- canonical destinations without rewriting any applied migration.

CREATE OR REPLACE FUNCTION public.notification_destination(
  p_profile_id uuid, p_kind text, p_entity_type text, p_entity_id uuid, p_fallback text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT role = 'admin' INTO v_is_admin FROM public.profiles WHERE id = p_profile_id;
  IF p_entity_id IS NOT NULL AND p_entity_type = 'rfq_case' THEN
    RETURN CASE WHEN v_is_admin THEN '/intools/requests/' || p_entity_id::text ELSE '/dashboard/requests/' || p_entity_id::text END;
  END IF;
  IF p_entity_id IS NOT NULL AND p_entity_type = 'rfq_message' THEN
    RETURN CASE WHEN v_is_admin THEN '/intools/messages/' || p_entity_id::text ELSE '/dashboard/messages/' || p_entity_id::text END;
  END IF;
  IF p_entity_id IS NOT NULL AND p_entity_type = 'invoice' THEN
    RETURN CASE WHEN v_is_admin THEN '/intools/invoices/' || p_entity_id::text ELSE '/dashboard/invoices/' || p_entity_id::text END;
  END IF;
  IF p_entity_type = 'order' THEN
    RETURN CASE WHEN v_is_admin THEN '/intools/orders' ELSE '/dashboard/requests' END;
  END IF;
  IF p_kind = 'account' THEN RETURN '/dashboard/settings'; END IF;
  IF p_kind = 'chat' THEN RETURN CASE WHEN v_is_admin THEN '/intools/messages' ELSE '/dashboard/messages' END; END IF;
  IF p_kind IN ('rfq','quote','agent','production') THEN RETURN CASE WHEN v_is_admin THEN '/intools/requests' ELSE '/dashboard/requests' END; END IF;
  IF p_kind IN ('invoice','payment') THEN RETURN CASE WHEN v_is_admin THEN '/intools/invoices' ELSE '/dashboard/invoices' END; END IF;
  RETURN public.notification_safe_href(p_fallback, CASE WHEN v_is_admin THEN '/intools/requests' ELSE '/dashboard/requests' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_get_rfq_production(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid()) THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'quote',(SELECT jsonb_build_object(
      'id',q.id,'unit_price_cents',q.unit_price_cents,'moq',q.moq,
      'lead_time_days',q.lead_time_days,'selected_at',q.selected_at,
      'factory_name',f.name,'factory_region',f.region
    ) FROM public.rfq_quotes q JOIN public.factories f ON f.id=q.factory_id WHERE q.id=l.selected_quote_id),
    'lifecycle',jsonb_build_object(
      'state',l.state,'sample_ready_at',l.sample_ready_at,'sample_decision',l.sample_decision,
      'sample_decided_at',l.sample_decided_at,'updated_at',l.updated_at
    ),
    'invoices',COALESCE((SELECT jsonb_object_agg(pi.phase,jsonb_build_object(
      'id',i.id,'invoice_no',i.invoice_no,'phase',pi.phase,'status',i.status::text,
      'effective_status',CASE WHEN i.status='sent' AND i.due_date<current_date THEN 'overdue' ELSE i.status::text END,
      'total_cents',i.total_cents,
      'balance_cents',i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),
      'due_date',i.due_date
    )) FROM public.rfq_phase_invoices pi JOIN public.invoices i ON i.id=pi.invoice_id WHERE pi.rfq_case_id=p_case_id),'{}'::jsonb),
    'order',(SELECT jsonb_build_object(
      'id',o.id,'order_no',o.order_no,'status',o.status::text,'total',o.total,
      'placed_at',o.placed_at,
      'production_stage',(SELECT ofl.production_stage FROM public.order_fulfillments ofl WHERE ofl.order_id=o.id ORDER BY ofl.created_at LIMIT 1)
    ) FROM public.orders o WHERE o.rfq_case_id=p_case_id ORDER BY o.created_at DESC LIMIT 1),
    'events',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',e.id,'event_type',e.event_type,'phase',e.phase,
      'actor_profile_id',e.actor_profile_id,
      'actor_name',COALESCE(NULLIF(btrim(p.full_name),''),NULLIF(btrim(p.company_name),'')),
      'note',e.note,'metadata',e.metadata,'created_at',e.created_at
    ) ORDER BY e.created_at,e.id) FROM public.rfq_lifecycle_events e LEFT JOIN public.profiles p ON p.id=e.actor_profile_id WHERE e.rfq_case_id=p_case_id),'[]'::jsonb)
  ) INTO v_result FROM public.rfq_lifecycles l WHERE l.rfq_case_id=p_case_id;
  RETURN COALESCE(v_result,jsonb_build_object('quote',null,'lifecycle',null,'invoices','{}'::jsonb,'order',null,'events','[]'::jsonb));
END; $$;

-- Keep the existing Requests list call count stable while surfacing the
-- lifecycle state and order controls required by its detail drawer.
CREATE OR REPLACE FUNCTION public.intools_list_rfq_cases(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',c.id,'case_no',c.case_no,'title',c.title,'brief',c.brief,'status',c.status,
    'buyer_profile_id',c.buyer_profile_id,'buyer_name',COALESCE(pr.company_name,pr.full_name),'buyer_email',u.email::text,
    'match_count',(SELECT count(*) FROM public.rfq_supplier_matches m WHERE m.rfq_case_id=c.id),
    'quote_count',(SELECT count(*) FROM public.rfq_quotes q WHERE q.rfq_case_id=c.id AND q.status<>'draft'),
    'lifecycle_state',(SELECT l.state FROM public.rfq_lifecycles l WHERE l.rfq_case_id=c.id),
    'order',(SELECT jsonb_build_object(
      'id',o.id,'order_no',o.order_no,'status',o.status::text,
      'production_stage',(SELECT ofl.production_stage FROM public.order_fulfillments ofl WHERE ofl.order_id=o.id ORDER BY ofl.created_at LIMIT 1)
    ) FROM public.orders o WHERE o.rfq_case_id=c.id ORDER BY o.created_at DESC LIMIT 1),
    'submitted_at',c.submitted_at,'created_at',c.created_at,'updated_at',c.updated_at
  ) ORDER BY c.updated_at DESC),'[]'::jsonb) INTO v_result
  FROM public.rfq_cases c JOIN public.profiles pr ON pr.id=c.buyer_profile_id JOIN auth.users u ON u.id=c.buyer_profile_id
  WHERE c.source='workspace' AND (p_status IS NULL OR c.status=p_status);
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.notification_destination(uuid,text,text,uuid,text), public.workspace_get_rfq_production(uuid), public.intools_list_rfq_cases(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_get_rfq_production(uuid), public.intools_list_rfq_cases(text) TO authenticated;

-- Human chat attachments may carry short QC/reference video. The 25 MB chat
-- cap stays unchanged; larger QC originals use the dedicated QC bucket.
ALTER TABLE public.rfq_ops_message_attachments DROP CONSTRAINT IF EXISTS rfq_ops_message_attachments_content_type_check;
ALTER TABLE public.rfq_ops_message_attachments ADD CONSTRAINT rfq_ops_message_attachments_content_type_check
  CHECK (content_type IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/quicktime','video/webm'));

UPDATE storage.buckets
SET allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/quicktime','video/webm']
WHERE id='rfq-message-attachments';

CREATE OR REPLACE FUNCTION public.rfq_ops_record_attachments(
  p_message_id uuid,
  p_conversation_id uuid,
  p_rfq_case_id uuid,
  p_client_message_id uuid,
  p_attachments jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_item jsonb;
  v_attachment_id uuid;
  v_storage_path text;
  v_original_name text;
  v_metadata jsonb;
  v_content_type text;
  v_byte_size bigint;
  v_reservation public.rfq_ops_upload_reservations;
  v_count integer := 0;
BEGIN
  IF p_attachments IS NULL OR jsonb_typeof(p_attachments)<>'array' OR jsonb_array_length(p_attachments)>10 THEN
    RAISE EXCEPTION 'attachments must be an array of at most 10 files' USING ERRCODE='22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
    IF jsonb_typeof(v_item)<>'object'
      OR COALESCE(v_item->>'id','') !~ '^[0-9a-fA-F-]{36}$'
      OR COALESCE(v_item->>'original_name','')=''
      OR char_length(btrim(v_item->>'original_name'))>255
      OR position('/' IN (v_item->>'original_name'))>0
      OR position(E'\\' IN (v_item->>'original_name'))>0 THEN
      RAISE EXCEPTION 'invalid attachment descriptor' USING ERRCODE='22023';
    END IF;
    v_attachment_id:=(v_item->>'id')::uuid;
    v_original_name:=btrim(v_item->>'original_name');
    v_storage_path:=v_item->>'storage_path';
    IF COALESCE(v_storage_path,'') !~ ('^'||auth.uid()::text||'/'||p_rfq_case_id::text||'/'||p_client_message_id::text||'/'||v_attachment_id::text||'/[^/]+$') THEN
      RAISE EXCEPTION 'attachment path does not match the required upload path' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_reservation FROM public.rfq_ops_upload_reservations r
    WHERE r.id=v_attachment_id AND r.conversation_id=p_conversation_id AND r.rfq_case_id=p_rfq_case_id
      AND r.uploader_profile_id=auth.uid() AND r.client_message_id=p_client_message_id
      AND r.storage_path=v_storage_path AND r.original_name=v_original_name
      AND r.consumed_at IS NULL AND r.expires_at>now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'active upload reservation was not found' USING ERRCODE='42501'; END IF;
    SELECT o.metadata INTO v_metadata FROM storage.objects o WHERE o.bucket_id='rfq-message-attachments' AND o.name=v_storage_path;
    IF NOT FOUND THEN RAISE EXCEPTION 'uploaded attachment was not found' USING ERRCODE='P0002'; END IF;
    v_content_type:=COALESCE(v_metadata->>'mimetype',v_metadata->>'contentType');
    IF COALESCE(v_metadata->>'size','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'uploaded attachment has invalid size metadata' USING ERRCODE='22023'; END IF;
    v_byte_size:=(v_metadata->>'size')::bigint;
    IF v_content_type NOT IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/quicktime','video/webm')
      OR v_byte_size NOT BETWEEN 1 AND 26214400 THEN RAISE EXCEPTION 'attachment type or size is not allowed' USING ERRCODE='22023'; END IF;
    INSERT INTO public.rfq_ops_message_attachments(id,message_id,storage_path,original_name,content_type,byte_size)
    VALUES(v_attachment_id,p_message_id,v_storage_path,v_original_name,v_content_type,v_byte_size);
    UPDATE public.rfq_ops_upload_reservations SET consumed_at=now(),message_id=p_message_id WHERE id=v_reservation.id;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.rfq_ops_record_attachments(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
