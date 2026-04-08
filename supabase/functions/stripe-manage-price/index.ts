import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

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
        const { action, amount_cents, userId } = await req.json();

        // "set" action requires admin auth; "get" is read-only (admin panel only)
        if (userId) {
            const access = await verifyAccess(supabase, userId);
            if (!access.valid || !access.isAdmin) {
                return new Response(JSON.stringify({ error: "Non autorizzato — solo admin" }), {
                    status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        } else if (action === "set") {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (action === "get") {
            // Recupera prezzo corrente da Stripe
            const { data: priceConfig } = await supabase
                .from("app_config")
                .select("value")
                .eq("key", "stripe_price_id")
                .single();

            if (!priceConfig?.value) {
                return new Response(JSON.stringify({ amount: 0, currency: "eur", product_id: null }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                });
            }

            let price;
            try {
                price = await stripe.prices.retrieve(priceConfig.value);
            } catch (stripeErr: any) {
                // Price ID no longer valid in Stripe — clear stale config and return zero
                console.error("Stripe price not found:", priceConfig.value, stripeErr.message);
                return new Response(JSON.stringify({ amount: 0, currency: "eur", product_id: null, price_id: null, error_detail: "Prezzo Stripe non trovato. Ricrea il prezzo." }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                });
            }
            const productId = typeof price.product === "string" ? price.product : price.product?.id;

            // Salva product_id in app_config se non presente
            const { data: existing } = await supabase
                .from("app_config")
                .select("value")
                .eq("key", "stripe_product_id")
                .single();

            if (!existing?.value && productId) {
                await supabase
                    .from("app_config")
                    .upsert({ key: "stripe_product_id", value: productId });
            }

            // Aggiorna anche stripe_price_amount
            const amountEur = (price.unit_amount || 0) / 100;
            await supabase
                .from("app_config")
                .upsert({ key: "stripe_price_amount", value: String(amountEur) });

            return new Response(JSON.stringify({
                amount: amountEur,
                currency: price.currency,
                product_id: productId,
                price_id: price.id,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        }

        if (action === "create") {
            if (!amount_cents || amount_cents <= 0) {
                return new Response(JSON.stringify({ error: "amount_cents non valido" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Recupera product_id da app_config
            const { data: productConfig } = await supabase
                .from("app_config")
                .select("value")
                .eq("key", "stripe_product_id")
                .single();

            if (!productConfig?.value) {
                return new Response(JSON.stringify({ error: "stripe_product_id non configurato. Vai prima su Gestione Prezzo e recupera i dati." }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Archivia il vecchio prezzo (opzionale, ignora errori)
            const { data: oldPriceConfig } = await supabase
                .from("app_config")
                .select("value")
                .eq("key", "stripe_price_id")
                .single();

            if (oldPriceConfig?.value) {
                await stripe.prices.update(oldPriceConfig.value, { active: false }).catch(() => {});
            }

            // Crea nuovo prezzo
            const newPrice = await stripe.prices.create({
                unit_amount: amount_cents,
                currency: "eur",
                recurring: { interval: "month" },
                product: productConfig.value,
            });

            const amountEur = amount_cents / 100;

            // Salva in app_config
            await supabase.from("app_config").upsert({ key: "stripe_price_id", value: newPrice.id });
            await supabase.from("app_config").upsert({ key: "stripe_price_amount", value: String(amountEur) });

            return new Response(JSON.stringify({
                priceId: newPrice.id,
                amount: amountEur,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        }

        return new Response(JSON.stringify({ error: "action non valida" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Errore stripe-manage-price:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
