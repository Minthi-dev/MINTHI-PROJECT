// Callback del provider fiscale (OpenAPI) sullo stato degli scontrini.
import { admin } from "../_shared/supabase.ts";
import { constantTimeEqual } from "../_shared/http.ts";
import { normalizeStatus } from "../_shared/openapi.ts";
import { sendReceiptEmail } from "../_shared/fiscal.ts";

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  const expected = Deno.env.get("OPENAPI_WEBHOOK_SECRET") ?? "";
  if (expected) {
    const provided = req.headers.get("x-openapi-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
    if (!constantTimeEqual(provided, expected)) return respond({ error: "Forbidden" }, 403);
  }

  let payload: Record<string, any> = {};
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return respond({ ok: true });
  }

  // formati tollerati: { event, data }, { data: { data } }, oggetto piatto
  const event = String(payload.event ?? payload.type ?? payload.data?.event ?? "");
  let data = payload.data ?? payload;
  if (data?.data && typeof data.data === "object") data = data.data;
  const providerId = String(data?.id ?? data?.receipt_id ?? "");
  if (!providerId) return respond({ ok: true });

  const db = admin();
  const { data: row } = await db.from("fiscal_receipts").select("id, status").eq("provider_receipt_id", providerId).maybeSingle();
  if (!row) return respond({ ok: true });

  const status = event === "receipt-error" ? "failed" : normalizeStatus(data?.status ?? (event === "receipt" ? "ready" : ""));
  if (row.status === "voided" || (row.status === "ready" && status !== "voided")) return respond({ ok: true });

  await db.from("fiscal_receipts").update({
    status,
    document_number: data?.document_number ?? undefined,
    provider_response: payload,
    error: status === "failed" ? String(data?.error_message ?? data?.message ?? "Errore dal provider").slice(0, 1000) : null,
  }).eq("id", row.id);

  if (status === "ready") await sendReceiptEmail(row.id).catch((e) => console.error("[fiscal-webhook] email", e));
  return respond({ ok: true, status });
});
