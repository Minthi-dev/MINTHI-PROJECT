import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { enqueueFiscalReceiptJob } from "../_shared/fiscal-outbox.ts";
import { buildDineInFinalReceiptPayload } from "../_shared/table-final-receipt.ts";
import { recordTableStripePayment, stripeId, stripePaymentTraceFromSession } from "../_shared/stripe-trace.ts";

/**
 * Deterministic client-side payment verification.
 *
 * The Stripe webhook is the primary handler, but webhooks can be delayed or
 * (in case of Connect misconfiguration) fail signature verification. This
 * function lets the client fallback: after returning from Stripe Checkout
 * with ?payment=success, the client passes the session ID. We verify with
 * Stripe directly and register the payment idempotently.
 *
 * NEVER touches order or order_item status. Only:
 *   - increments table_sessions.paid_amount
 *   - sets order_items.paid_online_at / paid_online_session_id
 *   - for takeaway: increments orders.paid_amount (+ status → PAID only if fully paid)
 *
 * Idempotent via payment dedup on session.id.
 */

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2026-02-25.clover" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const MINTHI_INTERNAL_KEY = Deno.env.get("MINTHI_INTERNAL_KEY") || "";

async function tryEmitFiscalReceipt(payload: Record<string, unknown>, options: { dedupeKey?: string } = {}) {
    if (!MINTHI_INTERNAL_KEY || !supabaseUrl) {
        console.warn("[verify-session→fiscal] internal key o SUPABASE_URL mancanti, skip");
        return;
    }
    try {
        const job = await enqueueFiscalReceiptJob(supabase, payload, {
            dedupeKey: options.dedupeKey,
            priority: 50,
        });
        console.log("[verify-session→fiscal] job:", JSON.stringify(job));
        pokeFiscalWorker();
    } catch (err: any) {
        console.error("[verify-session→fiscal] errore accodamento:", err?.message || err);
    }
}

