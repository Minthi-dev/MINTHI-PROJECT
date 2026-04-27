/**
 * OpenAPI.it — Scontrini Elettronici (Italian electronic receipts).
 *
 * One Minthi-wide OAuth Bearer token, generated on demand from
 * OPENAPI_EMAIL + OPENAPI_API_KEY. Per-restaurant routing happens via
 * the `fiscal_id` field on each call (each restaurant is a separate
 * IT-configuration on OpenAPI's side).
 *
 * Docs (live): https://console.openapi.com/apis/invoice/documentation
 *
 * Endpoints used here:
 *   - POST   /IT-configurations           — create per-restaurant config
 *   - PATCH  /IT-configurations/{fiscal_id} — update (e.g. rotate AdE creds)
 *   - GET    /IT-configurations/{fiscal_id} — read current config
 *   - DELETE /IT-configurations/{fiscal_id} — disable a restaurant
 *   - POST   /IT-receipts                 — emit a receipt (€0.019/op)
 *   - GET    /IT-receipts/{id}            — fetch JSON
 *   - GET    /IT-receipts/{id} (Accept: application/pdf) — fetch PDF
 *   - DELETE /IT-receipts/{id}            — void a receipt
 *
 * Authentication:
 *   Token endpoint:
 *     production: POST https://oauth.openapi.it/token
 *     sandbox:    POST https://test.oauth.openapi.it/token
 *     Body: { scopes: [...], ttl: <seconds> }
 *     Auth header: Basic base64(EMAIL:APIKEY)
 *   Returned: { token: "Bearer...", expires_at, ... }
 *
 *   Then use Authorization: Bearer <token> on every API call.
 */

const ENV = (Deno.env.get("OPENAPI_ENV") || "test").toLowerCase();

export function getOpenApiEnv(): string {
    return ENV;
}

export const OPENAPI_BASE_URL = ENV === "production"
    ? "https://invoice.openapi.com"
    : "https://test.invoice.openapi.com";

const OPENAPI_API_DOMAIN = ENV === "production"
    ? "invoice.openapi.com"
    : "test.invoice.openapi.com";

const OAUTH_BASE_URL = ENV === "production"
    ? "https://oauth.openapi.it"
    : "https://test.oauth.openapi.it";

const OPENAPI_EMAIL = Deno.env.get("OPENAPI_EMAIL") || "";
const OPENAPI_API_KEY = Deno.env.get("OPENAPI_API_KEY") || "";
const OPENAPI_WEBHOOK_SECRET = Deno.env.get("OPENAPI_WEBHOOK_SECRET") || "";

// Token cache (per worker instance). Token TTL is configurable up to 12mo;
// we mint for ~30 days and refresh as needed. Each cold-started worker will
// re-mint, which is fine — minting costs nothing and is fast.
interface TokenCache {
    token: string;
    expiresAt: number;
}
let tokenCache: TokenCache | null = null;
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const REQUIRED_SCOPES = [
    // IT-configurations
    `POST:${OPENAPI_API_DOMAIN}/IT-configurations`,
    `PATCH:${OPENAPI_API_DOMAIN}/IT-configurations/{fiscal_id}`,
    `GET:${OPENAPI_API_DOMAIN}/IT-configurations`,
    `GET:${OPENAPI_API_DOMAIN}/IT-configurations/{fiscal_id}`,
    `DELETE:${OPENAPI_API_DOMAIN}/IT-configurations/{fiscal_id}`,
    // IT-receipts
    `POST:${OPENAPI_API_DOMAIN}/IT-receipts`,
    `GET:${OPENAPI_API_DOMAIN}/IT-receipts`,
    `GET:${OPENAPI_API_DOMAIN}/IT-receipts/{id}`,
    `PATCH:${OPENAPI_API_DOMAIN}/IT-receipts/{id}`,
    `DELETE:${OPENAPI_API_DOMAIN}/IT-receipts/{id}`,
];

export function isOpenApiConfigured(): boolean {
    return Boolean(OPENAPI_EMAIL && OPENAPI_API_KEY);
}

export function getOpenApiWebhookSecret(): string {
    return OPENAPI_WEBHOOK_SECRET;
}

function basicAuthHeader(): string {
    const encoded = btoa(`${OPENAPI_EMAIL}:${OPENAPI_API_KEY}`);
    return `Basic ${encoded}`;
}

/**
 * Mint (or reuse cached) OAuth Bearer token for OpenAPI.
 * Throws on misconfiguration or auth failure.
 */
