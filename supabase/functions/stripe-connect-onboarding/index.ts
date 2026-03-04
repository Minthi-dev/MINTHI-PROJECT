import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.9.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = new Stripe(stripeKey, {
    apiVersion: "2022-11-15",
    httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (!stripeKey) {
            console.error("STRIPE_SECRET_KEY non configurata");
            return new Response(JSON.stringify({ error: "Configurazione Stripe mancante. Contatta l'assistenza." }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { restaurantId, returnUrl, refreshUrl } = await req.json();

        if (!restaurantId) {
            return new Response(JSON.stringify({ error: "restaurantId richiesto" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: restaurant, error: dbError } = await supabase
            .from("restaurants")
            .select("stripe_connect_account_id, name, email")
            .eq("id", restaurantId)
            .single();

        if (dbError || !restaurant) {
            console.error("DB error:", dbError?.message);
            return new Response(JSON.stringify({ error: "Ristorante non trovato" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        let accountId = restaurant.stripe_connect_account_id;

        // Crea account Connect se non esiste ancora
        if (!accountId) {
            try {
                const account = await stripe.accounts.create({
                    type: "express",
                    country: "IT",
                    email: restaurant.email || undefined,
                    business_type: "company",
                    capabilities: {
                        card_payments: { requested: true },
                        transfers: { requested: true },
                    },
                });
                accountId = account.id;
            } catch (stripeErr: any) {
                console.error("Stripe accounts.create error:", stripeErr.message, stripeErr.type);
                return new Response(JSON.stringify({ error: `Errore creazione account Stripe: ${stripeErr.message}` }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { error: updateErr } = await supabase
                .from("restaurants")
                .update({ stripe_connect_account_id: accountId })
                .eq("id", restaurantId);

            if (updateErr) {
                console.error("DB update error:", updateErr.message);
            }
        }

        const origin = req.headers.get("origin") || "http://localhost:5173";

        let accountLink;
        try {
            accountLink = await stripe.accountLinks.create({
                account: accountId,
                refresh_url: refreshUrl || `${origin}/?connect=refresh&restaurantId=${restaurantId}`,
                return_url: returnUrl || `${origin}/?connect=success`,
                type: "account_onboarding",
            });
        } catch (linkErr: any) {
            console.error("Stripe accountLinks.create error:", linkErr.message, linkErr.type);
            // If the existing account is invalid, reset and retry
            if (linkErr.message?.includes("No such account") || linkErr.code === "account_invalid") {
                console.log("Account invalido, reset e riprovo...");
                try {
                    const newAccount = await stripe.accounts.create({
                        type: "express",
                        country: "IT",
                        email: restaurant.email || undefined,
                        business_type: "company",
                        capabilities: {
                            card_payments: { requested: true },
                            transfers: { requested: true },
                        },
                    });
                    accountId = newAccount.id;

                    await supabase
                        .from("restaurants")
                        .update({ stripe_connect_account_id: accountId })
                        .eq("id", restaurantId);

                    accountLink = await stripe.accountLinks.create({
                        account: accountId,
                        refresh_url: refreshUrl || `${origin}/?connect=refresh&restaurantId=${restaurantId}`,
                        return_url: returnUrl || `${origin}/?connect=success`,
                        type: "account_onboarding",
                    });
                } catch (retryErr: any) {
                    console.error("Retry failed:", retryErr.message);
                    return new Response(JSON.stringify({ error: `Errore Stripe Connect: ${retryErr.message}` }), {
                        status: 500,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
            } else {
                return new Response(JSON.stringify({ error: `Errore link onboarding: ${linkErr.message}` }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }

        return new Response(JSON.stringify({ url: accountLink.url, accountId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error: any) {
        console.error("Errore Stripe Connect generico:", error.message, error.stack);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
