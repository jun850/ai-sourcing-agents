#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, client, intake, migration, edge] = await Promise.all([
  readFile(new URL("../src/intools.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/supplier-intake.tsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260920132509_supplier_candidate_review_and_partner_email.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/supplier-candidate-review/index.ts", import.meta.url), "utf8"),
]);

assert.match(intake, /countryCode/);
assert.match(intake, /Apparel \/ cut-and-sew/);
assert.match(ui, /listIntoolsSupplierCandidates\(200\)/);
assert.match(ui, /SupplierCandidateDrawerBody/);
assert.match(ui, /Not filled/);
assert.match(ui, /Accept as partner/);
assert.match(ui, /Edit selected/);
assert.match(ui, /updateIntoolsSupplierCandidatesBulk/);
assert.match(ui, /candidateIds\.length > 50/);
assert.match(client, /supplier-candidate-review/);
for (const rpc of ["intools_list_supplier_candidates", "intools_get_supplier_candidate", "intools_update_supplier_candidate", "intools_update_supplier_candidates_bulk", "intools_decline_supplier_intakes", "intools_accept_supplier_intakes", "intools_record_supplier_partner_email"]) {
  assert.match(migration, new RegExp(`FUNCTION public\\.${rpc}`));
}
assert.match(migration, /Select 1\.\.50 candidates/);
assert.match(migration, /source_system,source_record_id/);
assert.match(edge, /Welcome as an Atelix partner/);
assert.match(edge, /Congratulations on becoming an Atelix partner\. We will contact you separately regarding your first order\./);
assert.match(edge, /https:\/\/api\.resend\.com\/emails\/batch/);
assert.match(edge, /Idempotency-Key/);
assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY[^)]*client/i);

console.log("supplier candidate review QA passed");
