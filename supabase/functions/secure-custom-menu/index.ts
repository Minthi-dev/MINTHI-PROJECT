import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        const { userId, restaurantId, action, data, targetId } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti" }, 400);

        // For update/delete, resolve restaurantId from menu
        let resolvedRestaurantId = restaurantId;
        if (!resolvedRestaurantId && targetId) {
            const { data: menu } = await supabase.from("custom_menus").select("restaurant_id").eq("id", targetId).maybeSingle();
            resolvedRestaurantId = menu?.restaurant_id;
        }

        if (!resolvedRestaurantId) return json({ error: "restaurantId non determinabile" }, 400);

        // Owner or admin only
        const access = await verifyAccess(supabase, userId, resolvedRestaurantId);
        if (!access.valid || access.isStaff) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            case "create_menu": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const { data: result, error } = await supabase
                    .from("custom_menus")
                    .insert({ restaurant_id: resolvedRestaurantId, name: data.name, is_active: false })
                    .select()
                    .single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: result });
            }
            case "update_menu": {
                if (!targetId || !data) return json({ error: "targetId e data richiesti" }, 400);
                const safe = { name: data.name, description: data.description, is_active: data.is_active };
                // Remove undefined fields
                Object.keys(safe).forEach(k => { if ((safe as any)[k] === undefined) delete (safe as any)[k]; });
                const { error } = await supabase.from("custom_menus").update(safe).eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "delete_menu": {
                if (!targetId) return json({ error: "targetId richiesto" }, 400);
                // Delete related schedules and dishes first
                await supabase.from("custom_menu_schedules").delete().eq("custom_menu_id", targetId);
                await supabase.from("custom_menu_dishes").delete().eq("custom_menu_id", targetId);
                const { error } = await supabase.from("custom_menus").delete().eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "save_schedules": {
                if (!targetId) return json({ error: "targetId (menuId) richiesto" }, 400);
                // Verify menu belongs to restaurant
                const { data: menu } = await supabase.from("custom_menus").select("restaurant_id").eq("id", targetId).maybeSingle();
                if (!menu || menu.restaurant_id !== resolvedRestaurantId) return json({ error: "Menu non trovato" }, 404);

                const toRemoveIds = data?.toRemoveIds || [];
                const toAdd = data?.toAdd || [];

                // Remove schedules
                for (const id of toRemoveIds) {
                    await supabase.from("custom_menu_schedules").delete().eq("id", id);
                }
                // Add schedules
                for (const s of toAdd) {
                    await supabase.from("custom_menu_schedules").insert({
                        custom_menu_id: targetId,
                        day_of_week: s.day_of_week,
                        meal_type: s.meal_type,
                        is_active: true
                    });
                }
                break;
            }
            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-CUSTOM-MENU] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
