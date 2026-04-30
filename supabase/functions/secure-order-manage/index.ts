import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const VALID_ORDER_STATUSES = ["OPEN", "PENDING", "PREPARING", "READY", "PICKED_UP", "PAID", "CANCELLED"];
const VALID_ITEM_STATUSES = ["PENDING", "IN_PREPARATION", "READY", "SERVED", "DELIVERED", "PAID", "CANCELLED"];

async function getSessionOrderIds(sessionId: string, restaurantId: string): Promise<{ orderIds: string[]; error?: string }> {
    const { data: orders, error } = await supabase
        .from("orders")
        .select("id")
        .eq("table_session_id", sessionId)
        .eq("restaurant_id", restaurantId);

    if (error) return { orderIds: [], error: error.message };
    return { orderIds: (orders || []).map((order: any) => order.id) };
}

async function verifyOrderIds(orderIds: string[], restaurantId: string): Promise<{ valid: boolean; error?: string }> {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return { valid: false, error: "orderIds richiesto" };
    }

    const uniqueIds = [...new Set(orderIds)];
    const { data: orders, error } = await supabase
        .from("orders")
        .select("id, restaurant_id")
        .in("id", uniqueIds);

    if (error) return { valid: false, error: error.message };
    if (!orders || orders.length !== uniqueIds.length) {
        return { valid: false, error: "Uno o più ordini non esistono" };
    }
    if (orders.some((order: any) => order.restaurant_id !== restaurantId)) {
        return { valid: false, error: "Ordini di un altro ristorante non consentiti" };
    }

    return { valid: true };
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        const body = await req.json();
        const { userId, action, sessionId, orderIds, orderId, itemId, paymentMethod, data, sessionToken } = body;
        const json = (b: any, status = 200) =>
            new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti" }, 400);

        // Determine restaurantId from context
        let restaurantId: string | null = null;

        if (sessionId) {
            const { data: session } = await supabase
                .from("table_sessions").select("restaurant_id").eq("id", sessionId).maybeSingle();
            restaurantId = session?.restaurant_id || null;
        } else if (orderId) {
            const { data: order } = await supabase
                .from("orders").select("restaurant_id").eq("id", orderId).maybeSingle();
            restaurantId = order?.restaurant_id || null;
        } else if (orderIds && orderIds.length > 0) {
            const { data: order } = await supabase
                .from("orders").select("restaurant_id").eq("id", orderIds[0]).maybeSingle();
            restaurantId = order?.restaurant_id || null;
        } else if (itemId) {
            const { data: item } = await supabase
                .from("order_items").select("order_id, order:orders(restaurant_id)").eq("id", itemId).maybeSingle();
            restaurantId = (item?.order as any)?.restaurant_id || null;
        } else if (data?.operations?.length) {
            const firstOperation = data.operations.find((op: any) => op.itemId || op.orderId);
            if (firstOperation?.orderId) {
                const { data: order } = await supabase
                    .from("orders").select("restaurant_id").eq("id", firstOperation.orderId).maybeSingle();
                restaurantId = order?.restaurant_id || null;
            } else if (firstOperation?.itemId) {
                const { data: item } = await supabase
                    .from("order_items").select("order_id, order:orders(restaurant_id)").eq("id", firstOperation.itemId).maybeSingle();
                restaurantId = (item?.order as any)?.restaurant_id || null;
            }
        } else if (data?.restaurant_id) {
            restaurantId = data.restaurant_id;
        } else if (data?.order?.restaurant_id) {
            restaurantId = data.order.restaurant_id;
        } else if (data?.order?.table_session_id) {
            const { data: sess } = await supabase
                .from("table_sessions").select("restaurant_id").eq("id", data.order.table_session_id).maybeSingle();
            restaurantId = sess?.restaurant_id || null;
        }

        if (!restaurantId) return json({ error: "Contesto ristorante non trovato" }, 404);

        const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            // === Existing actions ===
            case "mark_paid_session": {
                if (!sessionId) return json({ error: "sessionId richiesto" }, 400);
                const pm = paymentMethod || "cash";
                const resolved = await getSessionOrderIds(sessionId, restaurantId);
                if (resolved.error) return json({ error: resolved.error }, 500);
                const { error } = await supabase
                    .from("orders")
                    .update({ status: "PAID", payment_method: pm, closed_at: new Date().toISOString() })
                    .eq("table_session_id", sessionId)
                    .eq("restaurant_id", restaurantId)
                    .neq("status", "PAID")
                    .neq("status", "CANCELLED");
                if (error) return json({ error: error.message }, 500);
                if (resolved.orderIds.length > 0) {
                    const { error: itemsError } = await supabase
                        .from("order_items")
                        .update({ status: "PAID" })
                        .in("order_id", resolved.orderIds)
                        .not("status", "in", "(PAID,CANCELLED)");
                    if (itemsError) return json({ error: itemsError.message }, 500);
                }
                break;
            }
            case "cancel_session": {
                if (!sessionId) return json({ error: "sessionId richiesto" }, 400);
                const resolved = await getSessionOrderIds(sessionId, restaurantId);
                if (resolved.error) return json({ error: resolved.error }, 500);
                const { error } = await supabase
                    .from("orders")
                    .update({ status: "CANCELLED", closed_at: new Date().toISOString() })
                    .eq("table_session_id", sessionId)
                    .eq("restaurant_id", restaurantId)
                    .neq("status", "PAID")
                    .neq("status", "COMPLETED");
                if (error) return json({ error: error.message }, 500);
                if (resolved.orderIds.length > 0) {
                    const { error: itemsError } = await supabase
                        .from("order_items")
                        .update({ status: "CANCELLED" })
                        .in("order_id", resolved.orderIds)
                        .not("status", "in", "(PAID,CANCELLED)");
                    if (itemsError) return json({ error: itemsError.message }, 500);
                }
                break;
            }
            case "mark_paid_orders": {
                if (!orderIds || orderIds.length === 0) return json({ error: "orderIds richiesto" }, 400);
                const verification = await verifyOrderIds(orderIds, restaurantId);
                if (!verification.valid) return json({ error: verification.error || "Ordini non validi" }, 403);
                const uniqueIds = [...new Set(orderIds)];
                const pm = paymentMethod || "cash";
                const { error } = await supabase
                    .from("orders")
                    .update({ status: "PAID", payment_method: pm, closed_at: new Date().toISOString() })
                    .in("id", uniqueIds)
                    .eq("restaurant_id", restaurantId);
                if (error) return json({ error: error.message }, 500);
                const { error: itemsError } = await supabase
                    .from("order_items")
                    .update({ status: "PAID" })
                    .in("order_id", uniqueIds)
                    .not("status", "in", "(PAID,CANCELLED)");
                if (itemsError) return json({ error: itemsError.message }, 500);
                break;
            }
            case "mark_paid_stripe": {
                if (!orderIds || orderIds.length === 0) return json({ error: "orderIds richiesto" }, 400);
                const verification = await verifyOrderIds(orderIds, restaurantId);
                if (!verification.valid) return json({ error: verification.error || "Ordini non validi" }, 403);
                const uniqueIds = [...new Set(orderIds)];
                const { error } = await supabase
                    .from("orders")
                    .update({ status: "PAID", payment_method: "stripe", closed_at: new Date().toISOString() })
                    .in("id", uniqueIds)
                    .eq("restaurant_id", restaurantId);
                if (error) return json({ error: error.message }, 500);
                const { error: itemsError } = await supabase
                    .from("order_items")
                    .update({ status: "PAID" })
                    .in("order_id", uniqueIds)
                    .not("status", "in", "(PAID,CANCELLED)");
                if (itemsError) return json({ error: itemsError.message }, 500);
                break;
            }

            // === New: order CRUD ===
            case "create_order": {
                if (!data?.order || !data?.items) return json({ error: "order e items richiesti" }, 400);
                const orderPayload = {
                    restaurant_id: data.order.restaurant_id || restaurantId,
                    table_session_id: data.order.table_session_id,
                    status: data.order.status || "PENDING",
                    total_amount: data.order.total_amount || 0,
                };
                const { data: newOrder, error: orderError } = await supabase
                    .from("orders").insert(orderPayload).select().single();
                if (orderError) return json({ error: orderError.message }, 500);

                if (data.items.length > 0) {
                    const dishIds = [...new Set(data.items.map((item: any) => item.dish_id).filter(Boolean))];
                    const { data: dishes } = dishIds.length > 0
                        ? await supabase.from("dishes").select("id, name, price, vat_rate").in("id", dishIds)
                        : { data: [] as any[] };
                    const dishMap = new Map((dishes || []).map((d: any) => [d.id, d]));
                    const items = data.items.map((item: any) => ({
                        order_id: newOrder.id,
                        dish_id: item.dish_id,
                        quantity: item.quantity || 1,
                        status: "PENDING",
                        note: item.note || null,
                        course_number: item.course_number || null,
                        dish_name_snapshot: dishMap.get(item.dish_id)?.name || item.dish_name_snapshot || null,
                        unit_price_snapshot: dishMap.get(item.dish_id)?.price ?? item.unit_price_snapshot ?? null,
                        vat_rate_snapshot: dishMap.get(item.dish_id)?.vat_rate ?? item.vat_rate_snapshot ?? null,
                    }));
                    const { error: itemsError } = await supabase.from("order_items").insert(items);
                    if (itemsError) return json({ error: itemsError.message }, 500);
                }
                return json({ success: true, data: newOrder });
            }

            case "update_order": {
                if (!orderId || !data) return json({ error: "orderId e data richiesti" }, 400);
                const allowed = ["status", "total_amount", "payment_method", "closed_at"];
                const payload: any = {};
                for (const key of allowed) {
                    if (data[key] !== undefined) payload[key] = data[key];
                }
                if (payload.status && !VALID_ORDER_STATUSES.includes(payload.status)) {
                    return json({ error: "Stato ordine non valido" }, 400);
                }
                const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "update_order_item": {
                if (!itemId || !data) return json({ error: "itemId e data richiesti" }, 400);
                const allowed = ["status", "quantity", "note", "course_number", "ready_at"];
                const payload: any = {};
                for (const key of allowed) {
                    if (data[key] !== undefined) payload[key] = data[key];
                }
                if (payload.status && !VALID_ITEM_STATUSES.includes(payload.status)) {
                    return json({ error: "Stato item non valido" }, 400);
                }
                const { error } = await supabase.from("order_items").update(payload).eq("id", itemId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            // === Bill operations (from TableBillDialog) ===
            case "pay_items": {
                // Mark specific items as PAID, handling partial quantities
                if (!data?.operations) return json({ error: "operations richiesto" }, 400);
                for (const op of data.operations) {
                    if (op.type === "mark_paid") {
                        const { data: item } = await supabase
                            .from("order_items")
                            .select("order:orders(restaurant_id)")
                            .eq("id", op.itemId)
                            .maybeSingle();
                        if ((item?.order as any)?.restaurant_id !== restaurantId) {
                            return json({ error: "Item non appartiene a questo ristorante" }, 403);
                        }
                        const { error } = await supabase.from("order_items").update({ status: "PAID" }).eq("id", op.itemId);
                        if (error) return json({ error: error.message }, 500);
                    } else if (op.type === "split_and_pay") {
                        // Decrement original, insert new PAID row
                        const { data: originalItem } = await supabase
                            .from("order_items")
                            .select("dish_name_snapshot, unit_price_snapshot, vat_rate_snapshot, order:orders(restaurant_id)")
                            .eq("id", op.itemId)
                            .maybeSingle();
                        if ((originalItem?.order as any)?.restaurant_id !== restaurantId) {
                            return json({ error: "Item non appartiene a questo ristorante" }, 403);
                        }
                        const { error: updateErr } = await supabase
                            .from("order_items").update({ quantity: op.remainingQty }).eq("id", op.itemId);
                        if (updateErr) return json({ error: updateErr.message }, 500);
                        const { error: insertErr } = await supabase.from("order_items").insert({
                            order_id: op.orderId,
                            dish_id: op.dishId,
                            course_number: op.courseNumber || null,
                            note: op.note || null,
                            quantity: op.paidQty,
                            status: "PAID",
                            dish_name_snapshot: originalItem?.dish_name_snapshot || null,
                            unit_price_snapshot: originalItem?.unit_price_snapshot ?? null,
                            vat_rate_snapshot: originalItem?.vat_rate_snapshot || null,
                        });
                        if (insertErr) return json({ error: insertErr.message }, 500);
                    }
                }
                break;
            }

            case "cancel_item": {
                // Cancel or decrement item quantity
                if (!itemId) return json({ error: "itemId richiesto" }, 400);
                if (data?.decrement) {
                    const { data: item } = await supabase.from("order_items").select("quantity").eq("id", itemId).single();
                    if (!item) return json({ error: "Item non trovato" }, 404);
                    if (item.quantity > 1) {
                        const { error } = await supabase.from("order_items").update({ quantity: item.quantity - 1 }).eq("id", itemId);
                        if (error) return json({ error: error.message }, 500);
                    } else {
                        const { error } = await supabase.from("order_items").update({ status: "CANCELLED" }).eq("id", itemId);
                        if (error) return json({ error: error.message }, 500);
                    }
                } else {
                    const { error } = await supabase.from("order_items").update({ status: "CANCELLED" }).eq("id", itemId);
                    if (error) return json({ error: error.message }, 500);
                }
                break;
            }

            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-ORDER] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
