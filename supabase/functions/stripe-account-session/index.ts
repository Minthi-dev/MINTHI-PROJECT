import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2026-02-25.clover" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { userId, restaurantId } = await req.json();

        if (!restaurantId) {
            return new Response(
                JSON.stringify({ error: "restaurantId richiesto" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
        if (!userId) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        const access = await verifyAccess(supabase, userId, restaurantId);
        if (!access.valid) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
                status: 403,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: restaurant, error: dbError } = await supabase
            .from("restaurants")
            .select("stripe_connect_account_id")
            .eq("id", restaurantId)
            .single();

        if (dbError || !restaurant) {
            return new Response(
                JSON.stringify({ error: "Ristorante non trovato" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!restaurant.stripe_connect_account_id) {
            return new Response(
                JSON.stringify({ error: "Nessun account Stripe Connect collegato. Avvia prima l'onboarding." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const accountSession = await stripe.accountSessions.create({
            account: restaurant.stripe_connect_account_id,
            components: {
                account_onboarding: {
                    enabled: true,
                },
            },
        });

        return new Response(
            JSON.stringify({ clientSecret: accountSession.client_secret }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
    } catch (error: any) {
        console.error("Errore Account Session:", error.message, error.stack);
        return new Response(
            JSON.stringify({ error: error.message || "Errore interno" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
