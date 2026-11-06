// Operazioni della piattaforma MINTHI (solo admin).
import { z } from "npm:zod@3.24.2";
import { badRequest, forbidden, handle, json, readJson } from "../_shared/http.ts";
import { admin, getCaller, isPlatformAdmin } from "../_shared/supabase.ts";

const id = z.string().uuid();

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_restaurant"),
    name: z.string().trim().min(1).max(120),
    ownerEmail: z.string().trim().toLowerCase().email(),
    ownerName: z.string().trim().max(80).default(""),
    ownerPassword: z.string().min(8).max(72).optional(),
    freeMonths: z.number().int().min(0).max(36).default(0),
  }),
  z.object({ action: z.literal("set_status"), restaurantId: id, status: z.enum(["active", "suspended"]), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("delete_restaurant"), restaurantId: id, confirmName: z.string() }),
  z.object({
    action: z.literal("create_invite"),
    note: z.string().max(200).optional(),
    freeMonths: z.number().int().min(0).max(36).default(0),
    discountPercent: z.number().int().min(0).max(100).default(0),
    discountDuration: z.enum(["once", "repeating", "forever"]).default("once"),
    discountMonths: z.number().int().min(1).max(36).optional(),
    expiresInDays: z.number().int().min(1).max(365).default(30),
  }),
  z.object({ action: z.literal("delete_invite"), inviteId: id }),
  z.object({ action: z.literal("grant_bonus"), restaurantId: id, freeMonths: z.number().int().min(1).max(36), reason: z.string().max(200).optional() }),
  z.object({
    action: z.literal("set_subscription"),
    restaurantId: id,
    status: z.enum(["trialing", "active", "past_due", "canceled", "free"]),
    currentPeriodEnd: z.string().datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal("record_subscription_payment"),
    restaurantId: id,
    amount: z.number().positive(),
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
  }),
  z.object({ action: z.literal("set_invoice_issued"), paymentId: id, issued: z.boolean() }),
  z.object({ action: z.literal("set_config"), key: z.string().regex(/^[a-z0-9_]{2,64}$/), value: z.unknown(), isPublic: z.boolean().default(false) }),
  z.object({ action: z.literal("owner_recovery_link"), restaurantId: id }),
]);

const addMonths = (d: Date, months: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
};

