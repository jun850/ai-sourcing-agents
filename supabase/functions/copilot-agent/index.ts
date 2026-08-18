import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Atelix Athelia agent — the authenticated, signed-in-only backend for the
// live copilot agent. Same trust rule as copilot-ask: the deterministic engine
// (js/copilot.js) computes every catalog FACT and NUMBER client-side; this
// function's model only ever NARRATES the object it is given, never inventing a
// price, stat, product, or supplier. Auth + the shared per-user daily cap
// (reserve_athelia_usage / add_athelia_tokens over copilot_usage, shared with
// copilot-ask and design-match) are enforced here server-side.
//
// Modes:
//  - "benchmark": narrate a deterministic price-benchmark / resale-context
//                 object (real numbers) as one calm paragraph. No new numbers.
//  - "draft":     brief + real matched products -> one RFQ per supplier.
//  - "revise":    current drafts + instruction -> revised drafts.

const MAX_CALLS = 40;
const MAX_TOKENS = 400000;
const UNLIMITED_EMAIL = "jun@arcanawangsa.com";
const MODEL = "@preset/marketplace-copilot";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BENCHMARK_SYSTEM_PROMPT = `You are Atelix's Athelia, a calm procurement analyst inside a B2B fashion-sourcing marketplace. A signed-in buyer asked a pricing / "am I paying too much" / resale-margin question about a specific fabric. A deterministic engine has ALREADY computed the real figures from the live catalog and given them to you as JSON (the target fabric's price, peer benchmark stats, its percentile, and any resale context).

Write ONE short paragraph (max 70 words, plain text, no markdown, no lists) answering the buyer. Rules:
- Use ONLY the numbers provided. Never invent, round beyond one decimal, or state a figure not present in the JSON.
- Quote the peer benchmark (e.g. median and range) and where this fabric sits (its percentile / verdict).
- If resale context is present, describe the fabric's price as a share of ONE piece's resale price, and explicitly note this is a material-cost share per priced unit, NOT a full gross margin (garment fabric usage is unknown).
- If the benchmark is marked insufficient (too few comparable SKUs), say the sample is too small to benchmark confidently rather than quoting shaky stats.
- Tone: precise, calm, confident. Never salesy, no exclamation points.
Reply with ONLY minified JSON: {"answer":"<the paragraph>"}`;

const DRAFT_SYSTEM_PROMPT = `You are Atelix's Athelia agent drafting supplier outreach for a signed-in buyer. A deterministic engine already found real, verified catalog matches (JSON below). You never invent products, prices, specs, sellers, MOQs, or certifications beyond what is given.

Reply with ONLY minified JSON, no markdown fences, in exactly this shape:
{"intro":"<one calm sentence, max 40 words, naming the top match and why it fits>","drafts":[{"productId":"<id from matches, one per match, same order>","message":"<a short professional RFQ email to that match's seller, 60-110 words, referencing ONLY the given name/spec/price/moq facts, signed 'Atelix buyer'>"}]}

Tone: precise, calm, confident, never salesy, never an exclamation point.`;

const REVISE_SYSTEM_PROMPT = `You are revising already-drafted supplier RFQ messages per the buyer's new instruction. You are given the current drafts and the original matched-product facts. Apply the instruction consistently across every draft while keeping every factual detail (price, spec, MOQ, seller name) unchanged unless the instruction explicitly asks to change a number.

Reply with ONLY minified JSON, no markdown fences, in exactly this shape:
{"intro":"<one short sentence, max 25 words, confirming what changed>","drafts":[{"productId":"<id, one per draft, same order>","message":"<the revised message>"}]}`;

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
  }));
}

function sanitizeDrafts(drafts: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(drafts)) return [];
  return drafts.slice(0, 5).map((d: any) => ({
    productId: trimStr(d?.productId, 40),
    message: trimStr(d?.message, 1200),
  }));
}

