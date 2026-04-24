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
        const { userId, orderId, nextStatus } = await req.json();
        if (!userId || !orderId || !nextStatus) return json({ error: "Parametri mancanti" }, 400);
        if (typeof orderId !== "string" || orderId.length !== 36) return json({ error: "orderId non valido" }, 400);

        const { data: order, error: oErr } = await supabase
            .from("orders")
            .select("id, restaurant_id, status, order_type, paid_amount, total_amount")
            .eq("id", orderId)
            .maybeSingle();
        if (oErr || !order) return json({ error: "Ordine non trovato" }, 404);
        if (order.order_type !== "takeaway") return json({ error: "Non è un ordine asporto" }, 400);

        const access = await verifyAccess(supabase, userId, order.restaurant_id);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

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
            const paid = Number(order.paid_amount) || 0;
            const total = Number(order.total_amount) || 0;
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
