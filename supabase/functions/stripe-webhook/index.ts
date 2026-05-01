import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { enqueueFiscalReceiptJob } from "../_shared/fiscal-outbox.ts";
import { buildDineInFinalReceiptPayload } from "../_shared/table-final-receipt.ts";
import { recordTableStripePayment, stripeId, stripePaymentTraceFromSession } from "../_shared/stripe-trace.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2026-02-25.clover" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

// Internal key used to call openapi-issue-receipt server-to-server.
const MINTHI_INTERNAL_KEY = Deno.env.get("MINTHI_INTERNAL_KEY") || "";
const SUPABASE_URL_FOR_FN = Deno.env.get("SUPABASE_URL") ?? "";

async function retrieveCheckoutSessionForTrace(session: any, stripeAccount?: string) {
    if (!session?.id) return session;
    try {
        return await stripe.checkout.sessions.retrieve(
            session.id,
            { expand: ["payment_intent.latest_charge"] },
            stripeAccount ? { stripeAccount } : undefined,
        );
    } catch (err: any) {
        console.warn("[WEBHOOK] Stripe trace retrieve skipped:", err?.message || err);
        return session;
    }
}

/**
 * Queue-and-log fiscal issue job. Never throws — the receipt emission is
 * decoupled from the Stripe webhook reply, so OpenAPI latency does NOT slow
 * down payment confirmation.
 */
async function tryEmitFiscalReceipt(payload: Record<string, unknown>, options: { dedupeKey?: string } = {}) {
    if (!MINTHI_INTERNAL_KEY || !SUPABASE_URL_FOR_FN) {
        console.warn("[WEBHOOK→fiscal] internal key o SUPABASE_URL mancanti, skip");
        return;
    }
    try {
        const job = await enqueueFiscalReceiptJob(supabase, payload, {
            dedupeKey: options.dedupeKey,
            priority: 50,
        });
        console.log(`[WEBHOOK→fiscal] job:`, JSON.stringify(job));
        pokeFiscalWorker();
    } catch (err: any) {
        console.error("[WEBHOOK→fiscal] errore accodamento:", err?.message || err);
    }
}

function pokeFiscalWorker() {
    if (!MINTHI_INTERNAL_KEY || !SUPABASE_URL_FOR_FN) return;
    fetch(`${SUPABASE_URL_FOR_FN}/functions/v1/openapi-receipt-worker`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
                "x-minthi-internal-key": MINTHI_INTERNAL_KEY,
            },
            body: JSON.stringify({ internalKey: MINTHI_INTERNAL_KEY, limit: 10, concurrency: 5 }),
        }).catch((err) => console.warn("[WEBHOOK→fiscal] worker poke fallito:", err?.message || err));
}

function parsePaidOrderItemIds(value: unknown): string[] {
    if (!value || typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.filter((id) => typeof id === "string" && id.length === 36))];
    } catch {
        return [];
    }
}

