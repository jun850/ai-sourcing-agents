-- Quotes and production/order tracking for the broker sourcing flow.
-- Additive only. Fills the gap left when the product catalogue (and its
-- cart-checkout order path) was retired: there is currently no record of a
-- supplier's commercial terms, and no way to create an order for a
-- broker-negotiated RFQ. Ops enters/publishes quotes here; the buyer selects
-- one; ops then confirms an order and tracks production stage.

-- ---------------------------------------------------------------------------
-- 1. rfq_quotes — a supplier's commercial terms for one RFQ, entered by ops
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfq_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_case_id uuid NOT NULL REFERENCES public.rfq_cases(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.rfq_supplier_matches(id) ON DELETE SET NULL,
  factory_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','selected','declined')),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  moq integer NOT NULL CHECK (moq > 0),
  lead_time_days integer NOT NULL CHECK (lead_time_days > 0),
  certifications text[] NOT NULL DEFAULT '{}',
  certification_note text CHECK (certification_note IS NULL OR char_length(certification_note) <= 300),
  recommended boolean NOT NULL DEFAULT false,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  selected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_case_id, factory_id)
);
CREATE INDEX IF NOT EXISTS rfq_quotes_case_status_idx ON public.rfq_quotes(rfq_case_id, status, updated_at DESC);
ALTER TABLE public.rfq_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rfq_quotes_admin_all ON public.rfq_quotes;
DROP POLICY IF EXISTS rfq_quotes_buyer_read ON public.rfq_quotes;
CREATE POLICY rfq_quotes_admin_all ON public.rfq_quotes FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY rfq_quotes_buyer_read ON public.rfq_quotes FOR SELECT TO authenticated
  USING (status IN ('published','selected','declined') AND EXISTS (
    SELECT 1 FROM public.rfq_cases c WHERE c.id = rfq_case_id AND c.buyer_profile_id = auth.uid()
  ));

DROP TRIGGER IF EXISTS rfq_quotes_touch ON public.rfq_quotes;
CREATE OR REPLACE FUNCTION public.rfq_quotes_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at:=now(); RETURN NEW; END;
$$;
CREATE TRIGGER rfq_quotes_touch BEFORE UPDATE ON public.rfq_quotes
  FOR EACH ROW EXECUTE FUNCTION public.rfq_quotes_touch();

-- ---------------------------------------------------------------------------
-- 2. rfq_cases.status — two additive stages: buyer picked a quote and Atelix
--    is confirming terms ('quote_selected'), then an order exists ('in_production')
-- ---------------------------------------------------------------------------
ALTER TABLE public.rfq_cases DROP CONSTRAINT IF EXISTS rfq_cases_status_check;
ALTER TABLE public.rfq_cases ADD CONSTRAINT rfq_cases_status_check
  CHECK (status IN ('draft','awaiting_supplier','supplier_replied','buyer_review','needs_research','closed','quote_selected','in_production'));

-- ---------------------------------------------------------------------------
-- 3. order_fulfillments.production_stage — sub-stages fulfillment_status alone
--    can't express (design needs sampling vs. bulk production vs. QC)
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_fulfillments
  ADD COLUMN IF NOT EXISTS production_stage text NOT NULL DEFAULT 'sampling'
  CHECK (production_stage IN ('sampling','bulk_production','quality_inspection','shipped','delivered'));