export async function getOpenApiToken(): Promise<string> {
    if (!isOpenApiConfigured()) {
        throw new Error(
            "[OpenAPI] credenziali mancanti. Imposta OPENAPI_EMAIL e OPENAPI_API_KEY come secret Supabase."
        );
    }

    const now = Date.now();
    if (tokenCache && tokenCache.expiresAt > now + 60_000) {
        return tokenCache.token;
    }

    const res = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: "POST",
        headers: {
            "Authorization": basicAuthHeader(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            scopes: REQUIRED_SCOPES,
            ttl: TOKEN_TTL_SECONDS,
        }),
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`[OpenAPI] login fallito: ${res.status} ${txt}`);
    }

    const data = await res.json();
    const token = data?.token || data?.access_token || data?.data?.token;
    if (!token) {
        throw new Error("[OpenAPI] login senza token nella risposta");
    }
    const normalizedToken = String(token).replace(/^Bearer\s+/i, "");

    tokenCache = {
        token: normalizedToken,
        expiresAt: now + (TOKEN_TTL_SECONDS - 3600) * 1000, // -1h safety
    };
    return normalizedToken;
}

/**
 * Internal helper: signed JSON request to OpenAPI.
 */
async function openapiRequest(path: string, init: RequestInit & { acceptPdf?: boolean } = {}) {
    const token = await getOpenApiToken();
    const headers: Record<string, string> = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": init.acceptPdf ? "application/pdf" : "application/json",
        ...((init.headers as Record<string, string>) || {}),
    };
    if (init.acceptPdf) {
        headers["Accept"] = "application/pdf";
    }
    const res = await fetch(`${OPENAPI_BASE_URL}${path}`, {
        ...init,
        headers,
    });
    return res;
}

// =====================================================================
// IT-configurations
// =====================================================================

export interface OpenApiConfigurationInput {
    fiscal_id: string;       // P.IVA o codice fiscale del ristorante
    name: string;            // ragione sociale
    email: string;           // email aziendale
    receipts_authentication: {
        taxCode: string;     // codice fiscale del responsabile invio (deve coincidere con AdE)
        password: string;    // password Area Privata AdE
        pin: string;         // PIN AdE
    };
    callback_receipt_url?: string;   // webhook URL per evento receipt (success)
    callback_receipt_error_url?: string; // webhook URL per evento receipt-error
    merchant_address?: {
        street_address: string;
        street_number: string;
        zip_code: string;
        city: string;
        province: string;
    };
}

export async function getConfiguration(fiscalId: string): Promise<{ raw: any } | null> {
    const res = await openapiRequest(
        `/IT-configurations/${encodeURIComponent(fiscalId)}`,
        { method: "GET" }
    );
    const json = await res.json().catch(() => ({}));
    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(
            `[OpenAPI] lettura configurazione fallita: ${res.status} ${JSON.stringify(json)}`
        );
    }
    return { raw: json };
}

function receiptCallbacks(successUrl?: string, errorUrl?: string): Array<Record<string, unknown>> {
    const secret = getOpenApiWebhookSecret();
    const makeCallback = (url: string) => ({
        url,
        method: "JSON",
        ...(secret ? { headers: { "x-openapi-secret": secret } } : {}),
    });

    const callbacks: Array<Record<string, unknown>> = [];
    if (successUrl) {
        // OpenAPI recommends listening to all receipt lifecycle events so our
        // local audit log can reflect retries, credential updates, and the
        // appointee/assignment flow as well as successful receipts.
        for (const event of ["receipt", "receipt-retry", "receipt-credentials", "appointee"]) {
            callbacks.push({ event, callback: makeCallback(successUrl) });
        }
    }
    if (errorUrl) {
        callbacks.push({ event: "receipt-error", callback: makeCallback(errorUrl) });
    }
    return callbacks;
}

/**
 * Create a per-restaurant IT-configuration. Idempotent on OpenAPI side
 * (will return 409 if already exists for that fiscal_id).
 */
