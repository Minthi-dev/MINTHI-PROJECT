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
    fetchReceiptPdf,
    getOpenApiEnv,
    issueReceipt,
    isValidTaxCodeIT,
    vatRateCode,
    type OpenApiReceiptItem,
} from "../_shared/openapi.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const INTERNAL_KEY = Deno.env.get("MINTHI_INTERNAL_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Minthi <onboarding@resend.dev>";

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
    stripePaymentTrace?: Record<string, unknown> | null;
    idempotencyKey?: string;        // interno/outbox: chiave stabile job -> scontrino
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
    testReceipt?: boolean;

    // Retry: riusa un record fiscal_receipts esistente in stato 'failed'
    retryReceiptId?: string;
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
            stripePaymentTrace,
            idempotencyKey: requestedIdempotencyKey,
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
            testReceipt,
            retryReceiptId,
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
        if (testReceipt && getOpenApiEnv() === "production") {
            return json({ error: "Lo scontrino di test è disponibile solo in ambiente sandbox OpenAPI." }, 400);
        }

        // ----------------------------------------------------------------
        // RETRY PATH: reload items from existing failed receipt
        // ----------------------------------------------------------------
        if (retryReceiptId) {
            const { data: failedRow } = await supabase
                .from("fiscal_receipts")
                .select("*")
                .eq("id", retryReceiptId)
                .eq("restaurant_id", restaurantId)
                .maybeSingle();

            if (!failedRow) {
                return json({ error: "Scontrino da riprovare non trovato" }, 404);
            }
            if (failedRow.openapi_status !== "failed") {
                return json({ error: `Scontrino in stato '${failedRow.openapi_status}': il retry è possibile solo per scontrini falliti.` }, 400);
            }
            if ((failedRow.retry_count || 0) >= 5) {
                return json({ error: "Numero massimo di tentativi raggiunto (5). Verifica la configurazione fiscale e contatta l'assistenza." }, 400);
            }

            // Reload fiscal settings
            const { data: retryFiscalSettings } = await supabase
                .from("restaurant_fiscal_settings")
                .select("openapi_fiscal_id, openapi_status, fiscal_receipts_enabled, default_vat_rate_code")
                .eq("restaurant_id", restaurantId)
                .maybeSingle();
            if (!retryFiscalSettings?.fiscal_receipts_enabled || retryFiscalSettings.openapi_status !== "active" || !retryFiscalSettings.openapi_fiscal_id) {
                return json({ error: "L'integrazione fiscale non è attiva. Completa prima l'onboarding." }, 400);
            }

            // Reset to pending
            const retryLog = Array.isArray(failedRow.error_log) ? failedRow.error_log : [];
            retryLog.push({ at: new Date().toISOString(), status: "manual_retry", source: "cashier" });
            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_status: "pending",
                    error_log: retryLog,
                })
                .eq("id", retryReceiptId);

            // Re-issue
            try {
                const retryItems = Array.isArray(failedRow.items) ? failedRow.items : [];
                const result = await issueReceipt({
                    fiscal_id: retryFiscalSettings.openapi_fiscal_id,
                    items: retryItems,
                    cash_payment_amount: Number(failedRow.cash_payment_amount) || 0,
                    electronic_payment_amount: Number(failedRow.electronic_payment_amount) || 0,
                    ticket_restaurant_payment_amount: Number(failedRow.ticket_restaurant_amount) || 0,
                    ticket_restaurant_quantity: Number(failedRow.ticket_restaurant_quantity) || 0,
                    discount: Number(failedRow.discount_amount) || 0,
                    lottery_code: failedRow.customer_lottery_code || undefined,
                    customer_tax_code: failedRow.customer_tax_code || undefined,
                    idempotency_key: retryReceiptId,
                });

                await supabase
                    .from("fiscal_receipts")
                    .update({
                        openapi_receipt_id: result.id,
                        openapi_status: result.status === "ready" ? "ready" : "submitted",
                        openapi_response: result.raw,
                        submitted_at: new Date().toISOString(),
                        ready_at: result.status === "ready" ? new Date().toISOString() : null,
                        issued_via: "manual_retry",
                    })
                    .eq("id", retryReceiptId);

                return json({
                    success: true,
                    receiptId: retryReceiptId,
                    openapiReceiptId: result.id,
                    openapiStatus: result.status,
                    retried: true,
                });
            } catch (retryApiErr: any) {
                const retryErrMsg = String(retryApiErr?.message || retryApiErr).slice(0, 500);
                retryLog.push({ at: new Date().toISOString(), error: retryErrMsg, source: "manual_retry" });
                await supabase
                    .from("fiscal_receipts")
                    .update({
                        openapi_status: "failed",
                        error_log: retryLog,
                        retry_count: (failedRow.retry_count || 0) + 1,
                    })
                    .eq("id", retryReceiptId);
                return json({ error: "Retry fallito. " + retryErrMsg, receiptId: retryReceiptId }, 502);
            }
        }

        // ----------------------------------------------------------------
        // NORMAL PATH: new receipt issuance
        // ----------------------------------------------------------------
        if (!Array.isArray(items) || items.length === 0) {
            return json({ error: "items vuoti" }, 400);
        }

        // --- Carica restaurant ---
        const { data: restaurant } = await supabase
            .from("restaurants")
            .select("id, name")
            .eq("id", restaurantId)
            .maybeSingle();

        if (!restaurant) return json({ error: "Ristorante non trovato" }, 404);

        const { data: fiscalSettings } = await supabase
            .from("restaurant_fiscal_settings")
            .select("openapi_fiscal_id, openapi_status, fiscal_receipts_enabled, fiscal_email_to_customer, default_vat_rate_code")
            .eq("restaurant_id", restaurantId)
            .maybeSingle();

        if (!fiscalSettings?.fiscal_receipts_enabled) {
            return json({
                skipped: true,
                reason: "fiscal_receipts_disabled",
                message: "Emissione scontrini disabilitata per questo ristorante.",
            }, 200);
        }
        if (fiscalSettings.openapi_status !== "active" || !fiscalSettings.openapi_fiscal_id) {
            return json({
                skipped: true,
                reason: "openapi_not_active",
                message: "Integrazione OpenAPI non attiva. Completa l'onboarding fiscale.",
            }, 200);
        }

        // --- Idempotency ---
        const cleanRequestedIdempotencyKey = typeof requestedIdempotencyKey === "string"
            ? requestedIdempotencyKey.trim().slice(0, 240)
            : "";
        const idempotencyKey = cleanRequestedIdempotencyKey || (stripeSessionId
            ? `stripe:${restaurantId}:${stripeSessionId}`
            : orderId
                ? `order:${restaurantId}:${orderId}:${issuedVia}`
                : tableSessionId
                    ? `table-session:${restaurantId}:${tableSessionId}:${issuedVia}:${Date.now()}`
                    : `manual:${restaurantId}:${crypto.randomUUID()}`);

        const { data: existingByKey } = await supabase
            .from("fiscal_receipts")
            .select("id, openapi_receipt_id, openapi_status, retry_count")
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();

        let receiptRowId: string | undefined;
        let isAutoRetry = false;

        if (existingByKey) {
            if (existingByKey.openapi_status === "failed" && isInternal && (existingByKey.retry_count || 0) < 5) {
                isAutoRetry = true;
                receiptRowId = existingByKey.id;
            } else {
                return json({
                    success: true,
                    alreadyIssued: true,
                    receiptId: existingByKey.id,
                    openapiReceiptId: existingByKey.openapi_receipt_id,
                    openapiStatus: existingByKey.openapi_status,
                });
            }
        }

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
        const cleanCustomerEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : "";
        const cleanCustomerTaxCode = customerTaxCode ? String(customerTaxCode).trim().toUpperCase() : "";
        const cleanCustomerLotteryCode = customerLotteryCode ? String(customerLotteryCode).trim().toUpperCase() : "";
        if (cleanCustomerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCustomerEmail)) {
            return json({ error: "Email cliente non valida" }, 400);
        }
        if (cleanCustomerTaxCode && !isValidTaxCodeIT(cleanCustomerTaxCode)) {
            return json({ error: "Codice fiscale cliente non valido" }, 400);
        }
        if (cleanCustomerLotteryCode && !/^[A-Z0-9]{8}$/.test(cleanCustomerLotteryCode)) {
            return json({ error: "Codice lotteria scontrini non valido" }, 400);
        }

        const defaultRate = vatRateCode(fiscalSettings.default_vat_rate_code, "10");
        const receiptItems: OpenApiReceiptItem[] = items.map(it => {
            // If the dish (or caller) supplied a vatRate, validate it strictly
            // and fall back to the restaurant default — never silent 22%.
            const rate = it.vatRate !== undefined && it.vatRate !== null && it.vatRate !== ""
                ? vatRateCode(it.vatRate, defaultRate)
                : defaultRate;
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

        const grossSum = receiptItems.reduce((s, it) => {
            const lineGross = it.unit_price * it.quantity - (it.discount || 0);
            return s + (it.complimentary ? 0 : lineGross);
        }, 0);
        const itemsTotal = Math.round(grossSum * 100) / 100;
        const paidTotal = Math.round(
            (Number(cashAmount) + Number(electronicAmount) + Number(ticketRestaurantAmount) + Number(discount)) * 100
        ) / 100;

        if (Math.abs(paidTotal - itemsTotal) > 0.05) {
            return json({
                error: `Incoerenza importi: items €${itemsTotal.toFixed(2)} ≠ pagamenti €${paidTotal.toFixed(2)}`,
            }, 400);
        }
        if (
            cleanCustomerLotteryCode &&
            (itemsTotal < 1 || Number(cashAmount) > 0 || Number(ticketRestaurantAmount) > 0 || Number(electronicAmount) + 0.01 < itemsTotal - Number(discount))
        ) {
            return json({
                error: "Il codice lotteria è ammesso solo per pagamenti interamente elettronici da almeno €1,00",
            }, 400);
        }

        // --- Insert pending row or Update for Auto-Retry ---
        if (isAutoRetry && receiptRowId) {
            const { data: currentFailed } = await supabase
                .from("fiscal_receipts")
                .select("error_log")
                .eq("id", receiptRowId)
                .single();
            const retryLog = Array.isArray(currentFailed?.error_log) ? currentFailed!.error_log : [];
            retryLog.push({ at: new Date().toISOString(), status: "auto_webhook_retry", source: "stripe_webhook" });

            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_status: "pending",
                    error_log: retryLog,
                })
                .eq("id", receiptRowId);
        } else {
            const { data: pendingRow, error: insErr } = await supabase
                .from("fiscal_receipts")
                .insert({
                    restaurant_id: restaurantId,
                    order_id: orderId || null,
                    table_session_id: tableSessionId || null,
                    stripe_session_id: stripeSessionId || null,
                    stripe_payment_intent_id: stripePaymentIntentId || null,
                    stripe_payment_trace: stripePaymentTrace || null,
                    idempotency_key: idempotencyKey,
                    openapi_status: "pending",
                    items: receiptItems,
                    cash_payment_amount: round2(cashAmount),
                    electronic_payment_amount: round2(electronicAmount),
                    ticket_restaurant_amount: round2(ticketRestaurantAmount),
                    ticket_restaurant_quantity: Number(ticketRestaurantQuantity) || 0,
                    discount_amount: round2(discount),
                    total_amount: itemsTotal,
                    customer_email: cleanCustomerEmail || null,
                    customer_tax_code: cleanCustomerTaxCode || null,
                    customer_lottery_code: cleanCustomerLotteryCode || null,
                    issued_by_user_id: !isInternal ? userId : null,
                    issued_via: issuedVia,
                })
                .select("id")
                .single();

            if (insErr || !pendingRow) {
                console.error("[openapi-issue] insert pending failed:", insErr);
                if ((insErr as any)?.code === "23505") {
                    const { data: existing } = await supabase
                        .from("fiscal_receipts")
                        .select("id, openapi_receipt_id, openapi_status")
                        .eq("idempotency_key", idempotencyKey)
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
                return json({ error: "Errore creazione record scontrino" }, 500);
            }
            receiptRowId = pendingRow.id;
        }

        // --- Chiamata OpenAPI ---
        try {
            const result = await issueReceipt({
                fiscal_id: fiscalSettings.openapi_fiscal_id,
                items: receiptItems,
                cash_payment_amount: cashAmount,
                electronic_payment_amount: electronicAmount,
                ticket_restaurant_payment_amount: ticketRestaurantAmount,
                ticket_restaurant_quantity: ticketRestaurantQuantity,
                discount,
                lottery_code: cleanCustomerLotteryCode || undefined,
                customer_tax_code: cleanCustomerTaxCode || undefined,
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

            if (result.status === "ready") {
                await sendReceiptEmailIfPossible({
                    receiptRowId,
                    openapiReceiptId: result.id,
                    customerEmail: cleanCustomerEmail,
                    restaurantName: restaurant.name || "Ristorante",
                    emailEnabled: fiscalSettings.fiscal_email_to_customer !== false,
                });
            }

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

            // CRITICAL: if OpenAPI says the fiscal_id is not registered (404 +
            // error 424), our DB drifted from OpenAPI side. Mark the
            // integration as "not_configured" so the dashboard banner forces
            // the merchant to re-enter AdE credentials and trigger a fresh
            // POST /IT-configurations.
            const isFiscalIdMissing =
                errMsg.includes('"error":424') ||
                errMsg.includes("Fiscal ID not found") ||
                errMsg.includes("not registered") ||
                errMsg.includes("404");
            if (isFiscalIdMissing) {
                // OpenAPI doesn't have the fiscal_id registered. Reset the
                // configuration timestamp so the next onboarding attempt does
                // a fresh POST /IT-configurations (instead of a doomed PATCH).
                await supabase
                    .from("restaurant_fiscal_settings")
                    .update({
                        openapi_status: "not_configured",
                        openapi_configured_at: null,
                        openapi_last_error: errMsg.slice(0, 500),
                    })
                    .eq("restaurant_id", restaurantId);
            }

            return json({
                error: isFiscalIdMissing
                    ? "Integrazione scollegata: la P.IVA non risulta registrata su OpenAPI. Vai in Impostazioni → Scontrino fiscale e ri-inserisci le credenziali AdE per ricreare la configurazione."
                    : humanizeOpenApiError(errMsg),
                detail: errMsg,
                receiptId: receiptRowId,
                requiresReactivation: isFiscalIdMissing,
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

/**
 * Translate noisy OpenAPI error strings into a hint the restaurateur can act on.
 * Original message stays available under `detail` for support.
 */
function humanizeOpenApiError(raw: string): string {
    const msg = raw.toLowerCase();
    if (msg.includes("credenziali mancanti")) {
        return "Integrazione non configurata sul server Minthi: contatta il supporto.";
    }
    if (msg.includes("login fallito")) {
        return "Login al provider scontrini fallito. Verifica le credenziali OpenAPI nei secret Supabase.";
    }
    if (msg.includes("[acube]") || msg.includes("acube")) {
        return "Provider OpenAPI ha rifiutato la richiesta — vedi dettaglio.";
    }
    if (msg.includes("\"401\"") || msg.includes(" 401 ") || msg.includes("unauthorized")) {
        return "Autorizzazione rifiutata da OpenAPI. Token Bearer non valido o scope insufficienti.";
    }
    if (msg.includes("\"403\"") || msg.includes(" 403 ") || msg.includes("forbidden")) {
        return "OpenAPI ha negato l'accesso — controlla che il token abbia gli scope IT-receipts.";
    }
    if (msg.includes("\"404\"") || msg.includes(" 404 ") || msg.includes("not found")) {
        return "Configurazione fiscale non trovata su OpenAPI per questa P.IVA. Riattiva l'integrazione dalle impostazioni.";
    }
    if (msg.includes("\"400\"") || msg.includes(" 400 ") || msg.includes("bad request")) {
        return "Dati scontrino non validi (P.IVA, IVA, importi). Vedi dettaglio.";
    }
    if (msg.includes("\"422\"") || msg.includes(" 422 ")) {
        return "Validazione lato OpenAPI fallita. Verifica i dati anagrafici del ristorante.";
    }
    if (msg.includes("\"429\"") || msg.includes(" 429 ") || msg.includes("rate limit")) {
        return "Troppe richieste a OpenAPI in questo momento. Riprova fra un minuto.";
    }
    if (msg.includes("\"50") || msg.includes(" 502 ") || msg.includes(" 503 ") || msg.includes(" 504 ") || msg.includes("internal server")) {
        return "Provider OpenAPI temporaneamente non disponibile. Riprova fra qualche minuto.";
    }
    if (msg.includes("authentication") || msg.includes("ade") || msg.includes("agenzia") || msg.includes("entrate")) {
        return "Credenziali Agenzia Entrate non accettate. Aggiornale dalle impostazioni (scadono ogni 90 giorni).";
    }
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("dns")) {
        return "Errore di rete contattando OpenAPI. Riprova fra qualche secondo.";
    }
    return "Emissione fallita — vedi dettaglio tecnico.";
}

async function sendReceiptEmailIfPossible(params: {
    receiptRowId: string;
    openapiReceiptId: string;
    customerEmail: string;
    restaurantName: string;
    emailEnabled: boolean;
}) {
    if (!params.customerEmail || !params.emailEnabled) return;

    if (!RESEND_API_KEY) {
        await supabase
            .from("fiscal_receipts")
            .update({ customer_email_error: "RESEND_API_KEY non configurato: email PDF non inviata" })
            .eq("id", params.receiptRowId);
        return;
    }

    try {
        const pdfBytes = await fetchReceiptPdf(params.openapiReceiptId);
        const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: [params.customerEmail],
                subject: `Scontrino fiscale - ${params.restaurantName}`,
                html: receiptEmailHtml(params.restaurantName),
                text: `Grazie per averci scelto. In allegato lo scontrino fiscale di ${params.restaurantName}.`,
                attachments: [{
                    filename: `scontrino-${params.openapiReceiptId}.pdf`,
                    content: base64FromBytes(pdfBytes),
                }],
            }),
        });

        if (emailRes.ok) {
            await supabase
                .from("fiscal_receipts")
                .update({ customer_email_sent_at: new Date().toISOString(), customer_email_error: null })
                .eq("id", params.receiptRowId);
            return;
        }

        const txt = await emailRes.text().catch(() => "");
        await supabase
            .from("fiscal_receipts")
            .update({ customer_email_error: `Resend ${emailRes.status}: ${txt}`.slice(0, 500) })
            .eq("id", params.receiptRowId);
    } catch (err: any) {
        console.error("[openapi-issue] email error:", err);
        await supabase
            .from("fiscal_receipts")
            .update({ customer_email_error: String(err?.message || err).slice(0, 500) })
            .eq("id", params.receiptRowId);
    }
}

function base64FromBytes(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function receiptEmailHtml(restaurantName: string): string {
    return `
<!doctype html>
<html lang="it"><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:14px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
    <h1 style="font-size:20px;color:#111;margin:0 0 16px;">Grazie per averci scelto</h1>
    <p style="color:#444;line-height:1.55;margin:0 0 16px;">
      In allegato trovi lo <strong>scontrino fiscale</strong> della tua spesa presso
      <strong>${restaurantName}</strong>.
    </p>
    <p style="color:#666;font-size:13px;line-height:1.5;margin:0;">
      Lo scontrino è stato trasmesso all'Agenzia delle Entrate. Conservalo se intendi richiedere garanzia o cambio.
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
    <p style="color:#999;font-size:12px;margin:0;">Inviato automaticamente da Minthi.</p>
  </div>
</body></html>`;
}