async function emitTakeawayFiscalReceipt(args: {
    session: any;
    restaurantId: string;
    orderId: string;
}) {
    const { data: orderMeta } = await supabase
        .from("orders")
        .select("id, total_amount, paid_amount, payments, customer_email, customer_tax_code, customer_lottery_code")
        .eq("id", args.orderId)
        .eq("restaurant_id", args.restaurantId)
        .maybeSingle();
    if (!orderMeta) return;
    const total = Number(orderMeta.total_amount) || 0;
    const paid = Number(orderMeta.paid_amount) || 0;
    if (paid + 0.01 < total) return;

    const { data: takeawayItems } = await supabase
        .from("order_items")
        .select("id, dish_id, quantity, dish_name_snapshot, unit_price_snapshot, vat_rate_snapshot, dish:dishes(name, price, vat_rate)")
        .eq("order_id", args.orderId)
        .neq("status", "CANCELLED");
    const items = (takeawayItems || []).map((it: any) => ({
        description: it.dish_name_snapshot || it.dish?.name || "Voce",
        quantity: Number(it.quantity) || 1,
        unitPrice: it.unit_price_snapshot !== null && it.unit_price_snapshot !== undefined
            ? Number(it.unit_price_snapshot) || 0
            : Number(it.dish?.price) || 0,
        vatRate: it.vat_rate_snapshot ?? it.dish?.vat_rate ?? undefined,
    }));
    if (items.length === 0) return;

    const payments: any[] = Array.isArray(orderMeta.payments) ? orderMeta.payments : [];
    const electronicReceiptAmount = payments
        .filter((p: any) => p?.method === "stripe")
        .reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);
    const cashReceiptAmount = payments
        .filter((p: any) => p?.method === "cash" || p?.method === "pay_on_pickup")
        .reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);

    const stripeTrace = stripePaymentTraceFromSession(args.session);
    await tryEmitFiscalReceipt({
        restaurantId: args.restaurantId,
        orderId: args.orderId,
        stripeSessionId: args.session.id,
        stripePaymentIntentId: stripeId(args.session.payment_intent),
        stripePaymentTrace: stripeTrace,
        issuedVia: "auto_takeaway_stripe",
        items,
        cashAmount: Math.round(cashReceiptAmount * 100) / 100,
        electronicAmount: Math.round(electronicReceiptAmount * 100) / 100,
        customerEmail: orderMeta.customer_email || args.session.customer_details?.email || undefined,
        customerTaxCode: orderMeta.customer_tax_code || undefined,
        customerLotteryCode: orderMeta.customer_lottery_code || undefined,
    });
}