-- Direct link from a broker-confirmed order back to its RFQ (invoices already
-- carry this; orders did not, since the retired cart-checkout path never set it).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rfq_case_id uuid REFERENCES public.rfq_cases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_rfq_case_idx ON public.orders(rfq_case_id) WHERE rfq_case_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Ops: enter and publish quotes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intools_upsert_rfq_quote(p_quote_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case_id uuid; v_factory_id uuid; v_quote public.rfq_quotes; v_certs text[];
BEGIN
  PERFORM public.intools_require_admin();
  v_case_id := (p_payload->>'rfq_case_id')::uuid;
  v_factory_id := (p_payload->>'factory_id')::uuid;
  IF v_case_id IS NULL OR v_factory_id IS NULL THEN
    RAISE EXCEPTION 'rfq_case_id and factory_id are required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rfq_supplier_matches m
    WHERE m.rfq_case_id = v_case_id AND m.factory_id = v_factory_id AND m.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Factory is not an approved match for this RFQ' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(array_agg(elem), '{}') INTO v_certs
    FROM jsonb_array_elements_text(COALESCE(p_payload->'certifications', '[]'::jsonb)) AS elem;
  IF p_quote_id IS NULL THEN
    INSERT INTO public.rfq_quotes(rfq_case_id, factory_id, match_id, unit_price_cents, moq, lead_time_days, certifications, certification_note, recommended, notes, created_by)
    VALUES (
      v_case_id, v_factory_id,
      (SELECT id FROM public.rfq_supplier_matches WHERE rfq_case_id=v_case_id AND factory_id=v_factory_id),
      (p_payload->>'unit_price_cents')::integer, (p_payload->>'moq')::integer, (p_payload->>'lead_time_days')::integer,
      v_certs, NULLIF(btrim(p_payload->>'certification_note'),''), COALESCE((p_payload->>'recommended')::boolean,false),
      NULLIF(btrim(p_payload->>'notes'),''), auth.uid()
    )
    ON CONFLICT (rfq_case_id, factory_id) DO UPDATE SET
      unit_price_cents=EXCLUDED.unit_price_cents, moq=EXCLUDED.moq, lead_time_days=EXCLUDED.lead_time_days,
      certifications=EXCLUDED.certifications, certification_note=EXCLUDED.certification_note,
      recommended=EXCLUDED.recommended, notes=EXCLUDED.notes
    WHERE public.rfq_quotes.status = 'draft'
    RETURNING * INTO v_quote;
  ELSE
    UPDATE public.rfq_quotes SET
      unit_price_cents=(p_payload->>'unit_price_cents')::integer, moq=(p_payload->>'moq')::integer,
      lead_time_days=(p_payload->>'lead_time_days')::integer, certifications=v_certs,
      certification_note=NULLIF(btrim(p_payload->>'certification_note'),''),
      recommended=COALESCE((p_payload->>'recommended')::boolean,false), notes=NULLIF(btrim(p_payload->>'notes'),'')
    WHERE id=p_quote_id AND status='draft'
    RETURNING * INTO v_quote;
  END IF;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found or no longer editable' USING ERRCODE='42501'; END IF;
  RETURN to_jsonb(v_quote);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_publish_rfq_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_quote public.rfq_quotes;
BEGIN
  PERFORM public.intools_require_admin();
  UPDATE public.rfq_quotes SET status='published' WHERE id=p_quote_id AND status='draft' RETURNING * INTO v_quote;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found or already published' USING ERRCODE='42501'; END IF;
  UPDATE public.rfq_cases SET status='buyer_review', updated_at=now()
    WHERE id=v_quote.rfq_case_id AND status IN ('needs_research','awaiting_supplier','supplier_replied');
  RETURN to_jsonb(v_quote);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Buyer: compare and select a quote
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_list_rfq_quotes(p_case_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id, 'status', q.status, 'unit_price_cents', q.unit_price_cents, 'moq', q.moq,
    'lead_time_days', q.lead_time_days, 'certifications', to_jsonb(q.certifications),
    'certification_note', q.certification_note, 'recommended', q.recommended, 'selected_at', q.selected_at,
    'factory_id', f.id, 'factory_name', f.name, 'factory_region', f.region, 'factory_years', f.years
  ) ORDER BY q.recommended DESC, q.unit_price_cents ASC), '[]'::jsonb)
  FROM public.rfq_quotes q
  JOIN public.factories f ON f.id = q.factory_id
  WHERE q.rfq_case_id = p_case_id AND q.status IN ('published','selected','declined')
    AND EXISTS (SELECT 1 FROM public.rfq_cases c WHERE c.id = p_case_id AND c.buyer_profile_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.workspace_select_rfq_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_quote public.rfq_quotes;
BEGIN
  SELECT q.* INTO v_quote FROM public.rfq_quotes q
    JOIN public.rfq_cases c ON c.id = q.rfq_case_id
    WHERE q.id = p_quote_id AND c.buyer_profile_id = auth.uid() AND q.status = 'published'
    FOR UPDATE;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found or not available for selection' USING ERRCODE='42501'; END IF;
  UPDATE public.rfq_quotes SET status='declined' WHERE rfq_case_id=v_quote.rfq_case_id AND status='published' AND id<>v_quote.id;
  UPDATE public.rfq_quotes SET status='selected', selected_at=now() WHERE id=v_quote.id RETURNING * INTO v_quote;
  UPDATE public.rfq_cases SET status='quote_selected', updated_at=now() WHERE id=v_quote.rfq_case_id;
  RETURN to_jsonb(v_quote);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Ops: confirm an order for the selected quote, then track production stage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intools_confirm_rfq_order(
  p_case_id uuid, p_quote_id uuid, p_qty numeric,
  p_ship_country text DEFAULT NULL, p_ship_address text DEFAULT NULL, p_incoterms text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.rfq_cases; v_quote public.rfq_quotes; v_factory public.factories;
  v_order public.orders; v_unit_price numeric(12,2); v_line_total numeric(12,2);
BEGIN
  PERFORM public.intools_require_admin();
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=p_case_id AND status='quote_selected' FOR UPDATE;
  IF v_case.id IS NULL THEN RAISE EXCEPTION 'RFQ is not awaiting order confirmation' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_quote FROM public.rfq_quotes WHERE id=p_quote_id AND rfq_case_id=p_case_id AND status='selected';
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found or not selected' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_factory FROM public.factories WHERE id=v_quote.factory_id;
  v_unit_price := round(v_quote.unit_price_cents / 100.0, 2);
  v_line_total := round(v_unit_price * p_qty, 2);
  INSERT INTO public.orders(order_no, buyer_profile_id, rfq_case_id, status, subtotal, total, ship_country, ship_address, incoterms, placed_at)
  VALUES ('ATL-ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)), v_case.buyer_profile_id, p_case_id, 'awaiting_payment', v_line_total, v_line_total, p_ship_country, p_ship_address, p_incoterms, now())
  RETURNING * INTO v_order;
  INSERT INTO public.order_items(order_id, factory_id, sku_snapshot, name_snapshot, seller_snapshot, unit_price, qty, line_total)
  VALUES (v_order.id, v_factory.id, v_case.case_no, v_case.title, v_factory.name, v_unit_price, p_qty, v_line_total);
  INSERT INTO public.order_fulfillments(order_id, factory_id, fulfillment_status, production_stage)
  VALUES (v_order.id, v_factory.id, 'pending', 'sampling');
  UPDATE public.rfq_cases SET status='in_production', updated_at=now() WHERE id=p_case_id;
  RETURN jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no, 'total', v_order.total);
END;
$$;

CREATE OR REPLACE FUNCTION public.intools_update_order_production_stage(p_order_id uuid, p_stage text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders; v_fulfillment public.order_fulfillments;
BEGIN
  PERFORM public.intools_require_admin();
  IF p_stage NOT IN ('sampling','bulk_production','quality_inspection','shipped','delivered') THEN
    RAISE EXCEPTION 'Invalid production stage' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='42501'; END IF;
  UPDATE public.order_fulfillments SET production_stage=p_stage WHERE order_id=p_order_id RETURNING * INTO v_fulfillment;
  IF v_fulfillment.id IS NULL THEN RAISE EXCEPTION 'Order has no fulfillment record' USING ERRCODE='42501'; END IF;
  INSERT INTO public.order_status_events(order_id, status, note, created_by) VALUES (p_order_id, v_order.status, NULLIF(btrim(p_note),''), auth.uid());
  RETURN to_jsonb(v_fulfillment);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Buyer: read the production/order/invoice summary for an RFQ (Orders tab)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_get_rfq_production(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rfq_cases WHERE id=p_case_id AND buyer_profile_id=auth.uid()) THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'quote', (SELECT jsonb_build_object(
      'id', q.id, 'unit_price_cents', q.unit_price_cents, 'moq', q.moq, 'lead_time_days', q.lead_time_days,
      'selected_at', q.selected_at, 'factory_name', f.name, 'factory_region', f.region
    ) FROM public.rfq_quotes q JOIN public.factories f ON f.id=q.factory_id
      WHERE q.rfq_case_id=p_case_id AND q.status='selected' ORDER BY q.selected_at DESC LIMIT 1),
    'order', (SELECT jsonb_build_object(
      'id', o.id, 'order_no', o.order_no, 'status', o.status::text, 'total', o.total, 'placed_at', o.placed_at,
      'production_stage', (SELECT ofl.production_stage FROM public.order_fulfillments ofl WHERE ofl.order_id=o.id LIMIT 1)
    ) FROM public.orders o
      WHERE o.rfq_case_id=p_case_id AND o.buyer_profile_id=auth.uid() ORDER BY o.created_at DESC LIMIT 1),
    'invoice', (SELECT jsonb_build_object(
      'id', i.id, 'invoice_no', i.invoice_no, 'status', i.status::text,
      'effective_status', CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END,
      'total_cents', i.total_cents,
      'balance_cents', i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),
      'due_date', i.due_date
    ) FROM public.invoices i WHERE i.rfq_case_id=p_case_id AND i.buyer_profile_id=auth.uid() ORDER BY i.created_at DESC LIMIT 1)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intools_upsert_rfq_quote(uuid,jsonb), public.intools_publish_rfq_quote(uuid),
  public.workspace_list_rfq_quotes(uuid), public.workspace_select_rfq_quote(uuid),
  public.intools_confirm_rfq_order(uuid,uuid,numeric,text,text,text), public.intools_update_order_production_stage(uuid,text,text),
  public.workspace_get_rfq_production(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_upsert_rfq_quote(uuid,jsonb), public.intools_publish_rfq_quote(uuid),
  public.workspace_list_rfq_quotes(uuid), public.workspace_select_rfq_quote(uuid),
  public.intools_confirm_rfq_order(uuid,uuid,numeric,text,text,text), public.intools_update_order_production_stage(uuid,text,text),
  public.workspace_get_rfq_production(uuid) TO authenticated;

GRANT SELECT ON public.rfq_quotes TO authenticated;
