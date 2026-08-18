-- Widen factories_verified_public_region_check to allow a handful of
-- internationally recognized European mills (CANONICO, CERRUTI, PENTAGONO,
-- ALUMO, LINTON) represented in the catalog to record their real country
-- instead of being stuck with a null region.
alter table factories drop constraint factories_verified_public_region_check;

alter table factories add constraint factories_verified_public_region_check
  check (
    verify_state <> 'verified'::verify_state
    or lower(trim(both from region)) = any (array[
      'brunei','cambodia','china','hong kong','indonesia','japan','laos','macau',
      'malaysia','mongolia','myanmar','north korea','philippines','singapore',
      'south korea','taiwan','thailand','timor-leste','vietnam',
      'italy','switzerland','united kingdom'
    ])
  );
