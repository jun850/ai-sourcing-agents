-- Preserve the public factory object ID in the outbox so a deleted or newly
-- unverified supplier can also be removed from Algolia.
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
      'sku', CASE WHEN TG_ARGV[0] = 'product' THEN to_jsonb(changed)->>'sku' ELSE NULL END,
      'factory_slug', CASE WHEN TG_ARGV[0] = 'factory' THEN to_jsonb(changed)->>'slug' ELSE NULL END
    ))
  );
  RETURN changed;
END;
$$;
