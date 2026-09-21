import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,client,dashboard,intools,analytics,server] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260913063944_supplier_intelligence_after_nomination.sql",import.meta.url),"utf8"),
  readFile(new URL("../src/supabase.ts",import.meta.url),"utf8"),
  readFile(new URL("../src/dashboard.tsx",import.meta.url),"utf8"),
  readFile(new URL("../src/intools.tsx",import.meta.url),"utf8"),
  readFile(new URL("../src/intools-analytics.tsx",import.meta.url),"utf8"),
  readFile(new URL("../server/index.mjs",import.meta.url),"utf8"),
]);

for (const table of ["supplier_order_outcomes","supplier_performance_snapshots","supplier_performance_snapshot_versions","rfq_order_commercial_snapshots","rfq_invoice_commercial_snapshots","agent_learning_runs","agent_learning_promotions","agent_learning_monthly_budgets"]) {
  assert.match(migration,new RegExp(`CREATE TABLE public\\.${table}`));
  assert.match(migration,new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
}
assert.match(migration,/delivery_rate numeric\(5,1\) NOT NULL DEFAULT 100/);
assert.match(migration,/response_rate numeric\(5,1\) NOT NULL DEFAULT 100/);
assert.match(migration,/delivery_basis text NOT NULL DEFAULT 'baseline'/);
assert.match(migration,/v_delivery_total>=10 AND v_delivery_brands>=5/);
assert.match(migration,/v_response_total>=10 AND v_response_brands>=5/);
assert.match(migration,/WHEN v_previous\.delivery_basis IN \('observed','historical'\) THEN 'historical'/);
assert.match(migration,/m\.status IN \('approved','selected'\)/);
assert.match(migration,/q\.status IN \('published','selected','declined'\)/);
assert.match(migration,/Supplier nomination revoked/);
assert.match(migration,/status='withdrawn'/);
assert.match(migration,/buyer-selected supplier must be handled through the order lifecycle/i);
assert.match(migration,/capture_rfq_invoice_commercial_snapshot_after_link/);
assert.match(migration,/capture_rfq_order_commercial_snapshot_after_insert/);
assert.match(migration,/Commercial snapshots are immutable/);
assert.match(migration,/supplier_performance_changed/);
assert.match(migration,/supplier_performance_snapshot_version_after_change/);
assert.match(migration,/'performance_trend'/);
assert.match(migration,/response_disposition IN \('responded','no_response'\)/);
assert.match(migration,/excluded_invalid_contact/);
assert.match(migration,/excluded_buyer_withdrawn/);
assert.match(migration,/jsonb_array_length\(evidence_references\)>0/);
assert.doesNotMatch(migration,/GRANT SELECT ON public\.supplier_(?:order_outcomes|performance_snapshots)/);
assert.match(migration,/cap_microusd integer NOT NULL DEFAULT 10000000/);
assert.match(migration,/Monthly paid learning budget exhausted/);
assert.match(migration,/NOT shared_evaluation OR \(deidentified/);
assert.match(migration,/canary_execution_cap integer NOT NULL DEFAULT 20/);
assert.match(migration,/protected_failures>0 THEN NEW\.state:='frozen'/);
assert.match(migration,/supplier_learning_frozen/);

for (const rpc of ["intools_get_supplier_intelligence","intools_set_supplier_intelligence_defaults","intools_close_rfq_response_opportunity","intools_get_supplier_intelligence_for_case","intools_get_supplier_order_outcome","intools_publish_supplier_order_outcome","intools_get_supplier_intelligence_overview","intools_set_supplier_learning_freeze","intools_set_agent_learning_promotion_state"]) {
  assert.match(migration,new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}`));
  assert.match(client,new RegExp(`"${rpc}"`));
  assert.match(server,new RegExp(`"${rpc}"`));
}
assert.match(client,/slice\(0, 3\)/);
assert.match(client,/supplier_performance_changed/);
assert.match(dashboard,/Atelix baseline/);
assert.match(dashboard,/Verified performance/);
assert.match(dashboard,/Historical performance/);
assert.match(dashboard,/setTimeout\(\(\) => setUpdatedSupplierId\(null\), 600\)/);
assert.match(dashboard,/prefers-reduced-motion: reduce/);
assert.match(dashboard,/Supplier performance updated/);
assert.match(dashboard,/subscribeToRfqActivity\(caseId/);
assert.match(intools,/prefilled from the supplier default/i);
assert.match(intools,/Invalid contacts and buyer-withdrawn requests are excluded/);
assert.match(intools,/incomplete_defaults/);
assert.match(intools,/defaults incomplete/);
assert.match(intools,/Publish reviewed outcome/);
assert.match(intools,/Only a published human review contributes to supplier performance/);
assert.match(intools,/Lift global freeze/);
assert.match(intools,/Start canary/);
assert.match(analytics,/Supplier intelligence coverage/);
assert.match(analytics,/Observed performance trend/);

console.log("supplier intelligence nomination, baseline, outcome, realtime, and learning contracts passed");
