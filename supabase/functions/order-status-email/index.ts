import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { siteUrl } from "../_shared/stripe.ts";
import { requireAdmin } from "../_shared/auth.ts";

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  payment_declared: "Payment declared",
  payment_verified: "Payment verified",
  fulfilling: "In fulfillment",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
  refunded: "Refunded",
};

// Admin-only: sends a transactional order-status-change email via Resend.
// Caller's JWT is verified by the platform (verify_jwt=true); we additionally
// check profiles.role='admin' with a service-role client so a non-admin
// authenticated user can't use this endpoint to spam arbitrary emails.
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    await requireAdmin(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    return new Response(message, { status: message === "Unauthorized" ? 401 : 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const { orderNo, status, buyerEmail, buyerName, total, note } = body || {};
  if (!orderNo || !status || !buyerEmail) {
    return new Response("Missing fields", { status: 400 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    // Not configured yet — status change already committed server-side; email is best-effort.
    return new Response(JSON.stringify({ ok: false, reason: "email_not_configured" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }

  const label = STATUS_LABEL[status] || status;
  const appUrl = siteUrl();

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "Atelix Orders <onboarding@resend.dev>",
      to: [buyerEmail],
      subject: `Order ${orderNo} — ${label}`,
      html: `<p>Hi ${buyerName || "there"},</p>` +
        `<p>Your Atelix order <b>${orderNo}</b> status has been updated to <b>${label}</b>.</p>` +
        (note ? `<p>Note: ${note}</p>` : "") +
        `<p>Total: US$${Number(total || 0).toFixed(2)}</p>` +
        `<p><a href="${appUrl}/pages/order.html?no=${orderNo}">View your order</a></p>`,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return new Response(`Email send failed: ${errText}`, { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
