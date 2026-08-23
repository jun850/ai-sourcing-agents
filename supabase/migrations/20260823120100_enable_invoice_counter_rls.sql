-- Keep the internal invoice-number counter inaccessible to browser roles.
ALTER TABLE public.invoice_year_counters ENABLE ROW LEVEL SECURITY;
