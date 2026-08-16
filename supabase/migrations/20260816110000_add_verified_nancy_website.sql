-- The official &Nancy website was verified during the supplier website audit.
UPDATE public.factories
SET web = 'https://www.andnancy.com/'
WHERE slug = 'oem-nancy'
  AND verify_state = 'verified';
