import { admin, cents, cors, json, mode, stripe, userFrom } from "../_shared/stripe.ts";

type CheckoutRequest =
  | { kind: "order"; orderNo: string; promotionCode?: string }
  | { kind: "invoices"; invoiceIds: string[] };

const sessionSuffix = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => String.fromCharCode(97 + (byte % 26))).join("");
const siteUrl = () => (Deno.env.get("SITE_URL") || "http://localhost:8090").replace(/\/$/, "");
const checkoutResponse = (session: Record<string, unknown>, kind: CheckoutRequest["kind"]) => json({
  url: session.url,
  environment: mode(),
  amountCents: Number(session.amount_total || 0),
  discountCents: Number((session.total_details as Record<string, unknown> | undefined)?.amount_discount || 0),
  kind,
});

async function existingInvoiceSession(sessionId: string) {
  const session = await stripe(`/checkout/sessions/${sessionId}`);
  if (Boolean(session.livemode) !== (mode() === "live")) throw new Error("Stripe session mode mismatch");
  if (session.status === "open" && session.url) return session;
  throw new Error("This Checkout session is no longer open. Refresh your invoices and try again.");
}

async function releaseUnattachedAttempt(db: ReturnType<typeof admin>, attemptId: string, reason: string) {
  const { error } = await db.rpc("invoice_checkout_release_unattached_attempt", { p_attempt_id: attemptId, p_reason: reason });
  if (error) console.error("invoice checkout release", error.message);
}

