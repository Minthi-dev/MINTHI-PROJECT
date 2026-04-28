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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function money(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return NaN;
    return Math.round(n * 100) / 100;
}

function normalizeUuidArray(value: unknown, max: number): string[] | null {
    if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
    const ids = [...new Set(value.filter((v) => typeof v === "string").map((v) => v.trim()))];
    if (ids.length === 0 || ids.length > max || ids.some((id) => !UUID_RE.test(id))) return null;
    return ids;
}

function oneRelation(row: any): any {
    return Array.isArray(row) ? row[0] : row;
}

function safeText(value: unknown, fallback: string, max = 80): string {
    if (typeof value !== "string") return fallback;
    const cleaned = value.replace(/[\r\n\t]+/g, " ").trim();
    return (cleaned || fallback).slice(0, max);
}

function scheduledPrice(args: {
    schedule: any;
    fallback: number;
    lunchStart?: string | null;
    dinnerStart?: string | null;
}): number {
    const schedule = args.schedule;
    if (!schedule) return Math.max(0, money(args.fallback) || 0);
    if (schedule.enabled === false) return 0;
    if (!schedule.useWeeklySchedule) return Math.max(0, money(schedule.defaultPrice) || 0);

    // Use the maximum configured price as a server-side cap. Edge functions
    // run in UTC, while the customer UI uses the restaurant/browser timezone;
    // a max cap avoids rejecting a legitimate dinner/lunch payment because of
    // timezone drift, while still preventing arbitrary overpayments.
    let maxPrice = Math.max(0, money(schedule.defaultPrice) || 0);
    for (const day of Object.values(schedule.schedule || {}) as any[]) {
        for (const meal of [day?.lunch, day?.dinner]) {
            if (meal && meal.enabled !== false) maxPrice = Math.max(maxPrice, money(meal.price) || 0);
        }
    }
    return maxPrice;
}

function copertoPrice(restaurant: any): number {
    return scheduledPrice({
        schedule: restaurant.weekly_coperto,
        fallback: Number(restaurant.cover_charge_per_person || 0),
        lunchStart: restaurant.lunch_time_start,
        dinnerStart: restaurant.dinner_time_start,
    });
}

