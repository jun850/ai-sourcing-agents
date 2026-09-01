-- intools_generate_rfq_supplier_matches (migration 20260901130000) writes an
-- admin_audit_log row for every routing read/refresh with target_table
-- 'rfq_cases' and action 'routing_read' / 'routing_refresh'. Neither value was
-- permitted by the existing check constraints, so opening the RFQ drawer's
-- supplier-matches panel failed with
--   new row for relation "admin_audit_log" violates check constraint
--   "admin_audit_log_action_check"
-- and no supplier matches could be loaded or saved. Widen both constraints
-- additively so the routing audit trail is accepted; every previously allowed
-- value is retained.

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_target_table_check,
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check,
  ADD CONSTRAINT admin_audit_log_target_table_check CHECK (
    target_table IN (
      'factories','products','content_pages','widget_instances',
      'intools_media_assets','country_shipping_rates','rfq_cases'
    )
  ),
  ADD CONSTRAINT admin_audit_log_action_check CHECK (
    action IN (
      'create','update','publish','rollback','archive','restore',
      'verify_state_change','routing_read','routing_refresh'
    )
  );
