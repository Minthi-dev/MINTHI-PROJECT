import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { restaurantId } = await req.json();

        if (!restaurantId) {
            return new Response(
                JSON.stringify({ error: "restaurantId mancante" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Get restaurant's Stripe Connect account ID
        const { data: restaurant, error: dbError } = await supabase
            .from("restaurants")
            .select("stripe_connect_account_id")
            .eq("id", restaurantId)
            .single();

        if (dbError || !restaurant?.stripe_connect_account_id) {
            return new Response(
                JSON.stringify({ error: "Account Stripe Connect non trovato" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create a login link for the Express Dashboard
        const loginLink = await stripe.accounts.createLoginLink(
            restaurant.stripe_connect_account_id
        );

        return new Response(
            JSON.stringify({ url: loginLink.url }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
    } catch (error: any) {
        console.error("Error creating Express login link:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Errore creazione link dashboard" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
