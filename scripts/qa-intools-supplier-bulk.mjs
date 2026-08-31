import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, client, migration] = await Promise.all([
  readFile(new URL("../src/intools-suppliers.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260831120000_intools_supplier_bulk_review.sql", import.meta.url), "utf8"),
]);

for (const label of ["Approve all visible", "Reject all visible", "Approve selected", "Reject selected"]) {
  assert.match(ui, new RegExp(label));
}
assert.match(ui, /documentIntoolsSupplierImportContacts\(run\.run_id, rowNumbers\)/);
assert.match(client, /intools_set_supplier_broker_status_bulk/);
assert.match(client, /intools_import_supplier_source_contacts/);
assert.match(migration, /PERFORM public\.intools_require_admin\(\)/);
assert.match(migration, /p_status NOT IN \('approved','rejected'\)/);
assert.match(migration, /admin_audit_log/);
assert.match(migration, /archived_at IS NULL/);
console.log("intools supplier bulk QA passed");
