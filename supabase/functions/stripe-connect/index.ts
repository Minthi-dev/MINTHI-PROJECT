// Stripe Connect (Express) del ristorante: onboarding, dashboard, stato.
import { z } from "npm:zod@3.24.2";
import { badRequest, handle, json, readJson, returnBaseUrl } from "../_shared/http.ts";
import { admin, getCaller, requireRole } from "../_shared/supabase.ts";
import { stripe, stripeMode } from "../_shared/stripe.ts";

const Body = z.object({
  action: z.enum(["onboarding_link", "dashboard_link", "refresh"]),
  restaurantId: z.string().uuid(),
});

async function syncAccount(restaurantId: string, accountId: string) {
  const acct = await stripe().accounts.retrieve(accountId);
  const patch = {
    charges_enabled: acct.charges_enabled === true,
    payouts_enabled: acct.payouts_enabled === true,
    details_submitted: acct.details_submitted === true,
  };
  await admin().from("stripe_accounts").update(patch).eq("restaurant_id", restaurantId);
  return { accountId, ...patch, mode: stripeMode() };
}

handle(async (req) => {
  const caller = await getCaller(req);
  const body = Body.parse(await readJson(req));
  await requireRole(caller.user.id, body.restaurantId, ["owner"]);
  const db = admin();

  const { data: existing } = await db.from("stripe_accounts").select("*").eq("restaurant_id", body.restaurantId).maybeSingle();

  if (body.action === "refresh") {
    if (!existing) return json(req, { connected: false, mode: stripeMode() });
    return json(req, { connected: true, ...(await syncAccount(body.restaurantId, existing.account_id)) });
  }

  if (body.action === "dashboard_link") {
    if (!existing?.details_submitted) throw badRequest("Completa prima la configurazione di Stripe.");
    const link = await stripe().accounts.createLoginLink(existing.account_id);
    return json(req, { url: link.url });
  }

  // onboarding_link
  let accountId = existing?.account_id as string | undefined;
  if (!accountId) {
    const { data: r } = await db.from("restaurants").select("name, email").eq("id", body.restaurantId).single();
    const acct = await stripe().accounts.create({
      type: "express",
      country: "IT",
      email: r?.email ?? caller.user.email ?? undefined,
      business_type: "company",
      business_profile: { name: r?.name, mcc: "5812" },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { restaurant_id: body.restaurantId },
    }, { idempotencyKey: `connect-account-${body.restaurantId}` });
    accountId = acct.id;
    await db.from("stripe_accounts").insert({ restaurant_id: body.restaurantId, account_id: accountId });
  }
  const base = returnBaseUrl(req);
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${base}/app/impostazioni/pagamenti?stripe=refresh`,
    return_url: `${base}/app/impostazioni/pagamenti?stripe=return`,
  });
  return json(req, { url: link.url });
});
