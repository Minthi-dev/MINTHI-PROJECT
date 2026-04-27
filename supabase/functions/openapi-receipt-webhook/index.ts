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
// Side-effect:
//   - Quando lo scontrino è "ready", se il customer_email è presente,
//     scarichiamo il PDF da OpenAPI e lo inviamo via Resend.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchReceiptPdf, getOpenApiWebhookSecret } from "../_shared/openapi.ts";

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

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), {
            status: s,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    // --- Auth shared-secret ---
    const expected = getOpenApiWebhookSecret();
    if (expected) {
        const url = new URL(req.url);
        const provided =
            req.headers.get("x-openapi-secret") ||
            url.searchParams.get("secret") ||
            "";
        if (provided !== expected) {
            console.warn("[openapi-webhook] secret mismatch");
            return json({ error: "Forbidden" }, 403);
        }
    }

    try {
        const payload = await req.json();
        // OpenAPI tipicamente invia: { event: "receipt" | "receipt-error", data: {...} }
        const event = payload?.event || payload?.type || "";
        const data = payload?.data || payload;
        const openapiReceiptId = String(data?.id || data?.receipt_id || "");

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

        if (event === "receipt-error" || data?.status === "failed") {
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

        // Event: receipt → success
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

        // Email PDF al cliente (best-effort, non blocca il webhook)
        if (row.customer_email && !row.customer_email_sent_at && RESEND_API_KEY) {
            try {
                const { data: rest } = await supabase
                    .from("restaurants")
                    .select("name, fiscal_email_to_customer")
                    .eq("id", row.restaurant_id)
                    .maybeSingle();
                if (rest?.fiscal_email_to_customer !== false) {
                    const pdfBytes = await fetchReceiptPdf(openapiReceiptId);
                    const base64 = base64FromBytes(pdfBytes);
                    const restaurantName = rest?.name || "Ristorante";

                    const emailRes = await fetch("https://api.resend.com/emails", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${RESEND_API_KEY}`,
                        },
                        body: JSON.stringify({
                            from: FROM_EMAIL,
                            to: [row.customer_email],
                            subject: `Scontrino fiscale — ${restaurantName}`,
                            html: receiptEmailHtml(restaurantName),
                            text: `Grazie per averci scelto. In allegato lo scontrino fiscale di ${restaurantName}.`,
                            attachments: [{
                                filename: `scontrino-${openapiReceiptId}.pdf`,
                                content: base64,
                            }],
                        }),
                    });

                    if (emailRes.ok) {
                        await supabase
                            .from("fiscal_receipts")
                            .update({ customer_email_sent_at: new Date().toISOString() })
                            .eq("id", row.id);
                    } else {
                        const txt = await emailRes.text().catch(() => "");
                        await supabase
                            .from("fiscal_receipts")
                            .update({ customer_email_error: `Resend ${emailRes.status}: ${txt}`.slice(0, 500) })
                            .eq("id", row.id);
                    }
                }
            } catch (mailErr: any) {
                console.error("[openapi-webhook] email error:", mailErr);
                await supabase
                    .from("fiscal_receipts")
                    .update({ customer_email_error: String(mailErr?.message || mailErr).slice(0, 500) })
                    .eq("id", row.id);
            }
        }

        return json({ ok: true, status: "ready" });
    } catch (err: any) {
        console.error("[openapi-webhook] generic error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});

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
