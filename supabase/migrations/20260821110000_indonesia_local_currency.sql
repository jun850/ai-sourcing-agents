-- Indonesian visitor pricing is a display preference. Order and payment values
-- remain USD and are calculated server-side by the existing checkout flow.
INSERT INTO public.platform_settings (key, value)
VALUES ('indonesia_local_currency_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
