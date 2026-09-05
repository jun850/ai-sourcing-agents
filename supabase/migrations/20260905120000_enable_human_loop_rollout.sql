-- Enable the reviewed human-loop operations surface after its guarded RPCs,
-- private outreach template, and category QC checklists have been deployed.
-- This is an additive rollout migration; unrelated payment settings remain
-- unchanged.

INSERT INTO public.platform_settings(key,value)
VALUES
  ('outreach_templates_enabled','true'),
  ('atomic_quote_publication_enabled','true'),
  ('production_updates_enabled','true'),
  ('qc_evidence_upload_enabled','true'),
  ('qc_ai_shadow_enabled','true'),
  ('qc_buyer_visibility_enabled','true'),
  ('rfq_activity_realtime_enabled','true')
ON CONFLICT (key) DO UPDATE
SET value=EXCLUDED.value, updated_at=now();
