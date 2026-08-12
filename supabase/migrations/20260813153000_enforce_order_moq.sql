CREATE OR REPLACE FUNCTION public.enforce_order_cart_moq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.carts c
    JOIN public.cart_items ci ON ci.cart_id = c.id
    JOIN public.products p ON p.id = ci.product_id
    WHERE c.profile_id = NEW.buyer_profile_id
      AND p.moq IS NOT NULL
      AND ci.qty < p.moq
  ) THEN
    RAISE EXCEPTION 'cart contains an item below its minimum order quantity';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_cart_moq ON public.orders;
CREATE TRIGGER orders_enforce_cart_moq
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_cart_moq();
