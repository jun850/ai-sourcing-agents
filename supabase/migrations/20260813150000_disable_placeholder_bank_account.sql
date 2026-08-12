-- Never expose or accept payment against the seed-only placeholder account.
UPDATE public.platform_bank_accounts
SET is_active = false
WHERE account_number = '000-XXXXXX-0';

-- Payment details are operational data for signed-in marketplace users, not
-- public catalog data. Order-level RLS still controls who can see an order.
DROP POLICY IF EXISTS bank_accounts_select ON public.platform_bank_accounts;
CREATE POLICY bank_accounts_select ON public.platform_bank_accounts
  FOR SELECT USING ((select auth.uid()) IS NOT NULL);
