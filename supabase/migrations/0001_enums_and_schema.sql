-- ============================================================================
-- ARCANA — 0001 enums + schema (13 tables)
-- Idempotent: enums guarded via DO/EXCEPTION, tables via CREATE TABLE IF NOT EXISTS.
-- All PKs gen_random_uuid() except profiles (mirrors auth.users.id).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('buyer','seller','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.factory_type AS ENUM ('fabric_mill','oem_factory','trim_supplier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verify_state AS ENUM ('unverified','pending','verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.product_category AS ENUM ('fabrics','accessories','trims','yarns','oem');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.unit_type AS ENUM ('m','kg','pc','package','style','order','color');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pricing_mode AS ENUM ('fixed','quote');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.listing_status AS ENUM ('active','draft','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'awaiting_payment','payment_declared','payment_verified',
    'fulfilling','completed','cancelled','disputed','refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fulfillment_status AS ENUM (
    'pending','processing','shipped','delivered','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. profiles — one row per auth user (id mirrors auth.users.id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          public.user_role NOT NULL DEFAULT 'buyer',
  full_name     text,
  company_name  text,
  country       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. factories — supplier / mill directory (sell-side)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  name              text NOT NULL,
  type              public.factory_type NOT NULL,
  region            text,
  loc               text,
  verify_state      public.verify_state NOT NULL DEFAULT 'verified',
  years             int,
  moq               text,
  lead              text,
  rating            numeric(2,1),
  orders_label      text,
  capacity          text,
  certs             text[],
  tags              text[],
  sales             text,
  phone             text,
  web               text,
  founded           int,
  employees         text,
  area              text,
  port              text,
  bio               text,
  img               text,
  owner_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. products — catalog listings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             text UNIQUE NOT NULL,
  name            text NOT NULL,
  comp            text,
  spec            text,
  price           numeric(12,2) NOT NULL DEFAULT 0,
  pricing_mode    public.pricing_mode NOT NULL DEFAULT 'fixed',
  unit_type       public.unit_type NOT NULL,
  moq             numeric(12,2),
  factory_id      uuid NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  category        public.product_category NOT NULL,
  badge           text,
  img             text,
  loc             text,
  listing_status  public.listing_status NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_factory_id ON public.products(factory_id);
CREATE INDEX IF NOT EXISTS idx_products_category   ON public.products(category);

-- ---------------------------------------------------------------------------
-- 4. product_variants — colorways per product
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_variants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  colorway    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);

-- ---------------------------------------------------------------------------
-- 5. price_breaks — volume pricing tiers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_breaks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_qty     numeric(12,2) NOT NULL,
  unit_price  numeric(12,2) NOT NULL,
  UNIQUE (product_id, min_qty)
);

CREATE INDEX IF NOT EXISTS idx_price_breaks_product_id ON public.price_breaks(product_id);

-- ---------------------------------------------------------------------------
-- 6. carts — one active cart per user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

-- ---------------------------------------------------------------------------
-- 7. cart_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cart_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty         numeric(12,2) NOT NULL CHECK (qty > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);

-- ---------------------------------------------------------------------------
-- 8. saved_items — wishlist / saved list
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_items_profile_id ON public.saved_items(profile_id);

-- ---------------------------------------------------------------------------
-- 9. orders — ARCANA-escrow order header
--    ON DELETE RESTRICT on buyer: never orphan an order's financial record.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no              text UNIQUE NOT NULL,
  buyer_profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status                public.order_status NOT NULL DEFAULT 'awaiting_payment',
  subtotal              numeric(12,2) NOT NULL DEFAULT 0,
  fee                   numeric(12,2) NOT NULL DEFAULT 0,
  ship                  numeric(12,2) NOT NULL DEFAULT 0,
  qc_fee                numeric(12,2) NOT NULL DEFAULT 0,
  ins_fee               numeric(12,2) NOT NULL DEFAULT 0,
  total                 numeric(12,2) NOT NULL DEFAULT 0,
  ship_country          text,
  ship_address          text,
  incoterms             text,
  notes                 text,
  placed_at             timestamptz DEFAULT now(),
  payment_declared_at   timestamptz,
  payment_verified_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_profile_id ON public.orders(buyer_profile_id);

-- ---------------------------------------------------------------------------
-- 10. order_items — immutable line snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,
  factory_id      uuid REFERENCES public.factories(id) ON DELETE SET NULL,
  sku_snapshot    text NOT NULL,
  name_snapshot   text NOT NULL,
  seller_snapshot text NOT NULL,
  unit_price      numeric(12,2) NOT NULL,
  qty             numeric(12,2) NOT NULL,
  line_total      numeric(12,2) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_factory_id ON public.order_items(factory_id);

-- ---------------------------------------------------------------------------
-- 11. order_fulfillments — one row per distinct factory in an order
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_fulfillments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  factory_id          uuid REFERENCES public.factories(id) ON DELETE SET NULL,
  fulfillment_status  public.fulfillment_status NOT NULL DEFAULT 'pending',
  tracking            text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_fulfillments_order_id   ON public.order_fulfillments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_fulfillments_factory_id ON public.order_fulfillments(factory_id);

-- ---------------------------------------------------------------------------
-- 12. order_status_events — audit trail of status transitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_status_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status      public.order_status NOT NULL,
  note        text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_events_order_id ON public.order_status_events(order_id);

-- ---------------------------------------------------------------------------
-- 13. platform_bank_accounts — ARCANA escrow deposit accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name       text NOT NULL,
  account_name    text NOT NULL,
  account_number  text NOT NULL,
  swift           text,
  currency        text NOT NULL DEFAULT 'USD',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
