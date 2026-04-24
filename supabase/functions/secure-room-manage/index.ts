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
        const { userId, restaurantId, action, data, targetId, sessionToken } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti" }, 400);

        // For update/delete, resolve restaurantId from room
        let resolvedRestaurantId = restaurantId;
        if (!resolvedRestaurantId && targetId) {
            const { data: room } = await supabase.from("rooms").select("restaurant_id").eq("id", targetId).maybeSingle();
            resolvedRestaurantId = room?.restaurant_id;
        }

        if (!resolvedRestaurantId) return json({ error: "restaurantId non determinabile" }, 400);

        // Owner or admin only (staff cannot manage rooms)
        const access = await verifyAccess(supabase, userId, resolvedRestaurantId, sessionToken);
        if (!access.valid || access.isStaff) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            case "create": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const { data: result, error } = await supabase.from("rooms").insert({ ...data, restaurant_id: resolvedRestaurantId }).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: result });
            }
            case "update": {
                if (!targetId || !data) return json({ error: "targetId e data richiesti" }, 400);
                const { error } = await supabase.from("rooms").update(data).eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "delete": {
                if (!targetId) return json({ error: "targetId richiesto" }, 400);
                // Soft delete
                const { error } = await supabase.from("rooms").update({ is_active: false }).eq("id", targetId);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-ROOM] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
