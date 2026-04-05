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

        // For update/delete without restaurantId, look it up from the record
        let resolvedRestaurantId = restaurantId;
        if (!resolvedRestaurantId && targetId) {
            // Try categories first, then dishes
            const { data: cat } = await supabase.from("categories").select("restaurant_id").eq("id", targetId).maybeSingle();
            if (cat) {
                resolvedRestaurantId = cat.restaurant_id;
            } else {
                const { data: dish } = await supabase.from("dishes").select("category_id").eq("id", targetId).maybeSingle();
                if (dish) {
                    const { data: dishCat } = await supabase.from("categories").select("restaurant_id").eq("id", dish.category_id).maybeSingle();
                    resolvedRestaurantId = dishCat?.restaurant_id;
                }
            }
        }

        if (!resolvedRestaurantId) return json({ error: "restaurantId non determinabile" }, 400);

        // Verify owner or admin
        const access = await verifyAccess(supabase, userId, resolvedRestaurantId);
        if (!access.valid || access.isStaff) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            // ---- CATEGORIES ----
            case "create_category": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const { data: result, error } = await supabase.from("categories").insert(data).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: result });
            }
            case "update_category": {
                const id = targetId || data?.id;
                if (!id || !data) return json({ error: "id e data richiesti" }, 400);
                const payload = { ...data }; delete payload.id;
                const { error } = await supabase.from("categories").update(payload).eq("id", id);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "delete_category": {
                const id = targetId;
                if (!id) return json({ error: "targetId richiesto" }, 400);
                const { error } = await supabase.from("categories").delete().eq("id", id);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            // ---- DISHES ----
            case "create_dish": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const { error } = await supabase.from("dishes").insert(data);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "update_dish": {
                const id = targetId || data?.id;
                if (!id || !data) return json({ error: "id e data richiesti" }, 400);
                const payload = { ...data }; delete payload.id;
                const { error } = await supabase.from("dishes").update(payload).eq("id", id);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "delete_dish": {
                const id = targetId;
                if (!id) return json({ error: "targetId richiesto" }, 400);
                const { error } = await supabase.from("dishes").delete().eq("id", id);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-MENU] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
