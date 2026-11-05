// Motore fiscale: costruisce lo scontrino (snapshot) e lo mette in coda.
// Il provider effettivo è scelto da fiscal_settings.provider ("openapi"; in futuro "rt_epson").
import { admin } from "./supabase.ts";
import { money } from "./http.ts";
import { fetchReceiptPdf, isOpenApiConfigured, openApiEnv } from "./openapi.ts";

export interface ReceiptDraft {
  restaurantId: string;
  sessionId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number; vatRateCode: string }>;
  cash: number;
  electronic: number;
  voucher: number;
  total: number;
  customerEmail?: string | null;
  customerTaxCode?: string | null;
  customerLotteryCode?: string | null;
  issuedVia: "manual" | "auto_stripe" | "auto_takeaway";
  issuedBy?: string | null;
  dedupeKey: string;
}

export async function fiscalSettings(restaurantId: string) {
  const { data } = await admin().from("fiscal_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  return data;
}

function splitPayments(payments: Array<{ method: string; amount: number; refunded_amount: number }>) {
  let cash = 0, electronic = 0, voucher = 0;
  for (const p of payments) {
    const net = money(Number(p.amount) - Number(p.refunded_amount ?? 0));
    if (p.method === "cash") cash += net;
    else if (p.method === "voucher") voucher += net;
    else electronic += net;
  }
  return { cash: money(cash), electronic: money(electronic), voucher: money(voucher) };
}

/** Scontrino finale del tavolo: tutte le voci a pagamento, ripartizione per metodo. */
export async function buildSessionDraft(sessionId: string, issuedVia: ReceiptDraft["issuedVia"], issuedBy?: string | null): Promise<ReceiptDraft | { error: string }> {
  const db = admin();
  const { data: s } = await db.from("table_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s) return { error: "Tavolo non trovato." };
  const fs = await fiscalSettings(s.restaurant_id);
  const defaultVat = fs?.default_vat_rate_code ?? "10";

  const { data: items } = await db.from("order_items")
    .select("dish_name, unit_price, vat_rate_code, quantity")
    .eq("session_id", sessionId).neq("status", "cancelled");

  const lines: ReceiptDraft["items"] = [];
  for (const it of items ?? []) {
    if (Number(it.unit_price) <= 0) continue;
    lines.push({ description: it.dish_name, quantity: it.quantity, unitPrice: money(it.unit_price), vatRateCode: it.vat_rate_code ?? defaultVat });
  }
  if (Number(s.cover_price) > 0) lines.push({ description: "Coperto", quantity: s.guests, unitPrice: money(s.cover_price), vatRateCode: defaultVat });
  if (s.ayce && Number(s.ayce_price) > 0) lines.push({ description: "Menu All You Can Eat", quantity: s.guests, unitPrice: money(s.ayce_price), vatRateCode: defaultVat });

  const total = money(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
  const { data: payments } = await db.from("payments").select("method, amount, refunded_amount")
    .eq("session_id", sessionId).in("status", ["succeeded", "refunded"]);
  const split = splitPayments(payments ?? []);
  const paid = money(split.cash + split.electronic + split.voucher);

  if (total <= 0) return { error: "Il conto è vuoto." };
  if (paid + 0.01 < total) return { error: `Il conto non è saldato (pagati ${paid} € su ${total} €).` };

  return {
    restaurantId: s.restaurant_id, sessionId, items: lines, total, ...normalizeSplit(split, total),
    customerEmail: s.customer_email, customerTaxCode: s.customer_tax_code, customerLotteryCode: s.customer_lottery_code,
    issuedVia, issuedBy, dedupeKey: `session:${sessionId}`,
  };
}

/** Scontrino ordine asporto. */
export async function buildOrderDraft(orderId: string, issuedVia: ReceiptDraft["issuedVia"], issuedBy?: string | null): Promise<ReceiptDraft | { error: string }> {
  const db = admin();
  const { data: o } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) return { error: "Ordine non trovato." };
  const fs = await fiscalSettings(o.restaurant_id);
  const { data: items } = await db.from("order_items").select("dish_name, unit_price, vat_rate_code, quantity")
    .eq("order_id", orderId).neq("status", "cancelled");
  const lines = (items ?? []).filter((i) => Number(i.unit_price) > 0).map((i) => ({
    description: i.dish_name, quantity: i.quantity, unitPrice: money(i.unit_price), vatRateCode: i.vat_rate_code ?? fs?.default_vat_rate_code ?? "10",
  }));
  const total = money(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
  const { data: payments } = await db.from("payments").select("method, amount, refunded_amount")
    .eq("order_id", orderId).in("status", ["succeeded", "refunded"]);
  const split = splitPayments(payments ?? []);
  if (total <= 0) return { error: "Ordine vuoto." };
  if (split.cash + split.electronic + split.voucher + 0.01 < total) return { error: "Ordine non pagato." };
  return {
    restaurantId: o.restaurant_id, orderId, items: lines, total, ...normalizeSplit(split, total),
    customerEmail: o.customer_email, customerTaxCode: o.customer_tax_code, customerLotteryCode: o.customer_lottery_code,
    issuedVia, issuedBy, dedupeKey: `order:${orderId}`,
  };
}

// Se si è incassato più del totale (resto non registrato), il contante si riduce di conseguenza.
function normalizeSplit(split: { cash: number; electronic: number; voucher: number }, total: number) {
  const excess = money(split.cash + split.electronic + split.voucher - total);
  if (excess <= 0) return split;
  return { ...split, cash: money(Math.max(0, split.cash - excess)) };
}

/** Crea lo scontrino "pending" e il job in coda. Idempotente sulla dedupeKey. */
export async function enqueueReceipt(draft: ReceiptDraft): Promise<{ receiptId: string; alreadyQueued: boolean }> {
  const db = admin();
  const { data: existing } = await db.from("fiscal_receipts").select("id, status").eq("idempotency_key", draft.dedupeKey).maybeSingle();
  if (existing && existing.status !== "failed" && existing.status !== "voided") {
    return { receiptId: existing.id, alreadyQueued: true };
  }
  const key = existing ? `${draft.dedupeKey}:retry:${Date.now()}` : draft.dedupeKey;

  const { data: receipt, error } = await db.from("fiscal_receipts").insert({
    restaurant_id: draft.restaurantId,
    session_id: draft.sessionId ?? null,
    order_id: draft.orderId ?? null,
    payment_id: draft.paymentId ?? null,
    provider: "openapi",
    provider_env: openApiEnv(),
    status: "pending",
    items: draft.items,
    cash_amount: draft.cash,
    electronic_amount: draft.electronic,
    voucher_amount: draft.voucher,
    total: draft.total,
    customer_email: draft.customerEmail ?? null,
    customer_tax_code: draft.customerTaxCode ?? null,
    customer_lottery_code: draft.customerLotteryCode ?? null,
    issued_via: draft.issuedVia,
    issued_by: draft.issuedBy ?? null,
    idempotency_key: key,
  }).select("id").single();
  if (error) throw error;

  const { error: jobError } = await db.from("fiscal_jobs").insert({
    restaurant_id: draft.restaurantId, dedupe_key: key, payload: { receiptId: receipt.id },
  });
  if (jobError) throw jobError;
  return { receiptId: receipt.id, alreadyQueued: false };
}

/** Emissione automatica dopo un pagamento online, se il ristorante l'ha attivata. */
export async function maybeAutoIssue(kind: "session" | "order", id: string, restaurantId: string): Promise<void> {
  const fs = await fiscalSettings(restaurantId);
  if (!fs?.enabled || !fs.auto_issue_online_payments || fs.status !== "active" || !isOpenApiConfigured()) return;
  const draft = kind === "session" ? await buildSessionDraft(id, "auto_stripe") : await buildOrderDraft(id, "auto_takeaway");
  if ("error" in draft) return; // es. tavolo non ancora saldato del tutto
  await enqueueReceipt(draft);
}

/** Invia lo scontrino al cliente (Resend), se configurato. */
export async function sendReceiptEmail(receiptId: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const db = admin();
  const { data: r } = await db.from("fiscal_receipts").select("*, restaurants(name)").eq("id", receiptId).maybeSingle();
  if (!r?.customer_email || r.email_sent_at || !r.provider_receipt_id) return;
  const fs = await fiscalSettings(r.restaurant_id);
  if (!fs?.email_to_customer) return;

  const pdf = await fetchReceiptPdf(r.provider_receipt_id);
  let binary = "";
  for (let i = 0; i < pdf.length; i += 0x8000) binary += String.fromCharCode(...pdf.subarray(i, i + 0x8000));
  const name = (r as { restaurants?: { name?: string } }).restaurants?.name ?? "MINTHI";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("MINTHI_EMAIL_FROM") ?? "MINTHI <scontrini@minthi.it>",
      to: [r.customer_email],
      subject: `Il tuo scontrino – ${name}`,
      html: `<p>Grazie per essere stato da <strong>${name}</strong>!</p><p>In allegato trovi il documento commerciale di ${Number(r.total).toFixed(2)} €.</p>`,
      attachments: [{ filename: `scontrino-${r.document_number ?? r.id}.pdf`, content: btoa(binary) }],
    }),
  });
  if (res.ok) await db.from("fiscal_receipts").update({ email_sent_at: new Date().toISOString() }).eq("id", receiptId);
  else console.error("[fiscal] email fallita", res.status, await res.text());
}