export async function createConfiguration(input: OpenApiConfigurationInput): Promise<{
    fiscal_id: string;
    raw: any;
}> {
    const body: Record<string, unknown> = {
        fiscal_id: input.fiscal_id,
        name: input.name,
        email: input.email,
        receipts: true,
        supplier_invoice: false,
        legal_storage: false,
        signature: false,
        receipts_authentication: input.receipts_authentication,
        ...(input.merchant_address ? { merchant_address: input.merchant_address } : {}),
    };

    const callbacks = receiptCallbacks(input.callback_receipt_url, input.callback_receipt_error_url);
    if (callbacks.length > 0) {
        body.api_configurations = callbacks;
    }

    const res = await openapiRequest("/IT-configurations", {
        method: "POST",
        body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(
            `[OpenAPI] creazione configurazione fallita: ${res.status} ${JSON.stringify(json)}`
        );
    }
    return { fiscal_id: input.fiscal_id, raw: json };
}

/**
 * Update an existing IT-configuration. Use this to rotate AdE
 * credentials every 90 days, or to update the email/business name.
 */
export async function updateConfiguration(
    fiscalId: string,
    patch: Partial<OpenApiConfigurationInput>
): Promise<{ raw: any }> {
    const body: Record<string, unknown> = {
        receipts: true,
    };
    if (patch.receipts_authentication) {
        body.receipts_authentication = patch.receipts_authentication;
    }
    if (patch.callback_receipt_url || patch.callback_receipt_error_url) {
        body.api_configurations = receiptCallbacks(
            patch.callback_receipt_url,
            patch.callback_receipt_error_url
        );
    }

    const res = await openapiRequest(
        `/IT-configurations/${encodeURIComponent(fiscalId)}`,
        { method: "PATCH", body: JSON.stringify(body) }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(
            `[OpenAPI] update configurazione fallito: ${res.status} ${JSON.stringify(json)}`
        );
    }
    return { raw: json };
}

export async function deleteConfiguration(fiscalId: string): Promise<void> {
    const res = await openapiRequest(
        `/IT-configurations/${encodeURIComponent(fiscalId)}`,
        { method: "DELETE" }
    );
    if (!res.ok && res.status !== 404) {
        const txt = await res.text().catch(() => "");
        throw new Error(`[OpenAPI] delete configurazione fallito: ${res.status} ${txt}`);
    }
}

// =====================================================================
// IT-receipts
// =====================================================================

export interface OpenApiReceiptItem {
    quantity: number;
    description: string;
    unit_price: number;        // EUR IVA inclusa
    vat_rate_code: string;     // "0" | "4" | "5" | "10" | "22" (Italian VAT)
    discount?: number;         // EUR
    complimentary?: boolean;
    sku?: string;
}

export interface OpenApiIssueReceiptInput {
    fiscal_id: string;
    items: OpenApiReceiptItem[];
    cash_payment_amount?: number;
    electronic_payment_amount?: number;
    ticket_restaurant_payment_amount?: number;
    ticket_restaurant_quantity?: number;
    discount?: number;
    invoice_issuing?: boolean;       // true → also issue invoice (B2B)
    services_uncollected_amount?: number;
    goods_uncollected_amount?: number;
    lottery_code?: string;           // 8-char codice lotteria scontrini
    customer_tax_code?: string;      // CF cliente per Tessera Sanitaria
    linked_receipt?: string;         // for refunds / voids
    idempotency_key?: string;        // we use our internal receipt id
}

export interface OpenApiReceiptResult {
    id: string;                       // OpenAPI receipt id
    status: string;                   // new | retry | submitted | ready | failed | voided
    document_number?: string;
    fiscal_serial?: string;
    issued_at?: string;
    raw: any;
}

export async function issueReceipt(input: OpenApiIssueReceiptInput): Promise<OpenApiReceiptResult> {
    const body: Record<string, unknown> = {
        fiscal_id: input.fiscal_id,
        items: input.items.map(it => ({
            quantity: it.quantity,
            description: it.description.slice(0, 1000),
            unit_price: Math.round(it.unit_price * 100) / 100,
            vat_rate_code: it.vat_rate_code,
            ...(typeof it.discount === "number" ? { discount: Math.round(it.discount * 100) / 100 } : {}),
            ...(it.complimentary ? { complimentary: true } : {}),
            ...(it.sku ? { sku: it.sku } : {}),
        })),
        cash_payment_amount: round2(input.cash_payment_amount),
        electronic_payment_amount: round2(input.electronic_payment_amount),
        ticket_restaurant_payment_amount: round2(input.ticket_restaurant_payment_amount),
        ticket_restaurant_quantity: input.ticket_restaurant_quantity || 0,
        discount: round2(input.discount),
        invoice_issuing: !!input.invoice_issuing,
        services_uncollected_amount: round2(input.services_uncollected_amount),
        goods_uncollected_amount: round2(input.goods_uncollected_amount),
    };

    if (input.lottery_code) body.lottery_code = input.lottery_code;
    if (input.customer_tax_code) body.customer_tax_code = input.customer_tax_code;
    if (input.linked_receipt) body.linked_receipt = input.linked_receipt;

    const headers: Record<string, string> = {};
    if (input.idempotency_key) headers["Idempotency-Key"] = input.idempotency_key;

    const res = await openapiRequest("/IT-receipts", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`[OpenAPI] emissione scontrino fallita: ${res.status} ${JSON.stringify(json)}`);
    }

    const receipt = json?.data ?? json;
    if (!receipt?.id) {
        throw new Error("[OpenAPI] scontrino emesso senza id nella risposta: " + JSON.stringify(json));
    }

    return {
        id: String(receipt.id),
        status: String(receipt.status || "submitted"),
        document_number: receipt.document_number,
        fiscal_serial: receipt.fiscal_serial,
        issued_at: receipt.issued_at,
        raw: json,
    };
}

