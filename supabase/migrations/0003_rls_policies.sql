-- ============================================================================
-- ARCANA — 0003 Row Level Security
-- Enables RLS on all 13 tables and defines least-privilege policies.
-- Policies are dropped-then-created so this file is safe to re-run.
-- Multiple permissive policies OR together; write paths for orders are handled
-- exclusively by the SECURITY DEFINER RPCs in 0004 (no client write policies).
-- ============================================================================

-- Enable RLS everywhere -------------------------------------------------------
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_breaks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_bank_accounts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles — self read/update; admins full access. No INSERT (definer trigger).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- factories — public read; owner or admin writes.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS factories_select_public ON public.factories;
CREATE POLICY factories_select_public ON public.factories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS factories_insert_owner ON public.factories;
CREATE POLICY factories_insert_owner ON public.factories
  FOR INSERT WITH CHECK (owner_profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS factories_update_owner ON public.factories;
CREATE POLICY factories_update_owner ON public.factories
  FOR UPDATE USING (owner_profile_id = auth.uid() OR public.is_admin())
             WITH CHECK (owner_profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS factories_delete_owner ON public.factories;
CREATE POLICY factories_delete_owner ON public.factories
  FOR DELETE USING (owner_profile_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- products — public read; write if admin or owner of the product's factory.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS products_select_public ON public.products;
CREATE POLICY products_select_public ON public.products
  FOR SELECT USING (true);

DROP POLICY IF EXISTS products_insert_owner ON public.products;
CREATE POLICY products_insert_owner ON public.products
  FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = factory_id AND f.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS products_update_owner ON public.products;
CREATE POLICY products_update_owner ON public.products
  FOR UPDATE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = factory_id AND f.owner_profile_id = auth.uid()
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = factory_id AND f.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS products_delete_owner ON public.products;
CREATE POLICY products_delete_owner ON public.products
  FOR DELETE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = factory_id AND f.owner_profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- product_variants — public read; write via factory ownership through products.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS product_variants_select_public ON public.product_variants;
CREATE POLICY product_variants_select_public ON public.product_variants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS product_variants_insert_owner ON public.product_variants;
CREATE POLICY product_variants_insert_owner ON public.product_variants
  FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS product_variants_update_owner ON public.product_variants;
CREATE POLICY product_variants_update_owner ON public.product_variants
  FOR UPDATE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = auth.uid()
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS product_variants_delete_owner ON public.product_variants;
CREATE POLICY product_variants_delete_owner ON public.product_variants
  FOR DELETE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- price_breaks — public read; write via factory ownership through products.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS price_breaks_select_public ON public.price_breaks;
CREATE POLICY price_breaks_select_public ON public.price_breaks
  FOR SELECT USING (true);

DROP POLICY IF EXISTS price_breaks_insert_owner ON public.price_breaks;
CREATE POLICY price_breaks_insert_owner ON public.price_breaks
  FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS price_breaks_update_owner ON public.price_breaks;
CREATE POLICY price_breaks_update_owner ON public.price_breaks
  FOR UPDATE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = auth.uid()
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS price_breaks_delete_owner ON public.price_breaks;
CREATE POLICY price_breaks_delete_owner ON public.price_breaks
  FOR DELETE USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- platform_bank_accounts — public read (buyers see escrow details); admin write.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS bank_accounts_select_public ON public.platform_bank_accounts;
CREATE POLICY bank_accounts_select_public ON public.platform_bank_accounts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS bank_accounts_admin_write ON public.platform_bank_accounts;
CREATE POLICY bank_accounts_admin_write ON public.platform_bank_accounts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- carts — owner full access; admin full access.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS carts_owner_all ON public.carts;
CREATE POLICY carts_owner_all ON public.carts
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS carts_admin_all ON public.carts;
CREATE POLICY carts_admin_all ON public.carts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- cart_items — access tied to owning cart; admin full access.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cart_items_owner_all ON public.cart_items;
CREATE POLICY cart_items_owner_all ON public.cart_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.profile_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS cart_items_admin_all ON public.cart_items;
CREATE POLICY cart_items_admin_all ON public.cart_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- saved_items — owner full access; admin full access.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS saved_items_owner_all ON public.saved_items;
CREATE POLICY saved_items_owner_all ON public.saved_items
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS saved_items_admin_all ON public.saved_items;
CREATE POLICY saved_items_admin_all ON public.saved_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- orders — buyer or admin read only. All writes go through 0004 RPCs.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS orders_select_buyer ON public.orders;
CREATE POLICY orders_select_buyer ON public.orders
  FOR SELECT USING (buyer_profile_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- order_items — visible to admin, the buyer, or the fulfilling factory's owner.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS order_items_select ON public.order_items;
CREATE POLICY order_items_select ON public.order_items
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.orders o
               WHERE o.id = order_id AND o.buyer_profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.factories f
               WHERE f.id = factory_id AND f.owner_profile_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- order_fulfillments — same visibility as order_items (factory_id on row).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS order_fulfillments_select ON public.order_fulfillments;
CREATE POLICY order_fulfillments_select ON public.order_fulfillments
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.orders o
               WHERE o.id = order_id AND o.buyer_profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.factories f
               WHERE f.id = factory_id AND f.owner_profile_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- order_status_events — same visibility. No factory_id column, so the factory-
-- owner branch is resolved through the order's line items.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS order_status_events_select ON public.order_status_events;
CREATE POLICY order_status_events_select ON public.order_status_events
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.orders o
               WHERE o.id = order_id AND o.buyer_profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.order_items oi
               JOIN public.factories f ON f.id = oi.factory_id
               WHERE oi.order_id = order_status_events.order_id
                 AND f.owner_profile_id = auth.uid())
  );
