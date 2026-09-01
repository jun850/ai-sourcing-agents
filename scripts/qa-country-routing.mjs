import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, client, ui] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260901130000_country_routing_recommendations.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/intools.tsx", import.meta.url), "utf8"),
]);

for (const country of ["China", "Indonesia", "Japan", "Malaysia", "Vietnam"]) assert.match(migration, new RegExp(`'${country}'`));
assert.match(migration, /PERFORM public\.intools_require_admin\(\)/);
assert.match(migration, /verify_state='verified' AND f\.broker_status='approved' AND f\.archived_at IS NULL/);
assert.match(migration, /ON CONFLICT\(rfq_case_id,factory_id\) DO UPDATE/);
assert.match(migration, /WHERE public\.rfq_supplier_matches\.status='suggested'/);
assert.match(migration, /explicitPriceSignal/);
assert.match(migration, /buyerLocationTieBreaker/);
assert.match(migration, /revenueContext/);
assert.match(client, /p_refresh: refresh/);
assert.match(ui, /Refresh recommendations/);
assert.match(ui, /Routing rationale/);
console.log("country routing QA passed");
