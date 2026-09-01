/*
 * Same-origin relay for the interactive RFQ assistant.
 *
 * The browser keeps its authenticated Supabase access token in the request;
 * this handler forwards it only to Atelix's fixed Edge Function.  It removes
 * the cross-origin preflight from the typing path while keeping every model
 * credential exclusively on the server.
 */
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ ok: false, reason: 'method_not_allowed' });
    return;
  }

  const authorization = typeof request.headers.authorization === 'string'
    ? request.headers.authorization
    : '';
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY;
  if (!authorization.startsWith('Bearer ')) {
    response.status(401).json({ ok: false, reason: 'unauthorized' });
    return;
  }
  if (!supabaseUrl || !publishableKey) {
    response.status(503).json({ ok: false, reason: 'service_unavailable' });
    return;
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/copilot-agent`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body ?? {}),
    });
    const body = await upstream.json();
    // JSON serialisation here is intentional: Vercel's Node response closes
    // deterministically after `json()`, whereas passing an upstream response
    // body through as text left some browser calls waiting after a 200.
    response.status(upstream.status).json(body);
  } catch (_) {
    response.status(502).json({ ok: false, reason: 'assistant_transport_failed' });
  }
}
