import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, isValidUUID } from "../_shared/cors.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    try {
        if (!stripeKey) {
            console.error("STRIPE_SECRET_KEY non configurata");
            return new Response(JSON.stringify({ error: "Configurazione Stripe mancante. Contatta l'assistenza." }), {
                status: 500,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        const { restaurantId, returnUrl } = await req.json();

        if (!isValidUUID(restaurantId)) {
            return new Response(JSON.stringify({ error: "restaurantId richiesto" }), {
                status: 400,
                headers: { ...cors, "Content-Type": "application/json" },
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
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        let accountId = restaurant.stripe_connect_account_id;

        // Se l'account esiste, verifica che sia valido
        if (accountId) {
            try {
                const account = await stripe.accounts.retrieve(accountId);

                // If account is fully set up, return login link to Express Dashboard
                if (account.charges_enabled && account.details_submitted) {
                    const loginLink = await stripe.accounts.createLoginLink(accountId);
                    return new Response(JSON.stringify({ accountId, url: loginLink.url }), {
                        headers: { ...cors, "Content-Type": "application/json" },
                        status: 200,
                    });
                }

                // Account exists but not fully set up — create Account Link to complete
                const accountLink = await stripe.accountLinks.create({
                    account: accountId,
                    refresh_url: returnUrl || req.headers.get("origin") || "https://localhost",
                    return_url: returnUrl || req.headers.get("origin") || "https://localhost",
                    type: "account_onboarding",
                });

                return new Response(JSON.stringify({ accountId, url: accountLink.url }), {
                    headers: { ...cors, "Content-Type": "application/json" },
                    status: 200,
                });
            } catch (retrieveErr: any) {
                // Account non valido (eliminato o inesistente), lo ricrea
                console.log("Account invalido, reset e ricreazione...", retrieveErr.message);
                accountId = null;
            }
        }

        // Crea nuovo account Express
        try {
            // Validate email before passing to Stripe
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const validEmail = restaurant.email && emailRegex.test(restaurant.email) ? restaurant.email : undefined;

            const account = await stripe.accounts.create({
                type: "express",
                country: "IT",
                email: validEmail,
                business_type: "company",
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
            });
            accountId = account.id;
        } catch (stripeErr: any) {
            console.error("Stripe accounts.create error:", stripeErr.message, stripeErr.type);
            let userMsg = stripeErr.message || "Errore sconosciuto";
            if (userMsg.includes("signed up for Connect") || userMsg.includes("new accounts")) {
                userMsg = "Stripe Connect non è ancora abilitato sul tuo account piattaforma. Contatta l'amministratore MINTHI.";
            }
            return new Response(JSON.stringify({ error: userMsg }), {
                status: 500,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // Salva l'account ID nel database
        const { error: updateErr } = await supabase
            .from("restaurants")
            .update({ stripe_connect_account_id: accountId })
            .eq("id", restaurantId);

        if (updateErr) {
            console.error("DB update error:", updateErr.message);
        }

        // Crea Account Link per l'onboarding
        const accountLink = await stripe.accountLinks.create({
            account: accountId!,
            refresh_url: returnUrl || req.headers.get("origin") || "https://localhost",
            return_url: returnUrl || req.headers.get("origin") || "https://localhost",
            type: "account_onboarding",
        });

        return new Response(JSON.stringify({ accountId, url: accountLink.url }), {
            headers: { ...cors, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error: any) {
        console.error("Errore Stripe Connect generico:", error.message, error.stack);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            headers: { ...cors, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
