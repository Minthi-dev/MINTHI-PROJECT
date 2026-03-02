import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.9.0?target=deno";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2022-11-15",
    httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
    // Gestione preflight CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { priceId, restaurantId, successUrl, cancelUrl } = await req.json();

        if (!priceId || !restaurantId) {
            return new Response(JSON.stringify({ error: "Mancano parametri necessari (priceId, restaurantId)" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Creazione della sessione di Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: successUrl || `${req.headers.get("origin")}/dashboard?payment=success`,
            cancel_url: cancelUrl || `${req.headers.get("origin")}/dashboard?payment=cancelled`,
            metadata: {
                paymentType: "subscription",
                restaurantId: restaurantId,
            },
            client_reference_id: restaurantId,
        });

        return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error) {
        console.error("Errore Stripe Checkout:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
