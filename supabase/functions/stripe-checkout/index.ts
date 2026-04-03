import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyApiKey, validateRedirectUrl } from "../_shared/auth.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const authError = verifyApiKey(req, corsHeaders);
    if (authError) return authError;

    try {
        const { priceId, restaurantId, pendingRegistrationId, successUrl, cancelUrl, couponId } = await req.json();

        if (!priceId || (!restaurantId && !pendingRegistrationId)) {
            return new Response(JSON.stringify({ error: "Mancano parametri: priceId e (restaurantId o pendingRegistrationId)" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const origin = req.headers.get("origin") || "https://minthi.it";

        // Metadati: distingue registrazione nuova (pending) da ristorante esistente
        const metadata: Record<string, string> = { paymentType: "subscription" };
        if (pendingRegistrationId) {
            metadata.pendingRegistrationId = pendingRegistrationId;
        } else {
            metadata.restaurantId = restaurantId;
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: validateRedirectUrl(successUrl, `${origin}/register-success`),
            cancel_url: validateRedirectUrl(cancelUrl, `${origin}/register-cancelled`),
            metadata,
            client_reference_id: pendingRegistrationId || restaurantId,
            ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
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
