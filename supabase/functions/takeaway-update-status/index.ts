// =====================================================================
// takeaway-update-status
// Authed (OWNER/STAFF/ADMIN) — transitions a takeaway order status:
// PENDING → PREPARING → READY → PICKED_UP / CANCELLED.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const ALLOWED: Record<string, string[]> = {
    PENDING: ["PREPARING", "CANCELLED"],
    PREPARING: ["READY", "CANCELLED"],
    READY: ["PICKED_UP", "PREPARING"],
    PICKED_UP: [],
    PAID: ["PICKED_UP"],
    CANCELLED: [],
};

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

    try {
        const { userId, orderId, nextStatus, sessionToken } = await req.json();
        if (!userId || !orderId || !nextStatus) return json({ error: "Parametri mancanti" }, 400);
        if (typeof orderId !== "string" || orderId.length !== 36) return json({ error: "orderId non valido" }, 400);

        const { data: order, error: oErr } = await supabase
            .from("orders")
            .select("id, restaurant_id, status, order_type, paid_amount, total_amount")
            .eq("id", orderId)
            .maybeSingle();
        if (oErr || !order) return json({ error: "Ordine non trovato" }, 404);
        if (order.order_type !== "takeaway") return json({ error: "Non è un ordine asporto" }, 400);

        const access = await verifyAccess(supabase, userId, order.restaurant_id, sessionToken);
        if (!access.valid) {
            // Diagnostica: identifica esattamente perché l'auth fallisce.
            // Rimuovere dopo aver capito la causa.
            const reasons: string[] = [];
            if (!sessionToken) reasons.push("sessionToken assente nel body");
            else if (typeof sessionToken !== "string" || sessionToken.length < 32) reasons.push(`sessionToken malformato (len=${(sessionToken as any)?.length ?? 0})`);
            else {
                const { data: rawUser } = await supabase
                    .from("users").select("id, role").eq("id", userId).maybeSingle();
                if (!rawUser) {
                    const { data: staff } = await supabase
                        .from("restaurant_staff").select("id, restaurant_id, is_active")
                        .eq("id", userId).maybeSingle();
                    if (!staff) reasons.push("userId non trovato né in users né in restaurant_staff");
                    else if (!staff.is_active) reasons.push("staff disattivato");
                    else if (staff.restaurant_id !== order.restaurant_id) reasons.push(`staff appartiene al ristorante ${staff.restaurant_id} ma l'ordine è del ${order.restaurant_id}`);
                    else reasons.push("staff trovato ma sessione non valida (scaduta/revocata o role mismatch)");
                } else {
                    if (rawUser.role !== "OWNER" && rawUser.role !== "ADMIN") reasons.push(`role utente: ${rawUser.role}, atteso OWNER/ADMIN`);
                    else {
                        const { data: rest } = await supabase
                            .from("restaurants").select("owner_id").eq("id", order.restaurant_id).maybeSingle();
                        if (!rest) reasons.push("ristorante non trovato");
                        else if (rest.owner_id !== userId && rawUser.role === "OWNER") reasons.push(`il ristorante è di proprietà di ${rest.owner_id}, non di ${userId}`);
                        else reasons.push("user trovato ma sessione non valida (scaduta/revocata o role mismatch nella sessione)");
                    }
                }
            }
            return json({ error: "Non autorizzato", reason: reasons.join("; ") || "sconosciuto" }, 403);
        }

        const { data: restaurant } = await supabase
            .from("restaurants")
            .select("takeaway_require_stripe")
            .eq("id", order.restaurant_id)
            .maybeSingle();

        const paid = Number(order.paid_amount) || 0;
        const total = Number(order.total_amount) || 0;
        const requiresStripePrepay = restaurant?.takeaway_require_stripe === true;
        if (
            requiresStripePrepay &&
            order.status === "PENDING" &&
            nextStatus === "PREPARING" &&
            paid + 0.01 < total
        ) {
            return json({ error: "Pagamento online obbligatorio: l'ordine entra in cucina solo dopo Stripe" }, 409);
        }

        // Idempotenza: se lo stato richiesto è uguale all'attuale, non è un errore.
        // Capita facilmente con doppio-tap o click ripetuto sul tablet della cucina.
        if (order.status === nextStatus) {
            return json({ success: true, idempotent: true });
        }

        const allowed = ALLOWED[order.status] ?? [];
        if (!allowed.includes(nextStatus)) {
            return json({ error: `Transizione non consentita da ${order.status} a ${nextStatus}` }, 400);
        }

        const updates: Record<string, unknown> = { status: nextStatus };
        const now = new Date().toISOString();
        if (nextStatus === "READY") updates.ready_at = now;
        if (nextStatus === "PICKED_UP") {
            updates.picked_up_at = now;
            // Closure automatica SOLO se l'ordine è effettivamente saldato
            // (c'è un pagamento registrato E l'importo copre il totale).
            // Non tocchiamo payment_method — è già stato impostato dalle funzioni
            // di pagamento (takeaway-pay / stripe-webhook / stripe-verify-session).
            if (paid > 0 && paid + 0.01 >= total) {
                updates.status = "PAID";
                updates.closed_at = now;
            }
        }
        if (nextStatus === "CANCELLED") updates.closed_at = now;

        const { error: uErr } = await supabase.from("orders").update(updates).eq("id", orderId);
        if (uErr) return json({ error: uErr.message }, 500);

        return json({ success: true });
    } catch (err: any) {
        console.error("[TAKEAWAY-STATUS] error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});
