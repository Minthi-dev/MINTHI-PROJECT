// Webhook Stripe (piattaforma + account Connect). Firma verificata, idempotente.
import { admin } from "../_shared/supabase.ts";
import { fromCents, Stripe, stripe } from "../_shared/stripe.ts";
import { maybeAutoIssue } from "../_shared/fiscal.ts";
import { money } from "../_shared/http.ts";

const secrets = [Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET"), Deno.env.get("STRIPE_WEBHOOK_SECRET")].filter(Boolean) as string[];
const ok = () => new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });

async function verify(req: Request): Promise<Stripe.Event | null> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return null;
  const payload = await req.text();
  for (const secret of secrets) {
    try {
      return await stripe().webhooks.constructEventAsync(payload, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
    } catch { /* prova il segreto successivo */ }
  }
  return null;
}

async function onCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return;
  const db = admin();
  const { data: payment } = await db.from("payments").select("*").eq("stripe_checkout_session_id", session.id).maybeSingle();
  if (!payment || payment.status === "succeeded") return;

  let chargeId: string | null = null, receiptUrl: string | null = null;
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  if (piId) {
    try {
      const pi = await stripe().paymentIntents.retrieve(piId, { expand: ["latest_charge"] }, { stripeAccount: event.account });
      const charge = pi.latest_charge as Stripe.Charge | null;
      chargeId = charge?.id ?? null;
      receiptUrl = charge?.receipt_url ?? null;
    } catch (e) {
      console.error("[webhook] retrieve PI", e);
    }
  }

  await db.from("payments").update({
    status: "succeeded",
    amount: money(fromCents(session.amount_total)),
    stripe_payment_intent_id: piId, stripe_charge_id: chargeId, stripe_receipt_url: receiptUrl,
  }).eq("id", payment.id).eq("status", "pending");

  if (payment.order_id) {
    const { data: o } = await db.from("orders").select("total, status").eq("id", payment.order_id).single();
    await db.from("orders").update({
      paid_amount: o?.total, payment_status: "paid",
      status: o?.status === "awaiting_payment" ? "received" : o?.status,
    }).eq("id", payment.order_id);
    await maybeAutoIssue("order", payment.order_id, payment.restaurant_id);
  } else if (payment.session_id) {
    await maybeAutoIssue("session", payment.session_id, payment.restaurant_id);
  }
}

async function onCheckoutExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  await admin().from("payments").update({ status: "failed" }).eq("stripe_checkout_session_id", session.id).eq("status", "pending");
}

async function onChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const db = admin();
  const { data: payment } = await db.from("payments").select("*").eq("stripe_charge_id", charge.id).maybeSingle();
  if (!payment) return;
  const refunded = money(fromCents(charge.amount_refunded));
  await db.from("payments").update({ refunded_amount: refunded, status: refunded >= Number(payment.amount) ? "refunded" : "succeeded" }).eq("id", payment.id);
  if (payment.order_id) {
    await db.from("orders").update({ payment_status: refunded >= Number(payment.amount) ? "refunded" : "partially_refunded" }).eq("id", payment.order_id);
  }
}

async function onAccountUpdated(event: Stripe.Event) {
  const acct = event.data.object as Stripe.Account;
  await admin().from("stripe_accounts").update({
    charges_enabled: acct.charges_enabled === true,
    payouts_enabled: acct.payouts_enabled === true,
    details_submitted: acct.details_submitted === true,
  }).eq("account_id", acct.id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const event = await verify(req);
  if (!event) return new Response("Invalid signature", { status: 400 });
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await onCheckoutCompleted(event);
        break;
      case "checkout.session.expired":
        await onCheckoutExpired(event);
        break;
      case "charge.refunded":
        await onChargeRefunded(event);
        break;
      case "account.updated":
        await onAccountUpdated(event);
        break;
    }
    return ok();
  } catch (err) {
    console.error(`[webhook] ${event.type} ${event.id}`, err);
    return new Response("Errore", { status: 500 }); // Stripe ritenterà
  }
});
