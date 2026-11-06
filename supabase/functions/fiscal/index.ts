// Scontrini elettronici: configurazione esercente, emissione, annullo, PDF.
import { z } from "npm:zod@3.24.2";
import { badRequest, forbidden, handle, json, readJson } from "../_shared/http.ts";
import { admin, getCaller, logActivity, requireRole } from "../_shared/supabase.ts";
import { buildOrderDraft, buildSessionDraft, enqueueReceipt } from "../_shared/fiscal.ts";
import { processFiscalJobs } from "../_shared/fiscal-worker.ts";
import {
  fetchReceiptPdf, getConfiguration, isOpenApiConfigured, isValidTaxCodeIT, isValidVatIT, openApiEnv, upsertConfiguration, voidReceipt,
} from "../_shared/openapi.ts";

const rid = z.string().uuid();
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), restaurantId: rid }),
  z.object({
    action: z.literal("configure"),
    restaurantId: rid,
    vatNumber: z.string().trim(),
    businessName: z.string().trim().min(2).max(160),
    email: z.string().trim().email(),
    adeTaxCode: z.string().trim().toUpperCase(),
    adePassword: z.string().min(1).max(200),
    adePin: z.string().trim().min(1).max(20),
  }),
  z.object({ action: z.literal("issue"), restaurantId: rid, sessionId: z.string().uuid().optional(), orderId: z.string().uuid().optional() }),
  z.object({ action: z.literal("void"), restaurantId: rid, receiptId: z.string().uuid() }),
  z.object({ action: z.literal("pdf"), restaurantId: rid, receiptId: z.string().uuid() }),
]);

handle(async (req) => {
  const caller = await getCaller(req);
  const body = Body.parse(await readJson(req));
  const db = admin();

  switch (body.action) {
    case "status": {
      await requireRole(caller.user.id, body.restaurantId, ["owner", "manager"]);
      const { data: fs } = await db.from("fiscal_settings").select("*").eq("restaurant_id", body.restaurantId).maybeSingle();
      return json(req, { env: openApiEnv(), providerConfigured: isOpenApiConfigured(), settings: fs });
    }

    case "configure": {
      await requireRole(caller.user.id, body.restaurantId, ["owner"]);
      if (!isValidVatIT(body.vatNumber) && !isValidTaxCodeIT(body.vatNumber)) throw badRequest("Partita IVA non valida.");
      if (!isValidTaxCodeIT(body.adeTaxCode)) throw badRequest("Codice fiscale per l'Agenzia delle Entrate non valido.");
      if (!isOpenApiConfigured()) throw badRequest("Servizio scontrini non disponibile, contatta MINTHI.");

      const log: unknown[] = [];
      await db.from("fiscal_settings").upsert({ restaurant_id: body.restaurantId, status: "pending", tax_code: body.vatNumber });
      try {
        const res = await upsertConfiguration({
          fiscalId: body.vatNumber, name: body.businessName, email: body.email,
          adeTaxCode: body.adeTaxCode, adePassword: body.adePassword, adePin: body.adePin,
          webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/fiscal-webhook`,
        });
        log.push({ at: new Date().toISOString(), step: res.created ? "create" : "update", result: "ok" });
        const cfg = await getConfiguration(body.vatNumber);
        if (!cfg || cfg.receipts !== true) throw new Error("La configurazione non risulta abilitata agli scontrini.");
        log.push({ at: new Date().toISOString(), step: "verify", result: "ok" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.push({ at: new Date().toISOString(), step: "error", detail: message.slice(0, 500) });
        await db.from("fiscal_settings").update({ status: "error", last_error: message.slice(0, 1000), onboarding_log: log }).eq("restaurant_id", body.restaurantId);
        throw badRequest("Configurazione non riuscita: controlla le credenziali dell'Agenzia delle Entrate.");
      }
      const now = new Date();
      await db.from("fiscal_settings").update({
        status: "active", enabled: true, fiscal_id: body.vatNumber, last_error: null, onboarding_log: log,
        configured_at: now.toISOString(), ade_credentials_set_at: now.toISOString(),
        ade_credentials_expire_at: new Date(now.getTime() + 90 * 86400_000).toISOString(),
      }).eq("restaurant_id", body.restaurantId);
      await logActivity(body.restaurantId, caller.user.id, "fiscal_configured", { env: openApiEnv() });
      return json(req, { ok: true, env: openApiEnv() });
    }

    case "issue": {
      const role = await requireRole(caller.user.id, body.restaurantId, ["owner", "manager", "waiter"]);
      if (role === "waiter") {
        const { data: m } = await db.from("memberships").select("can_take_payments").eq("restaurant_id", body.restaurantId).eq("user_id", caller.user.id).single();
        if (!m?.can_take_payments) throw forbidden("Non sei abilitato a emettere scontrini.");
      }
      const { data: fs } = await db.from("fiscal_settings").select("enabled, status").eq("restaurant_id", body.restaurantId).maybeSingle();
      if (!fs?.enabled || fs.status !== "active") throw badRequest("Scontrini elettronici non attivi: configurali nelle impostazioni.");
      if (!body.sessionId && !body.orderId) throw badRequest("Indica il tavolo o l'ordine.");

      const draft = body.sessionId
        ? await buildSessionDraft(body.sessionId, "manual", caller.user.id)
        : await buildOrderDraft(body.orderId!, "manual", caller.user.id);
      if ("error" in draft) throw badRequest(draft.error);
      if (draft.restaurantId !== body.restaurantId) throw forbidden();
      const queued = await enqueueReceipt(draft);
      // emissione immediata, il cron resta come rete di sicurezza
      await processFiscalJobs(3).catch((e) => console.error("[fiscal] inline worker", e));
      const { data: receipt } = await db.from("fiscal_receipts").select("id, status, document_number, error").eq("id", queued.receiptId).single();
      return json(req, { receipt, alreadyQueued: queued.alreadyQueued });
    }

    case "void": {
      await requireRole(caller.user.id, body.restaurantId, ["owner", "manager"]);
      const { data: r } = await db.from("fiscal_receipts").select("*").eq("id", body.receiptId).eq("restaurant_id", body.restaurantId).single();
      if (!r?.provider_receipt_id || !["submitted", "ready"].includes(r.status)) throw badRequest("Questo scontrino non può essere annullato.");
      await voidReceipt(r.provider_receipt_id);
      await db.from("fiscal_receipts").update({ status: "voided" }).eq("id", r.id);
      await logActivity(body.restaurantId, caller.user.id, "fiscal_voided", { receiptId: r.id, total: r.total });
      return json(req, { ok: true });
    }

    case "pdf": {
      await requireRole(caller.user.id, body.restaurantId, ["owner", "manager", "waiter"]);
      const { data: r } = await db.from("fiscal_receipts").select("provider_receipt_id, document_number").eq("id", body.receiptId).eq("restaurant_id", body.restaurantId).single();
      if (!r?.provider_receipt_id) throw badRequest("Scontrino non ancora emesso.");
      const pdf = await fetchReceiptPdf(r.provider_receipt_id);
      let binary = "";
      for (let i = 0; i < pdf.length; i += 0x8000) binary += String.fromCharCode(...pdf.subarray(i, i + 0x8000));
      return json(req, { filename: `scontrino-${r.document_number ?? body.receiptId}.pdf`, base64: btoa(binary) });
    }
  }
});
