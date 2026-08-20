-- RLS policies filter rows but do not grant relation access. Restore only the
-- read grant needed by public catalogue filters; writes remain revoked.
GRANT SELECT ON TABLE public.catalog_constructions TO anon, authenticated;
