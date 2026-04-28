export function fiscalReceiptDedupeKey(payload: Record<string, unknown>): string {
    const restaurantId = String(payload.restaurantId || "");
    const explicit = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
    if (explicit) return explicit.slice(0, 240);
    const stripeSessionId = typeof payload.stripeSessionId === "string" ? payload.stripeSessionId.trim() : "";
    if (stripeSessionId) return `stripe:${restaurantId}:${stripeSessionId}`;
    const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";
    if (orderId) return `order:${restaurantId}:${orderId}:${String(payload.issuedVia || "receipt")}`;
    const tableSessionId = typeof payload.tableSessionId === "string" ? payload.tableSessionId.trim() : "";
    if (tableSessionId) return `table:${restaurantId}:${tableSessionId}:${String(payload.issuedVia || "receipt")}`;
    return `manual:${restaurantId}:${crypto.randomUUID()}`;
}

export function tableFinalReceiptDedupeKey(restaurantId: string, tableSessionId: string): string {
    return `table-final:${restaurantId}:${tableSessionId}`;
}

export async function enqueueFiscalReceiptJob(
    supabase: any,
    payload: Record<string, unknown>,
    options: { dedupeKey?: string; priority?: number; maxAttempts?: number } = {}
): Promise<{ queued: boolean; jobId?: string; alreadyQueued?: boolean; status?: string }> {
    const restaurantId = String(payload.restaurantId || "").trim();
    if (!restaurantId) throw new Error("restaurantId mancante per job fiscale");

    const dedupeKey = (options.dedupeKey || fiscalReceiptDedupeKey(payload)).slice(0, 240);
    const jobPayload = { ...payload, idempotencyKey: String(payload.idempotencyKey || dedupeKey) };
    const row = {
        restaurant_id: restaurantId,
        dedupe_key: dedupeKey,
        priority: options.priority ?? 100,
        max_attempts: options.maxAttempts ?? 8,
        payload: jobPayload,
        status: "queued",
        run_after: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from("fiscal_receipt_jobs")
        .insert(row)
        .select("id, status")
        .single();

    if (!error && data) {
        return { queued: true, jobId: data.id, status: data.status };
    }

    if (error?.code !== "23505") {
        throw new Error(error?.message || "Impossibile accodare lo scontrino fiscale");
    }

    const { data: existing } = await supabase
        .from("fiscal_receipt_jobs")
        .select("id, status")
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();

    if (!existing) {
        return { queued: false, alreadyQueued: true };
    }

    if (existing.status === "failed" || existing.status === "dead") {
        await supabase
            .from("fiscal_receipt_jobs")
            .update({
                status: "queued",
                run_after: new Date().toISOString(),
                last_error: null,
                payload: jobPayload,
            })
            .eq("id", existing.id);
        return { queued: true, jobId: existing.id, status: "queued" };
    }

    return { queued: false, jobId: existing.id, alreadyQueued: true, status: existing.status };
}
