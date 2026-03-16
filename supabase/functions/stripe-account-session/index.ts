import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { restaurantId } = await req.json();

        if (!restaurantId) {
            return new Response(
                JSON.stringify({ error: "restaurantId richiesto" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Cerca l'account Connect del ristorante
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

        // Crea Account Session per gli embedded components
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
            JSON.stringify({ error: "Errore creazione sessione account" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
