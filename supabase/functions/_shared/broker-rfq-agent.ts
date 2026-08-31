import { createClient } from "jsr:@supabase/supabase-js@2";
import { classifyIntake, immediateQuestion } from "./rfq-intake.ts";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRESET = "@preset/marketplace-copilot";
const FIELDS = ["product", "quantity", "material", "certifications", "colors", "sizes", "budget", "timeline"] as const;
type Field = typeof FIELDS[number];
type AgentKind = "answer" | "clarifying_question" | "draft_updated" | "support_handoff" | "unavailable";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function uuid(value: string) { return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value); }
function modelText(value: any) {
  const content = value?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => typeof part?.text === "string" ? part.text : "").join("") : "";
}
function extractJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;
}
function operational(message: string) {
  // invoice/payment/paid/stripe rarely describe a new RFQ's own product, so
  // they're treated as operational on their own. order/production/shipment/
  // shipping/delivery are ordinary RFQ vocabulary (a delivery timeline, a
  // bulk production run, shipping terms), so those only count as an
  // operational question when paired with a status-inquiry cue -- otherwise
  // "bulk production... by next month" in a fresh RFQ prompt false-triggers
  // the payment/order support handoff instead of actually drafting the RFQ.
  const lower = message.toLowerCase();
  if (/\b(invoice|payment|paid|stripe)\b/.test(lower)) return true;
  if (!/\b(order|production|shipment|shipping|delivery)\b/.test(lower)) return false;
  return /\?|\b(status|cleared|confirm|track(ing)?|update|where is|when (will|is)|has (my|our|the))\b/.test(lower);
}
function readOnlyRfqQuestion(message: string) { return /\b(double[ -]?check|review|summari[sz]e|what(?:'s| is) in|show)\b.*\b(rfq|request|draft)\b/i.test(message); }
function output(kind: AgentKind, message: string, revision: number, extra: Record<string, unknown> = {}) {
  return { kind, reply: text(message, 900), savedPatch: null, changedFields: [], revision, undoToken: null, verificationStatus: null, supportHandoff: null, budgetState: null, options: null, ...extra };
}
function options(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const clean = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0 && entry.trim().length <= 60).map((entry) => entry.trim()).slice(0, 3);
  return clean.length ? clean : null;
}
function fieldValue(source: unknown): string | null {
  // Fields like colors/certifications read as plural nouns, so the model
  // sometimes answers with an array (e.g. ["black"]) instead of the plain
  // string our schema expects; join it into one rather than silently
  // dropping buyer-confirmed info the model correctly understood but
  // mis-typed.
  if (typeof source === "string") return source.trim();
  if (typeof source === "number" && Number.isFinite(source)) return String(source);
  if (Array.isArray(source)) {
    const joined = source
      .filter((entry): entry is string | number => typeof entry === "string" || typeof entry === "number")
      .map((entry) => String(entry).trim())
      .filter(Boolean)
      .join(", ");
    return joined || null;
  }
  return null;
}
function patch(value: unknown): Partial<Record<Field, string>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const clean: Partial<Record<Field, string>> = {};
  for (const field of FIELDS) {
    // An explicit empty string is kept (it's how the model clears a field);
    // fieldValue() only returns null when there was nothing usable to read.
    const source = fieldValue((value as Record<string, unknown>)[field]);
    if (source !== null && source.length <= 500) clean[field] = source;
  }
  return Object.keys(clean).length ? clean : null;
}
function parse(value: unknown) {
  // Only the six known keys are ever read below; any other top-level key the
  // model includes (extra commentary fields, provider-added metadata, etc.)
  // is simply ignored rather than rejecting an otherwise-valid response.
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const kind = ["answer", "clarifying_question", "draft_updated", "support_handoff"].includes(String(source.kind)) ? source.kind as AgentKind : "answer";
  return { kind, reply: text(source.reply, 900) || "I’m here to help refine this RFQ. Could you share one more detail?", patch: patch(source.patch), verificationStatus: text(source.verificationStatus, 180) || null, supportHandoff: source.supportHandoff === true || kind === "support_handoff", options: kind === "clarifying_question" ? options(source.options) : null };
}
function microusd(usage: any) {
  const cost = typeof usage?.cost === "number" ? usage.cost : typeof usage?.cost === "string" ? Number(usage.cost) : NaN;
  return Number.isFinite(cost) && cost >= 0 ? Math.ceil(cost * 1_000_000) : null;
}
function compactFields(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: Partial<Record<Field, string>> = {};
  for (const field of FIELDS) {
    const content = text(source[field], 300);
    if (content) result[field] = content;
  }
  return result;
}
function normaliseBuyerPrompt(message: string) {
  return message
    .replace(/\bprcs?\b/gi, "pcs")
    .replace(/\bpeices?\b/gi, "pieces")
    .replace(/\bmetres?\b/gi, "meters");
}
function deterministicPatch(message: string, intake: ReturnType<typeof classifyIntake>): Partial<Record<Field, string>> {
  // Keep the RFQ useful when the optional model provider is slow or
  // unavailable. These are deliberately conservative, buyer-stated values
  // only; they never create supplier or commercial facts.
  const result: Partial<Record<Field, string>> = {};
  const source = normaliseBuyerPrompt(message);
  const quantity = source.match(/\b(\d[\d,.]*)\s*(meters?|m\b|yards?|yd\b|pieces?|pcs?|units?|kg|kgs|kilograms?)\b/i);
  if (quantity) result.quantity = `${quantity[1]} ${quantity[2]}`;
  const timeline = source.match(/\b(within\s+)?(\d[\d,.]*)\s*(business\s+days?|days?|weeks?|months?)\b/i);
  if (timeline) result.timeline = `${timeline[1] || ""}${timeline[2]} ${timeline[3]}`.trim();
  const color = source.match(/\b(black|white|navy|blue|red|green|grey|gray|beige|brown|pink|yellow|orange|purple)\b/i)?.[0];
  if (color) result.colors = color;
  const sizes = source.match(/\b(?:all sizes|sizes?\s+(?:xs|s|m|l|xl|xxl|xxxl|\d+)(?:\s*(?:to|[-–])\s*(?:xs|s|m|l|xl|xxl|xxxl|\d+))?|xs|s|m|l|xl|xxl|xxxl)\b/i)?.[0];
  if (sizes) result.sizes = sizes;
  const budget = source.match(/\b(?:budget\s*)?(?:usd|us\$|\$)\s*\d[\d,.]*(?:\s*(?:each|per)\s*(?:pieces?|pcs?|units?))?\b|\b\d[\d,.]*\s*(?:usd|us\$|\$)(?:\s*(?:each|per)\s*(?:pieces?|pcs?|units?))?\b/i)?.[0];
  if (budget) result.budget = budget;
  const certification = source.match(/\b(?:OEKO[ -]?TEX|GOTS|GRS|RCS|BSCI|WRAP|ISO\s*9001)\b/i)?.[0];
  if (certification) result.certifications = certification;
  const textileWeight = source.match(/\b(?:\d{2,4}\s*gsm|\d+(?:\.\d+)?\s*(?:oz|ounces?))\b/i)?.[0];
  const material = source.match(/\b((?:organic\s+)?(?:cotton|silk|linen|wool|cashmere|viscose|rayon|polyester|nylon|denim)(?:[-\s]+blend)?(?:\s*[-/]?\s*(?:cotton|silk|linen|wool|cashmere|viscose|rayon|polyester|nylon|denim))*)\b/i)?.[0];
  if (material || textileWeight) result.material = [material, textileWeight].filter(Boolean).join(", ");
  const garment = source.match(/\b(t-?shirts?|tees?|polo shirts?|hoodies?|sweatshirts?|shirts?|trousers?|pants|dresses?|jackets?|coats?|uniforms?)\b/i)?.[0];
  if (garment) result.product = garment;
  if (intake.category === "fabric") {
    if (/\bfabrics?\b/i.test(source)) result.product = material ? `${material} fabric` : "Fabric";
  }
  if (intake.category === "apparel") {
    if (garment) result.product = garment;
  }
  return result;
}
async function append(admin: any, caseId: string, profileId: string, role: "buyer" | "agent", content: string) {
  // New workspace RFQs already own a thread at creation time. Writing directly
  // to that thread avoids taking an unnecessary RFQ-row lock for every turn,
  // which was able to leave concurrent first messages waiting indefinitely.
  const { data: rfq, error: rfqError } = await admin
    .from("rfq_cases")
    .select("thread_id")
    .eq("id", caseId)
    .eq("buyer_profile_id", profileId)
    .maybeSingle();
  if (rfqError || !rfq?.thread_id) {
    return await admin.rpc("agent_rfq_record_thread_message", {
      p_case_id: caseId,
      p_profile_id: profileId,
      p_role: role,
      p_content: content,
    });
  }
  return await admin.from("athelia_thread_messages").insert({
    thread_id: rfq.thread_id,
    role,
    content: content.trim(),
  });
}
async function finish(
  admin: any,
  turnId: string,
  result: Record<string, unknown>,
  status: "settled" | "unavailable" | "failed" = "settled",
  fallbackReason: string | null = null,
  startedAt?: number,
) {
  await admin.from("agent_rfq_turns").update({
    status,
    agent_reply: text(result.reply, 900),
    kind: result.kind,
    saved_patch: result.savedPatch,
    response: result,
    fallback_reason: fallbackReason,
    latency_ms: typeof startedAt === "number" ? Date.now() - startedAt : null,
    completed_at: new Date().toISOString(),
  }).eq("id", turnId);
}

// Legacy function routes delegate here. All supplier, invoice, order, and
// payment facts are read server-side; browser supplied context is never used.
export async function handleBrokerRfqAgent(request: Request) {
  const startedAt = Date.now();
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return reply({ ok: false, reason: "method_not_allowed" }, 405);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ ok: false, reason: "unauthorized" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply({ ok: false, reason: "service_unavailable" }, 503);
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return reply({ ok: false, reason: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ ok: false, reason: "invalid_json" }, 400); }
  const rfqCaseId = text(body.rfqCaseId, 36); const clientMessageId = text(body.clientMessageId, 36);
  const action = body.action === "undo" ? "undo" : "message";
  const message = action === "undo" ? "Undo the last agent change" : (typeof body.message === "string" ? body.message.trim() : "");
  const expectedRevision = typeof body.expectedRevision === "number" && Number.isInteger(body.expectedRevision) && body.expectedRevision >= 0 ? body.expectedRevision : null;
  if (!uuid(rfqCaseId) || !uuid(clientMessageId) || expectedRevision === null || !message) return reply({ ok: false, reason: "invalid_request" }, 400);

  const { data: context, error: contextError } = await admin.rpc("agent_rfq_get_context", { p_case_id: rfqCaseId, p_profile_id: user.id });
  if (contextError || !context?.rfq) return reply({ ok: false, reason: "rfq_not_found" }, 404);
  const revision = Number(context.rfq.revision || 0);
  // Follow-up messages often carry only the newly supplied requirements
  // (for example, "black and under two months"). Classify against the
  // established RFQ as well so that an already-known fabric/apparel route is
  // never discarded and the model can apply every buyer-stated field together.
  const intake = classifyIntake([
    text(context.rfq.title, 240),
    JSON.stringify(context.rfq.brief ?? {}),
    message,
  ].join("\n"));
  const { data: existing } = await admin.from("agent_rfq_turns").select("response,status,rfq_case_id").eq("profile_id", user.id).eq("client_message_id", clientMessageId).maybeSingle();
  if (existing && existing.rfq_case_id !== rfqCaseId) return reply({ ok: false, reason: "client_message_id_conflict" }, 409);
  if (existing?.response && typeof existing.response === "object") return reply(existing.response);
  if (existing) return reply(output("unavailable", "Your previous message is still being handled. Please wait a moment before trying again.", revision));

  const { data: turn, error: turnError } = await admin.from("agent_rfq_turns").insert({ rfq_case_id: rfqCaseId, profile_id: user.id, client_message_id: clientMessageId, buyer_message: message, preset: PRESET }).select("id").single();
  if (turnError || !turn?.id) return reply({ ok: false, reason: "turn_unavailable" }, 503);
  const buyerWrite = await append(admin, rfqCaseId, user.id, "buyer", message);
  if (buyerWrite.error) {
    const result = output("unavailable", "I couldn’t save that message safely. Please try again.", revision);
    await finish(admin, turn.id, result, "failed", "message_persist_failed", startedAt); return reply(result, 503);
  }

  if (action === "undo") {
    const token = text(body.undoToken, 36);
    const { data: undone, error } = uuid(token) ? await admin.rpc("agent_rfq_undo_patch", { p_case_id: rfqCaseId, p_profile_id: user.id, p_undo_token: token }) : { data: null, error: new Error("invalid undo") };
    const result = error
      ? output("unavailable", "I can’t safely undo that change because the RFQ has changed since then. Your latest saved details are still intact.", revision)
      : output("draft_updated", "I restored the previous RFQ details. You can keep refining the draft whenever you’re ready.", Number(undone?.revision || revision), { savedPatch: undone?.restoredFields || null, changedFields: Object.keys(undone?.restoredFields || {}).filter((key) => FIELDS.includes(key as Field)) });
    await append(admin, rfqCaseId, user.id, "agent", result.reply); await finish(admin, turn.id, result, error ? "unavailable" : "settled", error ? "undo_conflict" : null, startedAt);
    return reply(result, error ? 409 : 200);
  }

  // A first-pass classification is deterministic, immediate, and free. It
  // avoids paying an inference round merely to decide which brief is needed.
  if (intake.subtype === "unclassified") {
    const result = output("clarifying_question", immediateQuestion(intake.subtype), revision, { verificationStatus: "partial", intake });
    await append(admin, rfqCaseId, user.id, "agent", result.reply); await finish(admin, turn.id, result, "settled", "intake_unclassified", startedAt);
    return reply(result);
  }

  // A clearly stated sourcing brief does not need to wait for an upstream
  // model just to record facts that are already explicit. This is the fast,
  // dependable first response from the Dashboard prompt; it never invents a
  // supplier or commercial term. Ambiguous and follow-up requests continue
  // through the provider path below.
  const immediatePatch = deterministicPatch(message, intake);
  if (Object.keys(immediatePatch).length) {
    const { data: applied, error } = await admin.rpc("agent_rfq_apply_patch", { p_case_id: rfqCaseId, p_profile_id: user.id, p_expected_revision: expectedRevision, p_patch: immediatePatch, p_turn_id: turn.id });
    if (!error) {
      const result = output("draft_updated", "I’ve recorded the details you shared. Add any other requirements whenever you’re ready.", Number(applied?.revision || revision), { savedPatch: applied?.savedPatch || immediatePatch, changedFields: applied?.changedFields || Object.keys(immediatePatch), undoToken: applied?.undoToken || null, verificationStatus: "partial", intake });
      await append(admin, rfqCaseId, user.id, "agent", result.reply); await finish(admin, turn.id, result, "settled", "deterministic_intake", startedAt);
      return reply(result);
    }
  }

  // OpenRouter enriches the RFQ assistant, but it must never be a required
  // hop for a buyer to continue. A recognised request with no new structured
  // value gets the next focused question immediately. Buyers can continue
  // adding requirements for as long as their RFQ remains a draft.
  const deterministicResult = output(
    "clarifying_question",
    immediateQuestion(intake.subtype),
    revision,
    { verificationStatus: "partial", intake },
  );
  await append(admin, rfqCaseId, user.id, "agent", deterministicResult.reply);
  await finish(admin, turn.id, deterministicResult, "settled", "deterministic_clarification", startedAt);
  return reply(deterministicResult);
}
