-- Phase 3: broker invoice ledger.  Amounts are USD integer cents and every
-- privileged mutation is performed through an authenticated, admin-gated RPC.
DO $$ BEGIN
  CREATE TYPE public.atelix_invoice_status AS ENUM ('draft', 'sent', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.invoice_year_counters (
  invoice_year integer PRIMARY KEY CHECK (invoice_year BETWEEN 2000 AND 9999),
  last_number integer NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE CHECK (invoice_no ~ '^ATL-[0-9]{4}-[0-9]{5}$'),
  invoice_year integer NOT NULL CHECK (invoice_year BETWEEN 2000 AND 9999),
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rfq_case_id uuid REFERENCES public.rfq_cases(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  status public.atelix_invoice_status NOT NULL DEFAULT 'draft',
  subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  due_date date,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  sent_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_year, sequence_no),
  CHECK (total_cents = subtotal_cents + tax_cents),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CHECK (status <> 'cancelled' OR char_length(btrim(coalesce(cancelled_reason, ''))) BETWEEN 3 AND 500)
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position > 0),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents >= 0),
  tax_amount_cents integer NOT NULL DEFAULT 0 CHECK (tax_amount_cents >= 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, position),
  CHECK (line_total_cents = quantity * unit_amount_cents + tax_amount_cents)
);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('manual', 'stripe')),
  provider_reference text NOT NULL CHECK (char_length(btrim(provider_reference)) BETWEEN 3 AND 255),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'pending')),
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_reference)
);

