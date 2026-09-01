import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

const [
  legacyMigration,
  profilesMigration,
  engineMigration,
  rpcMigration,
  client,
  ui,
  routing,
  edge,
  sync,
  serverSeam,
] = await Promise.all([
  read("../supabase/migrations/20260901130000_country_routing_recommendations.sql"),
  read("../supabase/migrations/20260902090000_supplier_routing_country_profiles.sql"),
  read("../supabase/migrations/20260902093000_rfq_supplier_routing_engine.sql"),
  read("../supabase/migrations/20260902094000_rfq_routing_rpcs.sql"),
  read("../src/supabase.ts"),
  read("../src/intools.tsx"),
  read("../supabase/functions/_shared/supplier-routing.ts"),
  read("../supabase/functions/rfq-supplier-routing/index.ts"),
  read("../supabase/functions/algolia-supplier-sync/index.ts"),
  read("../server/index.mjs"),
]);

// Legacy deterministic RPC left intact and callable.
assert.match(legacyMigration, /PERFORM public\.intools_require_admin\(\)/);
assert.match(legacyMigration, /ON CONFLICT\(rfq_case_id,factory_id\) DO UPDATE/);

// Country profiles seed encodes the dimension -> country spec.
for (const country of [
  "Indonesia", "China", "Japan", "Vietnam", "Malaysia",
  "South Korea", "Italy", "Switzerland", "United Kingdom",
]) assert.match(profilesMigration, new RegExp(`'${country}'`));
assert.match(profilesMigration, /'Indonesia',[^\n]*,\s*1,\s*'Ops routing aid/);
assert.match(profilesMigration, /'China',[^\n]*,\s*2,\s*'Ops routing aid/);
assert.match(profilesMigration, /'Japan',[^\n]*,\s*3,\s*'Ops routing aid/);
assert.match(profilesMigration, /price_tiers\s+text\[\]/);
assert.match(profilesMigration, /premium_curation\s+boolean/);
assert.match(profilesMigration, /fast_lead_time\s+boolean/);
assert.doesNotMatch(profilesMigration, /country text PRIMARY KEY CHECK/);

// Engine tables + queues + eligibility-driven Algolia outbox trigger.
assert.match(engineMigration, /CREATE TABLE IF NOT EXISTS public\.rfq_routing_runs/);
assert.match(engineMigration, /CREATE TABLE IF NOT EXISTS public\.supplier_search_outbox/);
assert.match(engineMigration, /CREATE TABLE IF NOT EXISTS public\.rfq_routing_jobs/);
assert.match(engineMigration, /engine IN \('ai','deterministic','hard_fallback'\)/);
assert.match(engineMigration, /public\.broker_factory_is_eligible\(NEW, '\{\}'::jsonb\)/);
assert.match(engineMigration, /NEW\.status = 'needs_research'/);
// No churn on the audit-action constraint — reuse the existing values only.
for (const m of [engineMigration, rpcMigration]) {
  assert.doesNotMatch(m, /admin_audit_log_action_check/);
}

// RPCs: deterministic eligibility re-checked; audit reuses routing_read/refresh.
assert.match(rpcMigration, /auth\.role\(\) <> 'service_role' AND NOT public\.is_admin\(\)/);
assert.match(rpcMigration, /broker_factory_is_eligible\(f, v_case\.brief\)/);
assert.match(rpcMigration, /WHERE public\.rfq_supplier_matches\.status = 'suggested'/);
assert.match(rpcMigration, /'routing_refresh' ELSE 'routing_read'/);
assert.match(rpcMigration, /DELETE FROM public\.rfq_supplier_matches\s*\n\s*WHERE rfq_case_id = p_case_id AND status = 'suggested'/);

// Deterministic prior module.
assert.match(routing, /export function hardFallbackOrder/);
assert.match(routing, /leadTime === "urgent" && !p\.fast_lead_time/);
for (const dim of ["price", "quality", "complexity", "moqTerm", "premiumTerm", "simplicityTerm"]) {
  assert.match(routing, new RegExp(dim));
}

// Edge function: grounding guardrails + fallback branches + timeout + JSON mode.
assert.match(edge, /Return ONLY factory_id values present in candidates/);
assert.match(edge, /Never invent a supplier/);
assert.match(edge, /new AbortController\(\)/);
assert.match(edge, /response_format: \{ type: "json_object" \}/);
for (const reason of ["openrouter_key_missing", "model_timeout", "model_empty", "hard_country_fallback"]) {
  assert.match(edge, new RegExp(reason));
}
assert.match(edge, /intools_rfq_routing_candidates/);
assert.match(edge, /hardFallbackOrder\(/);

// Algolia sync function stays server-side and bounded.
assert.match(sync, /intools_supplier_search_claim/);
assert.match(sync, /never queried from the browser/i);

// Client repointed to the edge function; local seam proxies it.
assert.match(client, /functions\/v1\/rfq-supplier-routing/);
assert.match(client, /refresh \? "refresh" : "ensure"/);
assert.match(serverSeam, /\/api\/intools\/edge\/:name/);
assert.match(serverSeam, /rfq-supplier-routing/);

// UI no longer leaks the score or the rationale block.
assert.match(ui, /Refresh recommendations/);
assert.doesNotMatch(ui, /Routing rationale/);
assert.doesNotMatch(ui, /Number\(row\.match\.score\)/);

console.log("country routing QA passed");
