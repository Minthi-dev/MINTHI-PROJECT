// Client Supabase: admin (service role) e utente chiamante (JWT).
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.49.4";
import { forbidden, requireEnv, unauthorized } from "./http.ts";

let adminClient: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  adminClient ??= createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export interface Caller {
  user: User;
  /** Client che agisce come l'utente: RLS e auth.uid() valgono. */
  db: SupabaseClient;
}

export async function getCaller(req: Request, opts: { allowAnonymous?: boolean } = {}): Promise<Caller> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw unauthorized();

  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw unauthorized("Sessione scaduta, accedi di nuovo.");
  if (data.user.is_anonymous && !opts.allowAnonymous) throw forbidden();

  const db = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { user: data.user, db };
}

export type Role = "owner" | "manager" | "waiter" | "kitchen";

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data } = await admin().from("profiles").select("is_platform_admin").eq("id", userId).maybeSingle();
  return data?.is_platform_admin === true;
}

/** Verifica che il chiamante abbia uno dei ruoli nel ristorante (gli admin passano sempre). */
export async function requireRole(userId: string, restaurantId: string, roles: Role[]): Promise<Role | "admin"> {
  if (await isPlatformAdmin(userId)) return "admin";
  const { data } = await admin()
    .from("memberships")
    .select("role, is_active")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.is_active || !roles.includes(data.role as Role)) throw forbidden();
  return data.role as Role;
}

export async function logActivity(restaurantId: string, actorId: string | null, action: string, details: Record<string, unknown> = {}) {
  await admin().from("activity_log").insert({ restaurant_id: restaurantId, actor_id: actorId, action, details });
}
