import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, corsJson, preflight, requireAdmin, requireAllowedOrigin } from "../_shared/stripe.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AcceptedCandidate = {
  intake_id: string;
  supplier_id: string;
  email: string;
  contact_name: string;
  company_name: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

function uniqueCandidateIds(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Choose supplier candidates to accept.");
  const ids = [...new Set(value.filter((id): id is string => typeof id === "string" && UUID.test(id)))];
  if (ids.length !== value.length || ids.length < 1 || ids.length > 50) throw new Error("Choose 1 to 50 valid supplier candidates.");
  return ids.sort();
}

async function batchKey(ids: string[]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ids.join(",")));
  return `supplier-partner-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try { requireAllowedOrigin(req); } catch { return new Response("Origin not allowed", { status: 403, headers: { Vary: "Origin" } }); }
  if (req.method !== "POST") return corsJson(req, { error: "Method not allowed" }, 405);

  try {
    await requireAdmin(req);
    const input = await req.json() as { candidateIds?: unknown };
    const candidateIds = uniqueCandidateIds(input.candidateIds);
    const authorization = req.headers.get("authorization") || "";
    const userDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: review, error: reviewError } = await userDb.rpc("intools_accept_supplier_intakes", { p_candidate_ids: candidateIds });
    if (reviewError) throw new Error(reviewError.message);

    const accepted = (review?.accepted || []) as AcceptedCandidate[];
    const skipped = Array.isArray(review?.skipped) ? review.skipped : [];
    if (!accepted.length) return corsJson(req, { accepted: [], skipped, emailStatus: "not_sent" });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM");
    if (!resendKey || !from) {
      await admin().rpc("intools_record_supplier_partner_email", {
        p_candidate_ids: accepted.map((candidate) => candidate.intake_id),
        p_status: "failed",
        p_provider_ids: {},
        p_error: "Partner email delivery is not configured.",
      });
      throw new Error("Candidates were accepted, but partner email delivery is not configured. You can retry from the candidate record.");
    }

    const messages = accepted.map((candidate) => {
      const greeting = candidate.contact_name?.trim() ? `Hi ${candidate.contact_name.trim()},` : "Hello,";
      const text = `${greeting}\n\nCongratulations on becoming an Atelix partner. We will contact you separately regarding your first order.\n\nThe Atelix team`;
      return {
        from,
        to: [candidate.email],
        subject: "Welcome as an Atelix partner",
        text,
        html: `<p>${escapeHtml(greeting)}</p><p>Congratulations on becoming an Atelix partner. We will contact you separately regarding your first order.</p><p>The Atelix team</p>`,
      };
    });
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": await batchKey(candidateIds),
      },
      body: JSON.stringify(messages),
    });
    const responseText = await response.text();
    if (!response.ok) {
      console.error("Resend rejected supplier partner email batch", response.status, responseText.slice(0, 500));
      await admin().rpc("intools_record_supplier_partner_email", {
        p_candidate_ids: accepted.map((candidate) => candidate.intake_id),
        p_status: "failed",
        p_provider_ids: {},
        p_error: `Email provider rejected the request (${response.status}).`,
      });
      throw new Error("Candidates were accepted, but the partner email provider rejected delivery. You can retry from the candidate record.");
    }

    let providerRows: Array<{ id?: string }> = [];
    try { providerRows = JSON.parse(responseText)?.data || []; } catch { /* A successful provider response may omit JSON. */ }
    const providerIds = Object.fromEntries(accepted.map((candidate, index) => [candidate.intake_id, String(providerRows[index]?.id || "")]));
    const { error: recordError } = await admin().rpc("intools_record_supplier_partner_email", {
      p_candidate_ids: accepted.map((candidate) => candidate.intake_id),
      p_status: "sent",
      p_provider_ids: providerIds,
      p_error: null,
    });
    if (recordError) throw new Error("Partner emails were accepted by the provider, but delivery status could not be recorded.");
    return corsJson(req, { accepted, skipped, emailStatus: "sent" });
  } catch (error) {
    return corsJson(req, { error: error instanceof Error ? error.message : "Could not accept supplier candidates." }, 400);
  }
});
