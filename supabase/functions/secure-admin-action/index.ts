import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Stripe/subscription fields that should never be set from frontend
const FORBIDDEN_FIELDS = [
    "stripe_customer_id", "stripe_subscription_id",
    "stripe_connect_account_id", "stripe_connect_enabled",
    "subscription_status",
];

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    try {
        const { userId, action, restaurantId, data, targetId } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti (userId, action)" }, 400);

        // 1. Verify user is ADMIN
        const { data: user } = await supabase
            .from("users")
            .select("id, role")
            .eq("id", userId)
            .maybeSingle();

        if (!user || user.role !== "ADMIN") {
            return json({ error: "Non autorizzato: solo admin" }, 403);
        }

        // 2. Route to action
        switch (action) {
            case "create_restaurant": {
                if (!data || !data.name || !data.owner_id) {
                    return json({ error: "name e owner_id richiesti" }, 400);
                }
                const safeData = { ...data };
                for (const f of FORBIDDEN_FIELDS) delete safeData[f];

                const { error } = await supabase.from("restaurants").insert(safeData);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "delete_restaurant": {
                if (!restaurantId) return json({ error: "restaurantId richiesto" }, 400);

                // Get restaurant info for cleanup
                const { data: restaurant } = await supabase
                    .from("restaurants")
                    .select("logo_url, owner_id")
                    .eq("id", restaurantId)
                    .single();

                // Cascading delete (leaves → root)
                const { data: orders } = await supabase.from("orders").select("id").eq("restaurant_id", restaurantId);
                if (orders && orders.length > 0) {
                    await supabase.from("order_items").delete().in("order_id", orders.map(o => o.id));
                }

                await supabase.from("waiter_activity_logs").delete().eq("restaurant_id", restaurantId);
                await supabase.from("restaurant_staff").delete().eq("restaurant_id", restaurantId);
                await supabase.from("subscription_payments").delete().eq("restaurant_id", restaurantId);
                await supabase.from("restaurant_bonuses").delete().eq("restaurant_id", restaurantId);
                await supabase.from("restaurant_discounts").delete().eq("restaurant_id", restaurantId);
                await supabase.from("orders").delete().eq("restaurant_id", restaurantId);
                await supabase.from("table_sessions").delete().eq("restaurant_id", restaurantId);
                await supabase.from("bookings").delete().eq("restaurant_id", restaurantId);

                // Custom menus
                const { data: menus } = await supabase.from("custom_menus").select("id").eq("restaurant_id", restaurantId);
                if (menus && menus.length > 0) {
                    const menuIds = menus.map(m => m.id);
                    await supabase.from("custom_menu_schedules").delete().in("custom_menu_id", menuIds);
                    await supabase.from("custom_menu_dishes").delete().in("custom_menu_id", menuIds);
                }
                await supabase.from("custom_menus").delete().eq("restaurant_id", restaurantId);

                await supabase.from("dishes").delete().eq("restaurant_id", restaurantId);
                await supabase.from("categories").delete().eq("restaurant_id", restaurantId);
                await supabase.from("tables").delete().eq("restaurant_id", restaurantId);
                await supabase.from("rooms").delete().eq("restaurant_id", restaurantId);

                // Delete logo from storage
                if (restaurant?.logo_url) {
                    try {
                        const urlParts = restaurant.logo_url.split("/");
                        const fileName = urlParts[urlParts.length - 1];
                        if (fileName) await supabase.storage.from("logos").remove([fileName]);
                    } catch (e) { console.warn("Could not delete logo", e); }
                }

                // Delete restaurant
                const { error } = await supabase.from("restaurants").delete().eq("id", restaurantId);
                if (error) return json({ error: error.message }, 500);

                // Delete owner user if not ADMIN
                if (restaurant?.owner_id) {
                    try {
                        const { data: ownerUser } = await supabase.from("users").select("role").eq("id", restaurant.owner_id).single();
                        if (ownerUser?.role !== "ADMIN") {
                            await supabase.from("users").delete().eq("id", restaurant.owner_id);
                        }
                    } catch (e) { console.warn("Could not delete owner", e); }
                }
                break;
            }

            case "nuke_database": {
                // DANGEROUS: Wipe all data except admin users
                await supabase.from("pin_attempts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("cart_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("table_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("bookings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("custom_menu_schedules").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("custom_menu_dishes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("custom_menus").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("dishes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("categories").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("tables").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("rooms").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("waiter_activity_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("subscription_payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("restaurant_bonuses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("restaurant_discounts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("restaurant_staff").delete().neq("restaurant_id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("restaurants").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("pending_registrations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("registration_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("archived_order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("archived_orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("archived_table_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await supabase.from("users").delete().neq("role", "ADMIN");
                break;
            }

            case "toggle_payment_status": {
                // Toggle admin_completed on subscription_payments
                if (!targetId || data?.admin_completed === undefined) {
                    return json({ error: "targetId e admin_completed richiesti" }, 400);
                }
                const { error } = await supabase
                    .from("subscription_payments")
                    .update({ admin_completed: data.admin_completed })
                    .eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-ADMIN] Errore:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Errore interno" }),
            { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }
});
