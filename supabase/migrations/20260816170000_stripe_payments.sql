-- Stripe is server-authoritative. Browser code never writes payment state.
-- The payment Edge Functions use the service role to verify the caller's
-- administrator profile. The hardened base schema removes this grant.
-- Retire the legacy gateway columns. Payment state now lives exclusively in
-- the server-owned Stripe payment records below.
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS xendit_session_id,
  DROP COLUMN IF EXISTS xendit_payment_id;

GRANT SELECT ON public.profiles TO service_role;
-- Row-level security still limits authenticated users to their own profile.
-- The browser needs this to resolve the signed-in user's role.
GRANT SELECT ON public.profiles TO authenticated;
-- Existing RLS policies are the authorization boundary. These grants let the
-- browser reach the tables those policies already scope to the current user.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses, public.carts, public.cart_items, public.saved_items TO authenticated;
GRANT SELECT ON public.products, public.product_variants, public.price_breaks TO anon, authenticated;
GRANT SELECT ON public.orders, public.order_items, public.order_fulfillments, public.order_status_events TO authenticated;
GRANT SELECT, INSERT ON public.conversations, public.messages TO authenticated;
GRANT SELECT ON public.platform_settings, public.platform_bank_accounts TO anon, authenticated;

CREATE TYPE public.stripe_payment_state AS ENUM (
  'checkout_created','processing','paid','failed','expired','partially_refunded','refunded','disputed'
);

CREATE TABLE public.stripe_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  state public.stripe_payment_state NOT NULL DEFAULT 'checkout_created',
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  gross_amount_cents integer NOT NULL CHECK (gross_amount_cents >= 0),
  discount_amount_cents integer NOT NULL DEFAULT 0 CHECK (discount_amount_cents >= 0),
  net_amount_cents integer NOT NULL CHECK (net_amount_cents >= 0),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_invoice_id text UNIQUE,
  invoice_url text,
  invoice_pdf_url text,
  promotion_code_id text,
  promotion_code text,
  refunded_amount_cents integer NOT NULL DEFAULT 0 CHECK (refunded_amount_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_amount_cents <= gross_amount_cents),
  CHECK (net_amount_cents = gross_amount_cents - discount_amount_cents),
  CHECK (refunded_amount_cents <= net_amount_cents)
);

CREATE TABLE public.stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);

CREATE TABLE public.stripe_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.stripe_payments(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  stripe_refund_id text UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','canceled')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.stripe_payments(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('payment_succeeded','payment_failed','refund_succeeded')),
  recipient_email text NOT NULL,
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stripe_payments, public.stripe_refunds TO authenticated;

ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_payments_buyer_or_admin ON public.stripe_payments FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_profile_id = auth.uid())
);
CREATE POLICY stripe_refunds_buyer_or_admin ON public.stripe_refunds FOR SELECT USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.stripe_payments p JOIN public.orders o ON o.id=p.order_id WHERE p.id=payment_id AND o.buyer_profile_id=auth.uid())
);
CREATE POLICY payment_notifications_admin ON public.payment_notifications FOR SELECT USING (public.is_admin());

ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_payment_value CHECK (
    key <> 'payment_method' OR value IN ('bank_transfer','stripe')
  );
INSERT INTO public.platform_settings(key,value) VALUES ('stripe_checkout_enabled','false') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.intools_stripe_payment_detail(p_order_no text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'payment', to_jsonb(p),
    'refunds', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM public.stripe_refunds r WHERE r.payment_id=p.id), '[]'::jsonb)
  )
  FROM public.stripe_payments p JOIN public.orders o ON o.id=p.order_id
  WHERE public.is_admin() AND o.order_no=p_order_no;
$$;
REVOKE ALL ON FUNCTION public.intools_stripe_payment_detail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_stripe_payment_detail(text) TO authenticated;
