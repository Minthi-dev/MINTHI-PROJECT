// =====================================================================
// openapi-issue-receipt
//
// Emette uno scontrino fiscale via OpenAPI per un pagamento Minthi.
//
// Triggers:
//   1. INTERNAL — chiamata server-to-server da stripe-webhook con
//      MINTHI_INTERNAL_KEY (tipico: Stripe ha confermato un pagamento).
//   2. AUTHED — cassiere registra pagamento contanti/POS in dashboard.
//
// Idempotenza:
//   - Se l'orderId / stripe_session_id è già stato emesso (status 'submitted'
//     o 'ready') NON ri-emettiamo.
//   - Inseriamo prima un row in fiscal_receipts con stato 'pending', poi
//     chiamiamo OpenAPI. Se OpenAPI fallisce passiamo a 'failed' con
//     error_log per audit.
//
// Sicurezza:
//   - Se restaurants.fiscal_receipts_enabled = false → skip silenzioso.
//   - Se restaurants.openapi_status != 'active' → skip silenzioso.
//   - Mai esponiamo dettagli interni in caso di errore client-side.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";
import {
    issueReceipt,
    vatRateCode,
    type OpenApiReceiptItem,
} from "../_shared/openapi.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const INTERNAL_KEY = Deno.env.get("MINTHI_INTERNAL_KEY") || "";

interface IssueRequestPayload {
    // Auth (client)
    userId?: string;
    sessionToken?: string;
    // Auth (server-to-server)
    internalKey?: string;

    restaurantId: string;
    orderId?: string;             // takeaway o dine_in
    tableSessionId?: string;       // dine_in
    stripeSessionId?: string;      // cs_xxx — per idempotenza
    stripePaymentIntentId?: string;
    issuedVia?: 'auto_stripe' | 'auto_takeaway_stripe' | 'manual_cashier' | 'manual_retry';

