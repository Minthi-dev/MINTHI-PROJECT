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
        const { userId, action, restaurantId, data } = await req.json();

        if (!userId || !action) {
            return new Response(
                JSON.stringify({ error: "Parametri mancanti (userId, action)" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // 1. Verify user is ADMIN
        const { data: user } = await supabase
            .from("users")
            .select("id, role")
            .eq("id", userId)
            .maybeSingle();

        if (!user || user.role !== "ADMIN") {
            return new Response(
                JSON.stringify({ error: "Non autorizzato: solo admin" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // 2. Route to action
        switch (action) {
            case "create_restaurant": {
                if (!data || !data.name || !data.owner_id) {
                    return new Response(
                        JSON.stringify({ error: "name e owner_id richiesti" }),
                        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                const safeData = { ...data };
                for (const f of FORBIDDEN_FIELDS) delete safeData[f];

                const { error } = await supabase.from("restaurants").insert(safeData);
                if (error) {
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                break;
            }

            case "delete_restaurant": {
                if (!restaurantId) {
                    return new Response(
                        JSON.stringify({ error: "restaurantId richiesto" }),
                        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
                const { error } = await supabase
                    .from("restaurants")
                    .delete()
                    .eq("id", restaurantId);
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
        console.error("[SECURE-ADMIN] Errore:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Errore interno" }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
    }
});
