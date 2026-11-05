// Rimborso di un pagamento Stripe (solo titolare/responsabile).
import { z } from "npm:zod@3.24.2";
import { badRequest, handle, json, money, readJson } from "../_shared/http.ts";
import { admin, getCaller, logActivity, requireRole } from "../_shared/supabase.ts";
import { fromCents, stripe, toCents } from "../_shared/stripe.ts";

const Body = z.object({ paymentId: z.string().uuid(), amount: z.number().positive().optional() });

handle(async (req) => {
  const caller = await getCaller(req);
  const body = Body.parse(await readJson(req));
  const db = admin();
  const { data: p } = await db.from("payments").select("*").eq("id", body.paymentId).maybeSingle();
  if (!p) throw badRequest("Pagamento non trovato.");
  await requireRole(caller.user.id, p.restaurant_id, ["owner", "manager"]);
  if (p.method !== "stripe" || p.status !== "succeeded" || !p.stripe_payment_intent_id) {
    throw badRequest("Si possono rimborsare solo pagamenti online riusciti.");
  }
  const refundable = money(Number(p.amount) - Number(p.refunded_amount));
  const amount = money(Math.min(body.amount ?? refundable, refundable));
  if (amount <= 0) throw badRequest("Niente da rimborsare.");

  const { data: acct } = await db.from("stripe_accounts").select("account_id").eq("restaurant_id", p.restaurant_id).single();
  const refund = await stripe().refunds.create(
    { payment_intent: p.stripe_payment_intent_id, amount: toCents(amount) },
    { stripeAccount: acct!.account_id, idempotencyKey: `refund-${p.id}-${toCents(Number(p.refunded_amount))}-${toCents(amount)}` },
  );

  const refunded = money(Number(p.refunded_amount) + fromCents(refund.amount));
  const full = refunded >= Number(p.amount);
  await db.from("payments").update({ refunded_amount: refunded, status: full ? "refunded" : "succeeded" }).eq("id", p.id);
  if (p.order_id) await db.from("orders").update({ payment_status: full ? "refunded" : "partially_refunded" }).eq("id", p.order_id);
  await logActivity(p.restaurant_id, caller.user.id, "payment_refunded", { paymentId: p.id, amount });
  return json(req, { refunded, full });
});
