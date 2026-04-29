// =====================================================================
// takeaway-pickup-qr
// Authed (OWNER/STAFF/ADMIN): scan a customer's takeaway QR and atomically
// mark products as handed out.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

function extractToken(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!raw) return null;

    const minthiMatch = raw.match(/^minthi-pickup:[^:]+:([a-f0-9-]{36})$/i);
    if (minthiMatch) return minthiMatch[1].toLowerCase();

    try {
        const url = new URL(raw);
        const token = url.searchParams.get("token") || url.searchParams.get("t");
        if (token) return token.trim().toLowerCase();
        const lastSegment = url.pathname.split("/").filter(Boolean).pop();
        if (lastSegment) return lastSegment.trim().toLowerCase();
    } catch {
        // Not a URL; treat it as a raw token below.
    }

    const token = raw.replace(/^token[:=]/i, "").trim().toLowerCase();
    return /^[a-f0-9-]{36}$/i.test(token) ? token : null;
}

function normalizeItems(items: any[] | null | undefined) {
    return (items || []).map((item: any) => {
        const quantity = Math.max(0, Number(item.quantity || 0));
        const picked = Math.min(quantity, Math.max(0, Number(item.takeaway_picked_quantity || 0)));
        return {
            id: item.id,
            order_id: item.order_id,
            name: item.dish_name_snapshot || item.dish?.name || "Prodotto",
            quantity,
            picked_quantity: picked,
            remaining_quantity: Math.max(0, quantity - picked),
            status: item.status,
        };
    });
}

async function readOrderByToken(restaurantId: string, token: string) {
    const { data, error } = await supabase
        .from("orders")
        .select(`
            id, restaurant_id, pickup_number, pickup_code, status, total_amount, paid_amount,
            customer_name, customer_phone, created_at, ready_at, picked_up_at,
            takeaway_pickup_mode, takeaway_pickup_token, payment_method, payments,
            items:order_items(id, order_id, quantity, takeaway_picked_quantity, status, dish_name_snapshot,
                dish:dishes(name))
        `)
        .eq("restaurant_id", restaurantId)
        .eq("order_type", "takeaway")
        .eq("takeaway_pickup_token", token)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { ...data, items: normalizeItems((data as any).items) };
}

async function readOrderById(restaurantId: string, orderId: string) {
    const { data, error } = await supabase
        .from("orders")
        .select(`
            id, restaurant_id, pickup_number, pickup_code, status, total_amount, paid_amount,
            customer_name, customer_phone, created_at, ready_at, picked_up_at,
            takeaway_pickup_mode, takeaway_pickup_token, payment_method, payments,
            items:order_items(id, order_id, quantity, takeaway_picked_quantity, status, dish_name_snapshot,
                dish:dishes(name))
        `)
        .eq("restaurant_id", restaurantId)
        .eq("order_type", "takeaway")
        .eq("id", orderId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { ...data, items: normalizeItems((data as any).items) };
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    try {
        const body = await req.json();
        const { userId, sessionToken, restaurantId, action } = body || {};
        if (!userId || !restaurantId || typeof restaurantId !== "string") {
            return json({ error: "Parametri mancanti" }, 400);
        }

        const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        if (action === "resolve") {
            const token = extractToken(body.tokenOrUrl);
            if (!token) return json({ error: "QR non valido" }, 400);
            const order = await readOrderByToken(restaurantId, token);
            if (!order) return json({ error: "Ordine non trovato" }, 404);
            if (order.takeaway_pickup_mode !== "qr") {
                return json({ error: "Questo ordine non usa il ritiro QR" }, 409);
            }
            return json({ success: true, order });
        }

        if (action === "claim_item") {
            const { orderId, orderItemId } = body;
            const quantity = Math.max(1, Math.min(100, Number(body.quantity || 1)));
            if (typeof orderId !== "string" || orderId.length !== 36 || typeof orderItemId !== "string" || orderItemId.length !== 36) {
                return json({ error: "Prodotto non valido" }, 400);
            }

            const token = extractToken(body.tokenOrUrl);
            if (token) {
                const byToken = await readOrderByToken(restaurantId, token);
                if (!byToken || byToken.id !== orderId) return json({ error: "QR non corrisponde all'ordine" }, 409);
            }

            const { data, error } = await supabase.rpc("claim_takeaway_pickup_item", {
                p_restaurant_id: restaurantId,
                p_order_id: orderId,
                p_order_item_id: orderItemId,
                p_quantity: quantity,
            });
            if (error) return json({ error: error.message || "Errore consegna prodotto" }, 409);

            const order = await readOrderById(restaurantId, orderId);
            return json({ success: true, result: data, order });
        }

        return json({ error: "Azione non valida" }, 400);
    } catch (err: any) {
        console.error("[TAKEAWAY-PICKUP-QR] error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});
