-- Durable change capture for Algolia. Database writes enqueue work; the Edge
-- worker rehydrates authoritative rows before indexing, so no client payload
-- can leak draft, private, or stale product data into a public index.
CREATE TABLE IF NOT EXISTS public.algolia_sync_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('product','factory','order','order_item','saved_item')),
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_algolia_sync_outbox_pending
  ON public.algolia_sync_outbox (created_at) WHERE processed_at IS NULL;

CREATE OR REPLACE FUNCTION public.enqueue_algolia_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed record;
BEGIN
  IF TG_OP = 'DELETE' THEN changed := OLD; ELSE changed := NEW; END IF;
  INSERT INTO public.algolia_sync_outbox (entity_type, entity_id, payload)
  VALUES (
    TG_ARGV[0],
    changed.id,
    jsonb_strip_nulls(jsonb_build_object(
      'profile_id', CASE WHEN TG_ARGV[0] = 'saved_item' THEN to_jsonb(changed)->>'profile_id' ELSE NULL END,
      'product_id', CASE WHEN TG_ARGV[0] = 'saved_item' THEN to_jsonb(changed)->>'product_id' ELSE NULL END,
      'order_id', CASE WHEN TG_ARGV[0] = 'order_item' THEN to_jsonb(changed)->>'order_id' ELSE NULL END,
      'sku', CASE WHEN TG_ARGV[0] = 'product' THEN to_jsonb(changed)->>'sku' ELSE NULL END
    ))
  );
  RETURN changed;
END;
$$;

DROP TRIGGER IF EXISTS products_enqueue_algolia_sync ON public.products;
CREATE TRIGGER products_enqueue_algolia_sync
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enqueue_algolia_sync('product');

DROP TRIGGER IF EXISTS factories_enqueue_algolia_sync ON public.factories;
CREATE TRIGGER factories_enqueue_algolia_sync
AFTER INSERT OR UPDATE OR DELETE ON public.factories
FOR EACH ROW EXECUTE FUNCTION public.enqueue_algolia_sync('factory');

DROP TRIGGER IF EXISTS orders_enqueue_algolia_sync ON public.orders;
CREATE TRIGGER orders_enqueue_algolia_sync
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_algolia_sync('order');

DROP TRIGGER IF EXISTS order_items_enqueue_algolia_sync ON public.order_items;
CREATE TRIGGER order_items_enqueue_algolia_sync
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enqueue_algolia_sync('order_item');

DROP TRIGGER IF EXISTS saved_items_enqueue_algolia_sync ON public.saved_items;
CREATE TRIGGER saved_items_enqueue_algolia_sync
AFTER INSERT OR UPDATE OR DELETE ON public.saved_items
FOR EACH ROW EXECUTE FUNCTION public.enqueue_algolia_sync('saved_item');

ALTER TABLE public.algolia_sync_outbox ENABLE ROW LEVEL SECURITY;
