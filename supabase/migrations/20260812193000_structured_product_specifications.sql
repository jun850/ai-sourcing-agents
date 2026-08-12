-- Atomic material specification fields keep PDPs clear and editable.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gsm text,
  ADD COLUMN IF NOT EXISTS fabric_width text,
  ADD COLUMN IF NOT EXISTS roll_length text,
  ADD COLUMN IF NOT EXISTS style_code text;

UPDATE public.products
SET
  gsm = COALESCE(NULLIF(gsm,''), substring(spec from '([0-9]+(?:/[0-9]+)?\s*[Gg][Ss][Mm])')),
  fabric_width = COALESCE(NULLIF(fabric_width,''), substring(spec from '([0-9]+\s*[Cc][Mm])')),
  roll_length = COALESCE(NULLIF(roll_length,''), substring(spec from '([0-9]+\s*[Mm]\s*roll)')),
  style_code = COALESCE(NULLIF(style_code,''), substring(lower(spec) from 'style\s*([a-z0-9-]+)')),
  construction = CASE WHEN construction = spec THEN NULL ELSE construction END,
  description = CASE category
    WHEN 'fabrics' THEN concat_ws(' ', 'A', coalesce(comp,'material'), 'fabric selected for its surface character and balanced performance in apparel development.')
    WHEN 'trims' THEN concat_ws(' ', 'A', coalesce(comp,'trim'), 'component for considered garment detailing and production.')
    WHEN 'accessories' THEN concat_ws(' ', 'A', coalesce(comp,'component'), 'for functional apparel and accessory development.')
    WHEN 'yarns' THEN concat_ws(' ', 'A', coalesce(comp,'yarn'), 'for dependable textile and garment production.')
    ELSE 'A tailored production service for brand development, sampling or bulk manufacture.' END
WHERE category IN ('fabrics','trims','accessories','yarns','oem');
