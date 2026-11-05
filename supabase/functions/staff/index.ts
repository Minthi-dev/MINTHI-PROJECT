// Gestione account dello staff (camerieri, cucina, responsabili).
// Gli account staff accedono con username: l'email tecnica è <username>@staff.minthi.it
import { z } from "npm:zod@3.24.2";
import { badRequest, forbidden, handle, HttpError, json, readJson } from "../_shared/http.ts";
import { admin, getCaller, logActivity, requireRole } from "../_shared/supabase.ts";

const STAFF_DOMAIN = "staff.minthi.it";
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "Username: 3-32 caratteri, solo lettere, numeri, punto, trattino.");
const password = z.string().min(8, "La password deve avere almeno 8 caratteri.").max(72);
const staffRole = z.enum(["manager", "waiter", "kitchen"]);

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    restaurantId: z.string().uuid(),
    role: staffRole,
    displayName: z.string().trim().min(1).max(60),
    username,
    password,
    canTakePayments: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("update"),
    restaurantId: z.string().uuid(),
    userId: z.string().uuid(),
    role: staffRole.optional(),
    displayName: z.string().trim().min(1).max(60).optional(),
    canTakePayments: z.boolean().optional(),
    isActive: z.boolean().optional(),
    password: password.optional(),
  }),
  z.object({ action: z.literal("delete"), restaurantId: z.string().uuid(), userId: z.string().uuid() }),
]);

handle(async (req) => {
  const caller = await getCaller(req);
  const body = Body.parse(await readJson(req));
  const myRole = await requireRole(caller.user.id, body.restaurantId, ["owner", "manager"]);
  const db = admin();

  // un manager gestisce solo camerieri e cucina
  const canManage = (role: string) => myRole === "owner" || myRole === "admin" || role === "waiter" || role === "kitchen";

  if (body.action === "create") {
    if (!canManage(body.role)) throw forbidden("Solo il titolare può creare un responsabile.");
    const email = `${body.username}@${STAFF_DOMAIN}`;
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.displayName, username: body.username },
    });
    if (error) {
      if (/already|exists|registered/i.test(error.message)) throw new HttpError(409, "Username già in uso.", "username_taken");
      throw error;
    }
    const { error: mErr } = await db.from("memberships").insert({
      restaurant_id: body.restaurantId,
      user_id: created.user.id,
      role: body.role,
      display_name: body.displayName,
      can_take_payments: body.role === "manager" ? true : body.canTakePayments,
    });
    if (mErr) {
      await db.auth.admin.deleteUser(created.user.id);
      throw mErr;
    }
    await logActivity(body.restaurantId, caller.user.id, "staff_created", { username: body.username, role: body.role });
    return json(req, { userId: created.user.id });
  }

  const { data: target } = await db.from("memberships").select("*")
    .eq("restaurant_id", body.restaurantId).eq("user_id", body.userId).maybeSingle();
  if (!target) throw badRequest("Membro dello staff non trovato.");
  if (target.role === "owner") throw forbidden("Il titolare si gestisce dall'amministrazione.");
  if (!canManage(target.role) || (body.action === "update" && body.role && !canManage(body.role))) throw forbidden();
  if (body.userId === caller.user.id) throw forbidden("Non puoi modificare il tuo stesso ruolo.");

  if (body.action === "update") {
    const patch: Record<string, unknown> = {};
    if (body.role) patch.role = body.role;
    if (body.displayName) patch.display_name = body.displayName;
    if (body.canTakePayments !== undefined) patch.can_take_payments = body.canTakePayments;
    if (body.isActive !== undefined) patch.is_active = body.isActive;
    if (Object.keys(patch).length) {
      const { error } = await db.from("memberships").update(patch).eq("restaurant_id", body.restaurantId).eq("user_id", body.userId);
      if (error) throw error;
    }
    if (body.displayName) await db.from("profiles").update({ full_name: body.displayName }).eq("id", body.userId);
    if (body.password) {
      const { error } = await db.auth.admin.updateUserById(body.userId, { password: body.password });
      if (error) throw error;
    }
    if (body.isActive === false) await db.auth.admin.signOut(body.userId).catch(() => undefined);
    await logActivity(body.restaurantId, caller.user.id, "staff_updated", { userId: body.userId, ...patch, passwordChanged: !!body.password });
    return json(req, { ok: true });
  }

  // delete
  await db.from("memberships").delete().eq("restaurant_id", body.restaurantId).eq("user_id", body.userId);
  const { count } = await db.from("memberships").select("*", { count: "exact", head: true }).eq("user_id", body.userId);
  const { data: u } = await db.auth.admin.getUserById(body.userId);
  if ((count ?? 0) === 0 && u.user?.email?.endsWith(`@${STAFF_DOMAIN}`)) {
    await db.auth.admin.deleteUser(body.userId);
  }
  await logActivity(body.restaurantId, caller.user.id, "staff_deleted", { userId: body.userId });
  return json(req, { ok: true });
});