export async function fetchReceipt(receiptId: string): Promise<any> {
    const res = await openapiRequest(`/IT-receipts/${encodeURIComponent(receiptId)}`, {
        method: "GET",
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`[OpenAPI] fetch scontrino fallito: ${res.status} ${txt}`);
    }
    return await res.json();
}

/**
 * Returns a Uint8Array containing the PDF bytes of a fiscal receipt.
 */
export async function fetchReceiptPdf(receiptId: string): Promise<Uint8Array> {
    const res = await openapiRequest(`/IT-receipts/${encodeURIComponent(receiptId)}`, {
        method: "GET",
        acceptPdf: true,
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`[OpenAPI] fetch PDF fallito: ${res.status} ${txt}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
}

export async function voidReceipt(receiptId: string): Promise<void> {
    const res = await openapiRequest(
        `/IT-receipts/${encodeURIComponent(receiptId)}`,
        { method: "DELETE" }
    );
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`[OpenAPI] annullamento scontrino fallito: ${res.status} ${txt}`);
    }
}

// =====================================================================
// Helpers
// =====================================================================

function round2(n?: number | null): number {
    if (typeof n !== "number" || !Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

/**
 * P.IVA italiana — 11 cifre con check digit (Luhn variante italiana).
 */
export function isValidVatIT(vat: string): boolean {
    if (!/^\d{11}$/.test(vat)) return false;
    let sum = 0;
    for (let i = 0; i < 10; i++) {
        const digit = parseInt(vat[i], 10);
        if (i % 2 === 0) {
            sum += digit;
        } else {
            const doubled = digit * 2;
            sum += doubled > 9 ? doubled - 9 : doubled;
        }
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(vat[10], 10);
}

/**
 * Codice fiscale italiano — formato CF persona fisica (16 char) o 11 cifre P.IVA.
 */
export function isValidTaxCodeIT(cf: string): boolean {
    if (!cf) return false;
    const upper = cf.toUpperCase();
    if (/^\d{11}$/.test(upper)) return isValidVatIT(upper);
    if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(upper)) return false;

    const odd: Record<string, number> = {
        "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
        A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
        N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
    };
    const even: Record<string, number> = {};
    "0123456789".split("").forEach((c, i) => even[c] = i);
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => even[c] = i);

    let sum = 0;
    for (let i = 0; i < 15; i++) {
        const c = upper[i];
        sum += i % 2 === 0 ? odd[c] : even[c];
    }
    const expected = String.fromCharCode("A".charCodeAt(0) + (sum % 26));
    return upper[15] === expected;
}

/**
 * Italian VAT codes accepted by OpenAPI (matches DB CHECK constraint on
 * restaurant_fiscal_settings.default_vat_rate_code):
 *   - Numeric percentages: 4, 5, 10, 22
 *   - Exemption codes: N1, N2, N3, N4, N5, N6 (esenzioni AdE)
 */
export const VALID_VAT_RATE_CODES = [
    "4", "5", "10", "22",
    "N1", "N2", "N3", "N4", "N5", "N6",
] as const;

/**
 * Maps a numeric VAT rate (e.g. 22) or string code (e.g. "10", "N3") to a
 * valid OpenAPI vat_rate_code. Returns `fallback` when the input is missing
 * or not in the allowed set. In Minthi, numeric 0 on dishes historically means
 * "unset", not a legally selected exemption nature code, so it falls back to
 * the restaurant default.
 */
export function vatRateCode(
    rate: number | string | undefined | null,
    fallback = "10"
): string {
    if (rate === undefined || rate === null || rate === "") return fallback;
    const raw = String(rate).trim().toUpperCase();
    if ((VALID_VAT_RATE_CODES as readonly string[]).includes(raw)) return raw;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        const rounded = Math.round(numeric);
        if ([4, 5, 10, 22].includes(rounded)) return String(rounded);
    }
    return fallback;
}
