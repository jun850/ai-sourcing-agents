-- ARCANA — 0007 RLS perf pass
-- (1) Wrap auth.uid()/is_admin() in scalar subqueries so they evaluate ONCE per
--     statement, not per row (fixes auth_rls_initplan).
-- (2) Collapse the duplicate owner + admin FOR ALL policies into ONE policy per
--     table using OR (fixes multiple_permissive_policies).
-- (3) Add covering indexes for the 5 unindexed foreign keys.

-- Drop all 0003 policies -----------------------------------------------------
DROP POLICY IF EXISTS profiles_select_self            ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self            ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_all             ON public.profiles;
DROP POLICY IF EXISTS factories_select_public         ON public.factories;
DROP POLICY IF EXISTS factories_insert_owner          ON public.factories;
DROP POLICY IF EXISTS factories_update_owner          ON public.factories;
DROP POLICY IF EXISTS factories_delete_owner          ON public.factories;
DROP POLICY IF EXISTS products_select_public          ON public.products;
DROP POLICY IF EXISTS products_insert_owner           ON public.products;
DROP POLICY IF EXISTS products_update_owner           ON public.products;
DROP POLICY IF EXISTS products_delete_owner           ON public.products;
DROP POLICY IF EXISTS product_variants_select_public  ON public.product_variants;
DROP POLICY IF EXISTS product_variants_insert_owner   ON public.product_variants;
DROP POLICY IF EXISTS product_variants_update_owner   ON public.product_variants;
DROP POLICY IF EXISTS product_variants_delete_owner   ON public.product_variants;
DROP POLICY IF EXISTS price_breaks_select_public      ON public.price_breaks;
DROP POLICY IF EXISTS price_breaks_insert_owner       ON public.price_breaks;
DROP POLICY IF EXISTS price_breaks_update_owner       ON public.price_breaks;
DROP POLICY IF EXISTS price_breaks_delete_owner       ON public.price_breaks;
DROP POLICY IF EXISTS bank_accounts_select_public     ON public.platform_bank_accounts;
DROP POLICY IF EXISTS bank_accounts_admin_write       ON public.platform_bank_accounts;
DROP POLICY IF EXISTS carts_owner_all                 ON public.carts;
DROP POLICY IF EXISTS carts_admin_all                 ON public.carts;
DROP POLICY IF EXISTS cart_items_owner_all            ON public.cart_items;
DROP POLICY IF EXISTS cart_items_admin_all            ON public.cart_items;
DROP POLICY IF EXISTS saved_items_owner_all           ON public.saved_items;
DROP POLICY IF EXISTS saved_items_admin_all           ON public.saved_items;
DROP POLICY IF EXISTS orders_select_buyer             ON public.orders;
DROP POLICY IF EXISTS order_items_select              ON public.order_items;
DROP POLICY IF EXISTS order_fulfillments_select       ON public.order_fulfillments;
DROP POLICY IF EXISTS order_status_events_select      ON public.order_status_events;

-- profiles -------------------------------------------------------------------
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (id = (select auth.uid()) OR (select public.is_admin()))
             WITH CHECK (id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY profiles_admin_insert ON public.profiles
  FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY profiles_admin_delete ON public.profiles
  FOR DELETE USING ((select public.is_admin()));

-- factories ------------------------------------------------------------------
CREATE POLICY factories_select ON public.factories
  FOR SELECT USING (true);
CREATE POLICY factories_insert ON public.factories
  FOR INSERT WITH CHECK (owner_profile_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY factories_update ON public.factories
  FOR UPDATE USING (owner_profile_id = (select auth.uid()) OR (select public.is_admin()))
             WITH CHECK (owner_profile_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY factories_delete ON public.factories
  FOR DELETE USING (owner_profile_id = (select auth.uid()) OR (select public.is_admin()));

-- products -------------------------------------------------------------------
CREATE POLICY products_select ON public.products
  FOR SELECT USING (true);
CREATE POLICY products_insert ON public.products
  FOR INSERT WITH CHECK (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = factory_id AND f.owner_profile_id = (select auth.uid())));
CREATE POLICY products_update ON public.products
  FOR UPDATE USING (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = factory_id AND f.owner_profile_id = (select auth.uid())))
  WITH CHECK (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = factory_id AND f.owner_profile_id = (select auth.uid())));
