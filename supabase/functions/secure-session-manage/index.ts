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
        const { userId, action, sessionId, tableId, restaurantId, data } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti" }, 400);

        // Determine restaurant context
        let targetRestaurantId = restaurantId;

        if (!targetRestaurantId && sessionId) {
            const { data: session } = await supabase
                .from("table_sessions").select("restaurant_id").eq("id", sessionId).maybeSingle();
            targetRestaurantId = session?.restaurant_id;
        }
        if (!targetRestaurantId && tableId) {
            const { data: table } = await supabase
                .from("tables").select("restaurant_id").eq("id", tableId).maybeSingle();
            targetRestaurantId = table?.restaurant_id;
        }
        if (!targetRestaurantId) return json({ error: "Contesto ristorante non trovato" }, 400);

        // Verify access
        const access = await verifyAccess(supabase, userId, targetRestaurantId);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            case "create": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const payload: any = {
                    restaurant_id: data.restaurant_id || targetRestaurantId,
                    table_id: data.table_id,
                    status: "OPEN",
                    session_pin: data.session_pin || null,
                    customer_count: data.customer_count || null,
                    coperto_enabled: data.coperto_enabled ?? null,
                    ayce_enabled: data.ayce_enabled ?? null,
                };
                const { data: session, error } = await supabase
                    .from("table_sessions").insert(payload).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: session });
            }

            case "close": {
                if (!sessionId) return json({ error: "sessionId richiesto" }, 400);
                const updates: any = {
                    status: "CLOSED",
                    closed_at: new Date().toISOString(),
                };
                if (data?.closed_by_name) updates.closed_by_name = data.closed_by_name;
                if (data?.closed_by_role) updates.closed_by_role = data.closed_by_role;
                const { error } = await supabase.from("table_sessions").update(updates).eq("id", sessionId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "close_all_for_table": {
                if (!tableId) return json({ error: "tableId richiesto" }, 400);
                const updates: any = {
                    status: "CLOSED",
                    closed_at: new Date().toISOString(),
                };
                if (data?.closed_by_name) updates.closed_by_name = data.closed_by_name;
                if (data?.closed_by_role) updates.closed_by_role = data.closed_by_role;
                const { error } = await supabase
                    .from("table_sessions").update(updates).eq("table_id", tableId).eq("status", "OPEN");
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "update": {
                if (!sessionId || !data) return json({ error: "sessionId e data richiesti" }, 400);
                // Whitelist allowed fields
                const allowed = ["customer_count", "coperto_enabled", "ayce_enabled", "notes", "paid_amount"];
                const payload: any = {};
                for (const key of allowed) {
                    if (data[key] !== undefined) payload[key] = data[key];
                }
                if (Object.keys(payload).length === 0) return json({ error: "Nessun campo valido" }, 400);
                const { error } = await supabase.from("table_sessions").update(payload).eq("id", sessionId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            case "update_receipt": {
                if (!sessionId || data?.receipt_issued === undefined) return json({ error: "sessionId e receipt_issued richiesti" }, 400);
                const { error } = await supabase
                    .from("table_sessions").update({ receipt_issued: data.receipt_issued }).eq("id", sessionId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-SESSION] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
