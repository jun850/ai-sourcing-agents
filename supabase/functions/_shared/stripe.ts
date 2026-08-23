import { createClient } from "jsr:@supabase/supabase-js@2";

// Auth is enforced per function. Allow local ports during sandbox work without
// coupling the browser's development port to an Edge Function deployment.
export const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
export const mode = () => {
  const value = Deno.env.get("STRIPE_MODE");
  if (value !== "test" && value !== "live") throw new Error("Stripe mode is not configured safely");
  return value;
};
export const stripeKey = () => {
  const key = Deno.env.get("STRIPE_SECRET_API_KEY");
  if (!key) throw new Error("Stripe secret key is not configured");
  if ((mode() === "live") !== key.startsWith("sk_live_")) throw new Error("Stripe secret key does not match configured mode");
  return key;
};
export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
export async function userFrom(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}
export async function requireAdmin(req: Request) {
  const user = await userFrom(req);
  if (!user.email_confirmed_at) throw new Error("Forbidden");
  const { data } = await admin().from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "admin") throw new Error("Forbidden");
  return user;
}
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
  const url = `${Deno.env.get("SITE_URL") || "http://localhost:8090"}/pages/order.html?no=${encodeURIComponent(details.orderNo)}`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") || "Atelix Orders <onboarding@resend.dev>", to: [details.email], subject, html: `<p>Hi ${details.name || "there"},</p><p>${message}</p><p>Order: <b>${details.orderNo}</b></p>${details.invoiceUrl ? `<p><a href="${details.invoiceUrl}">View invoice</a></p>` : ""}<p><a href="${url}">View your order</a></p>` }) });
  const output = await response.json().catch(() => ({}));
  await db.from("payment_notifications").update(response.ok ? { sent_at: new Date().toISOString(), provider_message_id: output.id || null } : { error: "Email provider rejected notification" }).eq("event_key", key);
}
