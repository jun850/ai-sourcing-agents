-- These source assets are photos or placeholders, not usable company logos.
UPDATE public.factories
SET logo_img = null,
    updated_at = now()
WHERE slug IN (
  'apparelx-333z8',
  'apparelx-5dyi',
  'apparelx-7im',
  'apparelx-craft',
  'apparelx-dan',
  'apparelx-ikegra',
  'apparelx-lwbggk',
  'apparelx-panaa',
  'apparelx-ukf',
  'apparelx-xsakru'
);
