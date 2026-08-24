import { corsJson, json, mode, preflight, requireAdmin, requireAllowedOrigin, stripe } from "../_shared/stripe.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    requireAllowedOrigin(req);
    await requireAdmin(req);
    const account = await stripe("/account");
    const environment = mode();
    if (!account.charges_enabled || !Deno.env.get("STRIPE_WEBHOOK_SECRET")) throw new Error("Stripe is not ready");
    return corsJson(req, { ready: true, environment, chargesEnabled: true });
  } catch (error) {
    try {
      return corsJson(req, { ready: false, error: error instanceof Error ? error.message : "Stripe is not ready" }, 400);
    } catch {
      return json({ ready: false, error: "Stripe configuration unavailable" }, 503);
    }
  }
});
