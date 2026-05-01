// =====================================================================
// openapi-receipt-webhook
//
// Riceve callback da OpenAPI quando uno scontrino cambia stato:
//   - event: "receipt"        → emissione confermata (status = ready)
//   - event: "receipt-error"  → errore emissione (status = failed)
//
// Sicurezza:
//   - Verifichiamo un secret condiviso passato come query param
//     (?secret=...) o come header X-Openapi-Secret. OpenAPI non firma
//     i callback come Stripe, quindi questo secret è la nostra unica
//     barriera. È un valore casuale lungo, configurato come secret
//     Supabase + comunicato a OpenAPI nei callback URL al momento
//     della IT-configuration.
//
// Idempotenza:
//   - L'evento può arrivare più volte. Aggiorniamo solo se lo stato
//     non è già 'ready'.
//
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { generateFiscalReceiptPdf } from "../_shared/fiscal-receipt-pdf.ts";
import { getOpenApiEnv, getOpenApiWebhookSecret } from "../_shared/openapi.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Minthi <onboarding@resend.dev>";

// Webhook is server-to-server, browser CORS not needed.
const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-openapi-secret",
};

function constantTimeEqual(a: string, b: string): boolean {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), {
            status: s,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    // --- Auth shared-secret (timing-safe) ---
    const expected = getOpenApiWebhookSecret();
    if (expected) {
        const url = new URL(req.url);
        const provided =
            req.headers.get("x-openapi-secret") ||
            url.searchParams.get("secret") ||
            "";
        if (!constantTimeEqual(provided, expected)) {
            console.warn("[openapi-webhook] secret mismatch");
            return json({ error: "Forbidden" }, 403);
        }
    }

    try {
        const payload = await parseWebhookPayload(req);
        // OpenAPI callbacks can be { event, data }, { data: { data: ... } },
        // or form-encoded when a callback is misconfigured. Be deliberately
        // tolerant so production callbacks do not get lost.
        const event = String(payload?.event || payload?.type || payload?.data?.event || payload?.data?.type || "");
        const data = unwrapReceiptData(payload);
        const openapiReceiptId = String(data?.id || data?.receipt_id || data?.receiptId || "");
        const incomingStatus = normalizeOpenApiStatus(data?.status);

        if (!openapiReceiptId) {
            console.warn("[openapi-webhook] payload senza id:", JSON.stringify(payload).slice(0, 500));
            return json({ ok: true });
        }

        const { data: row } = await supabase
            .from("fiscal_receipts")
            .select("id, restaurant_id, customer_email, openapi_status, customer_email_sent_at")
            .eq("openapi_receipt_id", openapiReceiptId)
            .maybeSingle();

        if (!row) {
            console.warn(`[openapi-webhook] receipt ${openapiReceiptId} non trovato in DB`);
            return json({ ok: true });
        }

        if (event === "receipt-retry" || incomingStatus === "retry") {
            const { data: current } = await supabase
                .from("fiscal_receipts")
                .select("error_log, retry_count")
                .eq("id", row.id)
                .single();
            const log = Array.isArray(current?.error_log) ? current!.error_log : [];
            log.push({ at: new Date().toISOString(), status: "retry", source: "webhook", payload: data });
            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_status: "retry",
                    error_log: log,
                    retry_count: (current?.retry_count || 0) + 1,
                    openapi_response: data,
                })
                .eq("id", row.id);
            return json({ ok: true, status: "retry" });
        }

        if (event === "receipt-error" || incomingStatus === "failed") {
            const errMsg = String(data?.error_message || data?.message || "Errore AdE").slice(0, 500);
            const { data: current } = await supabase
                .from("fiscal_receipts")
                .select("error_log, retry_count")
                .eq("id", row.id)
                .single();
            const log = Array.isArray(current?.error_log) ? current!.error_log : [];
            log.push({ at: new Date().toISOString(), error: errMsg, source: "webhook" });
            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_status: "failed",
                    error_log: log,
                    retry_count: (current?.retry_count || 0) + 1,
                    openapi_response: data,
                })
                .eq("id", row.id);
            return json({ ok: true, status: "failed" });
        }

        if (incomingStatus === "voided") {
            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_status: "voided",
                    openapi_response: data,
                    voided_at: new Date().toISOString(),
                })
                .eq("id", row.id);
            return json({ ok: true, status: "voided" });
        }

        if (incomingStatus === "submitted") {
            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_status: "submitted",
                    openapi_response: data,
                })
                .eq("id", row.id);
            return json({ ok: true, status: "submitted" });
        }

        if (event && event !== "receipt" && incomingStatus !== "ready") {
            await supabase
                .from("fiscal_receipts")
                .update({ openapi_response: data })
                .eq("id", row.id);
            return json({ ok: true, ignoredEvent: event });
        }

        // Event: receipt or status ready → success
        if (row.openapi_status !== "ready") {
            await supabase
                .from("fiscal_receipts")
                .update({
                    openapi_status: "ready",
                    openapi_response: data,
                    ready_at: new Date().toISOString(),
                })
                .eq("id", row.id);
        }

        return json({ ok: true, status: "ready" });
    } catch (err: any) {
        console.error("[openapi-webhook] generic error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});

async function parseWebhookPayload(req: Request): Promise<any> {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/x-www-form-urlencoded")) {
        const form = await req.formData();
        const raw = form.get("data") || form.get("payload") || "";
        if (typeof raw === "string" && raw.trim().startsWith("{")) return JSON.parse(raw);
        return Object.fromEntries(form.entries());
    }
    return await req.json();
}

function unwrapReceiptData(payload: any): any {
    const first = payload?.data ?? payload;
    if (first?.data && typeof first.data === "object") return first.data;
    return first;
}

function normalizeOpenApiStatus(status: unknown): string {
    const value = String(status || "").toLowerCase();
    if (value === "new") return "submitted";
    if (["submitted", "ready", "failed", "voided", "retry"].includes(value)) return value;
    return "";
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
      Lo scontrino è stato trasmesso all'Agenzia delle Entrate ed è valido a tutti gli
      effetti come documento fiscale. Conservalo se intendi richiedere garanzia o cambio.
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
    <p style="color:#999;font-size:12px;margin:0;">Inviato automaticamente da Minthi.</p>
  </div>
</body></html>`;
}
