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
//  - "chat":   the conversational brain. Given the message history + real
//              candidate products (and, for price questions, a deterministic
//              benchmark), it writes the reply and picks which real product ids
//              to show. It may never invent a product, price, or number.
//  - "draft":  brief + real matched products -> one RFQ per supplier.
//  - "revise": current drafts + instruction -> revised drafts.

const MAX_CALLS = 40;
const MAX_TOKENS = 400000;
const UNLIMITED_EMAIL = "jun@arcanawangsa.com";
// Athelia is in limited preview — only these accounts may use the agent.
// This is the authoritative gate; the front-end shows the same allowlist as UX.
const ALLOWED_EMAILS = new Set(["jun@arcanawangsa.com"]);
const MODEL = "@preset/marketplace-copilot";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CHAT_SYSTEM_PROMPT = `You are Athelia, the sourcing agent inside Atelix, a B2B fashion-sourcing marketplace. You are talking to a signed-in brand-owner buyer. Reason over the WHOLE conversation so far — later messages refine earlier ones (a follow-up like "my budget is $10/m" narrows the previous request, it does not start a new one).

A deterministic engine has already searched the LIVE catalog and given you CONTEXT as JSON:
- "candidates": the real verified products that fit the conversation so far (id, name, seller, price, unit, moq, spec, comp, certs). This is the ONLY set of products you may reference or show. Never invent a product, price, spec, supplier, or number that is not in this JSON.
- "benchmark": present only when the buyer asked whether a price is fair — real peer price stats and resale context for one product. Quote ONLY these numbers; note any resale share is a material-cost share per unit, not a full gross margin.

Decide what to say and which products to surface. Reply with ONLY minified JSON, no markdown:
{"reply":"<your conversational answer, max 70 words, plain text>","show":["<candidate id>", ...],"draftFor":["<candidate id>", ...]}
- "show": the ids (0-5, best first) of candidates to render as cards for THIS turn. CRITICAL: every NEW product you name or recommend in "reply" MUST have its id here, so its add-to-cart card appears. Use [] when the turn is purely conversational, nothing fits, you're only confirming a spec/qty/price for something the buyer already picked (its card was already shown), or "draftFor" is non-empty this turn — drafting supersedes showing a card again. Only ids present in candidates.
- "draftFor": candidate ids to draft supplier RFQ inquiries for. Leave [] unless the buyer explicitly asked to draft/write/send a supplier inquiry THIS turn. When they did:
  - If they singled out one option ("draft an inquiry for that one", "just the cheapest", "the first one", "send it to <supplier>"), include ONLY that one id.
  - If they asked for all of them, every option, or named several, include each of those ids (up to 5).
  - If they said "draft an inquiry" with no target and only one candidate is in play, include that one id. If several are in play and none was singled out, do not guess — leave draftFor empty and ask which one(s) in "reply" instead.
- Pricing verdicts: when "benchmark" is given, answer the fairness question head-on with a firm verdict up front — "Yes, that's fair.", "No, that's overpriced.", or "No, that's underpriced." — grounded in the percentile and peer range, then cite the numbers. Never hedge with "it depends" when a benchmark is present; the data gives a clear answer.
- Be proactive: end a turn that shows 2+ options, or that completes a draft, with ONE short, concrete next-step question — e.g. "Which one do you like most?", "Want me to draft the RFQ?", "Ready to send this to the supplier?". Skip this on plain informational turns with nothing left to decide.
- "reply": speak naturally. If nothing fits the (possibly narrowed) request, say so honestly and suggest relaxing one constraint — do not show unrelated products.
Tone: precise, calm, confident. Never salesy, no exclamation points.`;