function aycePrice(restaurant: any): number {
    const legacy = typeof restaurant.all_you_can_eat === "object" && restaurant.all_you_can_eat
        ? Number(restaurant.all_you_can_eat.pricePerPerson || 0)
        : 0;
    return scheduledPrice({
        schedule: restaurant.weekly_ayce,
        fallback: legacy,
        lunchStart: restaurant.lunch_time_start,
        dinnerStart: restaurant.dinner_time_start,
    });
}

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
            items, // Legacy client summary. Prices are not trusted.
            totalAmount,
            customerEmail,
            customerTaxCode,
            customerLotteryCode,
            splitLabel, // e.g. "Saldo completo", "Alla romana (1/4)", "Piatti selezionati"
            successUrl,
            cancelUrl,
            tableId,
            paidOrderItemIds, // Array of order_item IDs when paying per-piatto
        } = await req.json();

        const orderIdsList = normalizeUuidArray(orderIds, 80);
        const paidOrderItemIdsList = Array.isArray(paidOrderItemIds)
            ? normalizeUuidArray(paidOrderItemIds, 120)
            : [];
        if (!UUID_RE.test(String(restaurantId || "")) || !UUID_RE.test(String(tableSessionId || "")) || !orderIdsList || !paidOrderItemIdsList) {
            return json({ error: "Parametri mancanti o non validi" }, 400, corsHeaders);
        }

        const clientItemsTotal = Array.isArray(items)
            ? items.reduce(
                (sum: number, item: { price: number; quantity: number }) =>
                    sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
                0
            )
            : 0;
        const requestedTotal = money(totalAmount ?? clientItemsTotal);
        if (!Number.isFinite(requestedTotal) || requestedTotal <= 0 || requestedTotal > 10000) {
            return json({ error: "Importo non valido" }, 400, corsHeaders);
        }
        const cleanCustomerEmail = typeof customerEmail === "string" ? customerEmail.trim().toLowerCase().slice(0, 120) : "";
        const cleanCustomerTaxCode = typeof customerTaxCode === "string" ? customerTaxCode.trim().toUpperCase().slice(0, 16) : "";
        const cleanCustomerLotteryCode = typeof customerLotteryCode === "string" ? customerLotteryCode.trim().toUpperCase().slice(0, 8) : "";
        if (cleanCustomerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCustomerEmail)) {
            return json({ error: "Email cliente non valida" }, 400, corsHeaders);
        }
        if (cleanCustomerTaxCode && !/^[A-Z0-9]{16}$/.test(cleanCustomerTaxCode)) {
            return json({ error: "Codice fiscale cliente non valido" }, 400, corsHeaders);
        }
        if (cleanCustomerLotteryCode && !/^[A-Z0-9]{8}$/.test(cleanCustomerLotteryCode)) {
            return json({ error: "Codice lotteria scontrini non valido" }, 400, corsHeaders);
        }

        // Verifica che il ristorante abbia i pagamenti Stripe abilitati
        const { data: restaurant, error: restaurantError } = await supabase
            .from("restaurants")
            .select("id, name, enable_stripe_payments, stripe_connect_account_id, stripe_connect_enabled, cover_charge_per_person, weekly_coperto, all_you_can_eat, weekly_ayce, lunch_time_start, dinner_time_start")
            .eq("id", restaurantId)
            .single();

        if (restaurantError || !restaurant) {
            console.error("Restaurant lookup error:", restaurantError);
            return json({ error: "Ristorante non trovato" }, 404, corsHeaders);
        }

        if (!restaurant.enable_stripe_payments) {
            return json({ error: "Pagamenti online non abilitati per questo ristorante" }, 400, corsHeaders);
        }

        if (!restaurant.stripe_connect_account_id || !restaurant.stripe_connect_enabled) {
            return json({ error: "Il ristorante non ha ancora completato la configurazione per ricevere pagamenti" }, 403, corsHeaders);
        }

        const { data: tableSession, error: tableSessionError } = await supabase
            .from("table_sessions")
            .select("id, restaurant_id, status, paid_amount, customer_count, coperto_enabled, ayce_enabled")
            .eq("id", tableSessionId)
            .eq("restaurant_id", restaurantId)
            .maybeSingle();

        if (tableSessionError || !tableSession || tableSession.status === "CLOSED") {
            return json({ error: "Sessione tavolo non valida o chiusa" }, 409, corsHeaders);
        }

        if (cleanCustomerEmail || cleanCustomerTaxCode || cleanCustomerLotteryCode) {
            await supabase
                .from("table_sessions")
                .update({
                    ...(cleanCustomerEmail ? { customer_email: cleanCustomerEmail } : {}),
                    ...(cleanCustomerTaxCode ? { customer_tax_code: cleanCustomerTaxCode } : {}),
                    ...(cleanCustomerLotteryCode ? { customer_lottery_code: cleanCustomerLotteryCode } : {}),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", tableSessionId)
                .eq("restaurant_id", restaurantId);
        }

        const { data: dbOrders, error: ordersError } = await supabase
            .from("orders")
            .select("id, restaurant_id, table_session_id, status")
            .in("id", orderIdsList)
            .eq("restaurant_id", restaurantId);

        if (ordersError || !dbOrders || dbOrders.length !== orderIdsList.length) {
            console.error("Order validation error:", ordersError);
            return json({ error: "Ordini non validi per questo ristorante" }, 400, corsHeaders);
        }

        if (dbOrders.some((o: any) => o.table_session_id !== tableSessionId)) {
            return json({ error: "Gli ordini non appartengono a questa sessione tavolo" }, 400, corsHeaders);
        }

        if (dbOrders.some((o: any) => o.status === "PAID" || o.status === "CANCELLED")) {
            return json({ error: "Uno o più ordini non sono più pagabili" }, 409, corsHeaders);
        }

        const { data: dbItems, error: itemsError } = await supabase
            .from("order_items")
            .select("id, quantity, status, order_id, paid_online_at, dish:dishes(id, name, price)")
            .in("order_id", orderIdsList);

        if (itemsError || !dbItems) {
            console.error("Order item validation error:", itemsError);
            return json({ error: "Impossibile verificare i piatti da pagare" }, 500, corsHeaders);
        }

        const billableItems = dbItems.filter((it: any) => it.status !== "PAID" && it.status !== "CANCELLED");
        const payableItems = billableItems.filter((it: any) => !it.paid_online_at);
        const dishesDue = billableItems.reduce((sum: number, it: any) => {
            const dish = oneRelation(it.dish);
            return sum + (Number(dish?.price) || 0) * (Number(it.quantity) || 0);
        }, 0);
        const customers = Math.max(1, Number(tableSession.customer_count || 1));
        const coverDue = tableSession.coperto_enabled ? copertoPrice(restaurant) * customers : 0;
        const ayceDue = tableSession.ayce_enabled ? aycePrice(restaurant) * customers : 0;
        const serverTotal = money(dishesDue + coverDue + ayceDue);
        const remainingDue = money(Math.max(0, serverTotal - Number(tableSession.paid_amount || 0)));

        if (remainingDue <= 0.01) {
            return json({ error: "Il conto risulta già saldato" }, 409, corsHeaders);
        }
        if (requestedTotal > remainingDue + 0.01) {
            return json({ error: `Importo superiore al residuo da pagare (€${remainingDue.toFixed(2)})` }, 400, corsHeaders);
        }

        if (paidOrderItemIdsList.length > 0) {
            const selectedSet = new Set(paidOrderItemIdsList);
            const selectedItems = dbItems.filter((it: any) => selectedSet.has(it.id));

            if (selectedItems.length !== paidOrderItemIdsList.length) {
                return json({ error: "Piatti selezionati non validi" }, 400, corsHeaders);
            }

            if (selectedItems.some((it: any) => it.status === "PAID" || it.status === "CANCELLED" || it.paid_online_at)) {
                return json({ error: "Uno o più piatti sono già pagati o non pagabili" }, 409, corsHeaders);
            }

            const selectedItemsTotal = selectedItems.reduce((sum: number, it: any) => {
                const dish = oneRelation(it.dish);
                return sum + (Number(dish?.price) || 0) * (Number(it.quantity) || 0);
            }, 0);

            if (requestedTotal + 0.01 < selectedItemsTotal) {
                return json({ error: "Importo inferiore al totale dei piatti selezionati" }, 400, corsHeaders);
            }
        }

        const safeLabel = safeText(splitLabel, "Saldo conto", 60);
        const lineItems = [{
            price_data: {
                currency: "eur",
                product_data: {
                    name: safeText(`${safeLabel} — ${restaurant.name}`, "Saldo del conto", 120),
                },
                unit_amount: Math.round(requestedTotal * 100),
            },
            quantity: 1,
        }];

        const paidItemsMetadata = JSON.stringify(paidOrderItemIdsList);
        if (paidOrderItemIdsList.length > 0 && paidItemsMetadata.length > 500) {
            return json({ error: "Troppi piatti selezionati per un singolo pagamento" }, 400, corsHeaders);
        }

        const orderIdsStr = JSON.stringify(orderIdsList);
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
                    splitLabel: safeLabel,
                    ...(cleanCustomerEmail ? { customerEmail: cleanCustomerEmail } : {}),
                    ...(cleanCustomerTaxCode ? { customerTaxCode: cleanCustomerTaxCode } : {}),
                    ...(cleanCustomerLotteryCode ? { customerLotteryCode: cleanCustomerLotteryCode } : {}),
                    ...(paidOrderItemIdsList.length > 0
                        ? { paidOrderItemIds: paidItemsMetadata }
                        : {}),
                },
                ...(cleanCustomerEmail
                    ? { customer_email: cleanCustomerEmail }
                    : {}),
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
        return json({ error: error.message }, 500, corsHeaders);
    }
});
