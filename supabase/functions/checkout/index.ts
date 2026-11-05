// Pagamento online con Stripe Checkout (direct charge sul conto del ristorante).
//   table    : conto del tavolo (intero, quota a persona, importo libero)
//   takeaway : ordine d'asporto
import { z } from "npm:zod@3.24.2";
import { badRequest, forbidden, handle, json, money, notFound, readJson, returnBaseUrl } from "../_shared/http.ts";
import { admin, getCaller } from "../_shared/supabase.ts";
import { stripe, toCents } from "../_shared/stripe.ts";

const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("table"),
    sessionId: z.string().uuid(),
    mode: z.enum(["full", "per_person", "custom"]),
    persons: z.number().int().min(1).max(100).optional(),
    amount: z.number().positive().optional(),
    qrToken: z.string().max(64),
  }),
  z.object({ kind: z.literal("takeaway"), token: z.string().min(16).max(64) }),
]);

async function connectedAccount(restaurantId: string): Promise<string> {
  const { data } = await admin().from("stripe_accounts").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  if (!data?.charges_enabled || !data.online_payments_enabled) throw badRequest("Il locale non accetta pagamenti online.", "online_payments_disabled");
  return data.account_id;
}

handle(async (req) => {
  const caller = await getCaller(req, { allowAnonymous: true });
  const body = Body.parse(await readJson(req));
  const db = admin();
  const base = returnBaseUrl(req);

  if (body.kind === "table") {
    // il conto lo calcola il DB con i permessi del chiamante (ospite del tavolo o staff)
    const { data: bill, error } = await caller.db.rpc("session_bill", { p_session_id: body.sessionId });
    if (error) throw forbidden(error.message);
    const { data: s } = await db.from("table_sessions").select("restaurant_id, status, tables(name)").eq("id", body.sessionId).single();
    if (!s || s.status !== "open") throw badRequest("Il tavolo è chiuso.");

    const due = money(bill.due);
    let amount = due;
    if (body.mode === "per_person") amount = money(Math.min(due, Number(bill.perPerson) * (body.persons ?? 1)));
    if (body.mode === "custom") amount = money(Math.min(due, body.amount ?? 0));
    if (amount < 0.5) throw badRequest("Importo troppo basso per un pagamento con carta.");

    const account = await connectedAccount(s.restaurant_id);
    const tableName = (s as { tables?: { name?: string } }).tables?.name ?? "";
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: { currency: "eur", unit_amount: toCents(amount), product_data: { name: `Conto tavolo ${tableName}`.trim() } },
      }],
      metadata: { kind: "table", session_id: body.sessionId, restaurant_id: s.restaurant_id },
      payment_intent_data: { metadata: { kind: "table", session_id: body.sessionId, restaurant_id: s.restaurant_id } },
      success_url: `${base}/t/${encodeURIComponent(body.qrToken)}?pagamento=ok`,
      cancel_url: `${base}/t/${encodeURIComponent(body.qrToken)}?pagamento=annullato`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      locale: "it",
    }, { stripeAccount: account });

    await db.from("payments").insert({
      restaurant_id: s.restaurant_id, session_id: body.sessionId, method: "stripe", status: "pending",
      amount, stripe_checkout_session_id: session.id, label: body.mode === "full" ? "Online (intero)" : "Online (quota)",
    });
    return json(req, { url: session.url });
  }

  // takeaway
  const { data: o } = await db.from("orders").select("*").eq("pickup_token", body.token).eq("kind", "takeaway").maybeSingle();
  if (!o) throw notFound("Ordine non trovato.");
  if (o.status === "cancelled") throw badRequest("Ordine annullato.");
  if (o.payment_status === "paid") throw badRequest("Ordine già pagato.");
  const account = await connectedAccount(o.restaurant_id);
  const { data: items } = await db.from("order_items").select("dish_name, unit_price, quantity").eq("order_id", o.id).neq("status", "cancelled");
  const lineItems = (items ?? []).filter((i) => Number(i.unit_price) > 0).map((i) => ({
    quantity: i.quantity,
    price_data: { currency: "eur", unit_amount: toCents(Number(i.unit_price)), product_data: { name: i.dish_name } },
  }));
  if (!lineItems.length) throw badRequest("Ordine vuoto.");

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    metadata: { kind: "takeaway", order_id: o.id, restaurant_id: o.restaurant_id },
    payment_intent_data: { metadata: { kind: "takeaway", order_id: o.id, restaurant_id: o.restaurant_id } },
    customer_email: o.customer_email ?? undefined,
    success_url: `${base}/asporto/ordine/${o.pickup_token}?pagamento=ok`,
    cancel_url: `${base}/asporto/ordine/${o.pickup_token}?pagamento=annullato`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    locale: "it",
  }, { stripeAccount: account });

  await db.from("payments").insert({
    restaurant_id: o.restaurant_id, order_id: o.id, method: "stripe", status: "pending",
    amount: money(o.total - o.paid_amount), stripe_checkout_session_id: session.id, label: "Online",
  });
  return json(req, { url: session.url });
});