const DRAFT_SYSTEM_PROMPT = `You are Atelix's Athelia agent drafting supplier outreach for a signed-in buyer. A deterministic engine already found real, verified catalog matches (JSON below). You never invent products, prices, specs, sellers, MOQs, or certifications beyond what is given.

The input JSON includes "lang": one of "en", "ja", "zh". Write the ENTIRE message — greeting, body, and sign-off — in that language. Default to "en" (English) unless the buyer explicitly asked for another language; never guess a language from the supplier's own country. Keep product names, specs, MOQs, and numbers exactly as given — do not translate or alter facts, only the surrounding prose.

Reply with ONLY minified JSON, no markdown fences, in exactly this shape:
{"intro":"<one calm sentence, max 40 words, naming the top match and why it fits, written in the requested lang>","drafts":[{"productId":"<id from matches, one per match, same order>","message":"<a short professional RFQ email to that match's seller, 60-110 words (or the natural equivalent in the target language), referencing ONLY the given name/spec/price/moq facts, signed 'Atelix buyer', written in the requested lang>"}]}

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

// Candidates for chat grounding — a few more fields + up to 8, best-first.
function sanitizeCandidates(candidates: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(candidates)) return [];
  return candidates.slice(0, 8).map((m: any) => ({
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

// Conversation history: only user/assistant text turns, clamped.
function sanitizeChatMessages(messages: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-16)
    .map((m: any) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: trimStr(m?.content, 800) }))
    .filter((m) => m.content);
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

  // ---- Limited-preview allowlist: only permitted accounts may use Athelia. ----
  if (!ALLOWED_EMAILS.has((user.email || "").toLowerCase())) {
    return jsonResponse({ ok: false, reason: "not_available" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, reason: "invalid_json" }, 400); }

  const mode = ["chat", "draft", "revise"].includes(body?.mode) ? body.mode : null;
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

  let llmMessages: Array<{ role: string; content: string }>;
  if (mode === "chat") {
    const convo = sanitizeChatMessages(body?.messages);
    if (!convo.length) return jsonResponse({ ok: false, reason: "missing_messages" }, 400);
    const candidates = sanitizeCandidates(body?.candidates);
    const benchmark = body?.benchmark ? JSON.parse(sanitizeBenchmarkPayload(body?.benchmark)) : null;
    llmMessages = [
      { role: "system", content: CHAT_SYSTEM_PROMPT + "\n\nCONTEXT:\n" + JSON.stringify({ candidates, benchmark }) },
      ...convo,
    ];
  } else if (mode === "draft") {
    const brief = trimStr(body?.brief, 400);
    if (!brief) return jsonResponse({ ok: false, reason: "missing_brief" }, 400);
    const matches = sanitizeMatches(body?.matches);
    if (!matches.length) return jsonResponse({ ok: false, reason: "missing_matches" }, 400);
    const lang = ["en", "ja", "zh"].includes(body?.lang) ? body.lang : "en";
    llmMessages = [{ role: "system", content: DRAFT_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify({ brief, matches, lang }) }];
  } else {
    const instruction = trimStr(body?.instruction, 400);
    if (!instruction) return jsonResponse({ ok: false, reason: "missing_instruction" }, 400);
    const drafts = sanitizeDrafts(body?.drafts);
    if (!drafts.length) return jsonResponse({ ok: false, reason: "missing_drafts" }, 400);
    llmMessages = [{ role: "system", content: REVISE_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify({ instruction, drafts, matches: sanitizeMatches(body?.matches) }) }];
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
        messages: llmMessages,
        // The preset resolves to a reasoning model; leave ample budget so its
        // internal reasoning doesn't consume the whole allowance before the
        // final answer (the bug that bit the earlier public function).
        // Tried `reasoning:{enabled:false}` here to cut latency (matching
        // design-match's fix) — in production this preset kept spending most
        // of a much smaller max_tokens on hidden reasoning anyway (confirmed
        // via function_logs: finish_reason "length", then unparseable "stop"
        // content), so it's reverted. Revisit with response_format:json_schema
        // (like design-match uses) before trying reasoning:false again here.
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

  if (mode === "chat") {
    const reply = trimStr(parsed.reply, 800);
    if (!reply) return jsonResponse({ ok: false, reason: "llm_error" });
    const candIds = new Set(sanitizeCandidates(body?.candidates).map((c) => c.id));
    const draftFor = Array.isArray(parsed.draftFor)
      ? parsed.draftFor.map((x: any) => trimStr(x, 40)).filter((id: string) => candIds.has(id)).slice(0, 5)
      : [];
    // Drafting supersedes showing a card again — enforced here, not just asked
    // for in the prompt, so a card never doubles up alongside the draft.
    const show = draftFor.length
      ? []
      : Array.isArray(parsed.show)
        ? parsed.show.map((x: any) => trimStr(x, 40)).filter((id: string) => candIds.has(id)).slice(0, 5)
        : [];
    return jsonResponse({ ok: true, reply, show, draftFor });
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
