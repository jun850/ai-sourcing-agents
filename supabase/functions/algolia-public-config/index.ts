import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  const appId = Deno.env.get("ALGOLIA_APP_ID");
  const apiKey = Deno.env.get("ALGOLIA_SEARCH_API_KEY");
  if (!appId || !apiKey) return new Response(JSON.stringify({ error: "search_not_configured" }), { status: 503, headers });
  return new Response(JSON.stringify({
    appId,
    apiKey,
    experienceId: appId,
    env: "prod",
    indices: {
      products: "atelix_app_7lq8h80eli_products",
      factories: "atelix_app_7lq8h80eli_factories",
      suggestions: "atelix_app_7lq8h80eli_query_suggestions",
    },
  }), { headers });
});