CREATE TABLE IF NOT EXISTS public.invoice_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.invoice_payments(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE TABLE IF NOT EXISTS public.invoice_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'send', 'cancel', 'manual_payment', 'paid')),
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_buyer_created_idx ON public.invoices (buyer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_status_due_idx ON public.invoices (status, due_date);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON public.invoice_items (invoice_id, position);
CREATE INDEX IF NOT EXISTS invoice_allocations_invoice_idx ON public.invoice_payment_allocations (invoice_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.invoices, public.invoice_items, public.invoice_payments, public.invoice_payment_allocations, public.invoice_audit_log, public.invoice_year_counters FROM anon, authenticated;
GRANT SELECT ON public.invoices, public.invoice_items, public.invoice_payments, public.invoice_payment_allocations TO authenticated;
CREATE POLICY invoices_buyer_or_admin_read ON public.invoices FOR SELECT TO authenticated USING (buyer_profile_id = auth.uid() OR public.is_admin());
CREATE POLICY invoice_items_buyer_or_admin_read ON public.invoice_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND (i.buyer_profile_id = auth.uid() OR public.is_admin())));
CREATE POLICY invoice_payments_buyer_or_admin_read ON public.invoice_payments FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.invoice_payment_allocations a JOIN public.invoices i ON i.id=a.invoice_id WHERE a.payment_id=invoice_payments.id AND i.buyer_profile_id=auth.uid()));
CREATE POLICY invoice_allocations_buyer_or_admin_read ON public.invoice_payment_allocations FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.buyer_profile_id=auth.uid()));
CREATE POLICY invoice_audit_admin_read ON public.invoice_audit_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.intools_invoice_require_draft(p_invoice_id uuid)
RETURNS public.invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invoice public.invoices;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found' USING ERRCODE='P0002'; END IF;
  IF v_invoice.status <> 'draft' THEN RAISE EXCEPTION 'sent, paid, and cancelled invoices are immutable' USING ERRCODE='55000'; END IF;
  RETURN v_invoice;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_invoice_replace_items(p_invoice_id uuid, p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_item jsonb; v_position integer := 0; v_subtotal integer := 0; v_tax integer := 0; v_quantity integer; v_unit integer; v_item_tax integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 100 THEN RAISE EXCEPTION 'invoice needs 1 to 100 items' USING ERRCODE='22023'; END IF;
  DELETE FROM public.invoice_items WHERE invoice_id=p_invoice_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_position := v_position + 1;
    v_quantity := NULLIF(v_item->>'quantity','')::integer;
    v_unit := NULLIF(v_item->>'unitAmountCents','')::integer;
    v_item_tax := COALESCE(NULLIF(v_item->>'taxAmountCents','')::integer,0);
    IF char_length(btrim(COALESCE(v_item->>'description',''))) NOT BETWEEN 1 AND 500 OR v_quantity NOT BETWEEN 1 AND 1000000 OR v_unit < 0 OR v_item_tax < 0 THEN RAISE EXCEPTION 'invalid invoice item' USING ERRCODE='22023'; END IF;
    INSERT INTO public.invoice_items(invoice_id,position,description,quantity,unit_amount_cents,tax_amount_cents,line_total_cents) VALUES (p_invoice_id,v_position,btrim(v_item->>'description'),v_quantity,v_unit,v_item_tax,v_quantity*v_unit+v_item_tax);
    v_subtotal := v_subtotal + v_quantity*v_unit; v_tax := v_tax + v_item_tax;
  END LOOP;
  UPDATE public.invoices SET subtotal_cents=v_subtotal,tax_cents=v_tax,total_cents=v_subtotal+v_tax,updated_by=auth.uid(),updated_at=now() WHERE id=p_invoice_id;
END; $$;

CREATE OR REPLACE FUNCTION public.intools_create_invoice(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_year integer := extract(year FROM current_date)::integer; v_sequence integer; v_invoice public.invoices; v_buyer uuid := NULLIF(p_payload->>'buyerProfileId','')::uuid;
BEGIN
  PERFORM public.intools_require_admin();
  IF jsonb_typeof(p_payload) <> 'object' OR jsonb_typeof(p_payload->'items') <> 'array' OR v_buyer IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_buyer) THEN RAISE EXCEPTION 'invalid invoice' USING ERRCODE='22023'; END IF;
  INSERT INTO public.invoice_year_counters(invoice_year,last_number) VALUES(v_year,1) ON CONFLICT(invoice_year) DO UPDATE SET last_number=public.invoice_year_counters.last_number+1 RETURNING last_number INTO v_sequence;
  INSERT INTO public.invoices(invoice_no,invoice_year,sequence_no,buyer_profile_id,rfq_case_id,order_id,currency,due_date,notes,created_by,updated_by) VALUES ('ATL-'||v_year::text||'-'||lpad(v_sequence::text,5,'0'),v_year,v_sequence,v_buyer,NULLIF(p_payload->>'rfqCaseId','')::uuid,NULLIF(p_payload->>'orderId','')::uuid,'usd',NULLIF(p_payload->>'dueDate','')::date,NULLIF(btrim(p_payload->>'notes'),''),auth.uid(),auth.uid()) RETURNING * INTO v_invoice;
  PERFORM public.intools_invoice_replace_items(v_invoice.id,p_payload->'items');
  INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary) VALUES(v_invoice.id,auth.uid(),'create','Created invoice '||v_invoice.invoice_no);
  RETURN public.intools_get_invoice_detail(v_invoice.id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_update_invoice(p_invoice_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.intools_invoice_require_draft(p_invoice_id);
  IF jsonb_typeof(p_payload) <> 'object' OR jsonb_typeof(p_payload->'items') <> 'array' THEN RAISE EXCEPTION 'invalid invoice' USING ERRCODE='22023'; END IF;
  UPDATE public.invoices SET buyer_profile_id=COALESCE(NULLIF(p_payload->>'buyerProfileId','')::uuid,buyer_profile_id),rfq_case_id=NULLIF(p_payload->>'rfqCaseId','')::uuid,order_id=NULLIF(p_payload->>'orderId','')::uuid,due_date=NULLIF(p_payload->>'dueDate','')::date,notes=NULLIF(btrim(p_payload->>'notes'),''),updated_by=auth.uid(),updated_at=now() WHERE id=p_invoice_id;
  PERFORM public.intools_invoice_replace_items(p_invoice_id,p_payload->'items');
  INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary) VALUES(p_invoice_id,auth.uid(),'update','Updated draft invoice');
  RETURN public.intools_get_invoice_detail(p_invoice_id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_send_invoice(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invoice public.invoices;
BEGIN
  v_invoice := public.intools_invoice_require_draft(p_invoice_id);
  IF v_invoice.total_cents <= 0 THEN RAISE EXCEPTION 'invoice total must be greater than zero' USING ERRCODE='22023'; END IF;
  UPDATE public.invoices SET status='sent',sent_at=now(),updated_by=auth.uid(),updated_at=now() WHERE id=p_invoice_id;
  INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary) VALUES(p_invoice_id,auth.uid(),'send','Sent invoice');
  RETURN public.intools_get_invoice_detail(p_invoice_id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_cancel_invoice(p_invoice_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status public.atelix_invoice_status;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT status INTO v_status FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found' USING ERRCODE='P0002'; END IF;
  IF v_status NOT IN ('draft','sent') THEN RAISE EXCEPTION 'paid and cancelled invoices cannot be cancelled' USING ERRCODE='55000'; END IF;
  IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'cancellation reason must be 3 to 500 characters' USING ERRCODE='22023'; END IF;
  UPDATE public.invoices SET status='cancelled',cancelled_at=now(),cancelled_reason=btrim(p_reason),updated_by=auth.uid(),updated_at=now() WHERE id=p_invoice_id;
  INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary) VALUES(p_invoice_id,auth.uid(),'cancel','Cancelled invoice: '||btrim(p_reason));
  RETURN public.intools_get_invoice_detail(p_invoice_id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_record_manual_payment(p_invoice_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invoice public.invoices; v_amount integer := NULLIF(p_payload->>'amountCents','')::integer; v_allocated integer; v_payment public.invoice_payments;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status <> 'sent' THEN RAISE EXCEPTION 'only sent invoices accept manual payments' USING ERRCODE='55000'; END IF;
  SELECT COALESCE(sum(a.amount_cents),0) INTO v_allocated FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=p_invoice_id AND p.status='succeeded';
  IF jsonb_typeof(p_payload) <> 'object' OR v_amount IS NULL OR v_amount <= 0 OR v_amount > v_invoice.total_cents-v_allocated OR char_length(btrim(coalesce(p_payload->>'reference',''))) NOT BETWEEN 3 AND 255 THEN RAISE EXCEPTION 'invalid manual payment' USING ERRCODE='22023'; END IF;
  INSERT INTO public.invoice_payments(provider,provider_reference,currency,amount_cents,status,recorded_by) VALUES('manual',btrim(p_payload->>'reference'),'usd',v_amount,'succeeded',auth.uid()) RETURNING * INTO v_payment;
  INSERT INTO public.invoice_payment_allocations(payment_id,invoice_id,amount_cents) VALUES(v_payment.id,p_invoice_id,v_amount);
  IF v_allocated+v_amount = v_invoice.total_cents THEN UPDATE public.invoices SET status='paid',paid_at=now(),updated_by=auth.uid(),updated_at=now() WHERE id=p_invoice_id; INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary) VALUES(p_invoice_id,auth.uid(),'paid','Invoice fully allocated and paid'); END IF;
  INSERT INTO public.invoice_audit_log(invoice_id,actor_profile_id,action,summary,metadata) VALUES(p_invoice_id,auth.uid(),'manual_payment','Recorded manual payment',jsonb_build_object('amountCents',v_amount,'reference',btrim(p_payload->>'reference')));
  RETURN public.intools_get_invoice_detail(p_invoice_id);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_invoices(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
    SELECT i.id,i.invoice_no,i.status::text,i.currency,i.subtotal_cents,i.tax_cents,i.total_cents,COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS paid_cents,i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0)::integer AS balance_cents,i.due_date,CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END AS effective_status,coalesce(pr.company_name,pr.full_name) AS buyer_name,u.email::text AS buyer_email,r.case_no AS rfq_case_no,o.order_no,i.created_at,i.updated_at FROM public.invoices i JOIN public.profiles pr ON pr.id=i.buyer_profile_id JOIN auth.users u ON u.id=i.buyer_profile_id LEFT JOIN public.rfq_cases r ON r.id=i.rfq_case_id LEFT JOIN public.orders o ON o.id=i.order_id WHERE public.intools_require_admin() IS NULL AND (p_status IS NULL OR i.status::text=p_status) ) x;
$$;

CREATE OR REPLACE FUNCTION public.intools_get_invoice_detail(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT jsonb_build_object('id',i.id,'invoice_no',i.invoice_no,'status',i.status::text,'effective_status',CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END,'currency',i.currency,'subtotal_cents',i.subtotal_cents,'tax_cents',i.tax_cents,'total_cents',i.total_cents,'paid_cents',COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),'balance_cents',i.total_cents-COALESCE((SELECT sum(a.amount_cents) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),0),'due_date',i.due_date,'notes',i.notes,'buyer_profile_id',i.buyer_profile_id,'buyer_name',coalesce(pr.company_name,pr.full_name),'buyer_email',u.email::text,'rfq_case_id',i.rfq_case_id,'order_id',i.order_id,'created_at',i.created_at,'updated_at',i.updated_at,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',it.id,'description',it.description,'quantity',it.quantity,'unit_amount_cents',it.unit_amount_cents,'tax_amount_cents',it.tax_amount_cents,'line_total_cents',it.line_total_cents) ORDER BY it.position) FROM public.invoice_items it WHERE it.invoice_id=i.id),'[]'::jsonb),'payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'provider',p.provider,'reference',p.provider_reference,'amount_cents',a.amount_cents,'recorded_at',p.recorded_at) ORDER BY p.recorded_at DESC) FROM public.invoice_payment_allocations a JOIN public.invoice_payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='succeeded'),'[]'::jsonb),'audit',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'summary',a.summary,'admin_name',coalesce(ap.full_name,'System'),'created_at',a.created_at) ORDER BY a.created_at DESC) FROM public.invoice_audit_log a LEFT JOIN public.profiles ap ON ap.id=a.actor_profile_id WHERE a.invoice_id=i.id),'[]'::jsonb)) INTO v_result FROM public.invoices i JOIN public.profiles pr ON pr.id=i.buyer_profile_id JOIN auth.users u ON u.id=i.buyer_profile_id WHERE i.id=p_invoice_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'invoice not found' USING ERRCODE='P0002'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.workspace_list_invoices()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (SELECT i.id,i.invoice_no,i.status::text,CASE WHEN i.status='sent' AND i.due_date < current_date THEN 'overdue' ELSE i.status::text END AS effective_status,i.currency,i.total_cents,i.due_date,i.created_at FROM public.invoices i WHERE i.buyer_profile_id=auth.uid()) x;
$$;

REVOKE ALL ON FUNCTION public.intools_invoice_require_draft(uuid), public.intools_invoice_replace_items(uuid,jsonb), public.intools_create_invoice(jsonb), public.intools_update_invoice(uuid,jsonb), public.intools_send_invoice(uuid), public.intools_cancel_invoice(uuid,text), public.intools_record_manual_payment(uuid,jsonb), public.intools_list_invoices(text), public.intools_get_invoice_detail(uuid), public.workspace_list_invoices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_create_invoice(jsonb), public.intools_update_invoice(uuid,jsonb), public.intools_send_invoice(uuid), public.intools_cancel_invoice(uuid,text), public.intools_record_manual_payment(uuid,jsonb), public.intools_list_invoices(text), public.intools_get_invoice_detail(uuid), public.workspace_list_invoices() TO authenticated;
