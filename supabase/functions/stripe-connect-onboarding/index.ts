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

        const { restaurantId } = await req.json();

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

        // Se l'account esiste, verifica che sia valido
        if (accountId) {
            try {
                await stripe.accounts.retrieve(accountId);
                // Account valido, ritorna l'ID
                return new Response(JSON.stringify({ accountId }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

        // Salva l'account ID nel database
        const { error: updateErr } = await supabase
            .from("restaurants")
            .update({ stripe_connect_account_id: accountId })
            .eq("id", restaurantId);

        if (updateErr) {
            console.error("DB update error:", updateErr.message);
        }

        return new Response(JSON.stringify({ accountId }), {
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
