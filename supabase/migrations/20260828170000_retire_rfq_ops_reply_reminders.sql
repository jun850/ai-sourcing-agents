-- The notification center replaces email reply reminders. Preserve historical
-- rows for audit only, but make every outstanding reminder permanently inert.
DROP TRIGGER IF EXISTS rfq_ops_reply_reminder_after_insert ON public.rfq_ops_messages;

UPDATE public.rfq_ops_reply_reminders
SET resolved_at = COALESCE(resolved_at, now()),
    claim_token = NULL,
    claim_expires_at = NULL,
    updated_at = now()
WHERE resolved_at IS NULL;

REVOKE EXECUTE ON FUNCTION public.rfq_ops_claim_due_reply_reminders(integer), public.rfq_ops_complete_reply_reminder(uuid,uuid,text) FROM service_role;

-- The deployed dispatcher is deleted during release. Supabase's migration
-- role cannot read or delete pg_cron jobs, so do not make this retirement
-- migration fail on that managed schema.
