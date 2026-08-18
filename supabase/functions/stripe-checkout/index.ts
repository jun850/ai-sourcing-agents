import { admin, cents, cors, json, mode, stripe, userFrom } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const user = await userFrom(req), { orderNo, promotionCode } = await req.json();
    if (!orderNo || typeof orderNo !== "string") return json({ error: "Order number is required" }, 400);
    const db = admin();
    const { data: order, error } = await db.from("orders").select("id,order_no,total,status,payment_path,buyer_profile_id").eq("order_no", orderNo).maybeSingle();
    if (error || !order || order.buyer_profile_id !== user.id || order.status !== "awaiting_payment" || order.payment_path !== "stripe") return json({ error: "This order cannot be paid with Stripe" }, 403);
    const { data: existing } = await db.from("stripe_payments").select("stripe_checkout_session_id,state").eq("order_id", order.id).maybeSingle();
    if (existing?.stripe_checkout_session_id && ["checkout_created", "processing"].includes(existing.state)) {
      const prior = await stripe(`/checkout/sessions/${existing.stripe_checkout_session_id}`);
      if (prior.status === "open" && Boolean(prior.livemode) === (mode() === "live") && prior.url) return json({ url: prior.url, environment: mode(), amountCents: Number(prior.amount_total || 0), discountCents: Number(prior.total_details?.amount_discount || 0) });
    }
    const amount = cents(order.total);
    let promotionId: string | null = null;
    let promotionLabel: string | null = null;
    if (promotionCode) {
      const lookup = await stripe(`/promotion_codes?code=${encodeURIComponent(String(promotionCode).trim())}&active=true`);
      promotionId = lookup.data?.[0]?.id || null;
      promotionLabel = lookup.data?.[0]?.code || null;
      if (!promotionId) return json({ error: "This discount code is invalid or expired" }, 400);
    }
    const integrationSuffix = order.id.replace(/-/g, "").replace(/[0-9]/g, digit => String.fromCharCode(97 + Number(digit))).slice(0, 8);
    const siteUrl = (Deno.env.get("SITE_URL") || "http://localhost:8090").replace(/\/$/, "");
    const orderUrl = `${siteUrl}/pages/order.html?no=${encodeURIComponent(order.order_no)}`;
    const params = new URLSearchParams({ mode: "payment", success_url: `${orderUrl}&stripe_return=success`, cancel_url: `${orderUrl}&stripe_return=cancelled`, client_reference_id: order.id, customer_email: user.email || "", integration_identifier: `atelix_checkout_${integrationSuffix}`, "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(amount), "line_items[0][price_data][product_data][name]": `Atelix order ${order.order_no}`, "line_items[0][quantity]": "1", "metadata[order_no]": order.order_no, "metadata[order_id]": order.id, "invoice_creation[enabled]": "true", "invoice_creation[invoice_data][description]": `Atelix order ${order.order_no}`, "invoice_creation[invoice_data][metadata][order_no]": order.order_no });
    if (promotionId) params.set("discounts[0][promotion_code]", promotionId);
    const attemptKey = existing?.stripe_checkout_session_id || "first";
    const session = await stripe("/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `atelix-checkout-v3-${order.id}-${attemptKey}` }, body: params });
    if (Boolean(session.livemode) !== (mode() === "live")) throw new Error("Stripe session mode mismatch");
    const discount = Number(session.total_details?.amount_discount || 0);
    const { error: saveError } = await db.from("stripe_payments").upsert({ order_id: order.id, environment: mode(), state: session.payment_status === "paid" || session.payment_status === "no_payment_required" ? "paid" : "checkout_created", currency: "usd", gross_amount_cents: amount, discount_amount_cents: discount, net_amount_cents: Number(session.amount_total), stripe_checkout_session_id: session.id, promotion_code_id: promotionId, promotion_code: promotionLabel }, { onConflict: "order_id" });
    if (saveError) throw saveError;
    if (!session.url) throw new Error("Stripe did not return a hosted checkout URL");
    return json({ url: session.url, environment: mode(), amountCents: Number(session.amount_total), discountCents: discount });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unable to start payment" }, /Unauthorized|Forbidden/.test(String(error)) ? 401 : 400); }
});
