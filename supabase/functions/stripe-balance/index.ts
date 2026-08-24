import { corsJson, json, mode, preflight, requireAdmin, requireAllowedOrigin, stripe } from "../_shared/stripe.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    requireAllowedOrigin(req);
    await requireAdmin(req);
    const balance = await stripe("/balance");
    return corsJson(req, { environment: mode(), available: balance.available || [], pending: balance.pending || [] });
  } catch (error) {
    try {
      return corsJson(req, { error: error instanceof Error ? error.message : "Unable to load balance" }, 400);
    } catch {
      return json({ error: "Stripe configuration unavailable" }, 503);
    }
  }
});
