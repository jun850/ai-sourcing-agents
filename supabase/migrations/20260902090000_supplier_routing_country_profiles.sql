-- Country routing profiles for the AI-assisted supplier routing engine.
-- This encodes the Ops dimension->country policy as data: price / quality /
-- complexity bands each country serves, whether it is a premium-curation
-- destination, whether it can hit sub-month lead times, whether it suits
-- low-MOQ work, and the hard fallback order (Indonesia -> China -> Japan).
--
-- This SUPERSEDES public.country_routing_policies for the new engine. The old
-- table and its RPC (intools_generate_rfq_supplier_matches) are left intact and
-- callable for backwards compatibility. There is intentionally no CHECK on the
-- country column so Ops can add SEA rows (Thailand, Philippines, Cambodia, ...)
-- without a migration. Country is matched to factories.region case-insensitively.

CREATE TABLE IF NOT EXISTS public.supplier_routing_country_profiles (
  country           text PRIMARY KEY,
  enabled           boolean NOT NULL DEFAULT true,
  price_tiers       text[] NOT NULL DEFAULT '{}'::text[] CHECK (price_tiers <@ ARRAY['low','mid','high']),
  quality_tiers     text[] NOT NULL DEFAULT '{}'::text[] CHECK (quality_tiers <@ ARRAY['low','mid','high']),
  complexity_tiers  text[] NOT NULL DEFAULT '{}'::text[] CHECK (complexity_tiers <@ ARRAY['unstated','simple','mid','high']),
  premium_curation  boolean NOT NULL DEFAULT false,
  fast_lead_time    boolean NOT NULL DEFAULT false,
  low_moq           boolean NOT NULL DEFAULT false,
  fallback_rank     integer NOT NULL DEFAULT 999 CHECK (fallback_rank > 0),
  routing_note      text NOT NULL DEFAULT '' CHECK (char_length(routing_note) <= 1000),
  version           integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_routing_country_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_routing_country_profiles_admin_all ON public.supplier_routing_country_profiles;
CREATE POLICY supplier_routing_country_profiles_admin_all ON public.supplier_routing_country_profiles FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

INSERT INTO public.supplier_routing_country_profiles
  (country, price_tiers, quality_tiers, complexity_tiers, premium_curation, fast_lead_time, low_moq, fallback_rank, routing_note)
VALUES
  ('Indonesia',     ARRAY['low'],  ARRAY['low','mid'], ARRAY['unstated','simple'],                 false, true,  true,  1, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.'),
  ('China',         ARRAY['mid'],  ARRAY['mid'],       ARRAY['unstated','simple','mid','high'],    false, true,  true,  2, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.'),
  ('Japan',         ARRAY['high'], ARRAY['high'],      ARRAY['mid','high'],                        true,  false, true,  3, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.'),
  ('Vietnam',       ARRAY['low'],  ARRAY['mid'],       ARRAY['unstated','simple'],                 false, true,  false, 4, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.'),
  ('Malaysia',      ARRAY['low'],  ARRAY['low','mid'], ARRAY['unstated','simple'],                 false, true,  false, 5, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.'),
  ('South Korea',   ARRAY['high'], ARRAY['high'],      ARRAY['mid','high'],                        true,  false, false, 6, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.'),
  ('Italy',         ARRAY['high'], ARRAY['high'],      ARRAY['mid','high'],                        true,  false, false, 7, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.'),
  ('Switzerland',   ARRAY['high'], ARRAY['high'],      ARRAY['mid','high'],                        true,  false, false, 8, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.'),
  ('United Kingdom',ARRAY['high'], ARRAY['high'],      ARRAY['mid','high'],                        true,  false, false, 9, 'Ops routing aid only; supplier-record evidence and live quotes decide facts.')
ON CONFLICT (country) DO NOTHING;

REVOKE ALL ON public.supplier_routing_country_profiles FROM PUBLIC, anon;
