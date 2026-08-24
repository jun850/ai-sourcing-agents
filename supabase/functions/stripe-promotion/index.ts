import { corsJson, json, mode, preflight, requireAdmin, requireAllowedOrigin, stripe } from "../_shared/stripe.ts";
const code = (environment: string) => `ATX-${environment.toUpperCase()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
Deno.serve(async req => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    requireAllowedOrigin(req);
    await requireAdmin(req);
    const environment = mode();
    const coupon = await stripe("/coupons", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ percent_off: "100", duration: "once", max_redemptions: "1", name: `Atelix ${environment} zero-cost test` }) });
    const value = code(environment);
    const promotion = await stripe("/promotion_codes", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ coupon: coupon.id, code: value, max_redemptions: "1", expires_at: String(Math.floor(Date.now() / 1000) + 1800), "metadata[purpose]": `atelix_${environment}_zero_cost_test` }) });
    return corsJson(req, { code: value, expiresAt: promotion.expires_at, environment });
  } catch (error) {
    try {
      return corsJson(req, { error: error instanceof Error ? error.message : "Could not create code" }, 400);
    } catch {
      return json({ error: "Stripe configuration unavailable" }, 503);
    }
  }
});
