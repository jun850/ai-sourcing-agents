import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Keeps the private `atelix_suppliers` Algolia index in sync with eligible
// factories. Server-side only — the index is never queried from the browser.
//   { mode: "drain" }  - process supplier_search_outbox in bounded batches
//   { mode: "full" }   - rebuild the index from every currently-eligible factory
//
// Callable by an admin session (operator "Reindex" action) or the service role
// (managed pg_cron drain job). Eligibility and deletions are decided in Postgres;
// this only mirrors the result into Algolia via its REST API (no SDK, matching
// the existing algolia-sync function).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ALGOLIA_INDEX = Deno.env.get("ALGOLIA_SUPPLIER_INDEX") || "atelix_suppliers";
const APP_ID = Deno.env.get("ALGOLIA_APP_ID");
const API_KEY = Deno.env.get("ALGOLIA_ADMIN_API_KEY");
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

async function algolia(path: string, body: unknown, method = "POST", write = true) {
  const host = write ? `${APP_ID}.algolia.net` : `${APP_ID}-dsn.algolia.net`;
  const res = await fetch(`https://${host}/1/indexes/${encodeURIComponent(ALGOLIA_INDEX)}${path}`, {
    method,
    headers: {
      "X-Algolia-Application-Id": APP_ID!,
      "X-Algolia-API-Key": API_KEY!,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`algolia_${res.status}:${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function batch(requests: { action: string; body: Record<string, unknown> }[]) {
  for (let offset = 0; offset < requests.length; offset += 500) {
    await algolia("/batch", { requests: requests.slice(offset, offset + 500) });
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !serviceKey) return json({ ok: false, reason: "unauthorized" }, 401);
  if (!APP_ID || !API_KEY) return json({ ok: false, reason: "algolia_not_configured" }, 503);

  let body: { mode?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400);
  }
  const mode = body.mode === "full" ? "full" : "drain";

  const admin = createClient(url, serviceKey);
  if (token !== serviceKey) {
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ ok: false, reason: "unauthorized" }, 401);
  }

  try {
    if (mode === "full") {
      await algolia("/settings", INDEX_SETTINGS, "PUT");
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
        await batch(records.map((body) => ({ action: "updateObject", body: body as Record<string, unknown> })));
        indexed += records.length;
        after = records[records.length - 1].objectID;
        if (records.length < 500) break;
      }
      return json({ ok: true, mode, indexed });
    }

    const limit = Math.max(1, Math.min(500, Number(body.limit) || 200));
    const { data, error } = await admin.rpc("intools_supplier_search_claim", { p_limit: limit });
    if (error) return json({ ok: false, reason: "claim_failed", detail: error.message }, 500);
    const rows = (data ?? []) as {
      id: string;
      factory_id: string;
      op: string;
      record: Record<string, unknown> | null;
    }[];
    const done: string[] = [];
    const failed: string[] = [];
    let lastError: string | null = null;

    const upserts = rows.filter((r) => r.op === "upsert" && r.record);
    const deletes = rows.filter((r) => r.op === "delete" || (r.op === "upsert" && !r.record));

    try {
      if (upserts.length) {
        await batch(upserts.map((r) => ({ action: "updateObject", body: r.record as Record<string, unknown> })));
        for (const r of upserts) done.push(r.id);
      }
      if (deletes.length) {
        await batch(deletes.map((r) => ({ action: "deleteObject", body: { objectID: r.factory_id } })));
        for (const r of deletes) done.push(r.id);
      }
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message.slice(0, 1000) : "algolia_write_failed";
      for (const r of rows) if (!done.includes(r.id)) failed.push(r.id);
    }

    await admin.rpc("intools_supplier_search_complete", { p_done: done, p_failed: failed, p_error: lastError });
    return json({ ok: true, mode, processed: done.length, failed: failed.length });
  } catch (cause) {
    return json({ ok: false, reason: cause instanceof Error ? cause.message.slice(0, 300) : "sync_failed" }, 500);
  }
});
