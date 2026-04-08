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

            case "suspend_restaurant": {
                if (!restaurantId || !data?.reason) return json({ error: "restaurantId e reason richiesti" }, 400);
                const { error } = await supabase
                    .from("restaurants")
                    .update({ is_active: false, suspension_reason: data.reason })
                    .eq("id", restaurantId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "reactivate_restaurant": {
                if (!restaurantId) return json({ error: "restaurantId richiesto" }, 400);
                const { error } = await supabase
                    .from("restaurants")
                    .update({ is_active: true, suspension_reason: null })
                    .eq("id", restaurantId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "create_bonus": {
                if (!data?.restaurant_id || !data?.free_months) return json({ error: "restaurant_id e free_months richiesti" }, 400);
                const expiresAt = new Date();
                expiresAt.setMonth(expiresAt.getMonth() + data.free_months);
                const { data: bonus, error } = await supabase
                    .from("restaurant_bonuses")
                    .insert({
                        restaurant_id: data.restaurant_id,
                        free_months: data.free_months,
                        reason: data.reason || null,
                        granted_by: data.granted_by || null,
                        expires_at: expiresAt.toISOString(),
                        is_active: true,
                    })
                    .select()
                    .single();
                if (error) return json({ error: error.message }, 500);
                // Reactivate restaurant if suspended
                await supabase.from("restaurants").update({ is_active: true, suspension_reason: null }).eq("id", data.restaurant_id);
                return json({ success: true, data: bonus });
            }

            case "deactivate_bonus": {
                if (!targetId) return json({ error: "targetId richiesto" }, 400);
                const { error } = await supabase.from("restaurant_bonuses").update({ is_active: false }).eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "set_app_config": {
                if (!data?.key || data?.value === undefined) return json({ error: "key e value richiesti" }, 400);
                const { error } = await supabase
                    .from("app_config")
                    .upsert({ key: data.key, value: data.value, updated_at: new Date().toISOString() }, { onConflict: "key" });
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "create_registration_token": {
                const freeMonths = data?.free_months || 0;
                const discountPercent = data?.discount_percent || 0;
                const discountDuration = data?.discount_duration || "once";
                const stripeCouponId = data?.stripe_coupon_id || null;

                // Check if token with same params already exists
                const { data: existing } = await supabase
                    .from("registration_tokens")
                    .select("id, token")
                    .eq("free_months", freeMonths)
                    .eq("discount_percent", discountPercent)
                    .eq("discount_duration", discountDuration)
                    .gt("expires_at", new Date().toISOString())
                    .maybeSingle();
                if (existing) return json({ success: true, data: existing });

                const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
                const { data: newToken, error } = await supabase
                    .from("registration_tokens")
                    .insert({ token, free_months: freeMonths, discount_percent: discountPercent, discount_duration: discountDuration, stripe_coupon_id: stripeCouponId })
                    .select("id, token")
                    .single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: newToken });
            }

            case "mark_token_used": {
                if (!targetId || !restaurantId) return json({ error: "targetId e restaurantId richiesti" }, 400);
                const { error } = await supabase
                    .from("registration_tokens")
                    .update({ used: true, used_by_restaurant_id: restaurantId })
                    .eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "update_subscription_payment": {
                if (!targetId || !data) return json({ error: "targetId e data richiesti" }, 400);
                // Solo campi consentiti
                const allowedPaymentFields: Record<string, any> = {};
                if (data.admin_completed !== undefined) allowedPaymentFields.admin_completed = data.admin_completed;
                if (data.notes !== undefined) allowedPaymentFields.notes = data.notes;
                if (Object.keys(allowedPaymentFields).length === 0) return json({ error: "Nessun campo valido da aggiornare" }, 400);
                const { error } = await supabase.from("subscription_payments").update(allowedPaymentFields).eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "delete_subscription_payment": {
                if (!targetId) return json({ error: "targetId richiesto" }, 400);
                const { error } = await supabase.from("subscription_payments").delete().eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "deactivate_discount": {
                if (!targetId) return json({ error: "targetId richiesto" }, 400);
                const { error } = await supabase.from("restaurant_discounts").update({ is_active: false }).eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "dismiss_discount_banner": {
                if (!targetId) return json({ error: "targetId richiesto" }, 400);
                const { error } = await supabase.from("restaurant_discounts").update({ banner_dismissed: true }).eq("id", targetId);
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
