import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    try {
        const { userId, restaurantId, action, staffId, data } = await req.json();

        if (!userId || !action) {
            return new Response(
                JSON.stringify({ error: "Parametri mancanti (userId, action)" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // 1. Verify user exists
        const { data: user } = await supabase
            .from("users")
            .select("id, role")
            .eq("id", userId)
            .maybeSingle();

        if (!user) {
            return new Response(
                JSON.stringify({ error: "Utente non trovato" }),
                { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // 2. Determine target restaurant_id (from payload or staff record)
        let targetRestaurantId = restaurantId;

        if ((action === "update" || action === "delete") && staffId && !targetRestaurantId) {
            const { data: staffRecord } = await supabase
                .from("restaurant_staff")
                .select("restaurant_id")
                .eq("id", staffId)
                .maybeSingle();

            if (!staffRecord) {
                return new Response(
                    JSON.stringify({ error: "Membro staff non trovato" }),
                    { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
                );
            }
            targetRestaurantId = staffRecord.restaurant_id;
        }

        // 3. Verify ownership (owner or admin)
        if (user.role !== "ADMIN") {
            if (!targetRestaurantId) {
                return new Response(
                    JSON.stringify({ error: "restaurantId richiesto" }),
                    { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
                );
            }
            const { data: restaurant } = await supabase
                .from("restaurants")
                .select("owner_id")
                .eq("id", targetRestaurantId)
                .maybeSingle();

            if (!restaurant || restaurant.owner_id !== userId) {
                return new Response(
                    JSON.stringify({ error: "Non autorizzato" }),
                    { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
                );
            }
        }

        // 4. Route to action
        switch (action) {
            case "create": {
                if (!data || !data.restaurant_id || !data.name || !data.username) {
                    return new Response(
                        JSON.stringify({ error: "restaurant_id, name e username richiesti" }),
                        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                const payload = { ...data };
                // Hash password server-side
                if (payload.password) {
                    payload.password = bcrypt.hashSync(payload.password);
                }
                const { error } = await supabase.from("restaurant_staff").insert(payload);
                if (error) {
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                break;
            }

            case "update": {
                if (!staffId || !data) {
                    return new Response(
                        JSON.stringify({ error: "staffId e data richiesti" }),
                        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                const payload = { ...data };
                // Hash password server-side if provided
                if (payload.password) {
                    payload.password = bcrypt.hashSync(payload.password);
                }
                // Don't allow changing restaurant_id
                delete payload.restaurant_id;

                const { error } = await supabase
                    .from("restaurant_staff")
                    .update(payload)
                    .eq("id", staffId);
                if (error) {
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                break;
            }

            case "delete": {
                if (!staffId) {
                    return new Response(
                        JSON.stringify({ error: "staffId richiesto" }),
                        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                const { error } = await supabase
                    .from("restaurant_staff")
                    .delete()
                    .eq("id", staffId);
                if (error) {
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                break;
            }

            default:
                return new Response(
                    JSON.stringify({ error: `Azione non riconosciuta: ${action}` }),
                    { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
                );
        }

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("[SECURE-STAFF] Errore:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Errore interno" }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
    }
});