async function createInvoiceSession(db: ReturnType<typeof admin>, user: { email?: string | null }, attempt: { attemptId: string; amountCents: number }) {
  const amount = Number(attempt.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid invoice Checkout amount");
  const returnUrl = `${siteUrl()}/dashboard/invoices`;
  const params = new URLSearchParams({
    mode: "payment", success_url: `${returnUrl}?stripe_return=success`, cancel_url: `${returnUrl}?stripe_return=cancelled`, client_reference_id: String(attempt.attemptId), customer_email: user.email || "",
    integration_identifier: `atelix_invoice_checkout_${sessionSuffix()}`,
    "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(amount), "line_items[0][price_data][product_data][name]": "Atelix invoices", "line_items[0][quantity]": "1",
    "metadata[invoice_checkout_attempt_id]": String(attempt.attemptId),
  });
  let session: Record<string, unknown>;
  try {
    // No payment_method_types: Stripe selects eligible methods for this account.
    session = await stripe("/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `atelix-invoice-checkout-v1-${attempt.attemptId}` }, body: params });
  } catch (error) {
    await releaseUnattachedAttempt(db, attempt.attemptId, error instanceof Error ? error.message : "Stripe session creation failed");
    throw error;
  }
  if (Boolean(session.livemode) !== (mode() === "live")) {
    await releaseUnattachedAttempt(db, attempt.attemptId, "Stripe session mode mismatch");
    throw new Error("Stripe session mode mismatch");
  }
  if (!session.url || typeof session.id !== "string") {
    await releaseUnattachedAttempt(db, attempt.attemptId, "Stripe did not return a hosted checkout URL");
    throw new Error("Stripe did not return a hosted checkout URL");
  }
  let { error: attachError } = await db.rpc("invoice_checkout_attach_session", { p_attempt_id: attempt.attemptId, p_session_id: session.id });
  // A database transient after Stripe created the session remains retryable with
  // the same attempt idempotency key; retry the attach once before surfacing it.
  if (attachError) ({ error: attachError } = await db.rpc("invoice_checkout_attach_session", { p_attempt_id: attempt.attemptId, p_session_id: session.id }));
  if (attachError) throw attachError;
  return checkoutResponse(session, "invoices");
}

async function checkoutInvoices(user: { id: string; email?: string | null }, input: Extract<CheckoutRequest, { kind: "invoices" }>) {
  if (!Array.isArray(input.invoiceIds) || input.invoiceIds.length < 1 || input.invoiceIds.length > 25 || input.invoiceIds.some((id) => typeof id !== "string")) throw new Error("Select one to 25 invoices to pay.");
  const db = admin();
  const { data: attempt, error: attemptError } = await db.rpc("invoice_checkout_create_attempt", { p_buyer_id: user.id, p_invoice_ids: input.invoiceIds, p_environment: mode() });
  if (attemptError || !attempt?.attemptId) throw attemptError || new Error("Unable to prepare invoice Checkout");
  if (!attempt.created) {
    if (!attempt.sessionId) return createInvoiceSession(db, user, { attemptId: String(attempt.attemptId), amountCents: Number(attempt.amountCents) });
    return checkoutResponse(await existingInvoiceSession(String(attempt.sessionId)), "invoices");
  }
  return createInvoiceSession(db, user, { attemptId: String(attempt.attemptId), amountCents: Number(attempt.amountCents) });
}

async function checkoutOrder(user: { id: string; email?: string | null }, input: Extract<CheckoutRequest, { kind: "order" }>) {
  if (!input.orderNo || typeof input.orderNo !== "string") throw new Error("Order number is required");
  const db = admin();
  const { data: order, error } = await db
    .from("orders")
    .select("id,order_no,total,status,payment_path,buyer_profile_id,order_items(id,sku_snapshot,name_snapshot,seller_snapshot,unit_price,qty,line_total)")
    .eq("order_no", input.orderNo)
    .maybeSingle();
  if (error || !order || order.buyer_profile_id !== user.id || order.status !== "awaiting_payment" || order.payment_path !== "stripe") throw new Error("This order cannot be paid with Stripe");
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  if (!items.length || items.some((item) => !item.sku_snapshot || !item.name_snapshot || !Number.isFinite(Number(item.line_total)))) {
    throw new Error("This order has no valid immutable line snapshots");
  }
  const { data: existing, error: existingError } = await db.from("stripe_payments").select("stripe_checkout_session_id,state").eq("order_id", order.id).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.stripe_checkout_session_id && ["checkout_created", "processing"].includes(existing.state)) {
    const prior = await stripe(`/checkout/sessions/${existing.stripe_checkout_session_id}`);
    if (prior.status === "open" && Boolean(prior.livemode) === (mode() === "live") && prior.url) return checkoutResponse(prior, "order");
  }
  const amount = cents(order.total);
  let promotionId: string | null = null;
  let promotionLabel: string | null = null;
  if (input.promotionCode) {
    const lookup = await stripe(`/promotion_codes?code=${encodeURIComponent(String(input.promotionCode).trim())}&active=true`);
    promotionId = lookup.data?.[0]?.id || null;
    promotionLabel = lookup.data?.[0]?.code || null;
    if (!promotionId) throw new Error("This discount code is invalid or expired");
  }
  const integrationSuffix = order.id.replace(/-/g, "").replace(/[0-9]/g, (digit: string) => String.fromCharCode(97 + Number(digit))).slice(0, 8);
  const orderUrl = `${siteUrl()}/pages/order.html?no=${encodeURIComponent(order.order_no)}`;
  const params = new URLSearchParams({ mode: "payment", success_url: `${orderUrl}&stripe_return=success`, cancel_url: `${orderUrl}&stripe_return=cancelled`, client_reference_id: order.id, customer_email: user.email || "", integration_identifier: `atelix_checkout_${integrationSuffix}`, "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(amount), "line_items[0][price_data][product_data][name]": `Atelix order ${order.order_no}`, "line_items[0][quantity]": "1", "metadata[order_no]": order.order_no, "metadata[order_id]": order.id, "invoice_creation[enabled]": "true", "invoice_creation[invoice_data][description]": `Atelix order ${order.order_no}`, "invoice_creation[invoice_data][metadata][order_no]": order.order_no });
  if (promotionId) params.set("discounts[0][promotion_code]", promotionId);
  const attemptKey = existing?.stripe_checkout_session_id || "first";
  const session = await stripe("/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `atelix-checkout-v3-${order.id}-${attemptKey}` }, body: params });
  if (Boolean(session.livemode) !== (mode() === "live")) throw new Error("Stripe session mode mismatch");
  const discount = Number(session.total_details?.amount_discount || 0);
  const { error: saveError } = await db.from("stripe_payments").upsert({ order_id: order.id, environment: mode(), state: session.payment_status === "paid" || session.payment_status === "no_payment_required" ? "paid" : "checkout_created", currency: "usd", gross_amount_cents: amount, discount_amount_cents: discount, net_amount_cents: Number(session.amount_total), stripe_checkout_session_id: session.id, promotion_code_id: promotionId, promotion_code: promotionLabel }, { onConflict: "order_id" });
  if (saveError) throw saveError;
  if (!session.url) throw new Error("Stripe did not return a hosted checkout URL");
  return checkoutResponse(session, "order");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const user = await userFrom(req);
    const payload = await req.json() as Record<string, unknown>;
    // Legacy order-only callers remain compatible; all new callers are discriminated.
    const input: CheckoutRequest = payload.kind === "invoices"
      ? { kind: "invoices", invoiceIds: payload.invoiceIds as string[] }
      : { kind: "order", orderNo: String(payload.orderNo || ""), promotionCode: typeof payload.promotionCode === "string" ? payload.promotionCode : undefined };
    return input.kind === "invoices" ? await checkoutInvoices(user, input) : await checkoutOrder(user, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start payment";
    return json({ error: message }, /Unauthorized|Forbidden/.test(message) ? 401 : 400);
  }
});
