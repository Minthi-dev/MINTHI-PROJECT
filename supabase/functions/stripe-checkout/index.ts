import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess, validateRedirectUrl } from "../_shared/auth.ts";

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
        const { userId, priceId, restaurantId, pendingRegistrationId, successUrl, cancelUrl, couponId, sessionToken } = await req.json();

        // Auth: existing restaurant requires userId + verifyAccess; registration flow skips auth
        if (restaurantId && !pendingRegistrationId) {
            if (!userId) {
                return new Response(JSON.stringify({ error: "Authentication required" }), {
                    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
            if (!access.valid) {
                return new Response(JSON.stringify({ error: "Forbidden" }), {
                    status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }

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

        // Ancora il ciclo al 1° del mese senza usare un trial gratuito implicito:
        // Stripe incassa subito il prorata iniziale e poi fattura il pieno ogni 1°.
        const now = new Date();
        const firstOfNextMonth = new Date(Date.UTC(
            now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
            now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1,
            1, 0, 0, 0
        ));
        const billingCycleAnchor = Math.floor(firstOfNextMonth.getTime() / 1000);

        // Se oggi è il 1°, l'addebito parte subito e il rinnovo rimane naturalmente al 1°.
        const isFirstOfMonth = now.getUTCDate() === 1;
        const subscriptionData: Record<string, unknown> = {
            metadata,
            ...(!isFirstOfMonth ? {
                billing_cycle_anchor: billingCycleAnchor,
                proration_behavior: "create_prorations",
            } : {}),
        };

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: validateRedirectUrl(successUrl, `${origin}/register-success`),
            cancel_url: validateRedirectUrl(cancelUrl, `${origin}/register-cancelled`),
            metadata,
            client_reference_id: pendingRegistrationId || restaurantId,
            ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
            subscription_data: subscriptionData as any,
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
