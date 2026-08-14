-- Preserve buyer instructions on the exact cart and order line they describe.

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS buyer_note text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS buyer_note text;

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_buyer_note_length_check
  CHECK (buyer_note IS NULL OR char_length(buyer_note) <= 300);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_buyer_note_length_check
  CHECK (buyer_note IS NULL OR char_length(buyer_note) <= 300);

-- place_order inserts immutable order lines before clearing the buyer cart.
-- Snapshot the matching line note in that same insert transaction without
-- changing the established RPC signature.
CREATE OR REPLACE FUNCTION public.snapshot_order_item_buyer_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.buyer_note IS NULL THEN
    SELECT NULLIF(btrim(cart_item.buyer_note),'')
      INTO NEW.buyer_note
    FROM public.orders order_header
    JOIN public.carts cart ON cart.profile_id=order_header.buyer_profile_id
    JOIN public.cart_items cart_item ON cart_item.cart_id=cart.id
    WHERE order_header.id=NEW.order_id
      AND cart_item.product_id=NEW.product_id
      AND cart_item.option_selection=NEW.option_selection
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_snapshot_buyer_note ON public.order_items;
CREATE TRIGGER order_items_snapshot_buyer_note
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_buyer_note();

REVOKE ALL ON FUNCTION public.snapshot_order_item_buyer_note() FROM PUBLIC;