function pokeFiscalWorker() {
    if (!MINTHI_INTERNAL_KEY || !supabaseUrl) return;
    fetch(`${supabaseUrl}/functions/v1/openapi-receipt-worker`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
                "x-minthi-internal-key": MINTHI_INTERNAL_KEY,
            },
            body: JSON.stringify({ internalKey: MINTHI_INTERNAL_KEY, limit: 10, concurrency: 5 }),
        }).catch((err) => console.warn("[verify-session→fiscal] worker poke fallito:", err?.message || err));
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
        console.log("[verify-session→fiscal] scontrino tavolo finale non ancora pronto:", JSON.stringify(result));
        return;
    }
    await tryEmitFiscalReceipt(result.payload, { dedupeKey: result.dedupeKey });
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { sessionId, restaurantId } = await req.json();

        if (!sessionId || !restaurantId) {
            return json({ error: "sessionId e restaurantId obbligatori" }, 400, corsHeaders);
        }

        // Fetch restaurant to get Connect account ID (sessions are created on connected account)
        const { data: restaurant } = await supabase
            .from("restaurants")
            .select("id, stripe_connect_account_id")
            .eq("id", restaurantId)
            .single();

        if (!restaurant?.stripe_connect_account_id) {
            return json({ error: "Ristorante senza account Stripe Connect" }, 400, corsHeaders);
        }

        // Retrieve the session from Stripe — authoritative source of truth
        let session: any;
        try {
            session = await stripe.checkout.sessions.retrieve(
                sessionId,
                { expand: ["payment_intent.latest_charge"] },
                { stripeAccount: restaurant.stripe_connect_account_id },
            );
        } catch (err: any) {
            console.error(`[verify-session] Stripe retrieve failed:`, err.message);
            return json({ error: "Sessione Stripe non trovata", details: err.message }, 404, corsHeaders);
        }

        if (session.payment_status !== "paid") {
            return json({
                paid: false,
                payment_status: session.payment_status,
                message: "Pagamento non completato",
            }, 200, corsHeaders);
        }

        const paymentType = session.metadata?.paymentType;
        const amountPaid = (session.amount_total || 0) / 100;
        const splitLabel = session.metadata?.splitLabel || "Pagamento online";
        const stripeTrace = stripePaymentTraceFromSession(session);

        // ═══════════════════ TAKEAWAY ORDER ═══════════════════
        if (paymentType === "takeaway_order") {
            const orderId = session.metadata?.orderId;
            if (!orderId) return json({ error: "orderId mancante nel metadata" }, 400, corsHeaders);

            const { data: order } = await supabase
                .from("orders")
                .select("id, status, total_amount, paid_amount, payments, order_type")
                .eq("id", orderId)
                .maybeSingle();

            if (!order) return json({ error: "Ordine non trovato" }, 404, corsHeaders);
            if (order.order_type !== "takeaway") return json({ error: "Tipo ordine non valido" }, 400, corsHeaders);

            const existing: any[] = Array.isArray(order.payments) ? order.payments : [];
            // Idempotency — session ID unique marker
            if (existing.some((p: any) => typeof p?.label === "string" && p.label.endsWith(`[${sessionId}]`))) {
                await emitTakeawayFiscalReceipt({ session, restaurantId, orderId });
                return json({ paid: true, alreadyRegistered: true, sessionId }, 200, corsHeaders);
            }

            const stripeLabel = `${splitLabel} [${sessionId}]`;
            const currentPaid = Number(order.paid_amount) || 0;
            const total = Number(order.total_amount) || 0;
            if (currentPaid + 0.01 >= total) {
                return json({ paid: true, alreadyRegistered: true, sessionId }, 200, corsHeaders);
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
            // L'ordine rimane attivo finché lo staff non lo consegna manualmente.
            const updates: Record<string, unknown> = { paid_amount: newPaid, payments: newPayments };
            if (fullyPaid) {
                updates.payment_method = newPayments.length > 1 ? "split" : "stripe";
            }
            if (order.status === "PENDING" && fullyPaid) {
                // L'ordine asporto entra in cucina solo quando Stripe copre
                // l'intero totale.
                updates.status = "PREPARING";
            }

            const { error: upErr } = await supabase.from("orders").update(updates).eq("id", orderId);
            if (upErr) return json({ error: "Update ordine fallito", details: upErr.message }, 500, corsHeaders);

            if (fullyPaid) {
                await emitTakeawayFiscalReceipt({ session, restaurantId, orderId });
            }

            return json({ paid: true, amount: amountPaid, fullyPaid, sessionId }, 200, corsHeaders);
        }

        // ═══════════════════ CUSTOMER (DINE-IN) ORDER — PRE-PAYMENT ═══════════════════
        if (paymentType === "customer_order") {
            const tableSessionId = session.metadata?.tableSessionId;
            if (!tableSessionId) return json({ error: "tableSessionId mancante" }, 400, corsHeaders);

            // Fetch current session — idempotency via notes containing session ID marker
            const { data: ts } = await supabase
                .from("table_sessions")
                .select("paid_amount, notes")
                .eq("id", tableSessionId)
                .single();

            if (!ts) return json({ error: "Sessione tavolo non trovata" }, 404, corsHeaders);

            const idempotencyMarker = `[stripe:${sessionId}]`;
            if (typeof ts.notes === "string" && ts.notes.includes(idempotencyMarker)) {
                await recordTableStripePayment(supabase, {
                    restaurantId,
                    tableSessionId,
                    amount: amountPaid,
                    session,
                    trace: stripeTrace,
                });
                await emitDineInFiscalReceipt({ session, restaurantId, tableSessionId, amountPaid, splitLabel });
                return json({ paid: true, alreadyRegistered: true, sessionId }, 200, corsHeaders);
            }

            const currentPaid = Number(ts.paid_amount) || 0;
            const newPaidAmount = Math.round((currentPaid + amountPaid) * 100) / 100;
            const timeStr = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
            const paymentNote = `💳 ${splitLabel}: €${amountPaid.toFixed(2)} (${timeStr}) ${idempotencyMarker}`;
            const newNotes = ts.notes ? `${ts.notes}\n${paymentNote}` : paymentNote;

            const { error: upErr } = await supabase
                .from("table_sessions")
                .update({ paid_amount: newPaidAmount, notes: newNotes, updated_at: new Date().toISOString() })
                .eq("id", tableSessionId);

            if (upErr) return json({ error: "Update sessione fallito", details: upErr.message }, 500, corsHeaders);

            await recordTableStripePayment(supabase, {
                restaurantId,
                tableSessionId,
                amount: amountPaid,
                session,
                trace: stripeTrace,
            });

            // Pre-payment: flag items as paid online but DO NOT change their status.
            // Kitchen must still prepare & serve them normally.
            const paidItemIdsRaw = session.metadata?.paidOrderItemIds;
            let flagged = 0;
            if (paidItemIdsRaw) {
                try {
                    const paidItemIds = parsePaidOrderItemIds(paidItemIdsRaw);
                    if (Array.isArray(paidItemIds) && paidItemIds.length > 0) {
                        const { error: itemErr, count } = await supabase
                            .from("order_items")
                            .update({
                                paid_online_at: new Date().toISOString(),
                                paid_online_session_id: sessionId,
                            })
                            .in("id", paidItemIds)
                            .is("paid_online_at", null) // only update if not already flagged
                            .select("id", { count: "exact", head: true });
                        if (itemErr) console.error("[verify-session] flag items err:", itemErr);
                        else flagged = count || 0;
                    }
                } catch (e) {
                    console.error("[verify-session] parse paidOrderItemIds err:", e);
                }
            }

            await emitDineInFiscalReceipt({ session, restaurantId, tableSessionId, amountPaid, splitLabel, paidAfter: newPaidAmount });

            return json({
                paid: true,
                amount: amountPaid,
                newPaidAmount,
                itemsFlagged: flagged,
                sessionId,
            }, 200, corsHeaders);
        }

        return json({ error: `paymentType non gestito: ${paymentType}` }, 400, corsHeaders);
    } catch (error: any) {
        console.error("[verify-session] Errore:", error);
        return json({ error: error.message || "Errore server" }, 500, getCorsHeaders(req));
    }
});

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
