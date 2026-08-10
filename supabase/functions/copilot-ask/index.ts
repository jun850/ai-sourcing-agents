import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Sourcing Copilot's LLM layer. The deterministic match engine (js/copilot.js)
// always runs client-side for free; this function only adds a natural-language
// summary on top of matches it is GIVEN — it never invents products, prices,
// certs, or suppliers, and it never returns matches of its own. That keeps the
// trust-critical catalog facts entirely in ARCANA's own data, per DESIGN.md's
// "specs before persuasion" rule.
//
// Auth + a per-user daily cap (30 calls or 128,000 tokens, whichever first)
// are enforced here, server-side, via increment_copilot_usage() — the client
// gate in components.js is UX only and is not trusted on its own.

const MAX_CALLS = 30;
const MAX_TOKENS = 128000;
// Keep the server-side model explicit so an old environment fallback cannot
// silently downgrade the analysis path. GEMINI_API_KEY remains an Edge secret.
const MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You are ARCANA's Sourcing Copilot, a calm procurement assistant inside a B2B fashion-sourcing marketplace. A brand-owner buyer described what they're sourcing; a deterministic engine already ranked verified catalog matches against that brief.

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
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return new Response("Unauthorized", { status: 401 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !user) return new Response("Unauthorized", { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const text = trimStr(body?.text, 400);
  const intent = sanitizeIntent(body?.intent);
  const matches = sanitizeMatches(body?.matches);
  if (!text) return new Response("Missing text", { status: 400 });

  // ---- Cap check (read-only pre-check; the RPC below re-checks atomically) ----
  const { data: usageRow } = await admin
    .from("copilot_usage")
    .select("call_count, total_tokens, usage_date")
    .eq("profile_id", user.id)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const isToday = usageRow?.usage_date === today;
  const callCount = isToday ? usageRow!.call_count : 0;
  const totalTokens = isToday ? usageRow!.total_tokens : 0;

  if (callCount >= MAX_CALLS || totalTokens >= MAX_TOKENS) {
    return jsonResponse({
      ok: false, reason: "limit_reached",
      usage: { callCount, totalTokens, maxCalls: MAX_CALLS, maxTokens: MAX_TOKENS },
    });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ ok: false, reason: "llm_not_configured" });
  }

  const userContent = JSON.stringify({ brief: text, readAs: intent, matches });

  let geminiJson: any;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          generationConfig: { maxOutputTokens: 220, thinkingConfig: { thinkingLevel: "minimal" } },
        }),
      },
    );
    if (!resp.ok) {
      console.error("[copilot-ask] Gemini error", resp.status, await resp.text());
      return jsonResponse({ ok: false, reason: "llm_error" });
    }
    geminiJson = await resp.json();
  } catch (err) {
    console.error("[copilot-ask] Gemini fetch failed", err);
    return jsonResponse({ ok: false, reason: "llm_error" });
  }

  const summary: string | undefined = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!summary) {
    console.error("[copilot-ask] Gemini returned no text", JSON.stringify(geminiJson).slice(0, 500));
    return jsonResponse({ ok: false, reason: "llm_error" });
  }

  const tokensUsed: number = geminiJson?.usageMetadata?.totalTokenCount
    ?? ((geminiJson?.usageMetadata?.promptTokenCount || 0) + (geminiJson?.usageMetadata?.candidatesTokenCount || 0))
    ?? 0;

  const { data: bumped, error: rpcErr } = await admin
    .rpc("increment_copilot_usage", { p_profile_id: user.id, p_tokens: tokensUsed })
    .single();
  if (rpcErr) console.error("[copilot-ask] usage increment failed", rpcErr);

  const usage = bumped
    ? { callCount: (bumped as any).call_count, totalTokens: (bumped as any).total_tokens, maxCalls: MAX_CALLS, maxTokens: MAX_TOKENS }
    : { callCount: callCount + 1, totalTokens: totalTokens + tokensUsed, maxCalls: MAX_CALLS, maxTokens: MAX_TOKENS };

  return jsonResponse({ ok: true, summary: summary.trim(), usage });
});
