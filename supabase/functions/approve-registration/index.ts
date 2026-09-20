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
  return result.data.properties.action_link;
}

async function sendSetupEmail(email: string, actionLink: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (!resendKey || !from) throw new Error("Invitation email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Set up your Atelix account",
      text: `Your Atelix access has been approved. Set up your password: ${actionLink}`,
      html: `<p>Your Atelix access has been approved.</p><p><a href="${escapeHtml(actionLink)}">Set up your password</a></p><p>If you were not expecting this email, you can ignore it.</p>`,
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
    const actionLink = await createSetupLink(db, request, redirectTo);
    await sendSetupEmail(request.email, actionLink);
    const { data: invited, error: updateError } = await db.from("registration_requests").update({ status: "invited", reviewed_by: reviewer.id, reviewed_at: new Date().toISOString(), invitation_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", requestId).select("*").single();
    if (updateError || !invited) throw new Error("The provider accepted the invitation but the request could not be updated.");
    return corsJson(req, invited);
  } catch (error) { return corsJson(req, { error: error instanceof Error ? error.message : "Could not approve this request." }, 400); }
});
