// =====================================================================
// takeaway-pay
// Authed (OWNER/STAFF/ADMIN) — cashier registers a payment on a
// takeaway order. Supports cash, card-at-POS, and split payments.
// Optionally creates a Stripe Checkout session for in-person card payment
// via the restaurant's Connect account.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess, validateRedirectUrl } from "../_shared/auth.ts";
import { ensureStripeConnectReady } from "../_shared/stripe-connect.ts";
import { issueReceipt, isOpenApiConfigured } from "../_shared/openapi.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2026-02-25.clover" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

type PaymentAction =
    | { action: "register_payment"; method: "cash" | "card_pos"; amount: number; label?: string }
    | { action: "register_stripe_online"; amount: number; label?: string } // after Stripe webhook lands
    | { action: "create_stripe_checkout"; amount: number; label?: string; successUrl?: string; cancelUrl?: string }
    | { action: "refund_last"; }
    | { action: "refund_stripe"; stripePaymentIntentId: string; amount?: number; reason?: string }
    | { action: "cancel_order"; };

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

    try {
        const body = await req.json();
        const { userId, orderId, sessionToken } = body;
        if (!userId || !orderId) return json({ error: "Parametri mancanti" }, 400);
        if (typeof orderId !== "string" || orderId.length !== 36) return json({ error: "orderId non valido" }, 400);

        const { data: order, error: oErr } = await supabase
            .from("orders")
            .select("id, restaurant_id, order_type, status, total_amount, paid_amount, payments, pickup_number, pickup_code")
            .eq("id", orderId)
            .maybeSingle();
        if (oErr || !order) return json({ error: "Ordine non trovato" }, 404);
        if (order.order_type !== "takeaway") return json({ error: "Non è un ordine asporto" }, 400);

        const access = await verifyAccess(supabase, userId, order.restaurant_id, sessionToken);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        const { data: restaurantConfig } = await supabase
            .from("restaurants")
            .select("takeaway_require_stripe")
            .eq("id", order.restaurant_id)
            .maybeSingle();
        const requiresStripePrepay = restaurantConfig?.takeaway_require_stripe === true;

        const payments: Array<{ method: string; amount: number; at: string; label?: string; by?: string }> =
            Array.isArray(order.payments) ? [...order.payments] : [];
        const currentPaid = Number(order.paid_amount) || 0;
        const total = Number(order.total_amount) || 0;
        const remaining = Math.max(0, Math.round((total - currentPaid) * 100) / 100);

        const a = body as PaymentAction;

        // ------------------------------------------------------------------
        // register_payment — cash or pos card, handled directly
        // ------------------------------------------------------------------
        if (a.action === "register_payment") {
            if (requiresStripePrepay) {
                return json({ error: "Questo ordine richiede pagamento anticipato online con Stripe" }, 409);
            }
            if (!["cash", "card_pos"].includes(a.method)) return json({ error: "Metodo non valido" }, 400);
            if (typeof a.amount !== "number" || !Number.isFinite(a.amount) || a.amount <= 0) {
                return json({ error: "Importo non valido" }, 400);
            }
            if (currentPaid + a.amount > total + 0.01) {
                return json({ error: `Importo supera il totale da pagare (residuo: €${(total - currentPaid).toFixed(2)})` }, 400);
            }
            payments.push({
                method: a.method,
                amount: Math.round(a.amount * 100) / 100,
                at: new Date().toISOString(),
                label: a.label?.slice(0, 64) || (a.method === "cash" ? "Contanti" : "POS"),
                by: userId,
            });
            const newPaid = Math.round((currentPaid + a.amount) * 100) / 100;
            const fullyPaid = newPaid + 0.01 >= total;

            const updates: Record<string, unknown> = {
                paid_amount: newPaid,
                payments,
                payment_method: fullyPaid ? (payments.length > 1 ? "split" : a.method) : order.status === "PAID" ? undefined : null,
            };
            if (fullyPaid && order.status !== "PAID") {
                updates.status = "PAID";
                updates.closed_at = new Date().toISOString();
                // Keep non-payment lifecycle fields intact.
            }

            const { error: uErr } = await supabase.from("orders").update(updates).eq("id", orderId);
            if (uErr) return json({ error: uErr.message }, 500);
            return json({ success: true, paidAmount: newPaid, fullyPaid });
        }

        // ------------------------------------------------------------------
        // register_stripe_online — called by webhook after Stripe confirms
        // Idempotent (won't double-credit the same stripe payment id label).
        // ------------------------------------------------------------------
        if (a.action === "register_stripe_online") {
            if (typeof a.amount !== "number" || a.amount <= 0) return json({ error: "Importo non valido" }, 400);
            // We don't store stripe ids here; webhook passes a deterministic label.
            const label = a.label?.slice(0, 64) || "Stripe online";
            const duplicate = payments.some((p) => p.method === "stripe" && p.label === label && Math.abs(p.amount - a.amount) < 0.01);
            if (duplicate) return json({ success: true, duplicate: true });
            if (currentPaid + 0.01 >= total) return json({ success: true, duplicate: true });
            const creditedAmount = Math.min(a.amount, remaining);
            payments.push({
                method: "stripe",
                amount: Math.round(creditedAmount * 100) / 100,
                at: new Date().toISOString(),
                label,
                by: userId,
            });
            const newPaid = Math.round((currentPaid + creditedAmount) * 100) / 100;
            const fullyPaid = newPaid + 0.01 >= total;
            const updates: Record<string, unknown> = {
                paid_amount: newPaid,
                payments,
                payment_method: fullyPaid ? (payments.length > 1 ? "split" : "stripe") : null,
            };
            if (order.status === "PENDING" && fullyPaid) {
                updates.status = "PREPARING";
            }
            const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
            if (error) return json({ error: error.message }, 500);
            return json({ success: true, paidAmount: newPaid, fullyPaid });
        }

        // ------------------------------------------------------------------
        // create_stripe_checkout — customer pays at counter with a card link
        // ------------------------------------------------------------------
        if (a.action === "create_stripe_checkout") {
            if (typeof a.amount !== "number" || a.amount <= 0) return json({ error: "Importo non valido" }, 400);
            if (currentPaid + a.amount > total + 0.01) {
                return json({ error: `Importo supera il totale (residuo: €${(total - currentPaid).toFixed(2)})` }, 400);
            }
            if (requiresStripePrepay && Math.abs(a.amount - remaining) > 0.01) {
                return json({ error: `Pagamento anticipato obbligatorio: incassa l'intero residuo (€${remaining.toFixed(2)}) con Stripe` }, 409);
            }

            const { data: rest } = await supabase
                .from("restaurants")
                .select("stripe_connect_account_id, stripe_connect_enabled, enable_stripe_payments, name")
                .eq("id", order.restaurant_id)
                .maybeSingle();
            if (!rest || !rest.enable_stripe_payments) return json({ error: "Pagamenti online non attivi" }, 400);
            if (!rest.stripe_connect_account_id || !rest.stripe_connect_enabled) {
                return json({ error: "Account Stripe non configurato" }, 403);
            }
            const connectReady = await ensureStripeConnectReady({
                stripe,
                supabase,
                restaurantId: order.restaurant_id,
                accountId: rest.stripe_connect_account_id,
            });
            if (!connectReady.ok) {
                return json({ error: connectReady.message, needsReconnect: connectReady.needsReconnect === true }, 403);
            }

            const origin = req.headers.get("origin") || "https://minthi.it";
            const defaultSuccess = `${origin}/client/takeaway/${order.restaurant_id}/order/${order.pickup_code}?payment=success&session_id={CHECKOUT_SESSION_ID}`;
            const defaultCancel = `${origin}/client/takeaway/${order.restaurant_id}/order/${order.pickup_code}?payment=cancelled`;

            const session = await stripe.checkout.sessions.create(
                {
                    mode: "payment",
                    line_items: [
                        {
                            price_data: {
                                currency: "eur",
                                product_data: { name: `Asporto #${order.pickup_number} — ${a.label || "Pagamento"}` },
                                unit_amount: Math.round(a.amount * 100),
                            },
                            quantity: 1,
                        },
                    ],
                    success_url: validateRedirectUrl(a.successUrl, defaultSuccess),
                    cancel_url: validateRedirectUrl(a.cancelUrl, defaultCancel),
                    metadata: {
                        paymentType: "takeaway_order",
                        restaurantId: order.restaurant_id,
                        orderId: order.id,
                        pickupCode: order.pickup_code || "",
                        pickupNumber: String(order.pickup_number),
                        splitLabel: (a.label || "Pagamento").slice(0, 60),
                    },
                },
                {
                    stripeAccount: rest.stripe_connect_account_id!,
                    idempotencyKey: `takeaway-counter-${order.id}-${Math.round(a.amount * 100)}`,
                }
            );
            return json({ success: true, checkoutUrl: session.url, sessionId: session.id });
        }

        // ------------------------------------------------------------------
        // refund_last — undo the last manual (cash/pos) payment entry
        // (Stripe refunds must happen from the Stripe dashboard.)
        // ------------------------------------------------------------------
        if (a.action === "refund_last") {
            const lastIdx = [...payments].reverse().findIndex((p) => p.method === "cash" || p.method === "card_pos");
            if (lastIdx === -1) return json({ error: "Nessun pagamento manuale da annullare" }, 400);
            const realIdx = payments.length - 1 - lastIdx;
            const removed = payments.splice(realIdx, 1)[0];
            const newPaid = Math.max(0, Math.round((currentPaid - removed.amount) * 100) / 100);
            const updates: Record<string, unknown> = { paid_amount: newPaid, payments };
            if (order.status === "PAID") {
                updates.status = "PREPARING";
                updates.closed_at = null;
                updates.payment_method = null;
            }
            const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
            if (error) return json({ error: error.message }, 500);
            return json({ success: true, paidAmount: newPaid });
        }

        // ------------------------------------------------------------------
        // refund_stripe — refund an existing Stripe payment via Connect
        //
        // Safety guarantees:
        //   - Only refunds a payment that we can trace to a payment intent
        //     stored in payments[].
        //   - Asks Stripe directly on the Connect account; if Stripe says
        //     "already refunded" we just reconcile our DB and return success.
        //   - Idempotent: a deterministic idempotencyKey prevents double-refund
        //     even if the cashier double-clicks or the network retries.
        //   - DB update happens only after Stripe confirms the refund.
        //   - Partial refunds supported via `amount` (defaults to full).
        // ------------------------------------------------------------------
        if (a.action === "refund_stripe") {
            const piId = String(a.stripePaymentIntentId || "").trim();
            if (!piId || !piId.startsWith("pi_")) {
                return json({ error: "Payment intent non valido" }, 400);
            }

            const entryIdx = payments.findIndex(
                (p: any) => p?.method === "stripe" && p?.stripePaymentIntentId === piId
            );
            if (entryIdx === -1) {
                return json({ error: "Pagamento Stripe non trovato per questo ordine" }, 404);
            }
            const entry = payments[entryIdx] as any;
            const alreadyRefunded = Number(entry.refundedAmount) || 0;
            const originalAmount = Number(entry.amount) || 0;
            const remainingRefundable = Math.max(0, Math.round((originalAmount - alreadyRefunded) * 100) / 100);
            if (remainingRefundable <= 0.01) {
                return json({ error: "Pagamento già rimborsato completamente" }, 409);
            }

            const requestedAmount = typeof a.amount === "number" && Number.isFinite(a.amount)
                ? Math.round(a.amount * 100) / 100
                : remainingRefundable;
            if (requestedAmount <= 0) {
                return json({ error: "Importo rimborso non valido" }, 400);
            }
            if (requestedAmount > remainingRefundable + 0.01) {
                return json({
                    error: `Importo richiesto (€${requestedAmount.toFixed(2)}) supera il residuo rimborsabile (€${remainingRefundable.toFixed(2)})`,
                }, 400);
            }

            // Need the connected account id to talk to Stripe Connect.
            const { data: restConnect } = await supabase
                .from("restaurants")
                .select("stripe_connect_account_id, name")
                .eq("id", order.restaurant_id)
                .maybeSingle();
            if (!restConnect?.stripe_connect_account_id) {
                return json({ error: "Account Stripe Connect del ristorante non disponibile" }, 409);
            }

            // Stripe refund (with deterministic idempotency to prevent
            // double-refund on retries).
            const idempotencyKey = `takeaway-refund-${orderId}-${piId}-${Math.round(requestedAmount * 100)}`;
            let refund: any = null;
            try {
                refund = await stripe.refunds.create(
                    {
                        payment_intent: piId,
                        amount: Math.round(requestedAmount * 100),
                        reason: a.reason === "fraudulent" ? "fraudulent"
                            : a.reason === "duplicate" ? "duplicate"
                            : "requested_by_customer",
                        metadata: {
                            minthiOrderId: orderId,
                            minthiRestaurantId: order.restaurant_id,
                            initiatedBy: userId,
                        },
                    },
                    { stripeAccount: restConnect.stripe_connect_account_id, idempotencyKey }
                );
            } catch (stripeErr: any) {
                // If Stripe says the charge was already refunded externally
                // (e.g. from Stripe Dashboard), reconcile our DB silently.
                const msg = String(stripeErr?.message || stripeErr || "").toLowerCase();
                if (msg.includes("already") && msg.includes("refunded")) {
                    // Treat as full refund of remaining amount
                    refund = {
                        id: `external-${Date.now()}`,
                        amount: Math.round(remainingRefundable * 100),
                        status: "succeeded",
                        external_reconciliation: true,
                    };
                } else {
                    console.error("[TAKEAWAY-REFUND-STRIPE] Stripe error:", stripeErr);
                    return json({
                        error: "Stripe ha rifiutato il rimborso: " + (stripeErr?.message || "errore sconosciuto"),
                    }, 502);
                }
            }

            const refundedAmount = (Number(refund.amount) || Math.round(requestedAmount * 100)) / 100;
            const fullRefund = refundedAmount + 0.01 >= remainingRefundable;

            // --- Update payments[] -------------------------------------------------
            const newRefundedAmount = Math.round((alreadyRefunded + refundedAmount) * 100) / 100;
            payments[entryIdx] = {
                ...entry,
                refundedAmount: newRefundedAmount,
                refundedAt: new Date().toISOString(),
                lastRefundId: refund.id,
            };

            // Audit row: log the refund as a NEGATIVE-amount payment so the
            // running total of paid_amount stays correct.
            payments.push({
                method: "stripe_refund",
                amount: -refundedAmount,
                at: new Date().toISOString(),
                label: `Rimborso Stripe [${piId.slice(0, 12)}…]`,
                by: userId,
                stripeRefundId: refund.id,
                stripePaymentIntentId: piId,
                externalReconciliation: refund.external_reconciliation === true,
            });

            const newPaid = Math.max(
                0,
                Math.round((currentPaid - refundedAmount) * 100) / 100
            );
            const updates: Record<string, unknown> = {
                paid_amount: newPaid,
                payments,
            };
            // If the order was PAID and now isn't fully covered → reopen as PREPARING
            if (order.status === "PAID" && newPaid + 0.01 < total) {
                updates.status = "PREPARING";
                updates.closed_at = null;
                updates.payment_method = null;
            }
            // If we refunded everything and there are no other payments → reset method
            const anyRemainingPayment = payments.some((p: any) => Number(p?.amount) > 0);
            if (!anyRemainingPayment) {
                updates.payment_method = null;
            }

            const { error: uErr } = await supabase.from("orders").update(updates).eq("id", orderId);
            if (uErr) {
                console.error("[TAKEAWAY-REFUND-STRIPE] DB update error after Stripe success:", uErr);
                // Stripe already refunded → DB inconsistency must be visible
                return json({
                    error: "Rimborso eseguito su Stripe ma errore nel salvataggio locale. Contatta supporto.",
                    stripeRefundId: refund.id,
                    refundedAmount,
                }, 500);
            }

            // ---- Auto-emit fiscal refund receipt (best-effort) ----
            //
            // Italian regulation (D.Lgs. 127/2015 + AdE Prov. 28/10/2016)
            // requires a "documento commerciale per reso/annullo" referencing
            // the original receipt. We do this via OpenAPI's linked_receipt
            // mechanism. Failure of this step does NOT roll back the Stripe
            // refund — fiscal reconciliation can be retried, money cannot.
            let fiscalRefund: any = null;
            let fiscalRefundError: string | null = null;
            try {
                const { data: originalReceipt } = await supabase
                    .from("fiscal_receipts")
                    .select("id, openapi_receipt_id, openapi_status, items, total_amount, electronic_payment_amount, restaurant_id, customer_email, customer_tax_code, customer_lottery_code")
                    .eq("restaurant_id", order.restaurant_id)
                    .eq("stripe_payment_intent_id", piId)
                    .neq("issued_via", "refund_stripe")
                    .neq("issued_via", "refund_manual")
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (originalReceipt?.openapi_receipt_id && originalReceipt.openapi_status === "ready") {
                    if (!isOpenApiConfigured()) {
                        fiscalRefundError = "OpenAPI non configurato sulla piattaforma";
                    } else {
                        // Get fiscal_id (P.IVA) of restaurant
                        const { data: fiscalSettings } = await supabase
                            .from("restaurant_fiscal_settings")
                            .select("openapi_fiscal_id")
                            .eq("restaurant_id", order.restaurant_id)
                            .maybeSingle();

                        if (!fiscalSettings?.openapi_fiscal_id) {
                            fiscalRefundError = "P.IVA fiscale non configurata";
                        } else {
                            // Build refund items.
                            // - Full refund: invert all original items (negative quantity).
                            // - Partial refund: emit a single "Rimborso parziale" line for
                            //   the refunded amount. AdE accepts this pattern via
                            //   linked_receipt.
                            const originalItems: any[] = Array.isArray(originalReceipt.items) ? originalReceipt.items : [];
                            const refundItems = fullRefund && originalItems.length > 0
                                ? originalItems.map((it: any) => ({
                                    quantity: Number(it.quantity) || 1,
                                    description: `RESO ${String(it.description || "Voce").slice(0, 990)}`,
                                    unit_price: -Math.abs(Number(it.unit_price ?? it.unitPrice ?? 0)),
                                    vat_rate_code: String(it.vat_rate_code || it.vatRate || "10"),
                                }))
                                : [{
                                    quantity: 1,
                                    description: `Rimborso parziale ordine #${order.pickup_number || ""}`.trim(),
                                    unit_price: -refundedAmount,
                                    vat_rate_code: "10",
                                }];

                            const refundResult = await issueReceipt({
                                fiscal_id: fiscalSettings.openapi_fiscal_id,
                                items: refundItems,
                                electronic_payment_amount: -refundedAmount,
                                linked_receipt: originalReceipt.openapi_receipt_id,
                                idempotency_key: `refund-${originalReceipt.id}-${refund.id}`,
                                customer_tax_code: originalReceipt.customer_tax_code || undefined,
                            });

                            // Persist refund receipt row
                            const { data: refundRow } = await supabase
                                .from("fiscal_receipts")
                                .insert({
                                    restaurant_id: order.restaurant_id,
                                    order_id: orderId,
                                    stripe_payment_intent_id: piId,
                                    openapi_receipt_id: refundResult.id,
                                    openapi_status: refundResult.status || "submitted",
                                    openapi_response: refundResult.raw || null,
                                    items: refundItems,
                                    cash_payment_amount: 0,
                                    electronic_payment_amount: -refundedAmount,
                                    total_amount: -refundedAmount,
                                    issued_via: "refund_stripe",
                                    linked_receipt_id: originalReceipt.id,
                                    issued_by_user_id: userId,
                                    submitted_at: new Date().toISOString(),
                                })
                                .select("id, openapi_receipt_id, openapi_status")
                                .single();
                            fiscalRefund = refundRow;
                        }
                    }
                } else if (!originalReceipt) {
                    fiscalRefundError = "Nessuno scontrino fiscale originale trovato — emetti il reso manualmente";
                } else if (originalReceipt.openapi_status !== "ready") {
                    fiscalRefundError = `Scontrino originale in stato ${originalReceipt.openapi_status}: reso emettibile solo dopo trasmissione AdE`;
                }
            } catch (err: any) {
                fiscalRefundError = String(err?.message || err).slice(0, 400);
                console.error("[TAKEAWAY-REFUND-STRIPE] fiscal refund error:", err);
            }

            return json({
                success: true,
                refundedAmount,
                fullRefund,
                paidAmount: newPaid,
                stripeRefundId: refund.id,
                externalReconciliation: refund.external_reconciliation === true,
                fiscalRefund,
                fiscalRefundError,
                fiscalNotice: fiscalRefund
                    ? `Rimborso completato. Scontrino di reso emesso (#${fiscalRefund.openapi_receipt_id || fiscalRefund.id}).`
                    : (fiscalRefundError
                        ? `Rimborso Stripe eseguito. ATTENZIONE: scontrino di reso NON emesso (${fiscalRefundError}). Emettilo manualmente dal POS o contatta il commercialista.`
                        : "Rimborso Stripe eseguito. Nessun scontrino fiscale da annullare (l'ordine non aveva uno scontrino emesso)."),
            });
        }

        // ------------------------------------------------------------------
        // cancel_order — cashier cancels a takeaway order
        // ------------------------------------------------------------------
        if (a.action === "cancel_order") {
            if (order.status === "PAID") return json({ error: "Impossibile annullare un ordine pagato" }, 400);
            const { error } = await supabase.from("orders").update({
                status: "CANCELLED",
                closed_at: new Date().toISOString(),
            }).eq("id", orderId);
            if (error) return json({ error: error.message }, 500);
            await supabase.from("order_items").update({ status: "CANCELLED" }).eq("order_id", orderId);
            return json({ success: true });
        }

        return json({ error: "Azione non riconosciuta" }, 400);
    } catch (err: any) {
        console.error("[TAKEAWAY-PAY] error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});
