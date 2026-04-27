import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    try {
        const body = await req.json();
        const {
            userId,
            sessionToken,
            restaurantId,
            includeReceipts = false,
            limit = 50,
            action,
            defaultVatRateCode,
            fiscalEmailToCustomer,
        } = body || {};

        if (!userId || !restaurantId) return json({ error: "Parametri mancanti" }, 400);
        const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
        if (!access.valid || (!access.isOwner && !access.isAdmin && !access.isStaff)) {
            return json({ error: "Non autorizzato" }, 403);
        }

        // -- Update preferences (admin/owner only) -----------------------
        if (action === "update_preferences") {
            if (!access.isOwner && !access.isAdmin) {
                return json({ error: "Solo i titolari possono modificare queste impostazioni" }, 403);
            }
            const VALID_VAT_CODES = ["4", "5", "10", "22", "N1", "N2", "N3", "N4", "N5", "N6"];
            const update: Record<string, unknown> = { restaurant_id: restaurantId };
            if (typeof defaultVatRateCode === "string") {
                if (!VALID_VAT_CODES.includes(defaultVatRateCode)) {
                    return json({ error: "Aliquota IVA non valida" }, 400);
                }
                update.default_vat_rate_code = defaultVatRateCode;
            }
            if (typeof fiscalEmailToCustomer === "boolean") {
                update.fiscal_email_to_customer = fiscalEmailToCustomer;
            }
            if (Object.keys(update).length <= 1) {
                return json({ error: "Nessuna modifica" }, 400);
            }
            const { error: upErr } = await supabase
                .from("restaurant_fiscal_settings")
                .upsert(update, { onConflict: "restaurant_id" });
            if (upErr) return json({ error: upErr.message }, 500);
            return json({ success: true });
        }

        const { data: restaurant, error: restaurantErr } = await supabase
            .from("restaurants")
            .select("id, name, email, vat_number, billing_name, billing_address, billing_city, billing_province, billing_cap")
            .eq("id", restaurantId)
            .maybeSingle();
        if (restaurantErr) throw restaurantErr;
        if (!restaurant) return json({ error: "Ristorante non trovato" }, 404);

        const { data: settings, error: settingsErr } = await supabase
            .from("restaurant_fiscal_settings")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .maybeSingle();
        if (settingsErr) throw settingsErr;

        const { data: statsRow, error: statsErr } = await supabase
            .from("fiscal_receipts_stats_30d")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .maybeSingle();
        if (statsErr) throw statsErr;

        let receipts: any[] = [];
        if (includeReceipts) {
            const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
            const { data, error } = await supabase
                .from("fiscal_receipts")
                .select("*")
                .eq("restaurant_id", restaurantId)
                .order("created_at", { ascending: false })
                .limit(safeLimit);
            if (error) throw error;
            receipts = data || [];
        }

        return json({
            restaurant: {
                ...restaurant,
                tax_code: settings?.tax_code || null,
                billing_postal_code: settings?.billing_postal_code || restaurant.billing_cap || null,
                fiscal_billing_email: settings?.fiscal_billing_email || restaurant.email || null,
                openapi_fiscal_id: settings?.openapi_fiscal_id || null,
                openapi_status: settings?.openapi_status || "not_configured",
                openapi_configured_at: settings?.openapi_configured_at || null,
                openapi_last_error: settings?.openapi_last_error || null,
                ade_credentials_set_at: settings?.ade_credentials_set_at || null,
                ade_credentials_expire_at: settings?.ade_credentials_expire_at || null,
                fiscal_receipts_enabled: settings?.fiscal_receipts_enabled === true,
                fiscal_email_to_customer: settings?.fiscal_email_to_customer !== false,
                default_vat_rate_code: settings?.default_vat_rate_code || "10",
            },
            stats: statsRow || {
                sent_count: 0,
                failed_count: 0,
                voided_count: 0,
                revenue_total: 0,
            },
            receipts,
        });
    } catch (err: any) {
        console.error("[openapi-fiscal-dashboard] error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});