handle(async (req) => {
  const caller = await getCaller(req);
  if (!(await isPlatformAdmin(caller.user.id))) throw forbidden();
  const body = Body.parse(await readJson(req));
  const db = admin();

  switch (body.action) {
    case "create_restaurant": {
      // owner: utente esistente o nuovo
      const { data: existing } = await db.from("profiles").select("id").eq("email", body.ownerEmail).maybeSingle();
      let ownerId = existing?.id as string | undefined;
      let recoveryLink: string | null = null;
      if (!ownerId) {
        const { data, error } = await db.auth.admin.createUser({
          email: body.ownerEmail,
          password: body.ownerPassword ?? crypto.randomUUID() + "Aa1!",
          email_confirm: true,
          user_metadata: { full_name: body.ownerName },
        });
        if (error) throw error;
        ownerId = data.user.id;
        if (!body.ownerPassword) {
          const { data: link } = await db.auth.admin.generateLink({ type: "recovery", email: body.ownerEmail });
          recoveryLink = link?.properties?.action_link ?? null;
        }
      }
      const { data: r, error } = await db.from("restaurants").insert({ name: body.name, created_by: caller.user.id }).select("id").single();
      if (error) throw error;
      await db.from("memberships").insert({ restaurant_id: r.id, user_id: ownerId, role: "owner", display_name: body.ownerName || "Titolare", can_take_payments: true });
      await db.from("billing_accounts").upsert({
        restaurant_id: r.id,
        subscription_status: body.freeMonths > 0 ? "trialing" : "active",
        current_period_end: body.freeMonths > 0 ? addMonths(new Date(), body.freeMonths).toISOString() : null,
      });
      
      return json(req, { restaurantId: r.id, ownerId, recoveryLink });
    }

    case "set_status": {
      const { error } = await db.from("restaurants").update({
        status: body.status,
        suspension_reason: body.status === "suspended" ? body.reason ?? null : null,
      }).eq("id", body.restaurantId);
      if (error) throw error;
      return json(req, { ok: true });
    }

    case "delete_restaurant": {
      const { data: r } = await db.from("restaurants").select("name").eq("id", body.restaurantId).single();
      if (!r || r.name.trim() !== body.confirmName.trim()) throw badRequest("Il nome di conferma non corrisponde.");
      // gli account staff tecnici vengono eliminati insieme al ristorante
      const { data: members } = await db.from("memberships").select("user_id, role").eq("restaurant_id", body.restaurantId);
      const { error } = await db.from("restaurants").delete().eq("id", body.restaurantId);
      if (error) throw error;
      for (const m of members ?? []) {
        const { count } = await db.from("memberships").select("*", { count: "exact", head: true }).eq("user_id", m.user_id);
        const { data: u } = await db.auth.admin.getUserById(m.user_id);
        if ((count ?? 0) === 0 && u.user?.email?.endsWith("@staff.minthi.it")) await db.auth.admin.deleteUser(m.user_id);
      }
      return json(req, { ok: true });
    }

    case "create_invite": {
      const { data, error } = await db.from("invites").insert({
        note: body.note ?? null,
        free_months: body.freeMonths,
        discount_percent: body.discountPercent,
        discount_duration: body.discountDuration,
        discount_months: body.discountDuration === "repeating" ? body.discountMonths ?? 3 : null,
        expires_at: new Date(Date.now() + body.expiresInDays * 86400_000).toISOString(),
        created_by: caller.user.id,
      }).select("id, token").single();
      if (error) throw error;
      return json(req, data);
    }

    case "delete_invite": {
      await db.from("invites").delete().eq("id", body.inviteId).is("used_at", null);
      return json(req, { ok: true });
    }

    case "grant_bonus": {
      await db.from("restaurant_bonuses").insert({ restaurant_id: body.restaurantId, free_months: body.freeMonths, reason: body.reason ?? null, granted_by: caller.user.id });
      const { data: b } = await db.from("billing_accounts").select("current_period_end").eq("restaurant_id", body.restaurantId).maybeSingle();
      const base = b?.current_period_end && new Date(b.current_period_end) > new Date() ? new Date(b.current_period_end) : new Date();
      await db.from("billing_accounts").upsert({ restaurant_id: body.restaurantId, current_period_end: addMonths(base, body.freeMonths).toISOString() });
      return json(req, { ok: true });
    }

    case "set_subscription": {
      await db.from("billing_accounts").upsert({
        restaurant_id: body.restaurantId,
        subscription_status: body.status,
        ...(body.currentPeriodEnd !== undefined ? { current_period_end: body.currentPeriodEnd } : {}),
      });
      return json(req, { ok: true });
    }

    case "record_subscription_payment": {
      const { error } = await db.from("subscription_payments").insert({
        restaurant_id: body.restaurantId, amount: body.amount, status: "paid",
        period_start: body.periodStart ?? null, period_end: body.periodEnd ?? null,
      });
      if (error) throw error;
      if (body.periodEnd) {
        await db.from("billing_accounts").upsert({ restaurant_id: body.restaurantId, subscription_status: "active", current_period_end: body.periodEnd });
      }
      return json(req, { ok: true });
    }

    case "set_invoice_issued": {
      await db.from("subscription_payments").update({ invoice_issued: body.issued }).eq("id", body.paymentId);
      return json(req, { ok: true });
    }

    case "set_config": {
      const { error } = await db.from("platform_config").upsert({ key: body.key, value: body.value ?? null, is_public: body.isPublic, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json(req, { ok: true });
    }

    case "owner_recovery_link": {
      const { data: m } = await db.from("memberships").select("user_id").eq("restaurant_id", body.restaurantId).eq("role", "owner").limit(1).maybeSingle();
      if (!m) throw badRequest("Nessun titolare associato.");
      const { data: u } = await db.auth.admin.getUserById(m.user_id);
      if (!u.user?.email) throw badRequest("Il titolare non ha un'email.");
      const { data: link, error } = await db.auth.admin.generateLink({ type: "recovery", email: u.user.email });
      if (error) throw error;
      return json(req, { link: link.properties.action_link, email: u.user.email });
    }
  }
});
