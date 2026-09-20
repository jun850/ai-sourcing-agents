-- Grant the approved Celina account the same server-authoritative Intools role
-- as the existing operator account. Intools still requires a confirmed email.
-- The role-protection trigger requires the change to be attributable to an
-- existing admin, so scope Jun's authenticated identity to this transaction.
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE lower(email) = 'jun@arcanawangsa.com'),
  true
);

UPDATE public.profiles AS profile
SET role = 'admin'
FROM auth.users AS auth_user
WHERE auth_user.id = profile.id
  AND lower(auth_user.email) = 'celina@arcanawangsa.com'
  AND profile.role IS DISTINCT FROM 'admin'::public.user_role;

SELECT set_config('request.jwt.claim.sub', '', true);
