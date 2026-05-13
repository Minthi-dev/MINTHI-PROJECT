// =====================================================================
// admin-qr-codes
//
// Admin-only management of reusable physical QR codes. The platform prints
// QR codes once and re-assigns them to restaurants over time without
// reprinting.
//
// Actions:
//   - list                 → all QR codes with current assignment + restaurant name
//   - create               → mint a new QR with a random unique slug (or a provided one)
//   - assign               → point an existing QR to a (different) restaurant
//   - unassign             → detach a QR (scanning it shows a friendly "not assigned" page)
//   - delete               → permanently remove a QR (use with care; the printed
//                            QR becomes dead — there's no way to recover)
//
// Auth: admin session token required. All requests are routed through
// verifyAccess so a STAFF/OWNER token CANNOT call this function.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Code: lower-case alphanumeric, 6-32 chars. Excludes confusing chars (no 0/o, 1/l/i).
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const DEFAULT_CODE_LENGTH = 8;
const CODE_PATTERN = /^[a-z0-9]{6,32}$/;

function randomCode(len: number = DEFAULT_CODE_LENGTH): string {
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    let out = "";
    for (let i = 0; i < len; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    return out;
}

async function generateUniqueCode(maxAttempts = 8): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
        const code = randomCode();
        const { data: existing } = await supabase
            .from("physical_qr_codes")
            .select("id")
            .eq("code", code)
            .maybeSingle();
        if (!existing) return code;
    }
    // Astronomically unlikely with 8 chars × 31 alphabet — fall back to longer.
    return randomCode(12);
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (body: any, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    try {
        const body = await req.json();
        const { userId, sessionToken, action } = body || {};

        if (!userId || !action) return json({ error: "Parametri mancanti (userId, action)" }, 400);

        const access = await verifyAccess(supabase, userId, undefined, sessionToken);
        if (!access.valid || !access.isAdmin) {
            return json({ error: "Non autorizzato: solo admin" }, 403);
        }

        switch (action) {
            case "list": {
                const { data, error } = await supabase
                    .from("physical_qr_codes")
                    .select(`
                        id, code, restaurant_id, label, created_at, assigned_at,
                        restaurant:restaurants(id, name)
                    `)
                    .order("created_at", { ascending: false });
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: data || [] });
            }

            case "create": {
                const customCode = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
                let code = customCode || (await generateUniqueCode());
                if (!CODE_PATTERN.test(code)) {
                    return json({
                        error: "Codice non valido: usa 6-32 caratteri minuscoli/numeri",
                    }, 400);
                }

                const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : null;
                const restaurantId = typeof body.restaurantId === "string" && body.restaurantId.length === 36
                    ? body.restaurantId
                    : null;

                // If user gave an explicit code, check uniqueness explicitly
                // to provide a clear error message.
                if (customCode) {
                    const { data: clash } = await supabase
                        .from("physical_qr_codes")
                        .select("id")
                        .eq("code", code)
                        .maybeSingle();
                    if (clash) {
                        return json({ error: "Codice già esistente, scegline un altro" }, 409);
                    }
                }

                const { data: inserted, error } = await supabase
                    .from("physical_qr_codes")
                    .insert({
                        code,
                        restaurant_id: restaurantId,
                        label,
                        assigned_at: restaurantId ? new Date().toISOString() : null,
                        created_by: userId,
                    })
                    .select(`
                        id, code, restaurant_id, label, created_at, assigned_at,
                        restaurant:restaurants(id, name)
                    `)
                    .single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: inserted });
            }

            case "assign": {
                const qrId = typeof body.qrId === "string" ? body.qrId : "";
                const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
                if (!qrId || !restaurantId) return json({ error: "qrId e restaurantId richiesti" }, 400);

                // Verify the restaurant exists (and is not deleted) — otherwise
                // we'd point a printed QR at a phantom id.
                const { data: rest } = await supabase
                    .from("restaurants")
                    .select("id, name")
                    .eq("id", restaurantId)
                    .maybeSingle();
                if (!rest) return json({ error: "Ristorante non trovato" }, 404);

                const { data: updated, error } = await supabase
                    .from("physical_qr_codes")
                    .update({
                        restaurant_id: restaurantId,
                        assigned_at: new Date().toISOString(),
                    })
                    .eq("id", qrId)
                    .select(`
                        id, code, restaurant_id, label, created_at, assigned_at,
                        restaurant:restaurants(id, name)
                    `)
                    .single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: updated });
            }

            case "unassign": {
                const qrId = typeof body.qrId === "string" ? body.qrId : "";
                if (!qrId) return json({ error: "qrId richiesto" }, 400);

                const { data: updated, error } = await supabase
                    .from("physical_qr_codes")
                    .update({ restaurant_id: null, assigned_at: null })
                    .eq("id", qrId)
                    .select(`
                        id, code, restaurant_id, label, created_at, assigned_at,
                        restaurant:restaurants(id, name)
                    `)
                    .single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: updated });
            }

            case "update_label": {
                const qrId = typeof body.qrId === "string" ? body.qrId : "";
                const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : null;
                if (!qrId) return json({ error: "qrId richiesto" }, 400);

                const { data: updated, error } = await supabase
                    .from("physical_qr_codes")
                    .update({ label })
                    .eq("id", qrId)
                    .select(`
                        id, code, restaurant_id, label, created_at, assigned_at,
                        restaurant:restaurants(id, name)
                    `)
                    .single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: updated });
            }

            case "delete": {
                const qrId = typeof body.qrId === "string" ? body.qrId : "";
                if (!qrId) return json({ error: "qrId richiesto" }, 400);
                const { error } = await supabase
                    .from("physical_qr_codes")
                    .delete()
                    .eq("id", qrId);
                if (error) return json({ error: error.message }, 500);
                return json({ success: true });
            }

            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }
    } catch (err: any) {
        console.error("[admin-qr-codes] error:", err);
        return new Response(
            JSON.stringify({ error: err?.message || "Errore interno" }),
            { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }
});
