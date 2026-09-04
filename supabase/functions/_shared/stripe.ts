import { admin } from "./auth.ts";
export { admin, userFrom, requireAdmin } from "./auth.ts";

const LOCAL_ORIGINS = new Set([
  "http://127.0.0.1:3000", "http://localhost:3000",
  "http://127.0.0.1:4173", "http://localhost:4173",
  "http://127.0.0.1:5173", "http://localhost:5173",
  "http://127.0.0.1:8090", "http://localhost:8090",
  "http://127.0.0.1:8091", "http://localhost:8091",
]);
const localEdgeMode = () => Deno.env.get("ATELIX_LOCAL_EDGE") === "1";

export const siteUrl = () => {
  const raw = Deno.env.get("SITE_URL")?.trim();
  if (!raw) throw new Error("SITE_URL is required");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("SITE_URL is invalid"); }
  if (url.origin !== raw.replace(/\/$/, "")) throw new Error("SITE_URL must be an origin");
  if (localEdgeMode()) {
    if (!LOCAL_ORIGINS.has(url.origin)) throw new Error("Local SITE_URL is not an allowed origin");
  } else if (url.protocol !== "https:" || LOCAL_ORIGINS.has(url.origin)) {
    throw new Error("SITE_URL must be a non-local HTTPS origin");
  }
  return url.origin;
};

const allowedOrigin = (origin: string) => origin === siteUrl()
  || (localEdgeMode() && LOCAL_ORIGINS.has(origin));
export const requireAllowedOrigin = (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(origin)) throw new Error("Origin not allowed");
};
export const corsHeaders = (req: Request) => {
  const origin = req.headers.get("origin");
  return origin && allowedOrigin(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" }
    : { "Vary": "Origin" };
};
export const preflight = (req: Request) => {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigin(origin)) return new Response("Origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
  return new Response(null, { status: 204, headers: corsHeaders(req) });
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const corsJson = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
export const mode = () => {
  const value = Deno.env.get("STRIPE_MODE");
  if (value !== "test" && value !== "live") throw new Error("Stripe mode is not configured safely");
  return value;
};
export const stripeKey = () => {
  const key = Deno.env.get("STRIPE_SECRET_API_KEY");
  if (!key) throw new Error("Stripe secret key is not configured");
  const expectedPrefix = mode() === "live" ? "sk_live_" : "sk_test_";
  if (!key.startsWith(expectedPrefix)) throw new Error("Stripe secret key does not match configured mode");
  return key;
};
export async function stripe(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${stripeKey()}`, "Stripe-Version": "2026-07-29.dahlia", ...(init.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Stripe request failed");
  return body;
}
export const cents = (amount: number) => Math.round(Number(amount || 0) * 100);
export async function deliver(paymentId: string, key: string, kind: "payment_succeeded" | "payment_failed" | "refund_succeeded", details: { email: string; name?: string; orderNo: string; amount: number; invoiceUrl?: string | null }) {
  const db = admin();
  const { error } = await db.from("payment_notifications").insert({ payment_id: paymentId, event_key: key, kind, recipient_email: details.email });
  if (error) return; // duplicate/retry is intentionally silent
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;
  const subject = kind === "payment_succeeded" ? `Payment confirmed — ${details.orderNo}` : kind === "payment_failed" ? `Payment needs attention — ${details.orderNo}` : `Refund confirmed — ${details.orderNo}`;
  const message = kind === "payment_succeeded" ? `We received your payment of US$${details.amount.toFixed(2)}.` : kind === "payment_failed" ? "Your payment did not complete. You can safely try again from your order." : `Your refund of US$${details.amount.toFixed(2)} has been confirmed.`;
  const url = `${siteUrl()}/pages/order.html?no=${encodeURIComponent(details.orderNo)}`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") || "Atelix Orders <onboarding@resend.dev>", to: [details.email], subject, html: `<p>Hi ${details.name || "there"},</p><p>${message}</p><p>Order: <b>${details.orderNo}</b></p>${details.invoiceUrl ? `<p><a href="${details.invoiceUrl}">View invoice</a></p>` : ""}<p><a href="${url}">View your order</a></p>` }) });
  const output = await response.json().catch(() => ({}));
  await db.from("payment_notifications").update(response.ok ? { sent_at: new Date().toISOString(), provider_message_id: output.id || null } : { error: "Email provider rejected notification" }).eq("event_key", key);
}
