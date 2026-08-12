-- GPT-authored MVP defaults: concise enough for the PDP, always editable in
-- the supplier/admin workspace when a mill provides more exact information.
UPDATE public.products
SET
  description = COALESCE(NULLIF(description,''), CASE category
    WHEN 'fabrics' THEN concat_ws(' ', 'A', coalesce(comp,'material'), 'fabric specified at', coalesce(spec,'supplier specification') || '.', 'Suitable for sampling and production sourcing.')
    WHEN 'trims' THEN concat_ws(' ', 'A custom', coalesce(comp,'trim'), 'component specified for garment development and production.')
    WHEN 'accessories' THEN concat_ws(' ', 'A', coalesce(comp,'component'), 'for apparel and accessory development.')
    WHEN 'yarns' THEN concat_ws(' ', 'A', coalesce(comp,'yarn'), 'for textile and garment production.')
    ELSE 'A custom production service prepared for brand development, sampling or bulk manufacture.' END),
  construction = COALESCE(NULLIF(construction,''), NULLIF(spec,'')),
  applications = COALESCE(NULLIF(applications,''), CASE WHEN category='oem' THEN 'Brand development, sampling and production' WHEN category='fabrics' THEN 'Apparel and collection development' ELSE 'Garment and accessory development' END),
  season = COALESCE(NULLIF(season,''), 'All season'),
  origin_country = COALESCE(NULLIF(origin_country,''), NULLIF(loc,'')),
  lead_time = COALESCE(NULLIF(lead_time,''), CASE category WHEN 'fabrics' THEN '7–14 days' WHEN 'yarns' THEN '10–15 days' WHEN 'oem' THEN 'Quoted to brief' ELSE '7–12 days' END)
WHERE description IS NULL OR description='' OR construction IS NULL OR construction='' OR applications IS NULL OR applications='' OR season IS NULL OR season='' OR origin_country IS NULL OR origin_country='' OR lead_time IS NULL OR lead_time='';
