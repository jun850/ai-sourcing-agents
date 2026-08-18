import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Atelix Agent POC — the public, unauthenticated pitch demo at /agentpoc.
// Modeled on copilot-ask (same OpenRouter-key-server-side, same "the LLM
// only writes prose, it never invents catalog facts" rule) with two
// differences: no auth (the demo page has no login), and the daily cap is
// one global row (agentpoc_usage) instead of per-profile, since there is
// no user to key it on. See supabase/migrations/20260818090000_agentpoc_usage.sql.
//
// Two modes:
//  - "draft":  brief + up to 5 real catalog matches -> an intro line + one
//              drafted RFQ message per match, addressed to that match's
//              real seller, grounded only in the facts given.
//  - "revise": current drafts + a free-text instruction -> the same drafts,
//              revised, facts unchanged unless the instruction asks for it.

const MAX_CALLS = 60;
const MAX_TOKENS = 250000;
const MODEL = "@preset/marketplace-copilot";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DRAFT_SYSTEM_PROMPT = `You are Atelix's sourcing agent, running inside a live public product demo. A buyer described a sourcing brief; a deterministic engine already found real, verified catalog matches (given to you below as JSON). You never invent products, prices, specs, sellers, MOQs, or certifications beyond what is given — those facts are trust-critical and come only from the catalog.

Reply with ONLY minified JSON, no markdown fences, no commentary outside the JSON, in exactly this shape:
{"intro":"<one calm sentence, max 40 words, naming the top match by name and one reason it fits the brief>","drafts":[{"productId":"<id from matches, one entry per match given, same order>","message":"<a short professional RFQ email to that match's seller, 60-110 words, referencing ONLY the given name/spec/price/moq facts, signed 'Atelix buyer'>"}]}

Tone: precise, calm, confident, never salesy, never an exclamation point.`;

const REVISE_SYSTEM_PROMPT = `You are revising a set of already-drafted supplier RFQ messages per the buyer's new instruction, inside a live public product demo. You are given the current drafts and the original matched-product facts. Apply the instruction consistently across every draft (tone, an added question, a deadline, whatever it asks) while keeping every factual detail (price, spec, MOQ, seller name) unchanged unless the instruction explicitly asks to change a number.

Reply with ONLY minified JSON, no markdown fences, no commentary outside the JSON, in exactly this shape:
{"intro":"<one short sentence, max 25 words, confirming what changed>","drafts":[{"productId":"<id, one entry per draft given, same order>","message":"<the revised message>"}]}`;

function trimStr(s: unknown, max: number): string {
  return String(s ?? "").slice(0, max);
}

function sanitizeMatches(matches: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(matches)) return [];
  return matches.slice(0, 5).map((m: any) => ({
    id: trimStr(m?.id, 40),
    name: trimStr(m?.name, 90),
    seller: trimStr(m?.seller, 60),
    loc: trimStr(m?.loc, 60),
    price: typeof m?.price === "number" ? m.price : null,
    unit: trimStr(m?.unit, 20),
    moq: trimStr(m?.moq, 30),
    spec: trimStr(m?.spec, 100),
    comp: trimStr(m?.comp, 100),
    certs: Array.isArray(m?.certs) ? m.certs.slice(0, 6).map((c: unknown) => trimStr(c, 30)) : [],
    hits: Array.isArray(m?.hits) ? m.hits.slice(0, 4).map((h: unknown) => trimStr(h, 60)) : [],
  }));
}

function sanitizeDrafts(drafts: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(drafts)) return [];
  return drafts.slice(0, 5).map((d: any) => ({
    productId: trimStr(d?.productId, 40),
    message: trimStr(d?.message, 1200),
  }));
}

