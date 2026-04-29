import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

type ReceiptLine = {
    quantity: number;
    description: string;
    vatRateCode: string;
    lineTotal: number;
    taxable: number;
    vat: number;
};

type PdfContext = {
    receipt: Record<string, any>;
    restaurant?: Record<string, any> | null;
    fiscalSettings?: Record<string, any> | null;
    openapiEnv?: string;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN_X = 42;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 44;

export async function generateFiscalReceiptPdf(params: PdfContext): Promise<Uint8Array> {
    const receipt = params.receipt || {};
    const restaurant = params.restaurant || {};
    const fiscalSettings = params.fiscalSettings || {};
    const data = receiptData(receipt);
    const lines = receiptLines(receipt, data);

    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let page = doc.addPage([A4.width, A4.height]);
    let y = A4.height - MARGIN_TOP;

    const black = rgb(0.08, 0.08, 0.09);
    const muted = rgb(0.35, 0.35, 0.38);
    const lineColor = rgb(0.72, 0.72, 0.72);

    const drawText = (text: string, x: number, yy: number, size = 10, font = regular, color = black) => {
        page.drawText(cleanText(text), { x, y: yy, size, font, color });
    };
    const textWidth = (text: string, size = 10, font = regular) => font.widthOfTextAtSize(cleanText(text), size);
    const drawRight = (text: string, xRight: number, yy: number, size = 10, font = regular, color = black) => {
        drawText(text, xRight - textWidth(text, size, font), yy, size, font, color);
    };
    const drawCentered = (text: string, yy: number, size = 10, font = regular, color = black) => {
        drawText(text, (A4.width - textWidth(text, size, font)) / 2, yy, size, font, color);
    };
    const drawLine = (yy: number) => {
        page.drawLine({ start: { x: MARGIN_X, y: yy }, end: { x: A4.width - MARGIN_X, y: yy }, thickness: 0.6, color: lineColor });
    };
    const ensureSpace = (needed: number) => {
        if (y - needed >= MARGIN_BOTTOM) return;
        page = doc.addPage([A4.width, A4.height]);
        y = A4.height - MARGIN_TOP;
    };

    const env = String(params.openapiEnv || "").toLowerCase();
    const isTest = env && env !== "production";
    if (isTest) {
        drawCentered("AMBIENTE TEST - NON VALIDO AI FINI FISCALI", y, 9, bold, rgb(0.55, 0.08, 0.08));
        y -= 20;
    }

    const businessName = cleanText(restaurant.billing_name || restaurant.name || "Ristorante").toUpperCase();
    const fiscalId = cleanText(fiscalSettings.openapi_fiscal_id || restaurant.vat_number || fiscalSettings.tax_code || data.fiscal_id || "");
    const taxCode = cleanText(fiscalSettings.tax_code || restaurant.vat_number || data.fiscal_id || "");
    const address = [
        restaurant.billing_address || restaurant.address,
        [restaurant.billing_cap, restaurant.billing_city, restaurant.billing_province].filter(Boolean).join(" "),
    ].filter(Boolean).join(" - ");

    drawCentered(businessName, y, 13, bold);
    y -= 18;
    if (fiscalId || taxCode) {
        drawCentered(`Partita IVA/CF: ${fiscalId || taxCode}`, y, 10, regular);
        y -= 14;
    }
    if (address) {
        drawCentered(address.toUpperCase(), y, 10, regular);
        y -= 22;
    } else {
        y -= 8;
    }

    drawCentered("DOCUMENTO COMMERCIALE", y, 17, bold);
    y -= 22;
    drawCentered("di vendita o prestazione", y, 13, bold);
    y -= 34;

    const tableLeft = MARGIN_X;
    const tableRight = A4.width - MARGIN_X;
    const qtaX = tableLeft + 10;
    const descX = tableLeft + 58;
    const vatX = tableRight - 170;
    const totalX = tableRight - 14;

    drawLine(y + 12);
    drawText("Qta", qtaX, y, 10, bold);
    drawText("Descrizione", descX, y, 10, bold);
    drawText("IVA", vatX, y, 10, bold);
    drawRight("Totale", totalX, y, 10, bold);
    y -= 10;
    drawLine(y);
    y -= 16;

    for (const line of lines) {
        const descLines = wrapText(line.description, regular, 10, vatX - descX - 16);
        const rowHeight = Math.max(18, descLines.length * 12 + 6);
        ensureSpace(rowHeight + 20);

        drawText(formatQuantity(line.quantity), qtaX, y, 10);
        descLines.forEach((part, idx) => drawText(part, descX, y - idx * 12, 10));
        drawText(line.vatRateCode ? `${line.vatRateCode}%` : "-", vatX, y, 10);
        drawRight(formatMoney(line.lineTotal), totalX, y, 10);
        y -= rowHeight;
        drawLine(y + 8);
        y -= 8;
    }

    const totals = receiptTotals(receipt, data, lines);
    ensureSpace(180);
    y -= 18;
    drawText("Totale imponibile:", MARGIN_X + 10, y, 11);
    drawRight(formatMoney(totals.taxable), tableRight - 14, y, 11);
    y -= 26;
    drawText("Totale IVA:", MARGIN_X + 10, y, 11);
    drawRight(formatMoney(totals.vat), tableRight - 14, y, 11);
    y -= 32;
    drawText("Totale complessivo:", MARGIN_X + 10, y, 16, bold);
    drawRight(formatMoney(totals.total), tableRight - 14, y, 16, bold);
    y -= 18;
    drawLine(y);
    y -= 26;

    const payments = paymentRows(receipt, data);
    for (const payment of payments) {
        drawText(payment.label, MARGIN_X + 10, y, 11);
        drawRight(formatMoney(payment.amount), tableRight - 14, y, 11);
        y -= 20;
    }

    y -= 12;
    const documentNumber = cleanText(data.document_number || data.number || receipt.openapi_receipt_id || "");
    const documentDate = formatDate(data.document_date || data.issued_at || receipt.ready_at || receipt.submitted_at || receipt.created_at);
    drawText(`Documento N. ${documentNumber || "-"}`, MARGIN_X + 10, y, 10, bold);
    drawText(`del ${documentDate}`, MARGIN_X + 260, y, 10);
    y -= 18;
    if (data.transaction_id) {
        drawText(`Transazione AdE: ${cleanText(data.transaction_id)}`, MARGIN_X + 10, y, 9, regular, muted);
        y -= 14;
    }
    if (receipt.openapi_receipt_id) {
        drawText(`ID OpenAPI: ${cleanText(receipt.openapi_receipt_id)}`, MARGIN_X + 10, y, 9, regular, muted);
        y -= 14;
    }

    const footer = "Documento generato dai dati della ricevuta OpenAPI confermata.";
    drawText(footer, MARGIN_X + 10, MARGIN_BOTTOM - 12, 8, regular, muted);

    return await doc.save();
}

function receiptData(receipt: Record<string, any>): Record<string, any> {
    const raw = receipt.openapi_response || {};
    return raw?.data?.data || raw?.data || raw || {};
}

function receiptLines(receipt: Record<string, any>, data: Record<string, any>): ReceiptLine[] {
    const source = Array.isArray(data.items) && data.items.length > 0
        ? data.items
        : Array.isArray(receipt.items)
            ? receipt.items
            : [];

    return source.map((item: Record<string, any>) => {
        const quantity = number(item.quantity, 1) || 1;
        const vatRateCode = cleanText(item.vat_rate_code ?? item.vat_rate ?? "");
        const explicitTotal = nullableNumber(item.total_amount);
        const grossPrice = nullableNumber(item.gross_price);
        const storedUnit = nullableNumber(item.unit_price);
        const discount = number(item.gross_discount ?? item.discount ?? item.unit_discount, 0);
        const lineTotal = round2(explicitTotal ?? ((grossPrice ?? storedUnit ?? 0) * quantity - discount));
        const taxable = round2(nullableNumber(item.taxable_amount) ?? nullableNumber(item.net_taxable_amount) ?? taxableFromGross(lineTotal, vatRateCode));
        const vat = round2(nullableNumber(item.vat_amount) ?? Math.max(0, lineTotal - taxable));
        return {
            quantity,
            description: cleanText(item.description || "Voce"),
            vatRateCode,
            lineTotal,
            taxable,
            vat,
        };
    }).filter(line => line.lineTotal !== 0 || line.description);
}

function receiptTotals(receipt: Record<string, any>, data: Record<string, any>, lines: ReceiptLine[]) {
    const total = round2(nullableNumber(data.total_amount) ?? nullableNumber(receipt.total_amount) ?? lines.reduce((sum, l) => sum + l.lineTotal, 0));
    const taxable = round2(nullableNumber(data.total_taxable_amount) ?? lines.reduce((sum, l) => sum + l.taxable, 0));
    const vat = round2(nullableNumber(data.total_vat_amount) ?? lines.reduce((sum, l) => sum + l.vat, 0));
    return { total, taxable, vat };
}

function paymentRows(receipt: Record<string, any>, data: Record<string, any>): Array<{ label: string; amount: number }> {
    const rows = [
        { label: "Pagamento elettronico:", amount: number(data.electronic_payment_amount ?? receipt.electronic_payment_amount, 0) },
        { label: "Pagamento contanti:", amount: number(data.cash_payment_amount ?? receipt.cash_payment_amount, 0) },
        { label: "Ticket restaurant:", amount: number(data.ticket_restaurant_payment_amount ?? receipt.ticket_restaurant_amount, 0) },
        { label: "Sconto:", amount: number(data.discount ?? receipt.discount_amount, 0) },
    ].filter(r => Math.abs(r.amount) > 0.004);
    return rows.length > 0 ? rows : [{ label: "Pagamento:", amount: number(data.total_amount ?? receipt.total_amount, 0) }];
}

function taxableFromGross(gross: number, vatRateCode: string): number {
    const rate = Number(String(vatRateCode).replace(",", "."));
    if (!Number.isFinite(rate) || rate <= 0) return gross;
    return gross / (1 + rate / 100);
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
    const words = cleanText(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
            current = next;
            continue;
        }
        if (current) lines.push(current);
        current = word;
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
}

function cleanText(value: unknown): string {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function formatMoney(value: number): string {
    return `EUR ${round2(value).toFixed(2).replace(".", ",")}`;
}

function formatQuantity(value: number): string {
    return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function formatDate(value: unknown): string {
    const date = value ? new Date(String(value)) : new Date();
    if (Number.isNaN(date.getTime())) return cleanText(value || "");
    return new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(date);
}

function nullableNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function number(value: unknown, fallback: number): number {
    const n = nullableNumber(value);
    return n === null ? fallback : n;
}

function round2(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
}