async function emitDineInFiscalReceipt(args: {
    session: any;
    restaurantId: string;
    tableSessionId: string;
    amountPaid: number;
    splitLabel: string;
    paidAfter?: number;
}) {
    const stripeTrace = stripePaymentTraceFromSession(args.session);
    const result = await buildDineInFinalReceiptPayload(supabase, {
        session: args.session,
        restaurantId: args.restaurantId,
        tableSessionId: args.tableSessionId,
        stripeSessionId: args.session.id,
        stripePaymentIntentId: stripeId(args.session.payment_intent),
        stripePaymentTrace: stripeTrace,
        paidAfter: args.paidAfter,
    });
    if (!result.ready) {
        console.log("[WEBHOOK→fiscal] scontrino tavolo finale non ancora pronto:", JSON.stringify(result));
        return;
    }

    // Quando il pagamento Stripe copre l'intero conto chiudiamo il tavolo:
    // - status=CLOSED + closed_at sblocca lo storico, l'archivio e il badge
    //   "scontrini da registrare" lato frontend.
    // - Marchiamo gli order non chiusi come PAID per coerenza con il flusso
    //   manuale di "incassa & chiudi".
    try {
        await supabase
            .from("table_sessions")
            .update({
                status: "CLOSED",
                closed_at: new Date().toISOString(),
                closed_by_role: "STRIPE_AUTO",
                closed_by_name: "Pagamento online",
                updated_at: new Date().toISOString(),
            })
            .eq("id", args.tableSessionId)
            .eq("restaurant_id", args.restaurantId)
            .neq("status", "CLOSED");

        await supabase
            .from("orders")
            .update({
                status: "PAID",
                payment_method: "stripe",
                closed_at: new Date().toISOString(),
            })
            .eq("table_session_id", args.tableSessionId)
            .eq("restaurant_id", args.restaurantId)
            .neq("status", "PAID")
            .neq("status", "CANCELLED");
    } catch (closeErr) {
        console.error("[WEBHOOK→close] errore chiusura tavolo:", closeErr);
    }

    await tryEmitFiscalReceipt(result.payload, { dedupeKey: result.dedupeKey });
}

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Webhook CORS: Stripe sends webhooks server-to-server, no browser origin.
// Allow stripe-signature header for webhook verification.
const webhookCorsHeaders = {
    "Access-Control-Allow-Origin": "https://minthi.it",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: webhookCorsHeaders });
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
                let session: any = event.data.object;
                session = await retrieveCheckoutSessionForTrace(session, (event as any).account || undefined);
                const paymentType = session.metadata?.paymentType;
                const stripeTrace = stripePaymentTraceFromSession(session);
                console.log(`[WEBHOOK] checkout.session.completed FULL metadata:`, JSON.stringify(session.metadata));
                console.log(`[WEBHOOK] session.payment_status: ${session.payment_status}, amount_total: ${session.amount_total}`);

                console.log(`[WEBHOOK] checkout.session.completed — paymentType: ${paymentType}, metadata:`, JSON.stringify(session.metadata));

                if (paymentType === "takeaway_order") {
                    // === PAGAMENTO ORDINE ASPORTO ===
                    const restaurantId = session.metadata?.restaurantId;
                    const orderId = session.metadata?.orderId;
                    const splitLabel = session.metadata?.splitLabel || 'Pagamento online';
                    const amountPaid = (session.amount_total || 0) / 100;

                    if (!restaurantId || !orderId) {
                        console.error(`[WEBHOOK] takeaway_order SKIP: metadata incompleto`, JSON.stringify(session.metadata));
                        break;
                    }

                    const { data: order, error: fetchErr } = await supabase
                        .from("orders")
                        .select("id, status, total_amount, paid_amount, payments, order_type")
                        .eq("id", orderId)
                        .maybeSingle();
                    if (fetchErr || !order) {
                        console.error(`[WEBHOOK] takeaway_order: ordine ${orderId} non trovato`, fetchErr);
                        break;
                    }
                    if (order.order_type !== "takeaway") {
                        console.warn(`[WEBHOOK] takeaway_order: ordine ${orderId} non è takeaway`);
                        break;
                    }

                    // Idempotency: use Stripe session id as deterministic label identifier
                    const stripeLabel = `${splitLabel} [${(session as any).id}]`;
                    const existing: any[] = Array.isArray(order.payments) ? order.payments : [];
                    if (existing.some(p => typeof p?.label === 'string' && p.label.endsWith(`[${(session as any).id}]`))) {
                        console.log(`[WEBHOOK] takeaway_order: pagamento ${(session as any).id} già registrato`);
                        await emitTakeawayFiscalReceipt({ session, restaurantId, orderId });
                        break;
                    }

                    const currentPaid = Number(order.paid_amount) || 0;
                    const total = Number(order.total_amount) || 0;
                    if (currentPaid + 0.01 >= total) {
                        console.log(`[WEBHOOK] takeaway_order: ordine ${orderId} già saldato, skip extra session ${(session as any).id}`);
                        break;
                    }
                    const creditedAmount = Math.min(amountPaid, Math.max(0, total - currentPaid));
                    const newPayments = [
                        ...existing,
                        {
                            method: "stripe",
                            amount: Math.round(creditedAmount * 100) / 100,
                            at: new Date().toISOString(),
                            label: stripeLabel,
                            stripeSessionId: stripeTrace.checkout_session_id,
                            stripePaymentIntentId: stripeTrace.payment_intent_id,
                            stripeChargeId: stripeTrace.charge_id,
                            stripeReceiptUrl: stripeTrace.receipt_url,
                            paymentMethodType: stripeTrace.payment_method_type,
                        },
                    ];
                    const newPaid = Math.round((currentPaid + creditedAmount) * 100) / 100;
                    const fullyPaid = newPaid + 0.01 >= total;

                    // IMPORTANTE: il pagamento Stripe NON chiude l'ordine.
                    // L'ordine rimane attivo (PENDING/PREPARING/READY) finché lo staff
                    // non lo consegna manualmente. Stripe registra solo il pagamento.
                    const updates: Record<string, unknown> = {
                        paid_amount: newPaid,
                        payments: newPayments,
                    };
                    if (fullyPaid) {
                        // Traccia il metodo ma NON chiude l'ordine né imposta closed_at.
                        updates.payment_method = newPayments.length > 1 ? "split" : "stripe";
                    }
                    if (order.status === "PENDING" && fullyPaid) {
                        // L'asporto prepagato entra in cucina solo quando Stripe
                        // ha coperto l'intero totale dell'ordine.
                        updates.status = "PREPARING";
                    }

                    const { error: upErr } = await supabase.from("orders").update(updates).eq("id", orderId);
                    if (upErr) {
                        console.error(`[WEBHOOK] takeaway_order update error:`, upErr);
                    } else {
                        console.log(`[WEBHOOK] ✅ Takeaway ${orderId} paid €${amountPaid} (totale: €${newPaid}, pieno: ${fullyPaid})`);
                    }

                    // ---- Emissione scontrino fiscale (best-effort, asincrono) ----
                    // Solo se l'ordine è completamente pagato: emettiamo lo scontrino
                    // dell'intero ordine, non del singolo split.
                    if (fullyPaid) {
                        try {
                            const { data: takeawayItems } = await supabase
                                .from("order_items")
                                .select("id, dish_id, quantity, dish_name_snapshot, unit_price_snapshot, vat_rate_snapshot, dish:dishes(name, price, vat_rate)")
                                .eq("order_id", orderId)
                                .neq("status", "CANCELLED");
                            const items = (takeawayItems || []).map((it: any) => ({
                                description: it.dish_name_snapshot || it.dish?.name || "Voce",
                                quantity: Number(it.quantity) || 1,
                                unitPrice: it.unit_price_snapshot !== null && it.unit_price_snapshot !== undefined
                                    ? Number(it.unit_price_snapshot) || 0
                                    : Number(it.dish?.price) || 0,
                                vatRate: it.vat_rate_snapshot ?? it.dish?.vat_rate ?? undefined,
                            }));
                            // Prendi anche email del cliente se salvata sull'ordine
                            const { data: orderMeta } = await supabase
                                .from("orders")
                                .select("customer_email, customer_tax_code, customer_lottery_code")
                                .eq("id", orderId)
                                .maybeSingle();
                            const electronicReceiptAmount = newPayments
                                .filter((p: any) => p?.method === "stripe")
                                .reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);
                            const cashReceiptAmount = newPayments
                                .filter((p: any) => p?.method === "cash" || p?.method === "pay_on_pickup")
                                .reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);
                            await tryEmitFiscalReceipt({
                                restaurantId,
                                orderId,
                                stripeSessionId: (session as any).id,
                                stripePaymentIntentId: stripeId((session as any).payment_intent),
                                issuedVia: 'auto_takeaway_stripe',
                                items,
                                cashAmount: Math.round(cashReceiptAmount * 100) / 100,
                                electronicAmount: Math.round(electronicReceiptAmount * 100) / 100,
                                customerEmail: orderMeta?.customer_email || (session.customer_details as any)?.email || undefined,
                                customerTaxCode: orderMeta?.customer_tax_code || undefined,
                                customerLotteryCode: orderMeta?.customer_lottery_code || undefined,
                            });
                        } catch (fe) {
                            console.error("[WEBHOOK→fiscal] takeaway emit error:", fe);
                        }
                    }
                    break;
                }

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

                    // Get current paid_amount to add to it
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

                    const idempotencyMarker = `[stripe:${(session as any).id}]`;
                    const currentPaid = currentSession.paid_amount || 0;
                    const existingNotes = currentSession.notes || '';
                    if (typeof existingNotes === "string" && existingNotes.includes(idempotencyMarker)) {
                        console.log(`[WEBHOOK] customer_order: pagamento ${(session as any).id} già registrato`);
                        await recordTableStripePayment(supabase, {
                            restaurantId,
                            tableSessionId: sessionId,
                            amount: amountPaid,
                            session,
                            trace: stripeTrace,
                        });
                        await emitDineInFiscalReceipt({ session, restaurantId, tableSessionId: sessionId, amountPaid, splitLabel });
                        break;
                    }
                    const paymentNote = `💳 ${splitLabel}: €${amountPaid.toFixed(2)} (${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}) ${idempotencyMarker}`;
                    const newNotes = existingNotes ? `${existingNotes}\n${paymentNote}` : paymentNote;
                    const newPaidAmount = currentPaid + amountPaid;

                    console.log(`[WEBHOOK] Updating session ${sessionId}: paid_amount ${currentPaid} → ${newPaidAmount}`);

                    const { error: updateError } = await supabase
                        .from("table_sessions")
                        .update({
                            paid_amount: newPaidAmount,
                            notes: newNotes,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", sessionId);

                    if (updateError) {
                        console.error(`[WEBHOOK] ERRORE update sessione ${sessionId}:`, updateError);
                    } else {
                        console.log(`[WEBHOOK] ✅ Pagamento cliente registrato: €${amountPaid.toFixed(2)} per sessione ${sessionId} (${splitLabel}). Totale pagato: €${newPaidAmount.toFixed(2)}`);
                        await recordTableStripePayment(supabase, {
                            restaurantId,
                            tableSessionId: sessionId,
                            amount: amountPaid,
                            session,
                            trace: stripeTrace,
                        });
                    }

                    // Pre-payment: flag these items as paid online, but DO NOT mark them
                    // as PAID/SERVED. The kitchen still needs to prepare and deliver them —
                    // Stripe checkout is a pre-payment, not a completion signal.
                    const paidItemIdsRaw = session.metadata?.paidOrderItemIds;
                    if (paidItemIdsRaw && paidItemIdsRaw !== '') {
                        try {
                            const paidItemIds = parsePaidOrderItemIds(paidItemIdsRaw);
                            if (paidItemIds.length > 0) {
                                const { error: itemUpdateError } = await supabase
                                    .from("order_items")
                                    .update({
                                        paid_online_at: new Date().toISOString(),
                                        paid_online_session_id: (session as any).id,
                                    })
                                    .in("id", paidItemIds)
                                    .is("paid_online_at", null);

                                if (itemUpdateError) {
                                    console.error(`[WEBHOOK] Errore flagging paid_online_at:`, itemUpdateError);
                                } else {
                                    console.log(`[WEBHOOK] ✅ ${paidItemIds.length} order_items contrassegnati come PAGATI ANTICIPATAMENTE (kitchen continua)`);
                                }
                            }
                        } catch (parseErr) {
                            console.error(`[WEBHOOK] Errore parsing paidOrderItemIds:`, parseErr);
                        }
                    }

                    // ---- Emissione scontrino fiscale tavolo (best-effort) ----
                    // Per il dine-in emettiamo un solo scontrino finale quando il
                    // conto risulta saldato, con righe reali + coperto/AYCE.
                    try {
                        await emitDineInFiscalReceipt({ session, restaurantId, tableSessionId: sessionId, amountPaid, splitLabel, paidAfter: newPaidAmount });
                    } catch (fe) {
                        console.error("[WEBHOOK→fiscal] customer_order emit error:", fe);
                    }
                } else {
                    // === ATTIVAZIONE ABBONAMENTO ===
                    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
                        console.warn(`[WEBHOOK] subscription checkout ${session.id} completato ma payment_status=${session.payment_status}; attendo invoice.paid`);
                        break;
                    }

                    const pendingRegistrationId = session.metadata?.pendingRegistrationId;
                    const restaurantId = session.metadata?.restaurantId || (!pendingRegistrationId ? session.client_reference_id : null);
                    const customerId = session.customer;
                    const subscriptionId = session.subscription;

                    if (pendingRegistrationId) {
                        // Nuova registrazione: crea utente + ristorante dal pending
                        // Verifica che il pending esista e sia valido
                        const { data: pendingCheck } = await supabase
                            .from("pending_registrations")
                            .select("id, completed, expires_at")
                            .eq("id", pendingRegistrationId)
                            .single();

                        if (!pendingCheck) {
                            console.error(`[WEBHOOK] Pending registration ${pendingRegistrationId} NON TROVATA nel DB`);
                            return new Response(JSON.stringify({ error: "Pending registration not found" }), { status: 400 });
                        }

                        if (pendingCheck.completed) {
                            console.log(`[WEBHOOK] Pending registration ${pendingRegistrationId} già completata, skip`);
                            break;
                        }

                        const { data: rpcResult, error: rpcError } = await supabase.rpc("complete_pending_registration", {
                            p_pending_id: pendingRegistrationId,
                            p_stripe_customer_id: customerId,
                            p_stripe_subscription_id: subscriptionId,
                        });

                        if (rpcError) {
                            console.error(`[WEBHOOK] ERRORE CRITICO complete_pending_registration ${pendingRegistrationId}:`, JSON.stringify(rpcError));
                            // Ritorna errore 500 così Stripe riprova
                            return new Response(JSON.stringify({ error: `Registration failed: ${rpcError.message}` }), { status: 500 });
                        }

                        console.log(`[WEBHOOK] ✅ Ristorante creato da pending registration ${pendingRegistrationId}:`, JSON.stringify(rpcResult));
                    } else if (restaurantId) {
                        // Ristorante esistente: aggiorna stato abbonamento
                        const { error: activationError } = await supabase
                            .from("restaurants")
                            .update({
                                stripe_customer_id: customerId,
                                stripe_subscription_id: subscriptionId,
                                is_active: true,
                                suspension_reason: null,
                                subscription_status: "active",
                            })
                            .eq("id", restaurantId);

                        if (activationError) {
                            console.error(`[WEBHOOK] ERRORE CRITICO attivazione ristorante ${restaurantId}:`, JSON.stringify(activationError));
                            return new Response(JSON.stringify({ error: `Activation failed: ${activationError.message}` }), { status: 500, headers: webhookCorsHeaders });
                        }

                        console.log(`[WEBHOOK] ✅ Ristorante ${restaurantId} attivato con abbonamento!`);
                    } else {
                        console.error(`[WEBHOOK] checkout.session.completed per subscription ma NESSUN pendingRegistrationId o restaurantId trovato nel metadata:`, JSON.stringify(session.metadata));
                    }
                }
                break;
            }

            case "invoice.paid": {
                const invoice = event.data.object;
                const customerId = invoice.customer;

                // Salta fatture con amount = 0 (es. prime fatture di trial)
                if ((invoice.amount_paid || 0) === 0) {
                    console.log(`[WEBHOOK] invoice.paid skipped: amount_paid=0 for invoice ${invoice.id}`);
                    break;
                }

                // Idempotenza: controlla se il pagamento è già stato registrato
                const { data: existingPayment } = await supabase
                    .from("subscription_payments")
                    .select("id")
                    .eq("stripe_invoice_id", invoice.id)
                    .limit(1);

                if (existingPayment && existingPayment.length > 0) {
                    console.log(`[WEBHOOK] invoice.paid skipped: payment for invoice ${invoice.id} already exists`);
                    break;
                }

                // Cerca ristorante per stripe_customer_id
                let { data: restaurant } = await supabase
                    .from("restaurants")
                    .select("id")
                    .eq("stripe_customer_id", customerId)
                    .single();

                // Fallback: se non trovato (race condition con checkout.session.completed),
                // cerca per stripe_subscription_id dalla fattura
                if (!restaurant && invoice.subscription) {
                    console.log(`[WEBHOOK] invoice.paid: restaurant not found by customer ${customerId}, trying subscription ${invoice.subscription}`);
                    const { data: restaurantBySub } = await supabase
                        .from("restaurants")
                        .select("id")
                        .eq("stripe_subscription_id", invoice.subscription)
                        .single();
                    restaurant = restaurantBySub;

                    // Se trovato per subscription ma manca customer_id, aggiornalo
                    if (restaurant) {
                        await supabase
                            .from("restaurants")
                            .update({ stripe_customer_id: customerId })
                            .eq("id", restaurant.id);
                        console.log(`[WEBHOOK] invoice.paid: fixed missing stripe_customer_id for restaurant ${restaurant.id}`);
                    }
                }

                // Ultimo fallback: aspetta 5 secondi e riprova (checkout potrebbe essere ancora in corso)
                if (!restaurant) {
                    console.log(`[WEBHOOK] invoice.paid: restaurant not found, waiting 5s for checkout to complete...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    const { data: retryRestaurant } = await supabase
                        .from("restaurants")
                        .select("id")
                        .eq("stripe_customer_id", customerId)
                        .single();
                    restaurant = retryRestaurant;
                }

                // Se Checkout era completato ma non ancora pagato, completiamo la
                // registrazione qui usando i metadata copiati sulla Subscription.
                if (!restaurant && invoice.subscription) {
                    try {
                        const subscription = await stripe.subscriptions.retrieve(String(invoice.subscription));
                        const pendingRegistrationId = subscription.metadata?.pendingRegistrationId;
                        const metadataRestaurantId = subscription.metadata?.restaurantId;

                        if (pendingRegistrationId) {
                            const { data: rpcResult, error: rpcError } = await supabase.rpc("complete_pending_registration", {
                                p_pending_id: pendingRegistrationId,
                                p_stripe_customer_id: customerId,
                                p_stripe_subscription_id: subscription.id,
                            });
                            if (rpcError) {
                                console.error(`[WEBHOOK] invoice.paid complete_pending_registration failed:`, JSON.stringify(rpcError));
                            } else if (rpcResult?.restaurant_id) {
                                restaurant = { id: rpcResult.restaurant_id };
                                console.log(`[WEBHOOK] invoice.paid created restaurant ${restaurant.id} from pending ${pendingRegistrationId}`);
                            }
                        } else if (metadataRestaurantId) {
                            await supabase
                                .from("restaurants")
                                .update({
                                    stripe_customer_id: customerId,
                                    stripe_subscription_id: subscription.id,
                                    is_active: true,
                                    suspension_reason: null,
                                    subscription_status: "active",
                                })
                                .eq("id", metadataRestaurantId);
                            restaurant = { id: metadataRestaurantId };
                        }
                    } catch (subscriptionErr) {
                        console.error(`[WEBHOOK] invoice.paid subscription metadata fallback failed:`, subscriptionErr);
                    }
                }

                if (!restaurant) {
                    console.error(`[WEBHOOK] invoice.paid: RISTORANTE NON TROVATO per customer=${customerId}, invoice=${invoice.id}, subscription=${invoice.subscription}. Pagamento PERSO.`);
                    break;
                }

                const { error: insertError } = await supabase
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

                if (insertError) {
                    console.error(`[WEBHOOK] invoice.paid: ERRORE insert subscription_payments per restaurant ${restaurant.id}:`, JSON.stringify(insertError));
                    break;
                }

                // Pagamento andato a buon fine: aggiorna status e riattiva se era past_due
                const { error: updateError } = await supabase
                    .from("restaurants")
                    .update({
                        subscription_status: "active",
                        is_active: true,
                        suspension_reason: null,
                    })
                    .eq("id", restaurant.id);

                if (updateError) {
                    console.error(`[WEBHOOK] invoice.paid: ERRORE update restaurant ${restaurant.id}:`, JSON.stringify(updateError));
                }

                console.log(`[WEBHOOK] ✅ Pagamento abbonamento registrato: €${((invoice.amount_paid || 0) / 100).toFixed(2)} per ristorante ${restaurant.id} (invoice ${invoice.id})`);
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

                if (!restaurant) {
                    console.error(`[WEBHOOK] invoice.payment_failed: ristorante non trovato per customer=${customerId}, invoice=${invoice.id}`);
                    break;
                }

                const { data: existingFailedPayment } = await supabase
                    .from("subscription_payments")
                    .select("id")
                    .eq("stripe_invoice_id", invoice.id)
                    .limit(1);
                if (existingFailedPayment && existingFailedPayment.length > 0) {
                    console.log(`[WEBHOOK] invoice.payment_failed skipped: invoice ${invoice.id} already registered`);
                    break;
                }

                const { error: failInsertError } = await supabase
                    .from("subscription_payments")
                    .insert({
                        restaurant_id: restaurant.id,
                        stripe_invoice_id: invoice.id,
                        amount: (invoice.amount_due || 0) / 100,
                        currency: invoice.currency || "eur",
                        status: "failed",
                    });

                if (failInsertError) {
                    console.error(`[WEBHOOK] invoice.payment_failed: ERRORE insert:`, JSON.stringify(failInsertError));
                }

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

                    console.log(`[WEBHOOK] Pagamento fallito per ristorante ${restaurant.id} — status: past_due`);
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
                    // Normalizziamo trialing → active: per noi un trial è un abbonamento attivo
                    const normalizedStatus = subscription.status === 'trialing' ? 'active' : subscription.status;
                    const updates: Record<string, unknown> = {
                        subscription_status: normalizedStatus,
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
