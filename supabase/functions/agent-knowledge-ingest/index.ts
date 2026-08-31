import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import * as XLSX from "npm:xlsx@0.18.5";
import pdf from "npm:pdf-parse@1.1.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_CHUNK = 3800;
const textTypes = new Set(["text/plain", "text/markdown", "text/csv"]);
const spreadsheetTypes = new Set(["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfType = "application/pdf";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}
function chunks(source: string) {
  const normalized = source.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const result: string[] = [];
  let rest = normalized;
  while (rest) {
    if (rest.length <= MAX_CHUNK) { result.push(rest); break; }
    const window = rest.slice(0, MAX_CHUNK + 1);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf(" "));
    const at = cut > Math.floor(MAX_CHUNK * 0.55) ? cut + 1 : MAX_CHUNK;
    result.push(rest.slice(0, at).trim()); rest = rest.slice(at).trim();
  }
  return result.filter(Boolean);
}
function decodeXml(value: string) {
  return value.replace(/<w:tab\/>/g, "\t").replace(/<w:br\s*\/?>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
}
async function embeddings(parts: string[]) {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("Knowledge embeddings are not configured.");
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, dimensions: 384, input: parts }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.data)) throw new Error("Knowledge embeddings could not be created.");
  const result = payload.data.sort((a: any, b: any) => a.index - b.index).map((item: any) => item.embedding);
  if (result.length !== parts.length || result.some((item: unknown) => !Array.isArray(item) || item.length !== 384)) throw new Error("Knowledge embeddings were incomplete.");
  return result;
}
async function extract(blob: Blob, contentType: string) {
  if (textTypes.has(contentType)) return await blob.text();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (spreadsheetTypes.has(contentType)) {
    const workbook = XLSX.read(bytes, { type: "array" });
    return workbook.SheetNames.map((name) => `# ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n\n");
  }
  if (contentType === docxType) {
    const archive = await JSZip.loadAsync(bytes);
    const xml = await archive.file("word/document.xml")?.async("text");
    if (!xml) throw new Error("The DOCX file has no readable document text.");
    return decodeXml(xml);
  }
  if (contentType === pdfType) {
    const result = await (pdf as any)(bytes);
    return typeof result?.text === "string" ? result.text : "";
  }
  if (contentType === "application/msword") throw new Error("Legacy .doc extraction is not supported safely. Export this document as DOCX, PDF, or TXT and retry.");
  throw new Error("This file format cannot be extracted.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !key) return json({ ok: false, reason: "unauthorized" }, 401);
  const admin = createClient(url, key);
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user || !user.email_confirmed_at) return json({ ok: false, reason: "unauthorized" }, 401);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return json({ ok: false, reason: "forbidden" }, 403);
  let body: { versionId?: unknown };
  try { body = await request.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }
  if (!validUuid(body.versionId)) return json({ ok: false, reason: "invalid_version" }, 400);

  const { data: version } = await admin.from("agent_knowledge_versions").select("id,storage_path,content_type,status").eq("id", body.versionId).maybeSingle();
  if (!version || !["uploaded", "failed"].includes(version.status)) return json({ ok: false, reason: "version_not_ingestable" }, 409);
  await admin.from("agent_knowledge_versions").update({ status: "processing", extraction_error: null, updated_at: new Date().toISOString() }).eq("id", version.id);
  const { data: blob, error: downloadError } = await admin.storage.from("agent-knowledge").download(version.storage_path);
  if (downloadError || !blob) {
    await admin.from("agent_knowledge_versions").update({ status: "failed", extraction_error: "The registered storage object could not be downloaded.", updated_at: new Date().toISOString() }).eq("id", version.id);
    return json({ ok: false, reason: "object_unavailable" }, 422);
  }
  let source = "";
  try { source = await extract(blob, version.content_type); }
  catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Knowledge extraction failed.";
    await admin.from("agent_knowledge_versions").update({ status: "failed", extraction_error: message, updated_at: new Date().toISOString() }).eq("id", version.id);
    return json({ ok: false, reason: "unsupported_extraction", message }, 422);
  }
  const parts = chunks(source);
  if (!parts.length) {
    await admin.from("agent_knowledge_versions").update({ status: "failed", extraction_error: "No searchable text was found in this document.", updated_at: new Date().toISOString() }).eq("id", version.id);
    return json({ ok: false, reason: "no_text" }, 422);
  }
  try {
    // Store deterministic chunks plus embeddings. Hybrid retrieval still falls
    // back to full-text ranking when a legacy chunk has no vector.
    const { error: clearError } = await admin.from("agent_knowledge_chunks").delete().eq("version_id", version.id);
    if (clearError) throw clearError;
    const vectors = await embeddings(parts);
    const { error: insertError } = await admin.from("agent_knowledge_chunks").insert(parts.map((content, chunk_no) => ({ version_id: version.id, chunk_no, content, embedding: vectors[chunk_no] })));
    if (insertError) throw insertError;
    const { error: readyError } = await admin.from("agent_knowledge_versions").update({ status: "ready", extraction_error: null, updated_at: new Date().toISOString() }).eq("id", version.id);
    if (readyError) throw readyError;
    return json({ ok: true, versionId: version.id, status: "ready", chunkCount: parts.length });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Knowledge extraction failed.";
    await admin.from("agent_knowledge_versions").update({ status: "failed", extraction_error: message, updated_at: new Date().toISOString() }).eq("id", version.id);
    return json({ ok: false, reason: "ingestion_failed", message }, 422);
  }
});
