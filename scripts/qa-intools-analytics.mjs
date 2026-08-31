import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, client, migration, detailMigration, routes] = await Promise.all([
  readFile(new URL("../src/intools-analytics.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260831140000_analytics_supplier_coverage.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260831150000_search_console_snapshot_detail.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/intools.tsx", import.meta.url), "utf8"),
]);

assert.match(ui, /Verified suppliers/);
assert.match(ui, /Supplier countries/);
assert.match(client, /verified_suppliers: number; supplier_countries: number/);
assert.match(client, /search_console_snapshot/);
assert.match(migration, /PERFORM public\.intools_require_admin\(\)/);
assert.match(migration, /verify_state='verified' AND f\.broker_status='approved'/);
assert.match(migration, /count\(DISTINCT lower\(trim\(f\.region\)\)\)/);
assert.match(detailMigration, /source_count/);
assert.match(detailMigration, /top_queries/);
assert.match(detailMigration, /PERFORM public\.intools_require_admin\(\)/);
assert.match(ui, /Daily clicks/);
assert.match(ui, /Top queries/);
assert.match(routes, /if \(tab === "analytics"\) return "\/intools\/analytics"/);
console.log("intools analytics QA passed");
