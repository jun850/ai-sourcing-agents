import { admin, deliver, json, mode, stripe } from "../_shared/stripe.ts";

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, "0")).join("");
}
function equal(a: string, b: string) { if (a.length !== b.length) return false; let result = 0; for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index); return result === 0; }
async function verify(req: Request, raw: string) {
  const header = req.headers.get("stripe-signature") || "";
  const timestamp = header.match(/t=(\d+)/)?.[1];
  const signatures = [...header.matchAll(/v1=([^,]+)/g)].map(match => match[1]);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret || !timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error("Invalid webhook signature");
  const expected = await hmac(secret, `${timestamp}.${raw}`);
  if (!signatures.some(signature => equal(signature, expected))) throw new Error("Invalid webhook signature");
}
const text = (value: unknown) => typeof value === "string" ? value : "";

async function settleInvoice(db: ReturnType<typeof admin>, session: Record<string, unknown>, environment: string) {
  const attemptId = text((session.metadata as Record<string, unknown> | undefined)?.invoice_checkout_attempt_id);
  if (!attemptId) return false;
  const { error } = await db.rpc("invoice_checkout_settle_attempt", {
    p_attempt_id: attemptId,
    p_session_id: text(session.id),
    p_payment_intent_id: text(session.payment_intent),
    p_stripe_invoice_id: text(session.invoice),
    p_amount_cents: Number(session.amount_total),
    p_environment: environment,
  });
  if (error) throw error;
  return true;
}

async function closeInvoice(db: ReturnType<typeof admin>, session: Record<string, unknown>, state: "failed" | "expired") {
  const attemptId = text((session.metadata as Record<string, unknown> | undefined)?.invoice_checkout_attempt_id);
  if (!attemptId) return false;
  const { error } = await db.rpc("invoice_checkout_close_attempt", { p_attempt_id: attemptId, p_session_id: text(session.id), p_state: state });
  if (error) throw error;
  return true;
}

async function transitionOrderPayment(db: ReturnType<typeof admin>, session: Record<string, unknown>, eventType: string, environment: string) {
  const sessionId = text(session.id);
  const { data: payment, error: paymentError } = await db.from("stripe_payments").select("*,orders!inner(order_no,buyer_profile_id)").eq("stripe_checkout_session_id", sessionId).maybeSingle();
  if (paymentError || !payment || payment.environment !== environment) throw paymentError || new Error("Unknown payment session");
  const paid = eventType === "checkout.session.completed" ? ["paid", "no_payment_required"].includes(text(session.payment_status)) : eventType === "checkout.session.async_payment_succeeded";
  const terminal = eventType === "checkout.session.async_payment_failed" ? "failed" : eventType === "checkout.session.expired" ? "expired" : null;
  if (!paid && !terminal) return;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (paid) {
    update.state = "paid";
    update.stripe_payment_intent_id = text(session.payment_intent) || null;
    update.stripe_invoice_id = text(session.invoice) || null;
    if (session.invoice) {
      const stripeInvoice = await stripe(`/invoices/${session.invoice}`);
      update.invoice_url = stripeInvoice.hosted_invoice_url || null;
      update.invoice_pdf_url = stripeInvoice.invoice_pdf || null;
    }
    const { data: advanced, error: updateError } = await db.from("stripe_payments").update(update).eq("id", payment.id).in("state", ["checkout_created", "processing", "failed", "expired"]).select("id").maybeSingle();
    if (updateError) throw updateError;
    if (!advanced) return;
    const { error: orderError } = await db.from("orders").update({ status: "payment_verified", payment_verified_at: new Date().toISOString() }).eq("id", payment.order_id).neq("status", "refunded");
    if (orderError) throw orderError;
    const buyer = (await db.auth.admin.getUserById(payment.orders.buyer_profile_id)).data.user;
    if (buyer?.email) await deliver(payment.id, `payment:${sessionId}`, "payment_succeeded", { email: buyer.email, name: buyer.user_metadata?.full_name, orderNo: payment.orders.order_no, amount: payment.net_amount_cents / 100, invoiceUrl: update.invoice_url as string | null });
  } else {
    // Failure/expiry are monotonic only until payment succeeds; late events cannot downgrade paid.
    const { error: updateError } = await db.from("stripe_payments").update({ state: terminal, updated_at: new Date().toISOString() }).eq("id", payment.id).in("state", ["checkout_created", "processing"]);
    if (updateError) throw updateError;
  }
}

