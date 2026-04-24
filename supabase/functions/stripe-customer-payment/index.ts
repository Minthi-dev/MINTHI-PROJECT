import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateRedirectUrl } from "../_shared/auth.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2026-02-25.clover" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // No API key / JWT verification here: this is a public endpoint called by
    // unauthenticated customers scanning a QR code.  The function validates
    // the restaurant and its Stripe Connect configuration before creating a
    // Checkout Session, so no sensitive action can be triggered without a
    // legitimate restaurantId + enabled Stripe account.

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

        if (!restaurantId || !Array.isArray(orderIds) || orderIds.length === 0 || !Array.isArray(items) || items.length === 0) {
            return new Response(
                JSON.stringify({ error: "Parametri mancanti (restaurantId, orderIds, items)" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Verifica che il ristorante abbia i pagamenti Stripe abilitati
        const { data: restaurant, error: restaurantError } = await supabase
            .from("restaurants")
            .select("id, name, enable_stripe_payments, stripe_connect_account_id, stripe_connect_enabled")
            .eq("id", restaurantId)
            .single();

        if (restaurantError || !restaurant) {
            console.error("Restaurant lookup error:", restaurantError);
            return new Response(
                JSON.stringify({ error: "Ristorante non trovato" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!restaurant.enable_stripe_payments) {
            return new Response(
                JSON.stringify({ error: "Pagamenti online non abilitati per questo ristorante" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!restaurant.stripe_connect_account_id || !restaurant.stripe_connect_enabled) {
            return new Response(
                JSON.stringify({ error: "Il ristorante non ha ancora completato la configurazione per ricevere pagamenti" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const orderIdsList = orderIds;
        const paidOrderItemIdsList = Array.isArray(paidOrderItemIds) ? paidOrderItemIds : [];
        const { data: dbOrders, error: ordersError } = await supabase
            .from("orders")
            .select("id, restaurant_id, table_session_id, status")
            .in("id", orderIdsList)
            .eq("restaurant_id", restaurantId);

        if (ordersError || !dbOrders || dbOrders.length !== orderIdsList.length) {
            console.error("Order validation error:", ordersError);
            return new Response(
                JSON.stringify({ error: "Ordini non validi per questo ristorante" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (tableSessionId && dbOrders.some((o: any) => o.table_session_id !== tableSessionId)) {
            return new Response(
                JSON.stringify({ error: "Gli ordini non appartengono a questa sessione tavolo" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (dbOrders.some((o: any) => o.status === "PAID" || o.status === "CANCELLED")) {
            return new Response(
                JSON.stringify({ error: "Uno o più ordini non sono più pagabili" }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const clientTotal = items.reduce(
            (sum: number, item: { price: number; quantity: number }) =>
                sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
            0
        );

        if (paidOrderItemIdsList.length > 0) {
            const { data: dbItems, error: itemsError } = await supabase
                .from("order_items")
                .select("id, quantity, status, order_id, paid_online_at, dish:dishes(id, name, price)")
                .in("id", paidOrderItemIdsList)
                .in("order_id", orderIdsList);

            if (itemsError || !dbItems || dbItems.length !== paidOrderItemIdsList.length) {
                console.error("Paid item validation error:", itemsError);
                return new Response(
                    JSON.stringify({ error: "Piatti selezionati non validi" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (dbItems.some((it: any) => it.status === "PAID" || it.status === "CANCELLED" || it.paid_online_at)) {
                return new Response(
                    JSON.stringify({ error: "Uno o più piatti sono già pagati o non pagabili" }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const selectedItemsTotal = dbItems.reduce((sum: number, it: any) => {
                const dish = Array.isArray(it.dish) ? it.dish[0] : it.dish;
                return sum + (Number(dish?.price) || 0) * (Number(it.quantity) || 0);
            }, 0);

            if (clientTotal + 0.01 < selectedItemsTotal) {
                return new Response(
                    JSON.stringify({ error: "Importo inferiore al totale dei piatti selezionati" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        // Crea le line items per Stripe, escludendo elementi con prezzo 0
        const lineItems = items
            .filter((item: { name: string; price: number; quantity: number }) => item.price > 0)
            .map((item: { name: string; price: number; quantity: number }) => ({
                price_data: {
                    currency: "eur",
                    product_data: {
                        name: item.name,
                    },
                    unit_amount: Math.round(item.price * 100),
                },
                quantity: item.quantity,
            }));

        if (lineItems.length === 0) {
            return new Response(
                JSON.stringify({ error: "Il totale da pagare tramite Stripe deve essere maggiore di 0€" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const orderIdsStr = JSON.stringify(orderIds);
        const safeOrderIdsMetadata = orderIdsStr.length > 500 ? "multiple_orders_overflow" : orderIdsStr;

        const origin = req.headers.get("origin") || "https://minthi.it";
        const defaultSuccessUrl = `${origin}/client/table/${tableId}?payment=success`;
        const defaultCancelUrl = `${origin}/client/table/${tableId}?payment=cancelled`;

        const session = await stripe.checkout.sessions.create(
            {
                mode: "payment",
                line_items: lineItems,
                success_url: validateRedirectUrl(successUrl, defaultSuccessUrl),
                cancel_url: validateRedirectUrl(cancelUrl, defaultCancelUrl),
                metadata: {
                    paymentType: "customer_order",
                    restaurantId,
                    tableSessionId: tableSessionId || "",
                    orderIds: safeOrderIdsMetadata,
                    splitLabel: splitLabel || "Pagamento",
                    ...(paidOrderItemIdsList.length > 0
                        ? { paidOrderItemIds: JSON.stringify(paidOrderItemIdsList).slice(0, 500) }
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