CREATE POLICY products_delete ON public.products
  FOR DELETE USING (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.factories f
      WHERE f.id = factory_id AND f.owner_profile_id = (select auth.uid())));

-- product_variants -----------------------------------------------------------
CREATE POLICY product_variants_select ON public.product_variants
  FOR SELECT USING (true);
CREATE POLICY product_variants_insert ON public.product_variants
  FOR INSERT WITH CHECK (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = (select auth.uid())));
CREATE POLICY product_variants_update ON public.product_variants
  FOR UPDATE USING (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = (select auth.uid())))
  WITH CHECK (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = (select auth.uid())));
CREATE POLICY product_variants_delete ON public.product_variants
  FOR DELETE USING (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = (select auth.uid())));

-- price_breaks ---------------------------------------------------------------
CREATE POLICY price_breaks_select ON public.price_breaks
  FOR SELECT USING (true);
CREATE POLICY price_breaks_insert ON public.price_breaks
  FOR INSERT WITH CHECK (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = (select auth.uid())));
CREATE POLICY price_breaks_update ON public.price_breaks
  FOR UPDATE USING (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = (select auth.uid())))
  WITH CHECK (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = (select auth.uid())));
CREATE POLICY price_breaks_delete ON public.price_breaks
  FOR DELETE USING (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.products p JOIN public.factories f ON f.id = p.factory_id
      WHERE p.id = product_id AND f.owner_profile_id = (select auth.uid())));

-- platform_bank_accounts (per-command so SELECT stays single-policy) ---------
CREATE POLICY bank_accounts_select ON public.platform_bank_accounts
  FOR SELECT USING (true);
CREATE POLICY bank_accounts_admin_insert ON public.platform_bank_accounts
  FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY bank_accounts_admin_update ON public.platform_bank_accounts
  FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY bank_accounts_admin_delete ON public.platform_bank_accounts
  FOR DELETE USING ((select public.is_admin()));

-- carts / cart_items / saved_items (single FOR ALL each) ---------------------
CREATE POLICY carts_all ON public.carts
  FOR ALL USING (profile_id = (select auth.uid()) OR (select public.is_admin()))
          WITH CHECK (profile_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY cart_items_all ON public.cart_items
  FOR ALL USING (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.profile_id = (select auth.uid())))
  WITH CHECK (
    (select public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.profile_id = (select auth.uid())));
CREATE POLICY saved_items_all ON public.saved_items
  FOR ALL USING (profile_id = (select auth.uid()) OR (select public.is_admin()))
          WITH CHECK (profile_id = (select auth.uid()) OR (select public.is_admin()));

-- orders and children (read-only for clients) --------------------------------
CREATE POLICY orders_select ON public.orders
  FOR SELECT USING (buyer_profile_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY order_items_select ON public.order_items
  FOR SELECT USING (
    (select public.is_admin())
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_profile_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.factories f WHERE f.id = factory_id AND f.owner_profile_id = (select auth.uid())));
CREATE POLICY order_fulfillments_select ON public.order_fulfillments
  FOR SELECT USING (
    (select public.is_admin())
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_profile_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.factories f WHERE f.id = factory_id AND f.owner_profile_id = (select auth.uid())));
CREATE POLICY order_status_events_select ON public.order_status_events
  FOR SELECT USING (
    (select public.is_admin())
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_profile_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.factories f ON f.id = oi.factory_id
               WHERE oi.order_id = order_status_events.order_id AND f.owner_profile_id = (select auth.uid())));

-- (3) Covering indexes for unindexed foreign keys ----------------------------
CREATE INDEX IF NOT EXISTS idx_factories_owner_profile_id     ON public.factories(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id          ON public.cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_product_id         ON public.saved_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id         ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_created_by ON public.order_status_events(created_by);
