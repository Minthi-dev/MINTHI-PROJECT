// =====================================================================
// takeaway-order-status
// Public, rate-limited lookup for customer takeaway status by pickup code.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

function clientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        "unknown";
}

function normalizePickupCode(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const code = value.trim().toUpperCase();
    return /^[A-Z2-9]{4,12}$/.test(code) ? code : null;
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json", ...extraHeaders },
        });

    try {
        const { restaurantId, pickupCode } = await req.json();
        if (typeof restaurantId !== "string" || restaurantId.length !== 36) {
            return json({ error: "Ordine non trovato" }, 404);
        }
        const code = normalizePickupCode(pickupCode);
        if (!code) return json({ error: "Ordine non trovato" }, 404);

        const { data: rateRows, error: rateErr } = await supabase.rpc("check_takeaway_rate_limit", {
            p_action: "takeaway_status_lookup",
            p_restaurant_id: restaurantId,
            p_ip: clientIp(req),
            p_window_seconds: 60,
            p_max_attempts: 30,
        });
        const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
        if (rateErr) {
            console.error("[TAKEAWAY-STATUS-PUBLIC] rate limit error:", rateErr);
            return json({ error: "Errore temporaneo" }, 503);
        }
        if (rate && rate.allowed === false) {
            return json(
                { error: "Troppi tentativi. Riprova tra poco." },
                429,
                { "Retry-After": String(rate.retry_after_seconds || 60) }
            );
        }

        const { data, error } = await supabase.rpc("get_takeaway_order_status", {
            p_restaurant_id: restaurantId,
            p_pickup_code: code,
        });
        if (error) {
            console.error("[TAKEAWAY-STATUS-PUBLIC] lookup error:", error);
            return json({ error: "Errore temporaneo" }, 503);
        }

        const order = Array.isArray(data) ? data[0] : data;
        if (!order) return json({ order: null }, 200);
        return json({ order });
    } catch (err: any) {
        console.error("[TAKEAWAY-STATUS-PUBLIC] error:", err);
        return json({ error: "Errore temporaneo" }, 500);
    }
});
