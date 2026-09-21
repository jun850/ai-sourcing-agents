import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, corsJson, preflight, requireAdmin, requireAllowedOrigin, siteUrl } from "../_shared/stripe.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

function atelixSender() {
  const from = Deno.env.get("RESEND_FROM")?.trim();
  if (!from) throw new Error("Invitation email delivery is not configured.");
  const address = from.match(/<([^>]+)>$/)?.[1]?.trim() || from;
  if (!/^[^\s@]+@atelix\.app$/i.test(address)) {
    throw new Error("Invitation email delivery must use a verified @atelix.app sender.");
  }
  return from;
}

async function createSetupLink(
  db: ReturnType<typeof admin>,
  request: { email: string; name: string; company_name: string; status: string },
  redirectTo: string,
) {
  const options = {
    redirectTo,
    data: { full_name: request.name, company_name: request.company_name },
  };
  const preferredType = request.status === "pending_review" ? "invite" : "recovery";
  let result = await db.auth.admin.generateLink({ type: preferredType, email: request.email, options });

  // A previous partially completed approval can leave an Auth user behind while
  // the registration request still says pending. Recovery safely resumes it.
  if (result.error && preferredType === "invite") {
    result = await db.auth.admin.generateLink({ type: "recovery", email: request.email, options });
  }
  if (result.error || !result.data.properties?.action_link) {
    throw new Error("Could not create a secure password setup link.");
  }
  return {
    actionLink: result.data.properties.action_link,
    authUserId: result.data.user.id,
    confirmedAt: result.data.user.email_confirmed_at,
  };
}

async function sendSetupEmail(name: string, email: string, actionLink: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = atelixSender();
  if (!resendKey) throw new Error("Invitation email delivery is not configured.");

  const greeting = name.trim() ? `Hi ${name.trim()},` : "Hi,";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Set up your Atelix account",
      text: `${greeting}\n\nYour Atelix access has been approved. Set up your password to open your sourcing workspace:\n${actionLink}\n\nThis secure link expires. If you were not expecting this email, you can ignore it.\n\nAtelix`,
      html: `<div style="background:#f4f7f3;padding:32px 16px;font-family:Arial,sans-serif;color:#202936"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:32px"><div style="font-size:22px;font-weight:700;letter-spacing:-.03em;color:#183d2d">atelix<span style="color:#5e8b68">.</span></div><p style="margin:28px 0 12px;line-height:1.6">${escapeHtml(greeting)}</p><p style="margin:0 0 24px;line-height:1.6">Your Atelix access has been approved. Set up your password to open your sourcing workspace.</p><p style="margin:0 0 28px"><a href="${escapeHtml(actionLink)}" style="display:inline-block;border-radius:999px;background:#183d2d;color:#fff;padding:13px 22px;font-weight:700;text-decoration:none">Set up your password</a></p><p style="margin:0;color:#687383;font-size:13px;line-height:1.55">This secure link expires. If you were not expecting this email, you can ignore it.</p></div></div>`,
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    console.error("Resend rejected registration email", response.status, responseText.slice(0, 500));
    throw new Error("The email provider rejected the password setup email. Please check the provider logs.");
  }
  let providerId = "";
  try { providerId = String(JSON.parse(responseText)?.id || ""); } catch { /* Resend returned a non-JSON success response. */ }
  console.info("Registration email accepted by provider", { requestEmail: email, providerId });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try { requireAllowedOrigin(req); } catch { return new Response("Origin not allowed", { status: 403, headers: { Vary: "Origin" } }); }
  if (req.method !== "POST") return corsJson(req, { error: "Method not allowed" }, 405);
  try {
    const reviewer = await requireAdmin(req);
    const input = await req.json() as { requestId?: unknown };
    const requestId = typeof input.requestId === "string" ? input.requestId : "";
    if (!UUID.test(requestId)) throw new Error("Invalid registration request.");
    const db = admin();
    const { data: request, error: lookupError } = await db.from("registration_requests").select("*").eq("id", requestId).maybeSingle();
    if (lookupError || !request || !["pending_review", "approved", "invited"].includes(request.status)) throw new Error("Registration request not available.");
    const redirectTo = `${siteUrl()}/auth/callback?next=${encodeURIComponent("/auth/set-password")}`;
    const setup = await createSetupLink(db, request, redirectTo);
    await sendSetupEmail(request.name, request.email, setup.actionLink);
    const now = new Date().toISOString();
    const { data: invited, error: updateError } = await db.from("registration_requests").update({
      status: setup.confirmedAt ? "accepted" : "invited",
      auth_user_id: setup.authUserId,
      accepted_at: setup.confirmedAt || null,
      reviewed_by: reviewer.id,
      reviewed_at: request.reviewed_at || now,
      invitation_requested_at: now,
      updated_at: now,
    }).eq("id", requestId).select("*").single();
    if (updateError || !invited) throw new Error("The provider accepted the invitation but the request could not be updated.");
    return corsJson(req, invited);
  } catch (error) { return corsJson(req, { error: error instanceof Error ? error.message : "Could not approve this request." }, 400); }
});
