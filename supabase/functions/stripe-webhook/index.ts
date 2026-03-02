import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.9.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2022-11-15",
    httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
    try {
        const signature = req.headers.get("Stripe-Signature");
        const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

        if (!signature || !webhookSecret) {
            return new Response("Manca la firma o il segreto del webhook", { status: 400 });
        }

        const body = await req.text();
        let event;

        try {
            event = await stripe.webhooks.constructEventAsync(
                body,
                signature,
                webhookSecret,
                undefined,
                cryptoProvider
            );
        } catch (err) {
            console.error(`Webhook Error: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        // Gestione degli eventi Stripe
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const restaurantId = session.metadata?.restaurantId || session.client_reference_id;
                const customerId = session.customer;
                const subscriptionId = session.subscription;

                if (restaurantId) {
                    // Attiviamo il ristorante
                    await supabase
                        .from("restaurants")
                        .update({
                            stripe_customer_id: customerId,
                            stripe_subscription_id: subscriptionId,
                            isActive: true, // Ristorante sbloccato!
                        })
                        .eq("id", restaurantId);

                    console.log(`Ristorante ${restaurantId} attivato con successo!`);
                }
                break;
            }

            case "customer.subscription.deleted":
            case "customer.subscription.paused":
            case "invoice.payment_failed": {
                const subscription = event.data.object;
                const customerId = subscription.customer;

                // Disattiviamo il ristorante
                const { data: restaurant } = await supabase
                    .from("restaurants")
                    .select("id")
                    .eq("stripe_customer_id", customerId)
                    .single();

                if (restaurant) {
                    await supabase
                        .from("restaurants")
                        .update({ isActive: false })
                        .eq("id", restaurant.id);

                    console.log(`Ristorante ${restaurant.id} sospeso per mancato pagamento o abbonamento annullato.`);
                }
                break;
            }
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });
    } catch (error) {
        console.error("Errore generico Webhook:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