async function processRefund(db: ReturnType<typeof admin>, object: Record<string, unknown>, environment: string) {
  const paymentIntent = text(object.payment_intent) || text(object.payment_intent_id);
  const refundId = text(object.id);
  if (!paymentIntent || !refundId) throw new Error("Invalid Stripe refund event");
  if (object.object === "refund") {
    const status = ["pending", "succeeded", "failed", "canceled"].includes(text(object.status)) ? text(object.status) : "pending";
    const requestKey = text((object.metadata as Record<string, unknown> | undefined)?.invoice_refund_request_id) || null;
    const { error: invoiceError } = await db.rpc("invoice_record_stripe_refund", { p_payment_intent_id: paymentIntent, p_stripe_refund_id: refundId, p_amount_cents: Number(object.amount), p_status: status, p_environment: environment, p_request_key: requestKey });
    if (!invoiceError) return;
    if (invoiceError.code !== "P0002") throw invoiceError;
  }
  const { data: payment, error: paymentError } = await db.from("stripe_payments").select("*,orders!inner(order_no,buyer_profile_id)").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
  if (paymentError || !payment || payment.environment !== environment) throw paymentError || new Error("Unknown refund payment");
  let total: number;
  if (object.object === "refund") {
    const status = ["succeeded", "failed", "canceled"].includes(text(object.status)) ? text(object.status) : "pending";
    const { error: refundError } = await db.from("stripe_refunds").update({ status, updated_at: new Date().toISOString() }).eq("stripe_refund_id", refundId);
    if (refundError) throw refundError;
    const { data: refunds, error: refundsError } = await db.from("stripe_refunds").select("amount_cents").eq("payment_id", payment.id).eq("status", "succeeded");
    if (refundsError) throw refundsError;
    total = (refunds || []).reduce((sum, refund) => sum + Number(refund.amount_cents), 0);
  } else {
    total = Number(object.amount_refunded || 0);
  }
  if (!Number.isInteger(total) || total < 0 || total > payment.net_amount_cents) throw new Error("Invalid Stripe refund amount");
  if (total === Number(payment.refunded_amount_cents || 0)) return;
  const state = total >= payment.net_amount_cents ? "refunded" : "partially_refunded";
  const { error: updateError } = await db.from("stripe_payments").update({ refunded_amount_cents: total, state, updated_at: new Date().toISOString() }).eq("id", payment.id).in("state", ["paid", "partially_refunded", "refunded"]);
  if (updateError) throw updateError;
  if (state === "refunded") {
    const { error: orderError } = await db.from("orders").update({ status: "refunded" }).eq("id", payment.order_id);
    if (orderError) throw orderError;
  }
}

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();
  let eventId = "";
  let db: ReturnType<typeof admin> | null = null;
  try {
    await verify(req, raw);
    const event = JSON.parse(raw) as { id?: string; type?: string; livemode?: boolean; data?: { object?: Record<string, unknown> } };
    eventId = text(event.id);
    const eventType = text(event.type);
    const environment = mode();
    if (!eventId || !eventType || Boolean(event.livemode) !== (environment === "live")) throw new Error("Webhook mode mismatch");
    db = admin();
    const { data: claimed, error: claimError } = await db.rpc("stripe_claim_webhook_event", { p_event_id: eventId, p_environment: environment, p_event_type: eventType });
    if (claimError) throw claimError;
    if (!claimed) return json({ received: true, duplicate: true });
    const object = event.data?.object || {};
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(eventType)) {
      const settled = eventType !== "checkout.session.completed" || ["paid", "no_payment_required"].includes(text(object.payment_status));
      if (settled) {
        const invoiceHandled = await settleInvoice(db, object, environment);
        if (!invoiceHandled) await transitionOrderPayment(db, object, eventType, environment);
      }
    } else if (["checkout.session.async_payment_failed", "checkout.session.expired"].includes(eventType)) {
      const invoiceHandled = await closeInvoice(db, object, eventType.endsWith("expired") ? "expired" : "failed");
      if (!invoiceHandled) await transitionOrderPayment(db, object, eventType, environment);
    } else if (["charge.refunded", "refund.updated"].includes(eventType)) {
      await processRefund(db, object, environment);
    }
    const { error: finishError } = await db.rpc("stripe_finish_webhook_event", { p_event_id: eventId, p_processed: true, p_error: null });
    if (finishError) throw finishError;
    return json({ received: true });
  } catch (error) {
    if (db && eventId) await db.rpc("stripe_finish_webhook_event", { p_event_id: eventId, p_processed: false, p_error: error instanceof Error ? error.message : "Stripe event processing failed" });
    console.error("stripe-webhook", error instanceof Error ? error.message : "unknown");
    return json({ error: "Webhook rejected" }, 400);
  }
});
