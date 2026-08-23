import { admin, cors, json, mode, requireAdmin, stripe } from "../_shared/stripe.ts";

type RefundRequest =
  | { kind?: "order"; orderNo: string; amountCents: number; reason: string }
  | { kind: "invoice"; invoicePaymentId: string; amountCents: number; reason: string };

async function invoiceRefund(userId: string, input: Extract<RefundRequest, { kind: "invoice" }>) {
  const db = admin();
  const { data: prepared, error: prepareError } = await db.rpc("invoice_refund_prepare", { p_invoice_payment_id: input.invoicePaymentId, p_amount_cents: input.amountCents, p_environment: mode() });
  if (prepareError || !prepared?.requestKey || !prepared?.paymentIntentId) throw prepareError || new Error("This invoice payment is not refundable");
  try {
    const refund = await stripe("/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `atelix-invoice-refund-v1-${prepared.requestKey}` },
      body: new URLSearchParams({ payment_intent: prepared.paymentIntentId, amount: String(input.amountCents), reason: "requested_by_customer", "metadata[invoice_refund_request_id]": prepared.requestKey }),
    });
    const status = ["succeeded", "failed", "canceled"].includes(refund.status) ? refund.status : "pending";
    const { error: recordError } = await db.rpc("invoice_record_stripe_refund", { p_payment_intent_id: prepared.paymentIntentId, p_stripe_refund_id: refund.id, p_amount_cents: input.amountCents, p_status: status, p_environment: mode(), p_request_key: prepared.requestKey });
    if (recordError) throw recordError;
    return json({ refund, requestedBy: userId });
  } catch (error) {
    const { error: closeError } = await db.rpc("invoice_refund_fail_request", { p_request_key: prepared.requestKey });
    if (closeError) throw closeError;
    throw error;
  }
}

async function orderRefund(userId: string, input: Extract<RefundRequest, { kind?: "order" }>) {
  const db = admin();
  const { data: payment, error } = await db.from("stripe_payments").select("*,orders!inner(order_no)").eq("orders.order_no", input.orderNo).maybeSingle();
  if (error || !payment || payment.environment !== mode() || !payment.stripe_payment_intent_id || !["paid", "partially_refunded"].includes(payment.state) || input.amountCents > payment.net_amount_cents - payment.refunded_amount_cents) throw error || new Error("This payment is not refundable");
  const refund = await stripe("/refunds", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `atelix-refund-${payment.id}-${payment.refunded_amount_cents}-${input.amountCents}` }, body: new URLSearchParams({ payment_intent: payment.stripe_payment_intent_id, amount: String(input.amountCents), reason: "requested_by_customer", "metadata[order_id]": payment.order_id }) });
  const status = ["succeeded", "failed", "canceled"].includes(refund.status) ? refund.status : "pending";
  const { error: insertError } = await db.from("stripe_refunds").upsert({ payment_id: payment.id, environment: mode(), stripe_refund_id: refund.id, amount_cents: input.amountCents, reason: input.reason, requested_by: userId, status }, { onConflict: "stripe_refund_id" });
  if (insertError) throw insertError;
  return json({ refund });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const user = await requireAdmin(req);
    const input = await req.json() as RefundRequest;
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.trim().length > 500) throw new Error("Enter a valid refund amount and reason");
    return input.kind === "invoice" ? await invoiceRefund(user.id, input) : await orderRefund(user.id, input);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Refund failed" }, 400);
  }
});
