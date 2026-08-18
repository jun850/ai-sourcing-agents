import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Athelia's LLM layer. The deterministic match engine (js/copilot.js)
// always runs client-side for free; this function only adds a natural-language
// summary on top of matches it is GIVEN — it never invents products, prices,
// certs, or suppliers, and it never returns matches of its own. That keeps the
// trust-critical catalog facts entirely in Atelix's own data, per DESIGN.md's
// "specs before persuasion" rule.
//
// Auth + a shared per-user daily cap (3 model calls or 128,000 tokens,
// whichever first) are enforced here, server-side — the client
// gate in components.js is UX only and is not trusted on its own.

const MAX_CALLS = 3;
const MAX_TOKENS = 128000;
const UNLIMITED_EMAIL = "jun@arcanawangsa.com";
// OpenRouter resolves the model, provider routing, and shared policy through
// this account-managed preset. Keep the credential server-side only.
const MODEL = "@preset/marketplace-copilot";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Atelix's Athelia, a calm procurement assistant inside a B2B fashion-sourcing marketplace. A brand-owner buyer described what they're sourcing; a deterministic engine already ranked verified catalog matches against that brief.

Write ONE short paragraph (max 55 words, plain text, no markdown, no bullet points) summarizing the results for the buyer. Rules:
- Reference ONLY the brief and matches given to you. Never invent materials, prices, GSM, MOQ, certifications, suppliers, or lead times beyond what is listed.
- If matches is empty, say so plainly and suggest relaxing one named constraint from the brief.
- Tone: precise, calm, confident. Never salesy, never use exclamation points.
- Lead with the top match by name if one exists.`;

function trimStr(s: unknown, max: number): string {
  return String(s ?? "").slice(0, max);
}

// Server-side re-trim of client-supplied matches — never trust payload size/shape.
function sanitizeMatches(matches: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(matches)) return [];
  return matches.slice(0, 8).map((m: any) => ({
    name: trimStr(m?.name, 80),
    seller: trimStr(m?.seller, 60),
    score: typeof m?.score === "number" ? Math.round(m.score) : null,
    hits: Array.isArray(m?.hits) ? m.hits.slice(0, 4).map((h: unknown) => trimStr(h, 60)) : [],
    miss: Array.isArray(m?.miss) ? m.miss.slice(0, 2).map((h: unknown) => trimStr(h, 60)) : [],
  }));
}

function sanitizeIntent(intent: unknown): Record<string, unknown> {
  const i = (intent && typeof intent === "object") ? (intent as Record<string, unknown>) : {};
  const pick = (k: string) => (i[k] === undefined ? undefined : i[k]);
  return {
    cat: pick("cat"), materials: pick("materials"), gsm: pick("gsm"),
    priceMax: pick("priceMax"), moqMax: pick("moqMax"), lowMoq: pick("lowMoq"),
    leadMax: pick("leadMax"), fastLead: pick("fastLead"), certs: pick("certs"),
    region: pick("region"), oem: pick("oem"),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return jsonResponse({ ok: false, reason: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !user) return jsonResponse({ ok: false, reason: "unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, reason: "invalid_json" }, 400); }

  const text = trimStr(body?.text, 400);
  const intent = sanitizeIntent(body?.intent);
  const matches = sanitizeMatches(body?.matches);
  if (!text) return jsonResponse({ ok: false, reason: "missing_text" }, 400);

  const unlimited = (user.email || "").toLowerCase() === UNLIMITED_EMAIL;

  // ---- Shared cap check; reserve atomically before spending model tokens. ----
  const { data: usageRow } = await admin
    .from("copilot_usage")
    .select("call_count, total_tokens, usage_date")
    .eq("profile_id", user.id)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const isToday = usageRow?.usage_date === today;
  const callCount = isToday ? usageRow!.call_count : 0;
  const totalTokens = isToday ? usageRow!.total_tokens : 0;

  if (!unlimited && totalTokens >= MAX_TOKENS) {
    return jsonResponse({
      ok: false, reason: "limit_reached",
      contact: "info@arcanawangsa.com",
      usage: { callCount, totalTokens, maxCalls: MAX_CALLS, maxTokens: MAX_TOKENS },
    });
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return jsonResponse({ ok: false, reason: "llm_not_configured" });
  }

  let reservedUsage: any = null;
  if (!unlimited) {
    const { data, error } = await admin
      .rpc("reserve_athelia_usage", { p_profile_id: user.id, p_max_calls: MAX_CALLS })
      .single();
    if (error || !data) {
      console.error("[copilot-ask] Usage reservation failed", error);
      return jsonResponse({ ok: false, reason: "usage_unavailable" }, 503);
    }
    reservedUsage = data;
    if (!reservedUsage.allowed) return jsonResponse({
      ok: false,
      reason: "limit_reached",
      contact: "info@arcanawangsa.com",
      usage: { callCount: reservedUsage.call_count, totalTokens: reservedUsage.total_tokens, maxCalls: MAX_CALLS, maxTokens: MAX_TOKENS },
    }, 429);
  }

  const userContent = JSON.stringify({ brief: text, readAs: intent, matches });

  let completion: any;
  try {
    const resp = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://atelix.app",
          "X-Title": "Atelix",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          // The current preset uses a reasoning-capable model. Leave enough
          // completion budget for its internal work and the short final copy.
          // (Tried reasoning:{enabled:false} + a smaller budget here too — see
          // copilot-agent/index.ts for why it was reverted after a production
          // failure on that function using the same preset.)
          max_tokens: 1024,
        }),
      },
    );
    if (!resp.ok) {
      console.error("[copilot-ask] OpenRouter error", resp.status);
      return jsonResponse({ ok: false, reason: "llm_error" });
    }
    completion = await resp.json();
  } catch (err) {
    console.error("[copilot-ask] OpenRouter fetch failed", err);
    return jsonResponse({ ok: false, reason: "llm_error" });
  }

  const rawSummary = completion?.choices?.[0]?.message?.content;
  const summary = typeof rawSummary === "string"
    ? rawSummary
    : Array.isArray(rawSummary)
      ? rawSummary.map((part: any) => part?.text || "").join("")
      : undefined;
  if (!summary) {
    console.error("[copilot-ask] OpenRouter returned no text");
    return jsonResponse({ ok: false, reason: "llm_error" });
  }

  const tokensUsed: number = completion?.usage?.total_tokens
    ?? ((completion?.usage?.prompt_tokens || 0) + (completion?.usage?.completion_tokens || 0))
    ?? 0;

  let tokenUsage: any = null;
  if (!unlimited) {
    const { data, error } = await admin
      .rpc("add_athelia_tokens", { p_profile_id: user.id, p_tokens: tokensUsed })
      .single();
    if (error) console.error("[copilot-ask] token accounting failed", error);
    tokenUsage = data;
  }

  const usage = unlimited
    ? { unlimited: true, maxCalls: MAX_CALLS, maxTokens: MAX_TOKENS }
    : { callCount: tokenUsage?.call_count ?? reservedUsage.call_count, totalTokens: tokenUsage?.total_tokens ?? reservedUsage.total_tokens + tokensUsed, maxCalls: MAX_CALLS, maxTokens: MAX_TOKENS };

  return jsonResponse({ ok: true, summary: summary.trim(), usage });
});