function sanitizeIntent(intent: unknown): Record<string, unknown> {
  const i = (intent && typeof intent === "object") ? (intent as Record<string, unknown>) : {};
  const pick = (k: string) => (i[k] === undefined ? undefined : i[k]);
  return { cat: pick("cat"), materials: pick("materials"), priceMax: pick("priceMax"), moqMax: pick("moqMax"), certs: pick("certs"), region: pick("region") };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function parseModelJson(raw: string): any {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* give up */ } }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, reason: "invalid_json" }, 400); }

  const mode = body?.mode === "revise" ? "revise" : body?.mode === "draft" ? "draft" : null;
  if (!mode) return jsonResponse({ ok: false, reason: "invalid_mode" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- Global (not per-user — this endpoint is public/unauthenticated) daily cap. ----
  const { data: reservedUsage, error: reserveErr } = await admin
    .rpc("reserve_agentpoc_usage", { p_max_calls: MAX_CALLS })
    .single();
  if (reserveErr || !reservedUsage) {
    console.error("[agentpoc-ask] Usage reservation failed", reserveErr);
    return jsonResponse({ ok: false, reason: "usage_unavailable" }, 503);
  }
  const usage: any = reservedUsage;
  if (!usage.allowed || usage.total_tokens >= MAX_TOKENS) {
    return jsonResponse({ ok: false, reason: "limit_reached" }, 429);
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return jsonResponse({ ok: false, reason: "llm_not_configured" });

  let userContent: string;
  let systemPrompt: string;
  if (mode === "draft") {
    const brief = trimStr(body?.brief, 400);
    if (!brief) return jsonResponse({ ok: false, reason: "missing_brief" }, 400);
    const matches = sanitizeMatches(body?.matches);
    if (!matches.length) return jsonResponse({ ok: false, reason: "missing_matches" }, 400);
    systemPrompt = DRAFT_SYSTEM_PROMPT;
    userContent = JSON.stringify({ brief, intent: sanitizeIntent(body?.intent), matches });
  } else {
    const instruction = trimStr(body?.instruction, 400);
    if (!instruction) return jsonResponse({ ok: false, reason: "missing_instruction" }, 400);
    const drafts = sanitizeDrafts(body?.drafts);
    if (!drafts.length) return jsonResponse({ ok: false, reason: "missing_drafts" }, 400);
    systemPrompt = REVISE_SYSTEM_PROMPT;
    userContent = JSON.stringify({ instruction, brief: trimStr(body?.brief, 400), drafts, matches: sanitizeMatches(body?.matches) });
  }

  let completion: any;
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://atelix.app",
        "X-Title": "Atelix Agent POC",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 10000,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(()=>"");
      console.error("[agentpoc-ask] OpenRouter error", resp.status, errText);
      return jsonResponse({ ok: false, reason: "llm_error" });
    }
    completion = await resp.json();
  } catch (err) {
    console.error("[agentpoc-ask] OpenRouter fetch failed", err);
    return jsonResponse({ ok: false, reason: "llm_error" });
  }

  const rawContent = completion?.choices?.[0]?.message?.content;
  const text = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((part: any) => part?.text || "").join("")
      : undefined;
  const parsed = text ? parseModelJson(text) : null;
  if (!parsed || !Array.isArray(parsed.drafts)) {
    console.error("[agentpoc-ask] OpenRouter returned unparseable content", text, completion?.choices?.[0]?.finish_reason, completion?.usage);
    return jsonResponse({ ok: false, reason: "llm_error" });
  }

  const validIds = mode === "draft"
    ? new Set(sanitizeMatches(body?.matches).map((m) => m.id))
    : new Set(sanitizeDrafts(body?.drafts).map((d) => d.productId));
  const drafts = parsed.drafts
    .filter((d: any) => d && validIds.has(trimStr(d.productId, 40)))
    .map((d: any) => ({ productId: trimStr(d.productId, 40), message: trimStr(d.message, 1200) }));

  const tokensUsed: number = completion?.usage?.total_tokens
    ?? ((completion?.usage?.prompt_tokens || 0) + (completion?.usage?.completion_tokens || 0))
    ?? 0;
  const { error: tokenErr } = await admin.rpc("add_agentpoc_tokens", { p_tokens: tokensUsed });
  if (tokenErr) console.error("[agentpoc-ask] token accounting failed", tokenErr);

  return jsonResponse({ ok: true, intro: trimStr(parsed.intro, 300), drafts });
});
