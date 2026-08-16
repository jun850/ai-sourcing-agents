import { admin, deliver, json, mode, stripe } from "../_shared/stripe.ts";

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, "0")).join("");
}
function equal(a: string, b: string) { if(a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0; }
async function verify(req: Request, raw: string) {
  const header=req.headers.get("stripe-signature") || "", timestamp=header.match(/t=(\d+)/)?.[1], signatures=[...header.matchAll(/v1=([^,]+)/g)].map(x=>x[1]);
  const secret=Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if(!secret||!timestamp||!signatures.length||Math.abs(Date.now()/1000-Number(timestamp))>300) throw new Error("Invalid webhook signature");
  const expected=await hmac(secret,`${timestamp}.${raw}`);
  if(!signatures.some(signature=>equal(signature,expected))) throw new Error("Invalid webhook signature");
}

Deno.serve(async req => {
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  const raw=await req.text();
  try {
    await verify(req,raw);
    const event=JSON.parse(raw), environment=mode();
    if(Boolean(event.livemode)!==(environment==="live")) throw new Error("Webhook mode mismatch");
    const db=admin();
    const inserted=await db.from("stripe_webhook_events").insert({stripe_event_id:event.id,environment,event_type:event.type}).select("stripe_event_id").maybeSingle();
    if(inserted.error && inserted.error.code==="23505") return json({received:true,duplicate:true});
    if(inserted.error) throw inserted.error;
    const session=event.data?.object;
    const isRefund=event.type==="charge.refunded" || event.type==="refund.updated";
    const paymentQuery=db.from("stripe_payments").select("*,orders!inner(order_no,buyer_profile_id)");
    const {data: payment}=isRefund
      ? await paymentQuery.eq("stripe_payment_intent_id",session?.payment_intent || session?.payment_intent_id).maybeSingle()
      : await paymentQuery.eq("order_id",session?.metadata?.order_id || "").maybeSingle();
    if(!payment||payment.environment!==environment||(!isRefund&&payment.stripe_checkout_session_id!==session?.id)) throw new Error("Unknown payment session");
    const buyer=(await db.auth.admin.getUserById(payment.orders.buyer_profile_id)).data.user;
    const email=buyer?.email;
    const update: Record<string,unknown>={updated_at:new Date().toISOString()};
    let notification: "payment_succeeded"|"payment_failed"|"refund_succeeded"|null=null;
    if(event.type==="checkout.session.completed" && ["paid","no_payment_required"].includes(session.payment_status)) { update.state="paid"; update.stripe_payment_intent_id=session.payment_intent||null; update.stripe_invoice_id=session.invoice||null; if(session.invoice){try{const invoice=await stripe(`/invoices/${session.invoice}`);update.invoice_url=invoice.hosted_invoice_url||null;update.invoice_pdf_url=invoice.invoice_pdf||null;}catch(_){/* notification remains useful without an invoice link */}} notification="payment_succeeded"; }
    else if(event.type==="checkout.session.async_payment_succeeded") { update.state="paid"; update.stripe_payment_intent_id=session.payment_intent||null; notification="payment_succeeded"; }
    else if(event.type==="checkout.session.async_payment_failed" || event.type==="checkout.session.expired") { update.state=event.type.endsWith("expired")?"expired":"failed"; notification="payment_failed"; }
    else if(event.type==="charge.refunded" || event.type==="refund.updated") {
      const amount=Number(session.amount_refunded||session.amount||0); update.refunded_amount_cents=amount; update.state=amount>=payment.net_amount_cents?"refunded":"partially_refunded";
      if(event.type==="refund.updated" && session.id) await db.from("stripe_refunds").update({status:['succeeded','failed','canceled'].includes(session.status)?session.status:'pending',updated_at:new Date().toISOString()}).eq("stripe_refund_id",session.id);
      if(event.type==="refund.updated" && session.status!=="succeeded") notification=null; else notification="refund_succeeded";
    }
    if(Object.keys(update).length>1) await db.from("stripe_payments").update(update).eq("id",payment.id);
    if(update.state==="paid") await db.from("orders").update({status:"payment_verified",payment_verified_at:new Date().toISOString()}).eq("id",payment.order_id);
    if(update.state==="refunded") await db.from("orders").update({status:"refunded"}).eq("id",payment.order_id);
    await db.from("stripe_webhook_events").update({processed_at:new Date().toISOString()}).eq("stripe_event_id",event.id);
    if(notification&&email) await deliver(payment.id,event.id,notification,{email,name:buyer?.user_metadata?.full_name,orderNo:payment.orders.order_no,amount:(notification==="refund_succeeded"?Number(update.refunded_amount_cents||0):payment.net_amount_cents)/100,invoiceUrl:payment.invoice_url});
    return json({received:true});
  } catch(error) { console.error("stripe-webhook",error instanceof Error?error.message:"unknown"); return json({error:"Webhook rejected"},400); }
});
