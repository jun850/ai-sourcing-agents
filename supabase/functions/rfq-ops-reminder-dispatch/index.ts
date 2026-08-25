import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { siteUrl } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!Deno.env.get("RFQ_OPS_REMINDER_CRON_SECRET") || req.headers.get("x-rfq-ops-reminder-secret") !== Deno.env.get("RFQ_OPS_REMINDER_CRON_SECRET")) return new Response("Unauthorized", { status: 401 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.rpc("rfq_ops_claim_due_reply_reminders", { p_limit: 50 });
  if (error) return new Response(error.message, { status: 500 });
  const reminders = Array.isArray(data) ? data : [];
  const resendKey = Deno.env.get("RESEND_API_KEY");
  let processed = 0;
  for (const reminder of reminders) {
    const complete = (status: "sent" | "skipped" | "failed") => db.rpc("rfq_ops_complete_reply_reminder", { p_id: reminder.id, p_claim_token: reminder.claim_token, p_status: status });
    if (!reminder.recipient_email) { await complete("skipped"); processed++; continue; }
    if (!resendKey) { await complete("failed"); continue; }
    const href = `${siteUrl()}/${reminder.recipient_kind === "buyer" ? "dashboard" : "intools"}/messages/${reminder.rfq_case_id}`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") || "Atelix Messages <onboarding@resend.dev>", to: [reminder.recipient_email], subject: `Reply needed for ${reminder.case_no}`, html: `<p>A reply is waiting in your Atelix conversation for <b>${reminder.case_no}</b>.</p><p><a href="${href}">Open messages</a></p><p style="color:#667384;font-size:12px">Reply from Atelix; email replies are not monitored.</p>` }) });
    await complete(response.ok ? "sent" : "failed"); processed++;
  }
  return Response.json({ ok: true, processed });
});
