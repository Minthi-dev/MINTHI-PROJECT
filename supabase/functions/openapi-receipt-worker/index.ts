import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_KEY = Deno.env.get("MINTHI_INTERNAL_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok");
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    try {
        const body = await req.json().catch(() => ({}));
        const key = req.headers.get("x-minthi-internal-key") || body.internalKey || "";
        if (!INTERNAL_KEY || key !== INTERNAL_KEY) return json({ error: "Non autorizzato" }, 403);

        const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
        const concurrency = Math.min(Math.max(Number(body.concurrency || 8), 1), 20);
        const workerId = `edge-${crypto.randomUUID()}`;
        const { data: jobs, error } = await supabase.rpc("claim_fiscal_receipt_jobs", {
            p_limit: limit,
            p_worker_id: workerId,
        });
        if (error) {
            console.error("[fiscal-worker] claim error:", error);
            return json({ error: error.message || "claim failed" }, 500);
        }

        const results = await mapWithConcurrency(jobs || [], concurrency, processJob);

        return json({ success: true, workerId, claimed: jobs?.length || 0, concurrency, results });
    } catch (err: any) {
        console.error("[fiscal-worker] generic error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});

async function processJob(job: any) {
    try {
        const res = await fetch(`${supabaseUrl}/functions/v1/openapi-issue-receipt`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ ...(job.payload || {}), internalKey: INTERNAL_KEY }),
        });
        const text = await res.text().catch(() => "");
        let data: any = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = { raw: text };
        }

        if (!res.ok || data?.error) {
            throw new Error((data?.error || data?.detail || text || `HTTP ${res.status}`).slice(0, 1000));
        }

        await supabase
            .from("fiscal_receipt_jobs")
            .update({
                status: "succeeded",
                receipt_id: data?.receiptId || null,
                last_error: null,
                locked_at: null,
                locked_by: null,
            })
            .eq("id", job.id);

        return { jobId: job.id, status: "succeeded", receiptId: data?.receiptId || null };
    } catch (err: any) {
        const attempts = Number(job.attempts || 1);
        const maxAttempts = Number(job.max_attempts || 8);
        const message = String(err?.message || err || "Errore emissione scontrino").slice(0, 1000);
        const isDead = attempts >= maxAttempts;
        const delaySeconds = retryDelaySeconds(attempts);
        const runAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();

        await supabase
            .from("fiscal_receipt_jobs")
            .update({
                status: isDead ? "dead" : "failed",
                run_after: isDead ? new Date().toISOString() : runAfter,
                last_error: message,
                locked_at: null,
                locked_by: null,
            })
            .eq("id", job.id);

        console.error(`[fiscal-worker] job ${job.id} failed attempt ${attempts}/${maxAttempts}:`, message);
        return { jobId: job.id, status: isDead ? "dead" : "retry_scheduled", attempts, nextRunAt: isDead ? null : runAfter };
    }
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    async function run() {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index]);
        }
    }

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, run);
    await Promise.all(runners);
    return results;
}

function retryDelaySeconds(attempts: number): number {
    const base = Math.min(3600, 20 * Math.pow(2, Math.max(0, attempts - 1)));
    const jitter = Math.floor(Math.random() * 15);
    return base + jitter;
}
