import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess, validateRedirectUrl } from "../_shared/auth.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
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
        const { userId, restaurantId, returnUrl } = await req.json();

        if (!userId) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        const access = await verifyAccess(supabase, userId, restaurantId);
        if (!access.valid) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
                status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (!restaurantId) {
            return new Response(JSON.stringify({ error: "restaurantId richiesto" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: restaurant, error } = await supabase
            .from("restaurants")
            .select("stripe_customer_id")
            .eq("id", restaurantId)
            .single();

        if (error || !restaurant?.stripe_customer_id) {
            return new Response(
                JSON.stringify({ error: "Nessun account Stripe trovato. Attiva prima un abbonamento." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const origin = req.headers.get("origin") || "https://minthi.it";
        const session = await stripe.billingPortal.sessions.create({
            customer: restaurant.stripe_customer_id,
            return_url: validateRedirectUrl(returnUrl, `${origin}/dashboard`),
        });

        return new Response(JSON.stringify({ url: session.url }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error) {
        console.error("Errore Billing Portal:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
