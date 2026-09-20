import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, corsJson, preflight, requireAdmin, requireAllowedOrigin, siteUrl } from "../_shared/stripe.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (request.status === "invited") {
      const { error: resendError } = await db.auth.resetPasswordForEmail(request.email, { redirectTo });
      if (resendError) throw new Error("Could not resend the password setup email.");
      const { data: resent, error: updateError } = await db.from("registration_requests").update({ invitation_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", requestId).select("*").single();
      if (updateError || !resent) throw new Error("The password setup email was sent but the request could not be updated.");
      return corsJson(req, resent);
    }
    const { error: inviteError } = await db.auth.admin.inviteUserByEmail(request.email, {
      data: { full_name: request.name, company_name: request.company_name },
      redirectTo,
    });
    if (inviteError) throw new Error("Could not send the user invitation.");
    const { data: invited, error: updateError } = await db.from("registration_requests").update({ status: "invited", reviewed_by: reviewer.id, reviewed_at: new Date().toISOString(), invitation_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", requestId).select("*").single();
    if (updateError || !invited) throw new Error("Invitation was sent but the request could not be updated.");
    return corsJson(req, invited);
  } catch (error) { return corsJson(req, { error: error instanceof Error ? error.message : "Could not approve this request." }, 400); }
});
