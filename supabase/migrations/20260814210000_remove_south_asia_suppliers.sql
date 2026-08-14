-- Keep source audit history while removing out-of-region suppliers from the public catalogue.
UPDATE public.factories
SET verify_state = 'unverified',
    archived_at = now(),
    updated_at = now()
WHERE lower(trim(region)) IN (
  'afghanistan', 'bangladesh', 'bhutan', 'india', 'maldives', 'nepal', 'pakistan', 'sri lanka'
)
OR slug IN ('apparelx-basi', 'apparelx-gmleaj', 'apparelx-iz9s', 'apparelx-nrf8', 'apparelx-segu', 'apparelx-thelu');

ALTER TABLE public.factories
  DROP CONSTRAINT IF EXISTS factories_verified_public_region_check;

ALTER TABLE public.factories
  ADD CONSTRAINT factories_verified_public_region_check
  CHECK (
    verify_state <> 'verified'
    OR lower(trim(region)) IN (
      'brunei', 'cambodia', 'china', 'hong kong', 'indonesia', 'japan', 'laos', 'macau',
      'malaysia', 'mongolia', 'myanmar', 'north korea', 'philippines', 'singapore',
      'south korea', 'taiwan', 'thailand', 'timor-leste', 'vietnam'
    )
  );
