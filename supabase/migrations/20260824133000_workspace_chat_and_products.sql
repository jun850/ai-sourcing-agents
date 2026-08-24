-- Workspace RFQ chat and sourced-product read contracts.
-- Additive only: buyer chat is tied to the durable RFQ case and products are
-- immutable order snapshots, never a public catalogue read.

CREATE OR REPLACE FUNCTION public.create_workspace_rfq(p_title text, p_brief jsonb)
RETURNS public.rfq_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_case public.rfq_cases;
  v_thread public.athelia_threads;
BEGIN
  IF auth.uid() IS NULL OR char_length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 240 OR jsonb_typeof(p_brief) <> 'object' THEN
    RAISE EXCEPTION 'Invalid RFQ' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.athelia_threads(buyer_profile_id,title,brief)
  VALUES (auth.uid(), btrim(p_title), p_brief)
  RETURNING * INTO v_thread;
  INSERT INTO public.rfq_cases(buyer_profile_id,thread_id,title,brief,source,last_saved_at)
  VALUES (auth.uid(), v_thread.id, btrim(p_title), p_brief, 'workspace', now())
  RETURNING * INTO v_case;
  INSERT INTO public.athelia_thread_messages(thread_id,role,content)
  VALUES (v_thread.id,'buyer',COALESCE(NULLIF(btrim(p_brief->>'summary'),''),btrim(p_title)));
  INSERT INTO public.athelia_thread_messages(thread_id,role,content)
  VALUES (v_thread.id,'agent','I’ll structure this into an RFQ for your review. Nothing is sent to a supplier until you approve the draft.');
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_list_rfq_messages(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'role',m.role,'content',m.content,'created_at',m.created_at
  ) ORDER BY m.created_at,m.id),'[]'::jsonb)
  INTO v_result
  FROM public.athelia_thread_messages m
  JOIN public.rfq_cases c ON c.thread_id=m.thread_id
  WHERE c.id=p_case_id AND c.buyer_profile_id=auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid()) THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501';
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_add_rfq_message(p_case_id uuid, p_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_case public.rfq_cases;
  v_message public.athelia_thread_messages;
  v_ack public.athelia_thread_messages;
BEGIN
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501'; END IF;
  IF char_length(btrim(COALESCE(p_content,''))) NOT BETWEEN 1 AND 12000 THEN
    RAISE EXCEPTION 'Message must be between 1 and 12000 characters' USING ERRCODE='22023';
  END IF;
  IF v_case.thread_id IS NULL THEN
    INSERT INTO public.athelia_threads(buyer_profile_id,title,brief)
    VALUES (auth.uid(),v_case.title,v_case.brief) RETURNING id INTO v_case.thread_id;
    UPDATE public.rfq_cases SET thread_id=v_case.thread_id WHERE id=v_case.id;
  END IF;
  INSERT INTO public.athelia_thread_messages(thread_id,role,content)
  VALUES (v_case.thread_id,'buyer',btrim(p_content)) RETURNING * INTO v_message;
  INSERT INTO public.athelia_thread_messages(thread_id,role,content)
  VALUES (v_case.thread_id,'agent','I’ve recorded that in this RFQ. It remains a buyer-reviewed draft; no supplier outreach or commercial commitment has been made.')
  RETURNING * INTO v_ack;
  RETURN jsonb_build_array(
    jsonb_build_object('id',v_message.id,'role',v_message.role,'content',v_message.content,'created_at',v_message.created_at),
    jsonb_build_object('id',v_ack.id,'role',v_ack.role,'content',v_ack.content,'created_at',v_ack.created_at)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_list_products()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(result) ORDER BY result.placed_at DESC NULLS LAST,result.id DESC),'[]'::jsonb)
  FROM (
    SELECT oi.id, oi.sku_snapshot AS sku, oi.name_snapshot AS name,
      oi.seller_snapshot AS supplier, oi.unit_price, oi.qty AS units,
      oi.line_total, o.id AS order_id, o.order_no, o.status AS order_status,
      o.placed_at,
      (SELECT i.rfq_case_id FROM public.invoices i WHERE i.order_id=o.id AND i.buyer_profile_id=auth.uid() ORDER BY i.created_at DESC LIMIT 1) AS rfq_case_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id=oi.order_id
    WHERE o.buyer_profile_id=auth.uid()
  ) result;
$$;

CREATE OR REPLACE FUNCTION public.workspace_get_product(p_item_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT row_to_json(result) FROM (
    SELECT oi.id, oi.sku_snapshot AS sku, oi.name_snapshot AS name,
      oi.seller_snapshot AS supplier, oi.unit_price, oi.qty AS units,
      oi.line_total, o.id AS order_id, o.order_no, o.status AS order_status,
      o.placed_at,
      (SELECT i.rfq_case_id FROM public.invoices i WHERE i.order_id=o.id AND i.buyer_profile_id=auth.uid() ORDER BY i.created_at DESC LIMIT 1) AS rfq_case_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id=oi.order_id
    WHERE oi.id=p_item_id AND o.buyer_profile_id=auth.uid()
  ) result;
$$;

REVOKE ALL ON FUNCTION public.workspace_list_rfq_messages(uuid), public.workspace_add_rfq_message(uuid,text), public.workspace_list_products(), public.workspace_get_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_list_rfq_messages(uuid), public.workspace_add_rfq_message(uuid,text), public.workspace_list_products(), public.workspace_get_product(uuid) TO authenticated;
