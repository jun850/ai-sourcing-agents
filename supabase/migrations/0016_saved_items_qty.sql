-- ============================================================================
-- ARCANA — 0016 add qty to saved_items
-- The wishlist table lets a buyer set a desired order quantity per saved
-- product (mirrors cart_items.qty) so it can show quantity + line total
-- without a separate "wishlist cart" concept.
-- ============================================================================

ALTER TABLE public.saved_items
  ADD COLUMN IF NOT EXISTS qty numeric(12,2) NOT NULL DEFAULT 1;

ALTER TABLE public.saved_items
  ADD CONSTRAINT saved_items_qty_positive CHECK (qty > 0);
