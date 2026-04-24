import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Allowed status transitions
const VALID_STATUSES = ["PENDING", "PREPARING", "IN_PREPARATION", "READY", "SERVED", "DELIVERED", "PAID", "CANCELLED"];

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        const { userId, restaurantId, action, data, sessionToken } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti" }, 400);

        // Resolve restaurantId
        let resolvedRestaurantId = restaurantId;

        // For insert, get restaurantId from the order
        if (!resolvedRestaurantId && data?.orderId) {
            const { data: order } = await supabase.from("orders").select("restaurant_id").eq("id", data.orderId).maybeSingle();
            resolvedRestaurantId = order?.restaurant_id;
        }
        // For status update, get from first item's order
        if (!resolvedRestaurantId && data?.itemIds?.length) {
            const { data: item } = await supabase
                .from("order_items")
                .select("order_id, orders(restaurant_id)")
                .eq("id", data.itemIds[0])
                .maybeSingle();
            resolvedRestaurantId = (item?.orders as any)?.restaurant_id;
        }

        if (!resolvedRestaurantId) return json({ error: "restaurantId non determinabile" }, 400);

        // Verify access (owner, admin, or staff of this restaurant)
        const access = await verifyAccess(supabase, userId, resolvedRestaurantId, sessionToken);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            case "insert_items": {
                // Waiter inserting order items
                const items = data?.items;
                if (!items || !Array.isArray(items) || items.length === 0) {
                    return json({ error: "items array richiesto" }, 400);
                }

                // Verify the order belongs to this restaurant
                const orderIds = [...new Set(items.map((i: any) => i.order_id))];
                for (const oid of orderIds) {
                    const { data: ord } = await supabase.from("orders").select("restaurant_id").eq("id", oid).maybeSingle();
                    if (!ord || ord.restaurant_id !== resolvedRestaurantId) {
                        return json({ error: "Ordine non appartiene a questo ristorante" }, 403);
                    }
                }

                // Whitelist fields
                const safeItems = items.map((i: any) => ({
                    order_id: i.order_id,
                    dish_id: i.dish_id,
                    quantity: i.quantity,
                    status: "PENDING",
                    note: i.note || null,
                    course_number: i.course_number || null,
                }));

                const { error } = await supabase.from("order_items").insert(safeItems);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "update_status": {
                // Update status of specific order items
                const itemIds = data?.itemIds;
                const status = data?.status;

                if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
                    return json({ error: "itemIds array richiesto" }, 400);
                }
                if (!status || !VALID_STATUSES.includes(status)) {
                    return json({ error: `Status non valido: ${status}` }, 400);
                }

                // Verify all items belong to this restaurant
                const { data: verifyItems } = await supabase
                    .from("order_items")
                    .select("id, order_id, orders(restaurant_id)")
                    .in("id", itemIds);

                if (verifyItems) {
                    for (const item of verifyItems) {
                        if ((item.orders as any)?.restaurant_id !== resolvedRestaurantId) {
                            return json({ error: "Item non appartiene a questo ristorante" }, 403);
                        }
                    }
                }

                const { error } = await supabase.from("order_items").update({ status }).in("id", itemIds);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-ORDER-ITEMS] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
