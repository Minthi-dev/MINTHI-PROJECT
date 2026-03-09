import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
            },
        });
    }

    try {
        const signature = req.headers.get("Stripe-Signature");
        const stripeAccount = req.headers.get("Stripe-Account");
        const platformSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
        const connectSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");

        console.log(`[WEBHOOK] ====== NEW REQUEST ======`);
        console.log(`[WEBHOOK] Method: ${req.method}, Stripe-Account header: ${stripeAccount || 'none (platform event)'}`);
        console.log(`[WEBHOOK] Signature present: ${!!signature}, Platform secret present: ${!!platformSecret}, Connect secret present: ${!!connectSecret}`);

        if (!signature || (!platformSecret && !connectSecret)) {
            console.error(`[WEBHOOK] Missing signature or secrets. Sig: ${!!signature}, Platform: ${!!platformSecret}, Connect: ${!!connectSecret}`);
            return new Response("Manca la firma o il segreto del webhook", { status: 400 });
        }

        const body = await req.text();
        let event;

        // Dual signing secret: prova prima platform, poi Connect
        // Gli eventi platform (subscription) usano STRIPE_WEBHOOK_SECRET
        // Gli eventi Connect (pagamenti clienti, account.updated) usano STRIPE_CONNECT_WEBHOOK_SECRET
        const secretsToTry = [platformSecret, connectSecret].filter(Boolean) as string[];
        let verified = false;
        let verifiedWith = '';

        for (const secret of secretsToTry) {
            try {
                event = await stripe.webhooks.constructEventAsync(
                    body,
                    signature,
                    secret,
                    undefined,
                    cryptoProvider
                );
                verified = true;
                verifiedWith = secret === platformSecret ? 'platform' : 'connect';
                break;
            } catch (err) {
                console.log(`[WEBHOOK] Signature verification failed with ${secret === platformSecret ? 'platform' : 'connect'} secret: ${err.message}`);
            }
        }

        if (!verified || !event) {
            console.error(`[WEBHOOK] Signature verification FAILED with ALL secrets. Tried ${secretsToTry.length} secrets.`);
            return new Response("Webhook signature verification failed", { status: 400 });
        }

        console.log(`[WEBHOOK] Event verified with ${verifiedWith} secret. Type: ${event.type}, ID: ${event.id}, Account: ${(event as any).account || 'platform'}`);

        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const paymentType = session.metadata?.paymentType;
                console.log(`[WEBHOOK] checkout.session.completed FULL metadata:`, JSON.stringify(session.metadata));
                console.log(`[WEBHOOK] session.payment_status: ${session.payment_status}, amount_total: ${session.amount_total}`);

                console.log(`[WEBHOOK] checkout.session.completed — paymentType: ${paymentType}, metadata:`, JSON.stringify(session.metadata));

                if (paymentType === "customer_order") {
                    // === PAGAMENTO CLIENTE (ordine dal menu) ===
                    const restaurantId = session.metadata?.restaurantId;
                    const sessionId = session.metadata?.tableSessionId;

                    console.log(`[WEBHOOK] customer_order — restaurantId: ${restaurantId}, sessionId: ${sessionId}, amount: €${((session.amount_total || 0) / 100).toFixed(2)}`);

                    if (!restaurantId) {
                        console.error(`[WEBHOOK] customer_order SKIP: restaurantId mancante nel metadata`);
                        break;
                    }

                    if (!sessionId) {
                        console.warn(`[WEBHOOK] customer_order SKIP: tableSessionId vuoto/mancante per restaurant ${restaurantId}`);
                        break;
                    }

                    const amountPaid = (session.amount_total || 0) / 100;
                    const splitLabel = session.metadata?.splitLabel || 'Pagamento online';
                    const paymentMode = session.metadata?.paymentMode || 'romana_or_full';

                    const { data: currentSession, error: fetchError } = await supabase
                        .from("table_sessions")
                        .select("paid_amount, notes")
                        .eq("id", sessionId)
                        .single();

                    if (fetchError) {
                        console.error(`[WEBHOOK] Errore fetch sessione ${sessionId}:`, fetchError);
                        break;
                    }

                    if (!currentSession) {
                        console.error(`[WEBHOOK] Sessione ${sessionId} non trovata nel DB`);
                        break;
                    }

                    if (paymentMode === 'per_piatti') {
                        // Per-piatti: mark specific order_items as PAID, update notes only
                        const paidItemIdsStr = session.metadata?.paidOrderItemIds;
                        if (paidItemIdsStr && paidItemIdsStr.length > 0) {
                            try {
                                const paidItemIds: string[] = JSON.parse(paidItemIdsStr);
                                if (paidItemIds.length > 0) {
                                    const { error: itemsError } = await supabase
                                        .from("order_items")
                                        .update({ status: "PAID" })
                                        .in("id", paidItemIds);
                                    if (itemsError) {
                                        console.error(`[WEBHOOK] Errore mark order_items PAID:`, itemsError);
                                    } else {
                                        console.log(`[WEBHOOK] ✅ ${paidItemIds.length} order_items marcati PAID (per_piatti) per sessione ${sessionId}`);
                                    }
                                }
                            } catch (parseErr) {
                                console.warn(`[WEBHOOK] Impossibile parsare paidOrderItemIds: ${paidItemIdsStr}`);
                            }
                        }
                        // Also update notes for restaurant visibility
                        const existingNotes = currentSession.notes || '';
                        const paymentNote = `💳 ${splitLabel}: €${amountPaid.toFixed(2)} (${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})`;
                        const newNotes = existingNotes ? `${existingNotes}\n${paymentNote}` : paymentNote;
                        await supabase.from("table_sessions").update({ notes: newNotes, updated_at: new Date().toISOString() }).eq("id", sessionId);
                        console.log(`[WEBHOOK] ✅ per_piatti: €${amountPaid.toFixed(2)} per sessione ${sessionId} (${splitLabel})`);
                    } else {
                        // Romana/full: update paid_amount (no item-level tracking)
                        const currentPaid = currentSession.paid_amount || 0;
                        const existingNotes = currentSession.notes || '';
                        const paymentNote = `💳 ${splitLabel}: €${amountPaid.toFixed(2)} (${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})`;
                        const newNotes = existingNotes ? `${existingNotes}\n${paymentNote}` : paymentNote;
                        const newPaidAmount = currentPaid + amountPaid;

                        console.log(`[WEBHOOK] Updating session ${sessionId}: paid_amount ${currentPaid} → ${newPaidAmount}`);

                        const { error: updateError } = await supabase
                            .from("table_sessions")
                            .update({ paid_amount: newPaidAmount, notes: newNotes, updated_at: new Date().toISOString() })
                            .eq("id", sessionId);

                        if (updateError) {
                            console.error(`[WEBHOOK] ERRORE update sessione ${sessionId}:`, updateError);
                        } else {
                            console.log(`[WEBHOOK] ✅ ${paymentMode}: €${amountPaid.toFixed(2)} per sessione ${sessionId}. Totale paid_amount: €${newPaidAmount.toFixed(2)}`);
                        }
                    }
                } else {
                    // === ATTIVAZIONE ABBONAMENTO ===
                    const pendingRegistrationId = session.metadata?.pendingRegistrationId;
                    const restaurantId = session.metadata?.restaurantId || (!pendingRegistrationId ? session.client_reference_id : null);
                    const customerId = session.customer;
                    const subscriptionId = session.subscription;

                    if (pendingRegistrationId) {
                        // Nuova registrazione: crea utente + ristorante dal pending
                        console.log(`[WEBHOOK] complete_pending_registration → pendingId: ${pendingRegistrationId}, customerId: ${customerId}, subscriptionId: ${subscriptionId}`);
                        const { error: rpcError } = await supabase.rpc("complete_pending_registration", {
                            p_pending_id: pendingRegistrationId,
                            p_stripe_customer_id: customerId,
                            p_stripe_subscription_id: subscriptionId,
                        });
                        if (rpcError) {
                            console.error(`[WEBHOOK] ERRORE complete_pending_registration ${pendingRegistrationId}:`, JSON.stringify(rpcError));
                            // If "already completed" it's idempotent - return 200 anyway.
                            // For any other error (expired, not found, unique violation) return 500
                            // so Stripe retries the event.
                            const msg = (rpcError.message || '').toLowerCase();
                            const isAlreadyDone = msg.includes('già completata') || msg.includes('already completed');
                            if (!isAlreadyDone) {
                                return new Response(
                                    JSON.stringify({ error: `Pending registration failed: ${rpcError.message}` }),
                                    { status: 500 }
                                );
                            }
                            console.log(`[WEBHOOK] Registrazione ${pendingRegistrationId} già completata in precedenza — OK.`);
                        } else {
                            console.log(`[WEBHOOK] ✅ Ristorante creato da pending registration ${pendingRegistrationId}`);
                        }
                    } else if (restaurantId) {
                        // Ristorante esistente: aggiorna stato abbonamento
                        await supabase
                            .from("restaurants")
                            .update({
                                stripe_customer_id: customerId,
                                stripe_subscription_id: subscriptionId,
                                is_active: true,
                                suspension_reason: null,
                                subscription_status: "active",
                            })
                            .eq("id", restaurantId);

                        console.log(`Ristorante ${restaurantId} attivato con abbonamento!`);
                    }
                }
                break;
            }

            case "invoice.paid": {
                const invoice = event.data.object;
                const customerId = invoice.customer;

                // Salta fatture con amount = 0 (es. prime fatture di trial)
                if ((invoice.amount_paid || 0) === 0) break;

                const { data: restaurant } = await supabase
                    .from("restaurants")
                    .select("id")
                    .eq("stripe_customer_id", customerId)
                    .single();

                if (restaurant) {
                    await supabase
                        .from("subscription_payments")
                        .insert({
                            restaurant_id: restaurant.id,
                            stripe_invoice_id: invoice.id,
                            stripe_payment_intent_id: invoice.payment_intent,
                            amount: (invoice.amount_paid || 0) / 100,
                            currency: invoice.currency || "eur",
                            status: "paid",
                            period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
                            period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
                        });

                    // Pagamento andato a buon fine: aggiorna status e riattiva se era past_due
                    await supabase
                        .from("restaurants")
                        .update({
                            subscription_status: "active",
                            is_active: true,
                            suspension_reason: null,
                        })
                        .eq("id", restaurant.id);

                    console.log(`Pagamento abbonamento registrato per ristorante ${restaurant.id}`);
                }
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object;
                const customerId = invoice.customer;

                const { data: restaurant } = await supabase
                    .from("restaurants")
                    .select("id")
                    .eq("stripe_customer_id", customerId)
                    .single();

                if (restaurant) {
                    await supabase
                        .from("subscription_payments")
                        .insert({
                            restaurant_id: restaurant.id,
                            stripe_invoice_id: invoice.id,
                            amount: (invoice.amount_due || 0) / 100,
                            currency: invoice.currency || "eur",
                            status: "failed",
                        });

                    // Controlla bonus attivo
                    const { data: activeBonus } = await supabase
                        .from("restaurant_bonuses")
                        .select("id")
                        .eq("restaurant_id", restaurant.id)
                        .eq("is_active", true)
                        .gte("expires_at", new Date().toISOString())
                        .limit(1);

                    if (!activeBonus || activeBonus.length === 0) {
                        await supabase
                            .from("restaurants")
                            .update({
                                subscription_status: "past_due",
                            })
                            .eq("id", restaurant.id);

                        console.log(`Pagamento fallito per ristorante ${restaurant.id} — status: past_due`);
                    }
                }
                break;
            }

            case "customer.subscription.deleted":
            case "customer.subscription.paused": {
                const subscription = event.data.object;
                const customerId = subscription.customer;

                const { data: restaurant } = await supabase
                    .from("restaurants")
                    .select("id")
                    .eq("stripe_customer_id", customerId)
                    .single();

                if (restaurant) {
                    const { data: activeBonus } = await supabase
                        .from("restaurant_bonuses")
                        .select("id, expires_at")
                        .eq("restaurant_id", restaurant.id)
                        .eq("is_active", true)
                        .gte("expires_at", new Date().toISOString())
                        .limit(1);

                    if (activeBonus && activeBonus.length > 0) {
                        await supabase
                            .from("restaurants")
                            .update({ subscription_status: "canceled" })
                            .eq("id", restaurant.id);
                    } else {
                        await supabase
                            .from("restaurants")
                            .update({
                                is_active: false,
                                subscription_status: "canceled",
                                suspension_reason: event.type === "customer.subscription.deleted"
                                    ? "Abbonamento annullato"
                                    : "Abbonamento in pausa",
                            })
                            .eq("id", restaurant.id);
                    }

                    console.log(`Abbonamento ${event.type} per ristorante ${restaurant.id}`);
                }
                break;
            }

            case "customer.subscription.updated": {
                const subscription = event.data.object;
                const customerId = subscription.customer;

                const { data: restaurant } = await supabase
                    .from("restaurants")
                    .select("id")
                    .eq("stripe_customer_id", customerId)
                    .single();

                if (restaurant) {
                    const updates: Record<string, unknown> = {
                        subscription_status: subscription.status,
                    };

                    if (subscription.cancel_at_period_end && subscription.cancel_at) {
                        updates.subscription_cancel_at = new Date(subscription.cancel_at * 1000).toISOString();
                    } else if (!subscription.cancel_at_period_end) {
                        updates.subscription_cancel_at = null;
                    }

                    await supabase
                        .from("restaurants")
                        .update(updates)
                        .eq("id", restaurant.id);

                    console.log(`Abbonamento aggiornato per ristorante ${restaurant.id}: status=${subscription.status}, cancel_at_period_end=${subscription.cancel_at_period_end}`);
                }
                break;
            }

            case "account.updated": {
                const account = event.data.object;
                await supabase
                    .from("restaurants")
                    .update({ stripe_connect_enabled: account.charges_enabled === true })
                    .eq("stripe_connect_account_id", account.id);

                console.log(`Stripe Connect account ${account.id}: charges_enabled=${account.charges_enabled}`);
                break;
            }
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });
    } catch (error) {
        console.error("[WEBHOOK] Errore generico:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
