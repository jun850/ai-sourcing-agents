-- Additive grant for the server-only reminder dispatcher.
GRANT EXECUTE ON FUNCTION public.rfq_ops_claim_due_reply_reminders(integer),public.rfq_ops_complete_reply_reminder(uuid,uuid,text) TO service_role;
