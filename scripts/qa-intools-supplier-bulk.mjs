import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, client, migration] = await Promise.all([
  readFile(new URL("../src/intools.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260831130000_skip_invalid_regions_in_bulk_supplier_review.sql", import.meta.url), "utf8"),
]);

for (const label of ["Approve selected", "Reject selected", "Archive selected"]) {
  assert.match(ui, new RegExp(label));
}
assert.match(ui, /setIntoolsSupplierBrokerStatusBulk\(\[id\]/);
assert.match(client, /intools_set_supplier_broker_status_bulk/);
assert.match(migration, /PERFORM public\.intools_require_admin\(\)/);
assert.match(migration, /p_status NOT IN \('approved','rejected'\)/);
assert.match(migration, /admin_audit_log/);
assert.match(migration, /archived_at IS NULL/);
assert.match(migration, /skipped_region_count/);
console.log("intools supplier bulk QA passed");
