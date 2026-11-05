// Registrazione di un nuovo ristorante tramite link di invito (/register/:token).
import { z } from "npm:zod@3.24.2";
import { badRequest, handle, HttpError, json, readJson } from "../_shared/http.ts";
import { admin } from "../_shared/supabase.ts";

const Body = z.object({
  token: z.string().min(10).max(100),
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri.").max(72),
  restaurantName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
  billing: z.object({
    billingName: z.string().trim().max(160).optional(),
    vatNumber: z.string().trim().max(20).optional(),
    sdiCode: z.string().trim().max(10).optional(),
    pec: z.string().trim().max(120).optional(),
    city: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(10).optional(),
    province: z.string().trim().max(4).optional(),
  }).default({}),
});

handle(async (req) => {
  const body = Body.parse(await readJson(req));
  const db = admin();

  const { data: invite } = await db.from("invites").select("*").eq("token", body.token).maybeSingle();
  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
    throw badRequest("Il link di invito non è valido o è scaduto.", "invalid_invite");
  }

  // blocca l'invito subito (evita doppi utilizzi concorrenti)
  const { data: claimed } = await db.from("invites").update({ used_at: new Date().toISOString() })
    .eq("id", invite.id).is("used_at", null).select("id").maybeSingle();
  if (!claimed) throw badRequest("Il link di invito è già stato usato.", "invalid_invite");

  try {
    const { data: created, error } = await db.auth.admin.createUser({
      email: body.email, password: body.password, email_confirm: true,
      user_metadata: { full_name: body.fullName },
    });
    if (error) {
      if (/already|exists|registered/i.test(error.message)) throw new HttpError(409, "Esiste già un account con questa email.", "email_taken");
      throw error;
    }
    const ownerId = created.user.id;

    const { data: r, error: rErr } = await db.from("restaurants").insert({
      name: body.restaurantName, phone: body.phone ?? null, address: body.address ?? null, email: body.email, created_by: ownerId,
    }).select("id").single();
    if (rErr) throw rErr;

    const trialEnd = new Date();
    trialEnd.setMonth(trialEnd.getMonth() + Math.max(invite.free_months, 0));
    await db.from("memberships").insert({ restaurant_id: r.id, user_id: ownerId, role: "owner", display_name: body.fullName, can_take_payments: true });
    await db.from("billing_accounts").upsert({
      restaurant_id: r.id,
      billing_name: body.billing.billingName ?? null,
      vat_number: body.billing.vatNumber ?? null,
      sdi_code: body.billing.sdiCode ?? null,
      pec: body.billing.pec ?? null,
      city: body.billing.city ?? null,
      postal_code: body.billing.postalCode ?? null,
      province: body.billing.province ?? null,
      address: body.address ?? null,
      subscription_status: invite.free_months > 0 ? "trialing" : "active",
      current_period_end: invite.free_months > 0 ? trialEnd.toISOString() : null,
    });
    
    if (invite.free_months > 0) {
      await db.from("restaurant_bonuses").insert({ restaurant_id: r.id, free_months: invite.free_months, reason: "Invito di registrazione" });
    }
    await db.from("invites").update({ used_by_restaurant_id: r.id }).eq("id", invite.id);

    return json(req, { restaurantId: r.id });
  } catch (err) {
    // l'invito torna utilizzabile se la registrazione fallisce
    await db.from("invites").update({ used_at: null }).eq("id", invite.id).is("used_by_restaurant_id", null);
    throw err;
  }
});
