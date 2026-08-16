-- Real CBA bank account for manual USD transfers.
-- BSB (065000) is embedded in the bank_name since the schema has no BSB column.
INSERT INTO public.platform_bank_accounts
  (bank_name, account_name, account_number, swift, currency, is_active)
VALUES
  ('Commonwealth Bank of Australia (BSB 065000)',
   'Gede Gopala Arcana',
   '12700857',
   'CTBAAU2S',
   'USD',
   true);
