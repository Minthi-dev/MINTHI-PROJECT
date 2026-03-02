import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.9.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2022-11-15",
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
        const { restaurantId, returnUrl, refreshUrl } = await req.json();

        if (!restaurantId) {
            return new Response(JSON.stringify({ error: "restaurantId richiesto" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: restaurant, error } = await supabase
            .from("restaurants")
            .select("stripe_connect_account_id, name, email")
            .eq("id", restaurantId)
            .single();

        if (error || !restaurant) {
            return new Response(JSON.stringify({ error: "Ristorante non trovato" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        let accountId = restaurant.stripe_connect_account_id;

        // Crea account Connect se non esiste ancora
        if (!accountId) {
            const account = await stripe.accounts.create({
                type: "express",
                country: "IT",
                email: restaurant.email || undefined,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
            });

            accountId = account.id;

            await supabase
                .from("restaurants")
                .update({ stripe_connect_account_id: accountId })
                .eq("id", restaurantId);
        }

        const origin = req.headers.get("origin") || "http://localhost:5173";
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: refreshUrl || `${origin}/?connect=refresh&restaurantId=${restaurantId}`,
            return_url: returnUrl || `${origin}/?connect=success`,
            type: "account_onboarding",
        });

        return new Response(JSON.stringify({ url: accountLink.url, accountId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error) {
        console.error("Errore Stripe Connect:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
