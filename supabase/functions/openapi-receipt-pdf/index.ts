// =====================================================================
// openapi-receipt-pdf
//
// Restituisce il PDF binario di uno scontrino fiscale.
//
// Due modalità:
//
//   1. CLIENTE (asporto / dine-in dopo pagamento Stripe):
//      Il cliente arriva con `pickupCode` (asporto) o `tableSessionId`
//      (dine-in) — sono identificatori già contenuti nell'URL del
//      proprio ordine, quindi un'autorizzazione equivalente alla
//      conoscenza dell'URL è accettabile (lo scontrino è solo una
//      ricevuta del proprio acquisto).
//
//   2. CASSIERE/AMMINISTRATORE (dashboard):
//      Passa userId + sessionToken + receiptId. Verifichiamo accesso
//      al ristorante via verifyAccess.
//
// Policy: restituiamo il PDF SOLO se openapi_status='ready'. Altrimenti
// 404 (lo scontrino non è ancora pronto).
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";
import { fetchReceiptPdf } from "../_shared/openapi.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), {
            status: s,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    try {
        const body = req.method === "GET"
            ? Object.fromEntries(new URL(req.url).searchParams.entries())
            : await req.json().catch(() => ({}));

        const restaurantId = String(body.restaurantId || "").trim();
        const pickupCode = String(body.pickupCode || "").trim().toUpperCase();
        const tableSessionId = String(body.tableSessionId || "").trim();
        const receiptId = String(body.receiptId || "").trim();
        const userId = body.userId ? String(body.userId) : "";
        const sessionToken = body.sessionToken ? String(body.sessionToken) : "";
        const stripeSessionId = String(body.stripeSessionId || "").trim();
        // Probe-only mode: returns the receipt status as JSON without downloading
        // the PDF. Used by the customer status page to poll readiness.
        const probeOnly = body.probeOnly === true || body.probeOnly === "true";

        if (!restaurantId || !UUID_RE.test(restaurantId)) {
            return json({ error: "restaurantId mancante o non valido" }, 400);
        }

        // ----------------------------------------------------------------
        // Resolve the fiscal_receipts row
        // ----------------------------------------------------------------
        let row: any = null;

        if (receiptId) {
            // Path 2: authed dashboard download (must verify access).
            if (!userId || !sessionToken) return json({ error: "Auth richiesta" }, 401);
            const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
            if (!access.valid || (!access.isOwner && !access.isAdmin && !access.isStaff)) {
                return json({ error: "Non autorizzato" }, 403);
            }
            const { data } = await supabase
                .from("fiscal_receipts")
                .select("id, openapi_receipt_id, openapi_status, restaurant_id")
                .eq("id", receiptId)
                .eq("restaurant_id", restaurantId)
                .maybeSingle();
            row = data;
        } else if (pickupCode && /^[A-Z0-9]{4,8}$/.test(pickupCode)) {
            // Path 1a: takeaway customer with pickup code in URL
            const { data: order } = await supabase
                .from("orders")
                .select("id")
                .eq("restaurant_id", restaurantId)
                .eq("pickup_code", pickupCode)
                .eq("order_type", "takeaway")
                .maybeSingle();
            if (!order) return json({ error: "Ordine non trovato" }, 404);

            const { data: receiptByStripe } = stripeSessionId
                ? await supabase
                    .from("fiscal_receipts")
                    .select("id, openapi_receipt_id, openapi_status")
                    .eq("restaurant_id", restaurantId)
                    .eq("stripe_session_id", stripeSessionId)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle()
                : { data: null };
            if (receiptByStripe) {
                row = receiptByStripe;
            } else {
                const { data } = await supabase
                    .from("fiscal_receipts")
                    .select("id, openapi_receipt_id, openapi_status")
                    .eq("restaurant_id", restaurantId)
                    .eq("order_id", order.id)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                row = data;
            }
        } else if (tableSessionId && UUID_RE.test(tableSessionId)) {
            // Path 1b: dine-in customer with table session id in URL.
            // For dine-in split payments, the table session alone is not
            // enough: it could expose the latest receipt from another payer at
            // the same table. Bind the download to the Stripe session that was
            // just verified by the success page.
            if (!stripeSessionId) {
                if (probeOnly) {
                    return json({
                        ready: false,
                        unavailable: true,
                        openapiStatus: "missing_stripe_session",
                    });
                }
                return json({ error: "stripeSessionId obbligatorio per lo scontrino tavolo" }, 400);
            }
            const { data } = await supabase
                .from("fiscal_receipts")
                .select("id, openapi_receipt_id, openapi_status")
                .eq("restaurant_id", restaurantId)
                .eq("table_session_id", tableSessionId)
                .eq("stripe_session_id", stripeSessionId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            row = data;
        } else if (stripeSessionId) {
            // Path 1c: any authenticated payer who only has the stripe session id
            const { data } = await supabase
                .from("fiscal_receipts")
                .select("id, openapi_receipt_id, openapi_status")
                .eq("restaurant_id", restaurantId)
                .eq("stripe_session_id", stripeSessionId)
                .maybeSingle();
            row = data;
        } else {
            return json({ error: "Identificatore scontrino mancante" }, 400);
        }

        if (!row) {
            if (probeOnly) {
                return json({
                    ready: false,
                    unavailable: true,
                    openapiStatus: "not_found",
                });
            }
            return json({ error: "Scontrino non trovato per questo ordine" }, 404);
        }
        if (!row.openapi_receipt_id || row.openapi_status !== "ready") {
            if (probeOnly) {
                return json({
                    ready: false,
                    pending: true,
                    openapiStatus: row.openapi_status,
                    message: "Lo scontrino non è ancora stato confermato dall'Agenzia delle Entrate.",
                });
            }
            return json({
                pending: true,
                openapiStatus: row.openapi_status,
                message: "Lo scontrino non è ancora stato confermato dall'Agenzia delle Entrate. Riprova fra qualche istante.",
            }, 202);
        }

        if (probeOnly) {
            return json({
                ready: true,
                openapiStatus: row.openapi_status,
                openapiReceiptId: row.openapi_receipt_id,
            });
        }

        // ----------------------------------------------------------------
        // Fetch PDF from OpenAPI and stream back to caller
        // ----------------------------------------------------------------
        const pdfBytes = await fetchReceiptPdf(row.openapi_receipt_id);

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                ...cors,
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="scontrino-${row.openapi_receipt_id}.pdf"`,
                "Cache-Control": "private, max-age=300",
            },
        });
    } catch (err: any) {
        console.error("[openapi-receipt-pdf] error:", err);
        return new Response(JSON.stringify({ error: err?.message || "Errore interno" }), {
            status: 500,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
