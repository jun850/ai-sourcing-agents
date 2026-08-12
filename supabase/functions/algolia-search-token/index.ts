import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const PRIVATE_INDEX = { orders: "atelix_private_orders", wishlist: "atelix_private_wishlist" } as const;

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } }); }
function b64(bytes: Uint8Array) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
async function securedKey(parent: string, parameters: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(parent), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parameters)));
  const combined = new Uint8Array(signature.length + new TextEncoder().encode(parameters).length);
  combined.set(signature); combined.set(new TextEncoder().encode(parameters), signature.length);
  return b64(combined);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!jwt) return response({ error: "unauthorized" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return response({ error: "unauthorized" }, 401);
  const { scope } = await req.json().catch(() => ({}));
  if (scope !== "orders" && scope !== "wishlist") return response({ error: "invalid_scope" }, 400);
  const appId = Deno.env.get("ALGOLIA_APP_ID");
  // A secured search key must inherit only search permissions. Never derive a
  // browser-facing token from the write or admin credentials.
  const parent = Deno.env.get("ALGOLIA_SEARCH_API_KEY");
  if (!appId || !parent) return response({ error: "search_not_configured" }, 503);
  const validUntil = Math.floor(Date.now() / 1000) + 300;
  const parameters = new URLSearchParams({ restrictIndices: PRIVATE_INDEX[scope], filters: `owner_profile_id:${user.id}`, validUntil: String(validUntil) }).toString();
  return response({ appId, indexName: PRIVATE_INDEX[scope], apiKey: await securedKey(parent, parameters), validUntil });
});
