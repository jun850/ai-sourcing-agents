import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retired unauthenticated demo. It cannot remain a public model/supplier path.
Deno.serve(() => new Response(JSON.stringify({ ok: false, reason: "not_found" }), {
  status: 404,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
