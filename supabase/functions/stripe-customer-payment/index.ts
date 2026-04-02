import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, isValidUUID } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
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
            tableId,
            paidOrderItemIds, // Array of order_item IDs when paying per-piatto
        } = await req.json();

        if (!isValidUUID(restaurantId) || !orderIds || !items || items.length === 0) {
            return new Response(
                JSON.stringify({ error: "Parametri mancanti (restaurantId, orderIds, items)" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // Verifica che il ristorante abbia i pagamenti Stripe abilitati
        const { data: restaurant } = await supabase
            .from("restaurants")
            .select("id, name, enable_stripe_payments, stripe_customer_id, stripe_connect_account_id, stripe_connect_enabled")
            .eq("id", restaurantId)
            .single();

        if (!restaurant || !restaurant.enable_stripe_payments) {
            return new Response(
                JSON.stringify({ error: "Pagamenti online non abilitati per questo ristorante" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        if (!restaurant.stripe_connect_account_id) {
            return new Response(
                JSON.stringify({ error: "Il ristorante non ha ancora configurato l'account di pagamento per ricevere fondi" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // Crea le line items per Stripe, escludendo elementi con prezzo 0 (come piatti AYCE se costo è coperto in origine)
        const lineItems = items
            .filter((item: { name: string; price: number; quantity: number }) => item.price > 0)
            .map((item: { name: string; price: number; quantity: number }) => ({
                price_data: {
                    currency: "eur",
                    product_data: {
                        name: item.name,
                    },
                    unit_amount: Math.round(item.price * 100), // Stripe usa centesimi
                },
                quantity: item.quantity,
            }));

        if (lineItems.length === 0) {
            return new Response(
                JSON.stringify({ error: "Il totale da pagare tramite Stripe deve essere maggiore di 0€" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // Array of orderIds might exceed 500 chars if the customer has many separated orders in the session.
        const orderIdsStr = JSON.stringify(orderIds);
        const safeOrderIdsMetadata = orderIdsStr.length > 500 ? "multiple_orders_overflow" : orderIdsStr;

        // Crea la sessione di checkout con Direct Charge — i fondi vanno direttamente sul conto del ristorante
        // Il secondo argomento { stripeAccount } crea la sessione sull'account connesso (Direct Charge)
        // I soldi NON passano mai dal conto MINTHI
        const session = await stripe.checkout.sessions.create(
            {
                payment_method_types: ["card"],
                mode: "payment",
                line_items: lineItems,
                success_url: successUrl || `${req.headers.get("origin")}/client/table/${tableId}?payment=success`,
                cancel_url: cancelUrl || `${req.headers.get("origin")}/client/table/${tableId}?payment=cancelled`,
                metadata: {
                    paymentType: "customer_order",
                    restaurantId,
                    tableSessionId: tableSessionId || "",
                    orderIds: safeOrderIdsMetadata,
                    splitLabel: splitLabel || "Pagamento",
                    ...(paidOrderItemIds && paidOrderItemIds.length > 0
                        ? { paidOrderItemIds: JSON.stringify(paidOrderItemIds).slice(0, 500) }
                        : {}),
                },
                ...(customerEmail ? { customer_email: customerEmail } : {}),
            },
            {
                stripeAccount: restaurant.stripe_connect_account_id,
            }
        );

        return new Response(
            JSON.stringify({ sessionId: session.id, url: session.url }),
            { headers: { ...cors, "Content-Type": "application/json" }, status: 200 }
        );
    } catch (error) {
        console.error("Errore Stripe Customer Payment:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...cors, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
