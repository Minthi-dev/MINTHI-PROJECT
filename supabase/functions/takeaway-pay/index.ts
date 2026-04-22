// =====================================================================
// takeaway-pay
// Authed (OWNER/STAFF/ADMIN) — cashier registers a payment on a
// takeaway order. Supports cash, card-at-POS, and split payments.
// Optionally creates a Stripe Checkout session for in-person card payment
// via the restaurant's Connect account.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess, validateRedirectUrl } from "../_shared/auth.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
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
    | { action: "cancel_order"; };

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

    try {
        const body = await req.json();
        const { userId, orderId } = body;
        if (!userId || !orderId) return json({ error: "Parametri mancanti" }, 400);
        if (typeof orderId !== "string" || orderId.length !== 36) return json({ error: "orderId non valido" }, 400);

        const { data: order, error: oErr } = await supabase
            .from("orders")
            .select("id, restaurant_id, order_type, status, total_amount, paid_amount, payments, pickup_number, pickup_code")
            .eq("id", orderId)
            .maybeSingle();
        if (oErr || !order) return json({ error: "Ordine non trovato" }, 404);
        if (order.order_type !== "takeaway") return json({ error: "Non è un ordine asporto" }, 400);

        const access = await verifyAccess(supabase, userId, order.restaurant_id);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        const payments: Array<{ method: string; amount: number; at: string; label?: string; by?: string }> =
            Array.isArray(order.payments) ? [...order.payments] : [];
        const currentPaid = Number(order.paid_amount) || 0;
        const total = Number(order.total_amount) || 0;

        const a = body as PaymentAction;

        // ------------------------------------------------------------------
        // register_payment — cash or pos card, handled directly
        // ------------------------------------------------------------------
        if (a.action === "register_payment") {
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
            payments.push({
                method: "stripe",
                amount: Math.round(a.amount * 100) / 100,
                at: new Date().toISOString(),
                label,
                by: userId,
            });
            const newPaid = Math.round((currentPaid + a.amount) * 100) / 100;
            const fullyPaid = newPaid + 0.01 >= total;
            const updates: Record<string, unknown> = {
                paid_amount: newPaid,
                payments,
                payment_method: fullyPaid ? (payments.length > 1 ? "split" : "stripe") : null,
            };
            if (fullyPaid) {
                updates.status = "PAID";
                updates.closed_at = new Date().toISOString();
            } else if (order.status === "PENDING") {
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

            const { data: rest } = await supabase
                .from("restaurants")
                .select("stripe_connect_account_id, stripe_connect_enabled, enable_stripe_payments, name")
                .eq("id", order.restaurant_id)
                .maybeSingle();
            if (!rest || !rest.enable_stripe_payments) return json({ error: "Pagamenti online non attivi" }, 400);
            if (!rest.stripe_connect_account_id || !rest.stripe_connect_enabled) {
                return json({ error: "Account Stripe non configurato" }, 403);
            }

            const origin = req.headers.get("origin") || "https://minthi.it";
            const defaultSuccess = `${origin}/client/takeaway/${order.restaurant_id}/order/${order.pickup_code}?payment=success`;
            const defaultCancel = `${origin}/client/takeaway/${order.restaurant_id}/order/${order.pickup_code}?payment=cancelled`;

            const session = await stripe.checkout.sessions.create(
                {
                    payment_method_types: ["card"],
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
                { stripeAccount: rest.stripe_connect_account_id! }
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
