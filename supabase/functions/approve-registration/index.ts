import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, corsJson, preflight, requireAdmin, requireAllowedOrigin, siteUrl } from "../_shared/stripe.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_LOGO_URL = "https://bobwfxvxzjovpgmmqsew.supabase.co/storage/v1/object/public/uploads/system/branding/atelix-ai-horizontal-email-v1.png";
const SUPPORT_EMAIL = "info@atelix.app";

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

  const greeting = name.trim() ? `Hi ${name.trim()},` : "Hi there,";
  const safeGreeting = escapeHtml(greeting);
  const safeActionLink = escapeHtml(actionLink);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { padding: 30px 22px !important; }
        .email-logo { width: 184px !important; }
        .email-title { font-size: 36px !important; }
        .email-copy { font-size: 18px !important; }
        .email-button { display: block !important; padding: 19px 24px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#090d0a;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Atelix access has been approved. Create your password to continue.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td align="center" class="email-shell" style="padding:42px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;">
            <tr>
              <td style="padding-bottom:72px;">
                <img class="email-logo" src="${EMAIL_LOGO_URL}" width="220" alt="Atelix AI" style="display:block;width:220px;max-width:100%;height:auto;border:0;">
              </td>
            </tr>
            <tr>
              <td class="email-title" style="font-size:46px;font-weight:700;letter-spacing:-1.8px;line-height:1.08;padding-bottom:38px;">
                Create your Atelix password
              </td>
            </tr>
            <tr>
              <td class="email-copy" style="font-size:20px;line-height:1.5;padding-bottom:18px;">
                ${safeGreeting} 👋
              </td>
            </tr>
            <tr>
              <td class="email-copy" style="font-size:20px;line-height:1.5;padding-bottom:20px;">
                Your Atelix access has been approved.
              </td>
            </tr>
            <tr>
              <td class="email-copy" style="font-size:20px;line-height:1.5;padding-bottom:58px;">
                Create your password to open your sourcing workspace.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:58px;">
                <a class="email-button" href="${safeActionLink}" style="display:inline-block;background:#0b442d;color:#ffffff;padding:21px 44px;border-radius:14px;font-size:18px;font-weight:700;text-decoration:none;">
                  Create your password
                </a>
              </td>
            </tr>
            <tr>
              <td align="center" style="font-size:16px;line-height:1.55;color:#323a35;">
                This secure link will expire in 1 hour. If you were not expecting this invitation, you can ignore this email or contact
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#5f9342;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Create your Atelix password",
      text: `${greeting} 👋\n\nYour Atelix access has been approved. Create your password to open your sourcing workspace:\n${actionLink}\n\nThis secure link will expire in 1 hour. If you were not expecting this invitation, you can ignore this email or contact ${SUPPORT_EMAIL}.\n\nAtelix AI`,
      html,
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
