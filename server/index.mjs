import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";

if (process.env.NODE_ENV !== "production") {
  const envPath = new URL("../.env.local", import.meta.url);
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
    }
  }
}

const app = express();
const port = Number(process.env.ATELIX_API_PORT || 3001);
const host = process.env.ATELIX_API_HOST || "127.0.0.1";
if (process.env.NODE_ENV === "production" || !["127.0.0.1", "::1"].includes(host)) {
  throw new Error("The Phase 1 review server is development-only and must bind to loopback.");
}
app.get("/health", (_, res) => res.json({ ok: true, service: "atelix-local-intools-seam" }));
app.use(express.json({ limit: "32kb" }));

const localIntoolsEnabled = process.env.NODE_ENV !== "production"
  && process.env.ATELIX_LOCAL_INTOOLS === "1"
  && ["127.0.0.1", "::1"].includes(host);
const localConfig = {
  url: process.env.ATELIX_LOCAL_SUPABASE_URL,
  key: process.env.ATELIX_LOCAL_SUPABASE_PUBLISHABLE_KEY,
  adminEmail: process.env.ATELIX_LOCAL_ADMIN_EMAIL,
  adminProfileId: process.env.ATELIX_LOCAL_ADMIN_PROFILE_ID,
  adminSupabasePassword: process.env.ATELIX_LOCAL_ADMIN_SUPABASE_PASSWORD,
  cookieSecret: process.env.ATELIX_LOCAL_INTOOLS_COOKIE_SECRET,
};
const cookieName = "atelix_local_intools";
const allowedRpcs = new Set([
  "intools_list_invoices", "intools_get_invoice_detail", "intools_create_invoice",
  "intools_update_invoice", "intools_send_invoice", "intools_cancel_invoice",
  "intools_record_manual_payment", "intools_list_orders", "intools_get_order_detail", "admin_update_order_status",
  "intools_list_audit",
  "intools_list_suppliers", "intools_get_supplier_detail", "intools_save_supplier",
  "intools_save_supplier_with_images", "intools_archive_supplier",
  "intools_supplier_import_dry_run", "intools_promote_supplier_import_rows",
  "intools_promote_supplier_intake", "intools_set_supplier_broker_status",
  "intools_generate_rfq_supplier_matches", "intools_set_rfq_supplier_match_status",
  "intools_list_buyer_conversations", "intools_get_buyer_conversation",
  "intools_list_buyer_messages", "intools_send_buyer_message",
  "rfq_ops_get_message",
  "intools_mark_buyer_conversation_read", "intools_get_buyer_unread_count",
  "intools_notification_center", "intools_notification_unread_count",
  "intools_reserve_buyer_upload",
  "intools_list_agent_knowledge", "intools_create_agent_knowledge_version",
  "intools_publish_agent_knowledge_version", "intools_archive_agent_knowledge_document",
]);
function configured() { return localIntoolsEnabled && Object.values(localConfig).every(Boolean) && localConfig.cookieSecret.length >= 32; }
function base64url(value) { return Buffer.from(value).toString("base64url"); }
function sign(value) { return crypto.createHmac("sha256", localConfig.cookieSecret).update(value).digest("base64url"); }
function readCookie(request) {
  const match = request.headers.cookie?.split(/;\s*/).find((item) => item.startsWith(`${cookieName}=`));
  if (!match || !configured()) return null;
  const [payload, signature] = decodeURIComponent(match.slice(cookieName.length + 1)).split(".");
  const expected = payload ? sign(payload) : "";
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()); return parsed.sub === localConfig.adminProfileId && Number.isInteger(parsed.exp) && parsed.exp > Math.floor(Date.now() / 1000) ? parsed : null; } catch { return null; }
}
function setCookie(response) {
  const payload = base64url(JSON.stringify({ sub: localConfig.adminProfileId, exp: Math.floor(Date.now() / 1000) + 600 }));
  response.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(`${payload}.${sign(payload)}`)}; Path=/api/intools; HttpOnly; SameSite=Strict; Max-Age=600`);
}
async function checkedAdminToken() {
  const tokenResponse = await fetch(`${localConfig.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: localConfig.key, "Content-Type": "application/json" }, body: JSON.stringify({ email: localConfig.adminEmail, password: localConfig.adminSupabasePassword }) });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || token.user?.id !== localConfig.adminProfileId || !token.access_token) throw new Error("Local admin mapping is unavailable.");
  const profileResponse = await fetch(`${localConfig.url}/rest/v1/profiles?select=id,role&id=eq.${encodeURIComponent(localConfig.adminProfileId)}`, { headers: { apikey: localConfig.key, Authorization: `Bearer ${token.access_token}` } });
  const profiles = await profileResponse.json();
  if (!profileResponse.ok || profiles.length !== 1 || profiles[0].id !== localConfig.adminProfileId || profiles[0].role !== "admin") throw new Error("Local admin role is unavailable.");
  return token.access_token;
}
if (localIntoolsEnabled) {
  app.get("/api/intools/session", async (request, response) => {
    if (!configured()) return response.status(404).end();
    if (!readCookie(request)) return response.status(401).json({ localAdmin: false });
    try { await checkedAdminToken(); return response.setHeader("Cache-Control", "no-store").json({ localAdmin: true }); }
    catch { return response.status(401).json({ localAdmin: false }); }
  });
  app.post("/api/intools/login", (request, response) => {
    if (!configured()) return response.status(404).end();
    const { username, password } = request.body ?? {};
    if (username !== "admin" || password !== "123456") return response.status(401).json({ error: "Invalid local administrator credentials." });
    setCookie(response); return response.setHeader("Cache-Control", "no-store").json({ localAdmin: true });
  });
  // This is intentionally loopback-only and protected by the short-lived
  // HttpOnly local review cookie. It lets the local Intools seam authorize a
  // private Supabase Realtime channel without exposing a service credential.
  app.get("/api/intools/realtime-token", async (request, response) => {
    if (!configured()) return response.status(404).end();
    if (!readCookie(request)) return response.status(401).json({ error: "Intools unavailable." });
    try {
      const accessToken = await checkedAdminToken();
      return response.setHeader("Cache-Control", "no-store").json({ accessToken });
    } catch (error) {
      return response.status(403).json({ error: error instanceof Error ? error.message : "Intools unavailable." });
    }
  });
  app.post("/api/intools/rpc", async (request, response) => {
    if (!configured()) return response.status(404).end();
    const { name, args = {} } = request.body ?? {};
    if (!readCookie(request) || !allowedRpcs.has(name) || !args || typeof args !== "object" || Array.isArray(args)) return response.status(401).json({ error: "Intools unavailable." });
    try {
      const accessToken = await checkedAdminToken();
      const rpcResponse = await fetch(`${localConfig.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: localConfig.key, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
      const data = await rpcResponse.json();
      return response.setHeader("Cache-Control", "no-store").status(rpcResponse.status).json(data);
    } catch (error) { return response.status(403).json({ error: error instanceof Error ? error.message : "Intools unavailable." }); }
  });
}
app.use((_, res) => res.status(404).json({ error: "No product API is served locally. Use Supabase." }));

app.listen(port, host, () => console.log(`Atelix development review API listening on http://${host}:${port}`));
