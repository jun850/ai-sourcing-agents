-- rfq_cases_buyer_all (FOR ALL, no status check) let a buyer mutate their own
-- RFQ row directly through the API at any status. The AI copilot path was
-- already server-gated to draft-only (agent_rfq_apply_patch), but the plain
-- table-update path a buyer's own client uses for manual edits and for
-- submitRfq() itself was not -- the "Edit RFQ" button being hidden after
-- submission was UI-only, not enforced. Once submitted, the RFQ becomes
-- server-authoritative and further edits require Intools/admin action.
DROP POLICY IF EXISTS rfq_cases_buyer_all ON public.rfq_cases;

CREATE POLICY rfq_cases_buyer_select ON public.rfq_cases
  FOR SELECT USING (buyer_profile_id = auth.uid());

CREATE POLICY rfq_cases_buyer_insert ON public.rfq_cases
  FOR INSERT WITH CHECK (buyer_profile_id = auth.uid());

-- USING checks the row as it stands before the update, so submitRfq()
-- (draft -> needs_research) is still allowed -- only edits to a case that is
-- already past draft are blocked.
CREATE POLICY rfq_cases_buyer_update_draft ON public.rfq_cases
  FOR UPDATE
  USING (buyer_profile_id = auth.uid() AND status = 'draft')
  WITH CHECK (buyer_profile_id = auth.uid());

CREATE POLICY rfq_cases_buyer_delete_draft ON public.rfq_cases
  FOR DELETE USING (buyer_profile_id = auth.uid() AND status = 'draft');
