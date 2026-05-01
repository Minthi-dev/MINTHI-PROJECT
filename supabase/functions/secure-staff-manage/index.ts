import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Campi consentiti per creazione/aggiornamento staff — tutto il resto viene ignorato
const ALLOWED_CREATE_FIELDS = ["restaurant_id", "name", "username", "password", "is_active", "role", "pin_code"];
const ALLOWED_UPDATE_FIELDS = ["name", "username", "password", "is_active", "role", "pin_code"];

function pickAllowed(data: Record<string, any>, allowed: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key of allowed) {
        if (key in data) result[key] = data[key];
    }
    return result;
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    try {
        const { userId, restaurantId, action, staffId, data, sessionToken } = await req.json();

        if (!userId || !action) {
            return new Response(
                JSON.stringify({ error: "Parametri mancanti (userId, action)" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // Determine target restaurant_id. Per update/delete deriviamo SEMPRE
        // dal record staff esistente per evitare cross-tenant: se trustassimo
        // `restaurantId` dal body, un OWNER del ristorante A potrebbe
        // modificare uno staff del ristorante B passando staffId di B e
        // restaurantId di A (verifyAccess passerebbe).
        let targetRestaurantId = restaurantId;

        if ((action === "update" || action === "delete") && staffId) {
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

        if (!targetRestaurantId) {
            return new Response(
                JSON.stringify({ error: "restaurantId richiesto" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        const access = await verifyAccess(supabase, userId, targetRestaurantId, sessionToken);
        if (!access.valid || access.isStaff) {
            return new Response(
                JSON.stringify({ error: "Non autorizzato" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // 4. Route to action
        switch (action) {
            case "create": {
                if (!data || !data.name || !data.username) {
                    return new Response(
                        JSON.stringify({ error: "name e username richiesti" }),
                        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                const payload = pickAllowed(data, ALLOWED_CREATE_FIELDS);
                // Forza il restaurant_id sul tenant autorizzato. Ignora un
                // eventuale data.restaurant_id (cross-tenant guard).
                payload.restaurant_id = targetRestaurantId;
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
                const payload = pickAllowed(data, ALLOWED_UPDATE_FIELDS);
                // Hash password server-side if provided
                if (payload.password) {
                    payload.password = bcrypt.hashSync(payload.password);
                }

                const { error } = await supabase
                    .from("restaurant_staff")
                    .update(payload)
                    .eq("id", staffId)
                    .eq("restaurant_id", targetRestaurantId);
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
                    .eq("id", staffId)
                    .eq("restaurant_id", targetRestaurantId);
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
