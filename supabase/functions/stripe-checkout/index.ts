import { admin, cents, cors, json, mode, stripe, userFrom } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const user = await userFrom(req), { orderNo, promotionCode } = await req.json();
    if (!orderNo || typeof orderNo !== "string") return json({ error: "Order number is required" }, 400);
    const db = admin();
    const { data: flag } = await db.from("platform_settings").select("value").eq("key", "stripe_checkout_enabled").maybeSingle();
    if (flag?.value !== "true") return json({ error: "Stripe checkout is not enabled" }, 409);
    const { data: order, error } = await db.from("orders").select("id,order_no,total,status,buyer_profile_id").eq("order_no", orderNo).maybeSingle();
    if (error || !order || order.buyer_profile_id !== user.id || order.status !== "awaiting_payment") return json({ error: "This order cannot be paid" }, 403);
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
    const params = new URLSearchParams({ mode: "payment", ui_mode: "embedded", return_url: `${Deno.env.get("SITE_URL") || "http://localhost:8090"}/pages/order.html?no=${encodeURIComponent(order.order_no)}`, client_reference_id: order.id, customer_email: user.email || "", integration_identifier: `atelix_checkout_${integrationSuffix}`, "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(amount), "line_items[0][price_data][product_data][name]": `Atelix order ${order.order_no}`, "line_items[0][quantity]": "1", "metadata[order_no]": order.order_no, "metadata[order_id]": order.id, "invoice_creation[enabled]": "true", "invoice_creation[invoice_data][description]": `Atelix order ${order.order_no}`, "invoice_creation[invoice_data][metadata][order_no]": order.order_no });
    if (promotionId) params.set("discounts[0][promotion_code]", promotionId);
    const session = await stripe("/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `atelix-checkout-v2-${order.id}-${promotionCode || "none"}` }, body: params });
    if (Boolean(session.livemode) !== (mode() === "live")) throw new Error("Stripe session mode mismatch");
    const discount = Number(session.total_details?.amount_discount || 0);
    const { error: saveError } = await db.from("stripe_payments").upsert({ order_id: order.id, environment: mode(), state: session.payment_status === "paid" || session.payment_status === "no_payment_required" ? "paid" : "checkout_created", currency: "usd", gross_amount_cents: amount, discount_amount_cents: discount, net_amount_cents: Number(session.amount_total), stripe_checkout_session_id: session.id, promotion_code_id: promotionId, promotion_code: promotionLabel }, { onConflict: "order_id" });
    if (saveError) throw saveError;
    return json({ clientSecret: session.client_secret, publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY"), environment: mode(), amountCents: Number(session.amount_total), discountCents: discount });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unable to start payment" }, /Unauthorized|Forbidden/.test(String(error)) ? 401 : 400); }
});
