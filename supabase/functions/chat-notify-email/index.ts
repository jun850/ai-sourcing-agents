import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// One-way "you have a new message" email, fired after a chat message is sent.
// Not a reply-by-email bridge (that needs inbound email routing on a verified
// domain — a separate, bigger piece of infra). This just notifies + links back
// into the app, mirroring order-status-email's pattern.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return new Response("Unauthorized", { status: 401 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !user) return new Response("Unauthorized", { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const { conversationId, preview } = body || {};
  if (!conversationId) return new Response("Missing conversationId", { status: 400 });

  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("id, buyer_profile_id, factory_id, factories(name, owner_profile_id), profiles!conversations_buyer_profile_id_fkey(full_name, company_name)")
    .eq("id", conversationId)
    .single();
  if (convoErr || !convo) return new Response("Conversation not found", { status: 404 });

  const isBuyer = user.id === convo.buyer_profile_id;
  const factory: any = convo.factories;
  const buyerProfile: any = convo.profiles;
  const isSeller = factory && user.id === factory.owner_profile_id;
  if (!isBuyer && !isSeller) return new Response("Forbidden", { status: 403 });

  // recipient is the OTHER participant
  const recipientId = isBuyer ? factory?.owner_profile_id : convo.buyer_profile_id;
  if (!recipientId) {
    return new Response(JSON.stringify({ ok: false, reason: "recipient_unlinked" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const { data: recipientAuth } = await admin.auth.admin.getUserById(recipientId);
  const recipientEmail = recipientAuth?.user?.email;
  if (!recipientEmail) return new Response("Recipient has no email", { status: 404 });

  const senderName = isBuyer
    ? (buyerProfile?.company_name || buyerProfile?.full_name || "A brand owner")
    : (factory?.name || "A supplier");
  const linkPath = isBuyer
    ? `pages/dashboard.html?convo=${conversationId}#chat`
    : `pages/brand-owner.html?convo=${conversationId}#chat`;

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ ok: false, reason: "email_not_configured" }), {
      status: 501, headers: { "Content-Type": "application/json" },
    });
  }

  const siteUrl = Deno.env.get("SITE_URL") || "https://marketplace-three-peach.vercel.app";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "ARCANA Messages <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `New message from ${senderName} on ARCANA`,
      html: `<p>You have a new message from <b>${senderName}</b> on ARCANA.</p>` +
        (preview ? `<p style="color:#54534e">“${String(preview).slice(0, 200)}”</p>` : "") +
        `<p><a href="${siteUrl}/${linkPath}">Reply on ARCANA</a></p>` +
        `<p style="color:#8a8a85;font-size:12px">Replying to this email won’t reach them — reply from the link above.</p>`,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return new Response(`Email send failed: ${errText}`, { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
