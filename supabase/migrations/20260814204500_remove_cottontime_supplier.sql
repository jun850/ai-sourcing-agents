-- Remove CottonTime from the public catalogue without destroying source audit history.
UPDATE public.factories
SET verify_state = 'unverified',
    archived_at = now(),
    updated_at = now()
WHERE slug = 'apparelx-tton';
