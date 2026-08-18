-- Stripe is the only payment method for new and existing marketplace orders.
-- Keep the order-status tools available; only the payment path is normalized.
UPDATE public.orders
SET payment_path = 'stripe'
WHERE payment_path IS DISTINCT FROM 'stripe';

ALTER TABLE public.orders
  ALTER COLUMN payment_path SET DEFAULT 'stripe';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_path_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_path_check CHECK (payment_path = 'stripe');

INSERT INTO public.platform_settings(key, value)
VALUES ('stripe_checkout_enabled', 'true')
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();

INSERT INTO public.platform_settings(key, value)
VALUES ('payment_method', 'stripe')
ON CONFLICT (key) DO UPDATE SET value = 'stripe', updated_at = now();
