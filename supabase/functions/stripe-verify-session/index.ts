import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";

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
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
            session = await stripe.checkout.sessions.retrieve(sessionId, {
                stripeAccount: restaurant.stripe_connect_account_id,
            });
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
                return json({ paid: true, alreadyRegistered: true, sessionId }, 200, corsHeaders);
            }

            const stripeLabel = `${splitLabel} [${sessionId}]`;
            const newPayments = [
                ...existing,
                { method: "stripe", amount: Math.round(amountPaid * 100) / 100, at: new Date().toISOString(), label: stripeLabel },
            ];
            const newPaid = Math.round(((Number(order.paid_amount) || 0) + amountPaid) * 100) / 100;
            const total = Number(order.total_amount) || 0;
            const fullyPaid = newPaid + 0.01 >= total;

            const updates: Record<string, unknown> = { paid_amount: newPaid, payments: newPayments };
            if (fullyPaid) {
                updates.status = "PAID";
                updates.payment_method = newPayments.length > 1 ? "split" : "stripe";
                updates.closed_at = new Date().toISOString();
            } else if (order.status === "PENDING") {
                updates.status = "PREPARING";
            }

            const { error: upErr } = await supabase.from("orders").update(updates).eq("id", orderId);
            if (upErr) return json({ error: "Update ordine fallito", details: upErr.message }, 500, corsHeaders);

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

            // Pre-payment: flag items as paid online but DO NOT change their status.
            // Kitchen must still prepare & serve them normally.
            const paidItemIdsRaw = session.metadata?.paidOrderItemIds;
            let flagged = 0;
            if (paidItemIdsRaw) {
                try {
                    const paidItemIds = JSON.parse(paidItemIdsRaw);
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
