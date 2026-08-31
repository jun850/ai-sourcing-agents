import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import pdf from "npm:pdf-parse@1.1.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_EXTRACTED_TEXT = 12_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}
function clean(value: string) {
  return value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_EXTRACTED_TEXT);
}
function modelText(value: unknown) {
  const content = (value as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === "string" ? part.text : "").join("\n");
  return "";
}

async function readPdf(blob: Blob) {
  const result = await (pdf as unknown as (bytes: Uint8Array) => Promise<{ text?: string }>)(new Uint8Array(await blob.arrayBuffer()));
  return clean(result?.text || "");
}

async function readImageWithOpenRouter(admin: ReturnType<typeof createClient>, storagePath: string, contentType: string) {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("Reference OCR is not configured.");
  const { data: signed, error: signedError } = await admin.storage.from("rfq-attachments").createSignedUrl(storagePath, 120);
  if (signedError || !signed?.signedUrl) throw new Error("The reference image could not be opened.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENROUTER_VISION_MODEL") || "@preset/marketplace-copilot",
        temperature: 0,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: "You extract reference evidence for a sourcing RFQ. Describe only text, labels, tables, and visual attributes plainly visible in the supplied image. Preserve wording and units. Do not infer material, composition, weight, dimensions, certification, supplier, price, MOQ, capacity, availability, or payment terms unless they are explicitly shown. For a tech-pack page, transcribe BOM or bill-of-material lines and their stated quantities/units. Return concise plain text, not advice.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Read this ${contentType} reference for the buyer's RFQ.` },
              { type: "image_url", image_url: { url: signed.signedUrl } },
            ],
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Reference OCR could not read this image.");
    const extracted = clean(modelText(payload));
    if (!extracted) throw new Error("No readable reference details were returned.");
    return extracted;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !supabaseUrl || !serviceKey) return json({ ok: false, reason: "unauthorized" }, 401);
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ ok: false, reason: "unauthorized" }, 401);
  let body: { caseId?: unknown; attachmentId?: unknown };
  try { body = await request.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }
  if (!uuid(body.caseId) || !uuid(body.attachmentId)) return json({ ok: false, reason: "invalid_request" }, 400);
  const { data: attachment } = await admin
    .from("rfq_attachments")
    .select("id,rfq_case_id,owner_profile_id,storage_path,content_type,extraction_status,extracted_text")
    .eq("id", body.attachmentId)
    .eq("rfq_case_id", body.caseId)
    .eq("owner_profile_id", user.id)
    .maybeSingle();
  if (!attachment) return json({ ok: false, reason: "attachment_not_found" }, 404);
  if (attachment.extraction_status === "ready") return json(attachment);
  if (!["application/pdf", ...IMAGE_TYPES].includes(attachment.content_type)) return json({ ok: false, reason: "unsupported_reference" }, 422);
  await admin.from("rfq_attachments").update({ extraction_status: "processing", extraction_error: null }).eq("id", attachment.id);
  try {
    const { data: blob, error: downloadError } = await admin.storage.from("rfq-attachments").download(attachment.storage_path);
    if (downloadError || !blob) throw new Error("The reference file could not be opened.");
    const extractedText = attachment.content_type === "application/pdf"
      ? await readPdf(blob)
      : await readImageWithOpenRouter(admin, attachment.storage_path, attachment.content_type);
    if (!extractedText) throw new Error("No readable text was found in this reference.");
    const { data: saved, error: saveError } = await admin
      .from("rfq_attachments")
      .update({ extraction_status: "ready", extracted_text: extractedText, extraction_error: null, extracted_at: new Date().toISOString() })
      .eq("id", attachment.id)
      .select()
      .single();
    if (saveError || !saved) throw saveError || new Error("The extracted reference could not be saved.");
    return json(saved);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 1000) : "Reference extraction failed.";
    await admin.from("rfq_attachments").update({ extraction_status: "failed", extraction_error: message }).eq("id", attachment.id);
    return json({ ok: false, reason: "extraction_failed" }, 422);
  }
});
