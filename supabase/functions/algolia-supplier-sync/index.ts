import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { algoliasearch } from "npm:algoliasearch@5.20.0";

// Keeps the private `atelix_suppliers` Algolia index in sync with eligible
// factories. Server-side only — the index is never queried from the browser.
//   { mode: "drain" }  - process the supplier_search_outbox in bounded batches
//   { mode: "full" }   - rebuild the index from every currently-eligible factory
//
// Callable by an admin session (operator "Reindex" action) or by the service
// role (managed pg_cron drain job). Deletions and eligibility are decided in
// Postgres; this function only mirrors the result into Algolia.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ALGOLIA_INDEX = Deno.env.get("ALGOLIA_SUPPLIER_INDEX") || "atelix_suppliers";
const INDEX_SETTINGS = {
  searchableAttributes: ["name", "type", "unordered(tags)", "unordered(certs)", "bio_excerpt", "region"],
  attributesForFaceting: [
    "filterOnly(country)",
    "filterOnly(type)",
    "filterOnly(price_tiers)",
    "filterOnly(quality_tiers)",
    "filterOnly(complexity_tiers)",
    "filterOnly(premium_curation)",
    "filterOnly(fast_lead_time)",
    "filterOnly(low_moq)",
  ],
  customRanking: ["desc(rating)"],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appId = Deno.env.get("ALGOLIA_APP_ID");
  const apiKey = Deno.env.get("ALGOLIA_ADMIN_API_KEY");
  if (!token || !url || !serviceKey) return json({ ok: false, reason: "unauthorized" }, 401);
  if (!appId || !apiKey) return json({ ok: false, reason: "algolia_not_configured" }, 503);

  let body: { mode?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400);
  }
  const mode = body.mode === "full" ? "full" : "drain";

  const admin = createClient(url, serviceKey);
  // A non-service token must belong to a real user; the RPCs re-check admin.
  if (token !== serviceKey) {
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ ok: false, reason: "unauthorized" }, 401);
  }

  const client = algoliasearch(appId, apiKey);

  try {
    if (mode === "full") {
      await client.setSettings({ indexName: ALGOLIA_INDEX, indexSettings: INDEX_SETTINGS });
      let after: string | null = null;
      let indexed = 0;
      for (let page = 0; page < 40; page++) {
        const { data, error } = await admin.rpc("intools_supplier_search_full_snapshot", {
          p_after: after,
          p_limit: 500,
        });
        if (error) return json({ ok: false, reason: "snapshot_failed", detail: error.message }, 500);
        const records = (data ?? []) as { objectID: string }[];
        if (records.length === 0) break;
        await client.saveObjects({ indexName: ALGOLIA_INDEX, objects: records as Record<string, unknown>[] });
        indexed += records.length;
        after = records[records.length - 1].objectID;
        if (records.length < 500) break;
      }
      return json({ ok: true, mode, indexed });
    }

    const limit = Math.max(1, Math.min(500, Number(body.limit) || 200));
    const { data, error } = await admin.rpc("intools_supplier_search_claim", { p_limit: limit });
    if (error) return json({ ok: false, reason: "claim_failed", detail: error.message }, 500);
    const rows = (data ?? []) as { id: string; factory_id: string; op: string; record: Record<string, unknown> | null }[];
    const done: string[] = [];
    const failed: string[] = [];
    let lastError: string | null = null;

    const upserts = rows.filter((r) => r.op === "upsert" && r.record);
    const deletes = rows.filter((r) => r.op === "delete" || (r.op === "upsert" && !r.record));

    try {
      if (upserts.length) {
        await client.saveObjects({
          indexName: ALGOLIA_INDEX,
          objects: upserts.map((r) => r.record as Record<string, unknown>),
        });
        for (const r of upserts) done.push(r.id);
      }
      if (deletes.length) {
        await client.deleteObjects({
          indexName: ALGOLIA_INDEX,
          objectIDs: deletes.map((r) => r.factory_id),
        });
        for (const r of deletes) done.push(r.id);
      }
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message.slice(0, 1000) : "algolia_write_failed";
      for (const r of rows) if (!done.includes(r.id)) failed.push(r.id);
    }

    await admin.rpc("intools_supplier_search_complete", {
      p_done: done,
      p_failed: failed,
      p_error: lastError,
    });
    return json({ ok: true, mode, processed: done.length, failed: failed.length });
  } catch (cause) {
    return json({ ok: false, reason: cause instanceof Error ? cause.message.slice(0, 300) : "sync_failed" }, 500);
  }
});