// The benchmark object is trusted numeric data from our own client engine; we
// clamp its size but pass the shape through so the model can narrate it.
function sanitizeBenchmarkPayload(raw: unknown): string {
  try {
    const json = JSON.stringify(raw ?? {});
    return json.slice(0, 4000);
  } catch {
    return "{}";
  }
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

  // ---- Auth: signed-in only. ----
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

  const mode = ["benchmark", "draft", "revise"].includes(body?.mode) ? body.mode : null;
  if (!mode) return jsonResponse({ ok: false, reason: "invalid_mode" }, 400);

  const unlimited = (user.email || "").toLowerCase() === UNLIMITED_EMAIL;

  // ---- Shared per-user daily cap: reserve a call before spending tokens. ----
  let reservedUsage: any = null;
  if (!unlimited) {
    const { data: usageRow } = await admin
      .from("copilot_usage")
      .select("call_count, total_tokens, usage_date")
      .eq("profile_id", user.id)
      .maybeSingle();
    const today = new Date().toISOString().slice(0, 10);
    const totalTokens = usageRow?.usage_date === today ? usageRow!.total_tokens : 0;
    if (totalTokens >= MAX_TOKENS) {
      return jsonResponse({ ok: false, reason: "limit_reached", contact: "info@arcanawangsa.com" }, 429);
    }
    const { data, error } = await admin
      .rpc("reserve_athelia_usage", { p_profile_id: user.id, p_max_calls: MAX_CALLS })
      .single();
    if (error || !data) {
      console.error("[copilot-agent] Usage reservation failed", error);
      return jsonResponse({ ok: false, reason: "usage_unavailable" }, 503);
    }
    reservedUsage = data;
    if (!reservedUsage.allowed) {
      return jsonResponse({ ok: false, reason: "limit_reached", contact: "info@arcanawangsa.com" }, 429);
    }
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return jsonResponse({ ok: false, reason: "llm_not_configured" });

  let systemPrompt: string;
  let userContent: string;
  if (mode === "benchmark") {
    const question = trimStr(body?.question, 400);
    if (!question) return jsonResponse({ ok: false, reason: "missing_question" }, 400);
    systemPrompt = BENCHMARK_SYSTEM_PROMPT;
    userContent = JSON.stringify({ question, data: JSON.parse(sanitizeBenchmarkPayload(body?.data)) });
  } else if (mode === "draft") {
    const brief = trimStr(body?.brief, 400);
    if (!brief) return jsonResponse({ ok: false, reason: "missing_brief" }, 400);
    const matches = sanitizeMatches(body?.matches);
    if (!matches.length) return jsonResponse({ ok: false, reason: "missing_matches" }, 400);
    systemPrompt = DRAFT_SYSTEM_PROMPT;
    userContent = JSON.stringify({ brief, matches });
  } else {
    const instruction = trimStr(body?.instruction, 400);
    if (!instruction) return jsonResponse({ ok: false, reason: "missing_instruction" }, 400);
    const drafts = sanitizeDrafts(body?.drafts);
    if (!drafts.length) return jsonResponse({ ok: false, reason: "missing_drafts" }, 400);
    systemPrompt = REVISE_SYSTEM_PROMPT;
    userContent = JSON.stringify({ instruction, drafts, matches: sanitizeMatches(body?.matches) });
  }

  let completion: any;
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://atelix.app",
        "X-Title": "Atelix Athelia Agent",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        // The preset resolves to a reasoning model; leave ample budget so its
        // internal reasoning doesn't consume the whole allowance before the
        // final answer (the bug that bit the earlier public function).
        max_tokens: 10000,
      }),
    });
    if (!resp.ok) {
      console.error("[copilot-agent] OpenRouter error", resp.status);
      return jsonResponse({ ok: false, reason: "llm_error" });
    }
    completion = await resp.json();
  } catch (err) {
    console.error("[copilot-agent] OpenRouter fetch failed", err);
    return jsonResponse({ ok: false, reason: "llm_error" });
  }

  const rawContent = completion?.choices?.[0]?.message?.content;
  const text = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((part: any) => part?.text || "").join("")
      : undefined;
  const parsed = text ? parseModelJson(text) : null;
  if (!parsed) {
    console.error("[copilot-agent] OpenRouter returned unparseable content", completion?.choices?.[0]?.finish_reason);
    return jsonResponse({ ok: false, reason: "llm_error" });
  }

  // ---- Token accounting on the shared per-user counter. ----
  const tokensUsed: number = completion?.usage?.total_tokens
    ?? ((completion?.usage?.prompt_tokens || 0) + (completion?.usage?.completion_tokens || 0))
    ?? 0;
  if (!unlimited) {
    const { error: tokenErr } = await admin.rpc("add_athelia_tokens", { p_profile_id: user.id, p_tokens: tokensUsed });
    if (tokenErr) console.error("[copilot-agent] token accounting failed", tokenErr);
  }

  if (mode === "benchmark") {
    const answer = trimStr(parsed.answer, 800);
    if (!answer) return jsonResponse({ ok: false, reason: "llm_error" });
    return jsonResponse({ ok: true, answer });
  }

  if (!Array.isArray(parsed.drafts)) return jsonResponse({ ok: false, reason: "llm_error" });
  const validIds = mode === "draft"
    ? new Set(sanitizeMatches(body?.matches).map((m) => m.id))
    : new Set(sanitizeDrafts(body?.drafts).map((d) => d.productId));
  const drafts = parsed.drafts
    .filter((d: any) => d && validIds.has(trimStr(d.productId, 40)))
    .map((d: any) => ({ productId: trimStr(d.productId, 40), message: trimStr(d.message, 1200) }));
  return jsonResponse({ ok: true, intro: trimStr(parsed.intro, 300), drafts });
});
