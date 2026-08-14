-- Public supplier locations use one compact catalogue convention: Country, City.
-- Full source addresses remain available in catalog field provenance for audit.

UPDATE public.factories
SET region = NULLIF(btrim(region), ''),
    loc = NULLIF(btrim(split_part(loc, ',', 1)), '')
WHERE slug NOT LIKE 'apparelx-%';

UPDATE public.factories AS factory
SET region = location.country,
    loc = location.city,
    updated_at = now()
FROM (VALUES
  ('apparelx-333z8', 'Japan', 'Nagoya'),
  ('apparelx-5dyi', 'Japan', 'Hikone'),
  ('apparelx-7im', 'Japan', 'Suita'),
  ('apparelx-alians', 'Japan', 'Hachioji'),
  ('apparelx-basi', 'Bangladesh', 'Dhaka'),
  ('apparelx-bqeldv', 'Japan', 'Shibata'),
  ('apparelx-craft', 'Japan', 'Saitama'),
  ('apparelx-canal', 'Japan', 'Tokyo'),
  ('apparelx-da1itk', 'Japan', 'Sanuki'),
  ('apparelx-dan', 'Japan', 'Tokyo'),
  ('apparelx-dongs', 'South Korea', 'Seoul'),
  ('apparelx-fet', 'Japan', 'Tokyo'),
  ('apparelx-geekpe', 'Japan', 'Tokyo'),
  ('apparelx-geh', 'Japan', 'Tokyo'),
  ('apparelx-gmleaj', 'Pakistan', 'Sialkot'),
  ('apparelx-hpi1b', 'Japan', 'Tokyo'),
  ('apparelx-ig6', 'Japan', 'Nagaokakyo'),
  ('apparelx-iic', 'Japan', 'Tokyo'),
  ('apparelx-ikegra', 'Japan', 'Kyoto'),
  ('apparelx-iz9s', 'India', 'Gurugram'),
  ('apparelx-j8687t', 'Japan', 'Tokyo'),
  ('apparelx-kaoris', 'China', 'Suzhou'),
  ('apparelx-l2b1', 'Japan', 'Osaka'),
  ('apparelx-lwbggk', 'Japan', 'Kyoto'),
  ('apparelx-mstt', 'Japan', 'Onomichi'),
  ('apparelx-nancy', 'Japan', 'Nagoya'),
  ('apparelx-nrf8', 'Bangladesh', 'Narayanganj'),
  ('apparelx-olife', 'Japan', 'Urasoe'),
  ('apparelx-panaa', 'Japan', 'Narashino'),
  ('apparelx-segu', 'Pakistan', 'Sialkot'),
  ('apparelx-thelu', 'Sri Lanka', 'Galle'),
  ('apparelx-tton', NULL, NULL),
  ('apparelx-ukf', 'Japan', 'Yokohama'),
  ('apparelx-xsakru', 'Japan', 'Okayama'),
  ('apparelx-z4y', 'Japan', 'Tokyo')
) AS location(slug, country, city)
WHERE factory.slug = location.slug;

COMMENT ON COLUMN public.factories.region IS 'Canonical supplier country for public Country, City display.';
COMMENT ON COLUMN public.factories.loc IS 'Canonical supplier city for public Country, City display; full imported addresses remain in provenance.';
