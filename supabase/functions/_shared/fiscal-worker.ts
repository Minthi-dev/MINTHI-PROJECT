// Consuma la coda fiscal_jobs: emette gli scontrini presso il provider.
import { admin } from "./supabase.ts";
import { issueReceipt, isOpenApiConfigured, openApiEnv } from "./openapi.ts";
import { sendReceiptEmail } from "./fiscal.ts";

const BACKOFF_MINUTES = [1, 2, 5, 10, 30, 60, 180, 360];

export async function processFiscalJobs(limit = 10): Promise<{ processed: number; failed: number }> {
  const db = admin();
  const { data: jobs, error } = await db.rpc("claim_fiscal_jobs", { p_limit: limit });
  if (error) throw error;
  let processed = 0, failed = 0;

  for (const job of jobs ?? []) {
    const receiptId = job.payload?.receiptId as string | undefined;
    try {
      if (!receiptId) throw new Error("Job senza receiptId");
      const { data: r } = await db.from("fiscal_receipts").select("*").eq("id", receiptId).single();
      if (!r) throw new Error("Scontrino non trovato");
      if (r.status !== "pending" && r.status !== "failed") {
        await db.from("fiscal_jobs").update({ status: "done", receipt_id: receiptId, locked_at: null }).eq("id", job.id);
        continue;
      }

      const { data: fs } = await db.from("fiscal_settings").select("*").eq("restaurant_id", r.restaurant_id).single();
      if (!fs?.enabled || fs.status !== "active" || !fs.fiscal_id) throw new Error("Scontrini non configurati per il ristorante");
      if (!isOpenApiConfigured()) throw new Error("Provider fiscale non configurato");

      const result = await issueReceipt({
        fiscalId: fs.fiscal_id,
        items: r.items,
        cash: Number(r.cash_amount),
        electronic: Number(r.electronic_amount),
        voucher: Number(r.voucher_amount),
        voucherQuantity: r.voucher_quantity ?? 0,
        discount: Number(r.discount_amount),
        lotteryCode: r.customer_lottery_code,
        customerTaxCode: r.customer_tax_code,
        idempotencyKey: r.idempotency_key,
      });

      await db.from("fiscal_receipts").update({
        status: result.status === "ready" ? "ready" : "submitted",
        provider_receipt_id: result.id,
        provider_env: openApiEnv(),
        document_number: result.documentNumber,
        provider_response: result.raw,
        error: null,
      }).eq("id", receiptId);
      await db.from("fiscal_jobs").update({ status: "done", receipt_id: receiptId, last_error: null, locked_at: null }).eq("id", job.id);
      if (result.status === "ready") await sendReceiptEmail(receiptId).catch((e) => console.error("[fiscal] email", e));
      processed++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      const final = job.attempts >= job.max_attempts;
      const delay = BACKOFF_MINUTES[Math.min(job.attempts - 1, BACKOFF_MINUTES.length - 1)];
      await db.from("fiscal_jobs").update({
        status: final ? "failed" : "queued",
        last_error: message.slice(0, 1000),
        locked_at: null,
        run_after: new Date(Date.now() + delay * 60_000).toISOString(),
      }).eq("id", job.id);
      if (receiptId) {
        await db.from("fiscal_receipts").update({ error: message.slice(0, 1000), ...(final ? { status: "failed" } : {}) }).eq("id", receiptId);
      }
      console.error(`[fiscal-worker] job ${job.id} tentativo ${job.attempts}:`, message);
    }
  }
  return { processed, failed };
}
