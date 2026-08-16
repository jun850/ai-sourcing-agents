-- Keep the raw public row consistent with the localized storefront copy.
UPDATE public.factories
SET bio='Verified supplier. Contact the supplier to confirm current capabilities, specifications, minimums, and terms.'
WHERE slug='yamamoto-co-ltd';
