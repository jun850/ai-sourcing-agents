import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [foundation, workerSql, realtime, worker, client, intools, dashboard, server] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260905100000_human_loop_wave4_production_qc.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260905103000_human_loop_wave5_qc_worker.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260905110000_human_loop_wave6_realtime_schedule.sql", import.meta.url), "utf8"),
  readFile(new URL("../workers/qc/app.py", import.meta.url), "utf8"),
  readFile(new URL("../src/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/intools.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/dashboard.tsx", import.meta.url), "utf8"),
  readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
]);

for (const table of ["rfq_production_updates","rfq_qc_checklist_versions","rfq_qc_inspections","rfq_qc_upload_reservations","rfq_qc_assets","rfq_qc_analysis_jobs","rfq_qc_analysis_runs","rfq_qc_findings","rfq_qc_reviews"]) {
  assert.match(foundation, new RegExp(`CREATE TABLE public\\.${table}`));
  assert.match(foundation, new RegExp(`${table}[^;]*ENABLE ROW LEVEL SECURITY`, "s"));
}
for (const rpc of ["intools_get_rfq_operations","intools_publish_rfq_production_update","intools_begin_manual_qc_review","intools_reserve_qc_upload","intools_finalize_qc_upload","intools_review_qc_inspection"]) {
  assert.match(foundation, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}`));
  assert.match(client, new RegExp(`"${rpc}"`));
  assert.match(server, new RegExp(`"${rpc}"`));
}
assert.match(foundation, /Shipment requires a current approved QC review/);
assert.match(foundation, /buyer_visible AND EXISTS/);
assert.match(foundation, /Every AI finding requires one human disposition/);
assert.match(foundation, /checklist_version_id,reviewed_asset_ids,buyer_visible_summary/);
assert.doesNotMatch(foundation, /GRANT SELECT ON[^;]*rfq_qc_reviews TO authenticated/);
assert.match(foundation, /file_size_limit,allowed_mime_types/);
assert.match(client, /storage\/v1\/upload\/resumable/);
assert.match(client, /findPreviousUploads/);
assert.match(client, /resumeFromPreviousUpload/);
assert.match(intools, /getIntoolsRfqOperations\(rfq\.id\)/);
assert.match(intools, /if \(refresh\) await generateIntoolsRfqSupplierMatches/);
assert.doesNotMatch(intools, /Promise\.all\(\[\s*listIntoolsRfqCases[\s\S]*generateIntoolsRfqSupplierMatches/);

for (const rpc of ["qc_claim_analysis_jobs","qc_get_analysis_context","qc_checkpoint_analysis_jobs","qc_complete_analysis_jobs"]) {
  assert.match(workerSql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}`));
  assert.match(worker, new RegExp(`"${rpc}"`));
}
assert.match(workerSql, /p_limit NOT BETWEEN 1 AND 2/);
assert.match(workerSql, /FOR UPDATE SKIP LOCKED LIMIT p_limit/);
assert.match(workerSql, /attempt_count<3/);
assert.match(workerSql, /Service role required/);
assert.match(worker, /START_BUDGET_SECONDS = 220/);
assert.match(worker, /HARD_BUDGET_SECONDS = 240/);
assert.match(worker, /"zdr": True/);
assert.match(worker, /"data_collection": "deny"/);
assert.match(worker, /"pass", "fail", "approved", "shipment_ready"/);

assert.match(realtime, /'rfq:'\|\|NEW\.rfq_case_id::text\|\|':activity'/);
assert.match(realtime, /vault\.create_secret/);
assert.match(realtime, /cron\.schedule\('atelix-qc-worker','\*\/2 \* \* \* \*'/);
assert.match(realtime, /intools_set_human_loop_feature_flag/);
assert.match(realtime, /Disable atomic quote publication first/);
assert.match(client, /subscribeToRfqActivity/);
assert.match(client, /"intools_set_human_loop_feature_flag"/);
assert.match(dashboard, /refreshRef\.current\.inFlight/);
assert.match(intools, /operationsLoadRef\.current\.inFlight/);

console.log("human-loop production, QC, bounded worker, and realtime contracts passed");
