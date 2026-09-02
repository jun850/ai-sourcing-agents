import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, client, coverageMigration, detailMigration, overviewFix, customerDistributionMigration, routes] = await Promise.all([
  readFile(new URL("../src/intools-analytics.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260831140000_analytics_supplier_coverage.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260831150000_search_console_snapshot_detail.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260901095937_intools_analytics_overview_fixes.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260902104915_intools_customer_distribution.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/intools.tsx", import.meta.url), "utf8"),
]);

// Metric tiles
assert.match(ui, /"Active users"/);
assert.match(ui, /"Suppliers"/);
assert.match(ui, /Supplier countries/);
assert.doesNotMatch(ui, /Dashboard users|Verified suppliers/);
assert.match(client, /suppliers: number; supplier_countries: number/);
assert.match(client, /search_console_snapshot/);
assert.match(client, /customer_geography: IntoolsCustomerDistribution\[\]/);
assert.match(client, /customer_revenue_tiers: IntoolsCustomerDistribution\[\]/);

// Customer distribution: one aggregate admin RPC, not buyer-level browser reads.
assert.match(ui, /Customer distribution/);
assert.match(ui, /By country/);
assert.match(ui, /By annual revenue/);
assert.match(customerDistributionMigration, /PERFORM public\.intools_require_admin\(\)/);
assert.match(customerDistributionMigration, /'Not specified'/);
assert.match(customerDistributionMigration, /customer_geography/);
assert.match(customerDistributionMigration, /customer_revenue_tiers/);
assert.match(customerDistributionMigration, /WHERE p\.role = 'buyer'/);
assert.match(customerDistributionMigration, /LIMIT 1/);

// RFQ creation trend chart removed; Search Console visualises impressions
assert.doesNotMatch(ui, /RFQ creation trend/);
assert.match(ui, /Daily impressions/);
assert.doesNotMatch(ui, /Daily clicks/);
assert.match(ui, /Top queries/);
assert.match(ui, /title === "Countries" \? \[\.\.\.rows\]\.sort\(\(a, b\) => b\.impressions - a\.impressions/);
// No "0 clicks · 0%" noise: Search Console lists and tiles drop clicks/CTR
assert.doesNotMatch(ui, /clicks · |Average CTR|\bpercent\b/);
assert.match(ui, /row\.impressions\)\} impr\./);

// Base migrations still present
assert.match(coverageMigration, /PERFORM public\.intools_require_admin\(\)/);
assert.match(detailMigration, /source_count/);
assert.match(detailMigration, /top_queries/);
assert.match(detailMigration, /PERFORM public\.intools_require_admin\(\)/);
// Overview fixes migration: all-factory supplier count + correct GSC label keys
assert.match(overviewFix, /PERFORM public\.intools_require_admin\(\)/);
assert.match(overviewFix, /'suppliers',\(SELECT count\(\*\) FROM public\.factories\)/);
assert.match(overviewFix, /item->>'Top queries'/);
assert.match(overviewFix, /item->>'Top pages'/);
assert.doesNotMatch(overviewFix, /item->>'Query'|item->>'Page'/);

assert.match(routes, /navigate\("\/intools\/analytics"\)/);
assert.match(routes, /section: "analytics"/);
console.log("intools analytics QA passed");
