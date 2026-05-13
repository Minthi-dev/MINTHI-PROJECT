// =====================================================================
// resolve-qr-code (PUBLIC — no auth)
//
// Given a slug code embedded in a physical QR, returns the currently
// assigned restaurant id so the frontend can redirect the customer to
// the takeaway menu. Returns 404 if the code does not exist, and a
// distinct "unassigned" payload if the code exists but has no restaurant.
//
// This endpoint is public on purpose — a printed QR can be scanned by
// anyone without authentication. The only data leaked is the public
// restaurant id (which is already in the URL of the destination page),
// so there's nothing privileged here.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const CODE_PATTERN = /^[a-z0-9]{6,32}$/;

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (body: any, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    try {
        let code = "";
        if (req.method === "GET") {
            code = String(new URL(req.url).searchParams.get("code") || "").trim().toLowerCase();
        } else {
            const body = await req.json().catch(() => ({}));
            code = String(body?.code || "").trim().toLowerCase();
        }

        if (!CODE_PATTERN.test(code)) return json({ error: "Codice non valido" }, 400);

        const { data: row, error } = await supabase
            .from("physical_qr_codes")
            .select("id, code, restaurant_id, restaurant:restaurants(id, name, is_active, takeaway_enabled)")
            .eq("code", code)
            .maybeSingle();
        if (error) {
            console.error("[resolve-qr-code] DB error:", error);
            return json({ error: "Errore interno" }, 500);
        }
        if (!row) return json({ error: "QR non riconosciuto", notFound: true }, 404);

        if (!row.restaurant_id || !row.restaurant) {
            return json({
                code: row.code,
                assigned: false,
                restaurant: null,
                message: "Questo QR non è ancora assegnato a nessun ristorante",
            });
        }

        const rest = row.restaurant as any;
        if (rest.is_active === false) {
            return json({
                code: row.code,
                assigned: true,
                restaurant: { id: rest.id, name: rest.name, is_active: false },
                message: "Ristorante temporaneamente non disponibile",
            });
        }
        if (rest.takeaway_enabled === false) {
            return json({
                code: row.code,
                assigned: true,
                restaurant: { id: rest.id, name: rest.name, takeaway_enabled: false },
                message: "L'asporto non è attivo per questo ristorante",
            });
        }

        return json({
            code: row.code,
            assigned: true,
            restaurant: { id: rest.id, name: rest.name },
        });
    } catch (err: any) {
        console.error("[resolve-qr-code] error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});
