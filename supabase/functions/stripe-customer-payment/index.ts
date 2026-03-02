import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.9.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2022-11-15",
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
        const {
            restaurantId,
            tableSessionId,
            orderIds,
            items, // Array of { name, price, quantity }
            totalAmount,
            customerEmail,
            splitLabel, // e.g. "Pagamento completo", "Alla romana (1/4)", "Pagamento parziale"
            successUrl,
            cancelUrl,
        } = await req.json();

        if (!restaurantId || !orderIds || !items || items.length === 0) {
            return new Response(
                JSON.stringify({ error: "Parametri mancanti (restaurantId, orderIds, items)" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Verifica che il ristorante abbia i pagamenti Stripe abilitati
        const { data: restaurant } = await supabase
            .from("restaurants")
            .select("id, name, enable_stripe_payments, stripe_customer_id")
            .eq("id", restaurantId)
            .single();

        if (!restaurant || !restaurant.enable_stripe_payments) {
            return new Response(
                JSON.stringify({ error: "Pagamenti online non abilitati per questo ristorante" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Crea le line items per Stripe
        const lineItems = items.map((item: { name: string; price: number; quantity: number }) => ({
            price_data: {
                currency: "eur",
                product_data: {
                    name: item.name,
                },
                unit_amount: Math.round(item.price * 100), // Stripe usa centesimi
            },
            quantity: item.quantity,
        }));

        // Crea la sessione di checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items: lineItems,
            success_url: successUrl || `${req.headers.get("origin")}/client/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${req.headers.get("origin")}/client/payment-cancelled`,
            metadata: {
                paymentType: "customer_order",
                restaurantId,
                tableSessionId: tableSessionId || "",
                orderIds: JSON.stringify(orderIds),
                splitLabel: splitLabel || "Pagamento",
            },
            ...(customerEmail ? { customer_email: customerEmail } : {}),
        });

        return new Response(
            JSON.stringify({ sessionId: session.id, url: session.url }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
    } catch (error) {
        console.error("Errore Stripe Customer Payment:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
