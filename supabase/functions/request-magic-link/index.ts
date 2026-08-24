import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, corsJson, preflight, requireAllowedOrigin, siteUrl } from "../_shared/stripe.ts";

const GENERIC_RESPONSE = { ok: true };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try { requireAllowedOrigin(req); } catch {
    return new Response("Origin not allowed", { status: 403, headers: { Vary: "Origin" } });
  }
  if (req.method !== "POST") return corsJson(req, { error: "Method not allowed" }, 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json() as Record<string, unknown>; } catch {
    return corsJson(req, { error: "Invalid request" }, 400);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const redirectTo = typeof payload.redirectTo === "string" ? payload.redirectTo.trim() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 320) return corsJson(req, GENERIC_RESPONSE);

  let redirect: URL;
  try { redirect = new URL(redirectTo); } catch { return corsJson(req, { error: "Invalid redirect" }, 400); }
  if (redirect.origin !== siteUrl() || redirect.pathname !== "/auth/callback") {
    return corsJson(req, { error: "Invalid redirect" }, 400);
  }

  const db = admin();
  const { data: registration, error: registrationError } = await db
    .from("registration_requests")
    .select("status")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (registrationError) {
    console.error("magic link eligibility lookup failed", registrationError.message);
    return corsJson(req, { error: "Sign in is temporarily unavailable" }, 503);
  }
  if (registration?.status !== "approved" && registration?.status !== "invited") {
    return corsJson(req, GENERIC_RESPONSE);
  }

  const auth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: otpError } = await auth.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect.toString(), shouldCreateUser: false },
  });

  // Supabase deliberately obscures whether an Auth account exists. Preserve
  // that boundary for both missing accounts and ineligible registrations.
  if (otpError) console.warn("eligible magic link request was not sent", otpError.message);
  return corsJson(req, GENERIC_RESPONSE);
});
