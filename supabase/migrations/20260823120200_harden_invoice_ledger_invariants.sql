-- Enforce ledger invariants below the RPC layer as a defence in depth measure.
CREATE OR REPLACE FUNCTION public.invoice_item_mutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id); v_status public.atelix_invoice_status;
BEGIN
  SELECT status INTO v_status FROM public.invoices WHERE id=v_invoice_id;
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'invoice items are immutable after send' USING ERRCODE='55000'; END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE OR REPLACE FUNCTION public.invoice_mutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.status IN ('paid','cancelled') THEN RAISE EXCEPTION 'paid and cancelled invoices are immutable' USING ERRCODE='55000'; END IF;
  IF OLD.status = 'sent' AND (NEW.buyer_profile_id IS DISTINCT FROM OLD.buyer_profile_id OR NEW.rfq_case_id IS DISTINCT FROM OLD.rfq_case_id OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents OR NEW.tax_cents IS DISTINCT FROM OLD.tax_cents OR NEW.total_cents IS DISTINCT FROM OLD.total_cents OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.invoice_no IS DISTINCT FROM OLD.invoice_no OR NEW.invoice_year IS DISTINCT FROM OLD.invoice_year OR NEW.sequence_no IS DISTINCT FROM OLD.sequence_no) THEN RAISE EXCEPTION 'sent invoice financial fields are immutable' USING ERRCODE='55000'; END IF;
  IF OLD.status='draft' AND NEW.status NOT IN ('draft','sent','cancelled') THEN RAISE EXCEPTION 'invalid invoice state transition' USING ERRCODE='55000'; END IF;
  IF OLD.status='sent' AND NEW.status NOT IN ('sent','paid','cancelled') THEN RAISE EXCEPTION 'invalid invoice state transition' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.invoice_allocation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.invoice_payments; v_invoice public.invoices; v_payment_allocated integer; v_invoice_allocated integer;
BEGIN
  SELECT * INTO v_payment FROM public.invoice_payments WHERE id=NEW.payment_id FOR UPDATE;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=NEW.invoice_id FOR UPDATE;
  IF NOT FOUND OR v_payment.status <> 'succeeded' OR v_invoice.status <> 'sent' OR v_payment.currency <> v_invoice.currency THEN RAISE EXCEPTION 'invalid invoice payment allocation' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(sum(amount_cents),0) INTO v_payment_allocated FROM public.invoice_payment_allocations WHERE payment_id=NEW.payment_id AND id IS DISTINCT FROM NEW.id;
  SELECT COALESCE(sum(amount_cents),0) INTO v_invoice_allocated FROM public.invoice_payment_allocations WHERE invoice_id=NEW.invoice_id AND id IS DISTINCT FROM NEW.id;
  IF v_payment_allocated + NEW.amount_cents > v_payment.amount_cents OR v_invoice_allocated + NEW.amount_cents > v_invoice.total_cents THEN RAISE EXCEPTION 'payment allocation exceeds its payment or invoice balance' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS invoice_items_draft_only ON public.invoice_items;
CREATE TRIGGER invoice_items_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.invoice_item_mutability_guard();
DROP TRIGGER IF EXISTS invoices_state_immutable ON public.invoices;
CREATE TRIGGER invoices_state_immutable BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_mutability_guard();
DROP TRIGGER IF EXISTS invoice_allocations_within_balance ON public.invoice_payment_allocations;
CREATE TRIGGER invoice_allocations_within_balance BEFORE INSERT OR UPDATE ON public.invoice_payment_allocations FOR EACH ROW EXECUTE FUNCTION public.invoice_allocation_guard();