    // Items dello scontrino (passati dal chiamante per non dipendere
    // dallo schema esatto di orders/order_items qui).
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;     // EUR IVA inclusa
        vatRate?: number | string; // 0 / 4 / 5 / 10 / 22 — default ristorante
        discount?: number;
        complimentary?: boolean;
        sku?: string;
    }>;

    // Pagamenti — somma deve corrispondere a totale items (tolleranza 0.05)
    cashAmount?: number;
    electronicAmount?: number;
    ticketRestaurantAmount?: number;
    ticketRestaurantQuantity?: number;
    discount?: number;

    // Cliente (opzionale)
    customerEmail?: string;
    customerTaxCode?: string;       // CF cliente (Tessera Sanitaria)
    customerLotteryCode?: string;   // 8 char

    // Fattura B2B opzionale
    invoiceIssuing?: boolean;
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), {
            status: s,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    try {
        const body: IssueRequestPayload = await req.json();
        const {
            userId,
            sessionToken,
            internalKey,
            restaurantId,
            orderId,
            tableSessionId,
            stripeSessionId,
            stripePaymentIntentId,
            issuedVia = 'manual_cashier',
            items,
            cashAmount = 0,
            electronicAmount = 0,
            ticketRestaurantAmount = 0,
            ticketRestaurantQuantity = 0,
            discount = 0,
            customerEmail,
            customerTaxCode,
            customerLotteryCode,
            invoiceIssuing,
        } = body;

        // --- Auth ---
        let isInternal = false;
        if (internalKey && INTERNAL_KEY && internalKey === INTERNAL_KEY) {
            isInternal = true;
        } else {
            if (!userId || !restaurantId) return json({ error: "Parametri auth mancanti" }, 400);
            const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
            if (!access.valid) return json({ error: "Non autorizzato" }, 403);
        }

        // --- Validazione minima ---
        if (!restaurantId) return json({ error: "restaurantId mancante" }, 400);
        if (!Array.isArray(items) || items.length === 0) {
            return json({ error: "items vuoti" }, 400);
        }

        // --- Carica restaurant ---
        const { data: restaurant } = await supabase
            .from("restaurants")
            .select("id, openapi_fiscal_id, openapi_status, fiscal_receipts_enabled, fiscal_email_to_customer, default_vat_rate_code")
            .eq("id", restaurantId)
            .maybeSingle();

        if (!restaurant) return json({ error: "Ristorante non trovato" }, 404);

        if (!restaurant.fiscal_receipts_enabled) {
            return json({
                skipped: true,
                reason: "fiscal_receipts_disabled",
                message: "Emissione scontrini disabilitata per questo ristorante.",
            }, 200);
        }
        if (restaurant.openapi_status !== "active" || !restaurant.openapi_fiscal_id) {
            return json({
                skipped: true,
                reason: "openapi_not_active",
                message: "Integrazione OpenAPI non attiva. Completa l'onboarding fiscale.",
            }, 200);
        }

        // --- Idempotency ---
        // 1) Se per stesso stripe_session_id esiste già scontrino non-failed → skip
        if (stripeSessionId) {
            const { data: existing } = await supabase
                .from("fiscal_receipts")
                .select("id, openapi_receipt_id, openapi_status")
                .eq("restaurant_id", restaurantId)
                .eq("stripe_session_id", stripeSessionId)
                .in("openapi_status", ["pending", "submitted", "ready"])
                .maybeSingle();
            if (existing) {
                return json({
                    success: true,
                    alreadyIssued: true,
                    receiptId: existing.id,
                    openapiReceiptId: existing.openapi_receipt_id,
                    openapiStatus: existing.openapi_status,
                });
            }
        }
        // 2) Se per stesso orderId esiste già scontrino 'ready' → skip
        if (orderId) {
            const { data: existing } = await supabase
                .from("fiscal_receipts")
                .select("id, openapi_receipt_id")
                .eq("restaurant_id", restaurantId)
                .eq("order_id", orderId)
                .eq("openapi_status", "ready")
                .maybeSingle();
            if (existing) {
                return json({
                    success: true,
                    alreadyIssued: true,
                    receiptId: existing.id,
                    openapiReceiptId: existing.openapi_receipt_id,
                });
            }
        }

        // --- Calcolo totali ---
        const defaultRate = restaurant.default_vat_rate_code || "22";
        const acubeItems: OpenApiReceiptItem[] = items.map(it => {
            const rate = it.vatRate !== undefined ? vatRateCode(it.vatRate) : defaultRate;
            return {
                description: String(it.description || "Voce").slice(0, 1000),
                quantity: Number(it.quantity) || 1,
                unit_price: Math.round(Number(it.unitPrice || 0) * 100) / 100,
                vat_rate_code: rate,
                discount: it.discount ? Math.round(Number(it.discount) * 100) / 100 : undefined,
                complimentary: !!it.complimentary,
                sku: it.sku,
            };
        });

        const grossSum = acubeItems.reduce((s, it) => {
            const lineGross = it.unit_price * it.quantity - (it.discount || 0);
            return s + (it.complimentary ? 0 : lineGross);
        }, 0);
        const itemsTotal = Math.round(grossSum * 100) / 100;
        const paidTotal = Math.round(
            (Number(cashAmount) + Number(electronicAmount) + Number(ticketRestaurantAmount) - Number(discount)) * 100
        ) / 100;

        if (Math.abs(paidTotal - itemsTotal) > 0.05) {
            return json({
                error: `Incoerenza importi: items €${itemsTotal.toFixed(2)} ≠ pagamenti €${paidTotal.toFixed(2)}`,
            }, 400);
        }

        // --- Insert pending row ---
        const { data: pendingRow, error: insErr } = await supabase
            .from("fiscal_receipts")
            .insert({
                restaurant_id: restaurantId,
                order_id: orderId || null,
                table_session_id: tableSessionId || null,
                stripe_session_id: stripeSessionId || null,
                stripe_payment_intent_id: stripePaymentIntentId || null,
                openapi_status: "pending",
                items: acubeItems,
                cash_payment_amount: round2(cashAmount),
                electronic_payment_amount: round2(electronicAmount),
                ticket_restaurant_amount: round2(ticketRestaurantAmount),
                ticket_restaurant_quantity: Number(ticketRestaurantQuantity) || 0,
                discount_amount: round2(discount),
                total_amount: itemsTotal,
                customer_email: customerEmail || null,
                customer_tax_code: customerTaxCode || null,
                customer_lottery_code: customerLotteryCode || null,
                issued_by_user_id: !isInternal ? userId : null,
                issued_via: issuedVia,
            })
            .select("id")
            .single();

        if (insErr || !pendingRow) {
            console.error("[openapi-issue] insert pending failed:", insErr);
            return json({ error: "Errore creazione record scontrino" }, 500);
        }

        const receiptRowId = pendingRow.id;

        // --- Chiamata OpenAPI ---
        try {
            const result = await issueReceipt({
                fiscal_id: restaurant.openapi_fiscal_id,
                items: acubeItems,
                cash_payment_amount: cashAmount,
                electronic_payment_amount: electronicAmount,
                ticket_restaurant_payment_amount: ticketRestaurantAmount,
                ticket_restaurant_quantity: ticketRestaurantQuantity,
                discount,
                lottery_code: customerLotteryCode || undefined,
                customer_tax_code: customerTaxCode || undefined,
                invoice_issuing: !!invoiceIssuing,
                idempotency_key: receiptRowId,
            });

            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_receipt_id: result.id,
                    openapi_status: result.status === "ready" ? "ready" : "submitted",
                    openapi_response: result.raw,
                    submitted_at: new Date().toISOString(),
                    ready_at: result.status === "ready" ? new Date().toISOString() : null,
                })
                .eq("id", receiptRowId);

            return json({
                success: true,
                receiptId: receiptRowId,
                openapiReceiptId: result.id,
                openapiStatus: result.status,
            });
        } catch (apiErr: any) {
            console.error("[openapi-issue] OpenAPI error:", apiErr);
            const errMsg = String(apiErr?.message || apiErr).slice(0, 500);

            const { data: current } = await supabase
                .from("fiscal_receipts")
                .select("error_log, retry_count")
                .eq("id", receiptRowId)
                .single();

            const log = Array.isArray(current?.error_log) ? current!.error_log : [];
            log.push({ at: new Date().toISOString(), error: errMsg });

            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_status: "failed",
                    error_log: log,
                    retry_count: (current?.retry_count || 0) + 1,
                })
                .eq("id", receiptRowId);

            return json({
                error: "Emissione fallita, verrà riprovata.",
                receiptId: receiptRowId,
                detail: errMsg,
            }, 502);
        }
    } catch (err: any) {
        console.error("[openapi-issue] generic error:", err);
        return new Response(JSON.stringify({ error: err?.message || "Errore interno" }), {
            status: 500,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});

function round2(n?: number | null): number {
    if (typeof n !== "number" || !Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}
