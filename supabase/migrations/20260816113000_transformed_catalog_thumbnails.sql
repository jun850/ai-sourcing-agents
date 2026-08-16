BEGIN;

ALTER TABLE public.product_media
  ALTER COLUMN thumb_storage_path DROP NOT NULL,
  ALTER COLUMN thumb_bytes DROP NOT NULL,
  ALTER COLUMN thumb_sha256 DROP NOT NULL;

ALTER TABLE public.product_media
  DROP CONSTRAINT IF EXISTS product_media_thumbnail_source_check;

ALTER TABLE public.product_media
  ADD CONSTRAINT product_media_thumbnail_source_check CHECK (
    (
      thumb_storage_path IS NOT NULL
      AND thumb_bytes > 0
      AND thumb_sha256 IS NOT NULL
      AND thumb_url ~ '/storage/v1/object/public/catalog-media/'
    )
    OR
    (
      thumb_storage_path IS NULL
      AND thumb_bytes IS NULL
      AND thumb_sha256 IS NULL
      AND thumb_url ~ '/storage/v1/render/image/public/catalog-media/products/[0-9a-f-]{36}/[0-9a-f]{64}-1600[.]webp[?]'
      AND thumb_url ~ '[?&]width=640(&|$)'
    )
  );

COMMENT ON CONSTRAINT product_media_thumbnail_source_check ON public.product_media IS
  'Thumbnails are either immutable stored WebP objects or Supabase-rendered 640px variants of the immutable full image.';

COMMIT;
