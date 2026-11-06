// Provider fiscale OpenAPI.it (scontrini elettronici / documento commerciale online).
// Un unico account MINTHI; ogni ristorante è una IT-configuration identificata dal fiscal_id.
// Ambiente: OPENAPI_ENV = "test" (sandbox, default sicuro) | "production".

export type OpenApiEnv = "production" | "test";

export function openApiEnv(): OpenApiEnv {
  return (Deno.env.get("OPENAPI_ENV") ?? "test").trim().toLowerCase() === "production" ? "production" : "test";
}

function hosts() {
  const prod = openApiEnv() === "production";
  return {
    api: prod ? "invoice.openapi.com" : "test.invoice.openapi.com",
    oauth: prod ? "https://oauth.openapi.it" : "https://test.oauth.openapi.it",
  };
}

export function isOpenApiConfigured(): boolean {
  return Boolean(Deno.env.get("OPENAPI_EMAIL") && Deno.env.get("OPENAPI_API_KEY"));
}

let tokenCache: { token: string; env: OpenApiEnv; expiresAt: number } | null = null;
const TOKEN_TTL_SECONDS = 30 * 24 * 3600;

async function token(): Promise<string> {
  if (!isOpenApiConfigured()) throw new Error("Credenziali OpenAPI non configurate.");
  const env = openApiEnv();
  if (tokenCache && tokenCache.env === env && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const { api, oauth } = hosts();
  const scopes = [
    `POST:${api}/IT-configurations`, `PATCH:${api}/IT-configurations/{fiscal_id}`,
    `GET:${api}/IT-configurations`, `GET:${api}/IT-configurations/{fiscal_id}`,
    `DELETE:${api}/IT-configurations/{fiscal_id}`,
    `POST:${api}/IT-receipts`, `GET:${api}/IT-receipts`, `GET:${api}/IT-receipts/{id}`,
    `PATCH:${api}/IT-receipts/{id}`, `DELETE:${api}/IT-receipts/{id}`,
  ];
  const basic = btoa(`${Deno.env.get("OPENAPI_EMAIL")}:${Deno.env.get("OPENAPI_API_KEY")}`);
  const res = await fetch(`${oauth}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scopes, ttl: TOKEN_TTL_SECONDS }),
  });
  if (!res.ok) throw new Error(`OpenAPI login fallito (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const raw = data?.token ?? data?.access_token ?? data?.data?.token;
  if (!raw) throw new Error("OpenAPI: token assente nella risposta.");
  tokenCache = { token: String(raw).replace(/^Bearer\s+/i, ""), env, expiresAt: Date.now() + (TOKEN_TTL_SECONDS - 3600) * 1000 };
  return tokenCache.token;
}

async function request(path: string, init: RequestInit & { pdf?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await token()}`, ...(init.headers as Record<string, string> ?? {}) };
  const method = (init.method ?? "GET").toUpperCase();
  if (init.pdf) {
    // OpenAPI negozia il PDF con Content-Type anche sulla GET (contratto documentato)
    headers["Content-Type"] = "application/pdf";
    headers["Accept"] = "application/pdf";
  } else if (["POST", "PATCH", "PUT"].includes(method)) {
    headers["Content-Type"] ??= "application/json";
  } else {
    headers["Accept"] ??= "application/json";
  }
  return await fetch(`https://${hosts().api}${path}`, { ...init, headers });
}

async function jsonOrThrow(res: Response, what: string) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAPI ${what} fallito (${res.status}): ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

// ---------------------------------------------------------------- configurazioni

export interface MerchantConfigInput {
  fiscalId: string;
  name: string;
  email: string;
  adeTaxCode: string;
  adePassword: string;
  adePin: string;
  webhookUrl?: string;
}

function callbacks(url?: string) {
  if (!url) return undefined;
  const secret = Deno.env.get("OPENAPI_WEBHOOK_SECRET");
  const cb = { url, method: "JSON", ...(secret ? { headers: { "x-openapi-secret": secret } } : {}) };
  return ["receipt", "receipt-retry", "receipt-credentials", "appointee", "receipt-error"].map((event) => ({ event, callback: cb }));
}

export async function getConfiguration(fiscalId: string): Promise<Record<string, unknown> | null> {
  const res = await request(`/IT-configurations/${encodeURIComponent(fiscalId)}`);
  if (res.status === 404) return null;
  const body = await jsonOrThrow(res, "lettura configurazione");
  return body?.data ?? body;
}

export async function upsertConfiguration(input: MerchantConfigInput): Promise<{ created: boolean }> {
  const auth = { taxCode: input.adeTaxCode, password: input.adePassword, pin: input.adePin };
  const existing = await getConfiguration(input.fiscalId);
  if (existing) {
    await jsonOrThrow(await request(`/IT-configurations/${encodeURIComponent(input.fiscalId)}`, {
      method: "PATCH",
      body: JSON.stringify({ receipts: true, receipts_authentication: auth, api_configurations: callbacks(input.webhookUrl) }),
    }), "aggiornamento configurazione");
    return { created: false };
  }
  await jsonOrThrow(await request("/IT-configurations", {
    method: "POST",
    body: JSON.stringify({
      fiscal_id: input.fiscalId, name: input.name, email: input.email,
      receipts: true, supplier_invoice: false, legal_storage: false, signature: false,
      receipts_authentication: auth, api_configurations: callbacks(input.webhookUrl),
    }),
  }), "creazione configurazione");
  return { created: true };
}

// ---------------------------------------------------------------- scontrini

export interface ReceiptItem {
  description: string;
  quantity: number;
  unitPrice: number;   // IVA inclusa
  vatRateCode: string;
}

export interface IssueReceiptInput {
  fiscalId: string;
  items: ReceiptItem[];
  cash: number;
  electronic: number;
  voucher: number;
  voucherQuantity: number;
  discount: number;
  lotteryCode?: string | null;
  customerTaxCode?: string | null;
  linkedReceipt?: string | null;
  idempotencyKey: string;
}

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export async function issueReceipt(input: IssueReceiptInput) {
  const body: Record<string, unknown> = {
    fiscal_id: input.fiscalId,
    items: input.items.map((it) => ({
      quantity: it.quantity,
      description: it.description.slice(0, 1000),
      unit_price: r2(it.unitPrice),
      vat_rate_code: it.vatRateCode,
    })),
    cash_payment_amount: r2(input.cash),
    electronic_payment_amount: r2(input.electronic),
    ticket_restaurant_payment_amount: r2(input.voucher),
    ticket_restaurant_quantity: input.voucherQuantity,
    discount: r2(input.discount),
    invoice_issuing: false,
    services_uncollected_amount: 0,
    goods_uncollected_amount: 0,
  };
  if (input.lotteryCode) body.lottery_code = input.lotteryCode;
  if (input.customerTaxCode) body.customer_tax_code = input.customerTaxCode;
  if (input.linkedReceipt) body.linked_receipt = input.linkedReceipt;

  const res = await request("/IT-receipts", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify(body),
  });
  const json = await jsonOrThrow(res, "emissione scontrino");
  const data = json?.data ?? json;
  if (!data?.id) throw new Error("OpenAPI: scontrino senza id nella risposta.");
  return { id: String(data.id), status: normalizeStatus(data.status), documentNumber: data.document_number ?? null, raw: json };
}

export async function voidReceipt(receiptId: string): Promise<void> {
  const res = await request(`/IT-receipts/${encodeURIComponent(receiptId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`OpenAPI annullamento fallito (${res.status}): ${(await res.text()).slice(0, 300)}`);
}

export async function fetchReceiptPdf(receiptId: string): Promise<Uint8Array> {
  const res = await request(`/IT-receipts/${encodeURIComponent(receiptId)}`, { pdf: true });
  if (!res.ok) throw new Error(`OpenAPI PDF fallito (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 4 || String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF") {
    throw new Error("Il PDF dello scontrino non è ancora disponibile.");
  }
  return bytes;
}

export function normalizeStatus(s: unknown): "submitted" | "ready" | "failed" | "voided" {
  const v = String(s ?? "").toLowerCase();
  if (v === "ready") return "ready";
  if (v === "failed" || v === "error") return "failed";
  if (v === "voided") return "voided";
  return "submitted";
}

// ---------------------------------------------------------------- validazioni

export function isValidVatIT(vat: string): boolean {
  if (!/^\d{11}$/.test(vat)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(vat[i]);
    sum += i % 2 === 0 ? d : (d * 2 > 9 ? d * 2 - 9 : d * 2);
  }
  return (10 - (sum % 10)) % 10 === Number(vat[10]);
}

export function isValidTaxCodeIT(cf: string): boolean {
  const v = cf.toUpperCase();
  if (/^\d{11}$/.test(v)) return isValidVatIT(v);
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(v)) return false;
  const odd: Record<string, number> = {
    0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15,
    H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
  };
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = v[i];
    sum += i % 2 === 0 ? odd[c] : (/\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65);
  }
  return v[15] === String.fromCharCode(65 + (sum % 26));
}
