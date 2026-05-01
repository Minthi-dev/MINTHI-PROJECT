import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9\s().\-]{6,24}$/;
const MAX_RESERVATION_ADVANCE_DAYS = 365;

function cleanDuration(value: unknown): number | null {
    if (value === undefined || value === null || value === "") return null;
    const minutes = Math.floor(Number(value));
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return Math.min(9999, Math.max(15, minutes));
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        const { userId, action, bookingId, restaurantId, data, sessionToken } = await req.json();
        const json = (body: any, status = 200, extraHeaders: Record<string, string> = {}) =>
            new Response(JSON.stringify(body), {
                status,
                headers: { ...cors, "Content-Type": "application/json", ...extraHeaders },
            });

        if (!action) return json({ error: "action richiesto" }, 400);

        // Determine restaurant context
        let targetRestaurantId = restaurantId;

        if (!targetRestaurantId && bookingId) {
            const { data: booking } = await supabase
                .from("bookings").select("restaurant_id").eq("id", bookingId).maybeSingle();
            targetRestaurantId = booking?.restaurant_id;
        }
        if (!targetRestaurantId && data?.restaurant_id) {
            targetRestaurantId = data.restaurant_id;
        }

        // Public booking creation (no userId required)
        if (action === "create_public") {
            if (!data || !data.restaurant_id || !data.name || !data.date_time || !data.guests) {
                return json({ error: "restaurant_id, name, date_time, guests richiesti" }, 400);
            }

            // Validazione formato per evitare spam / dati malformati.
            const cleanName = String(data.name || "").trim().slice(0, 80);
            if (cleanName.length < 2) return json({ error: "Nome non valido" }, 400);
            const cleanEmail = data.email ? String(data.email).trim().toLowerCase().slice(0, 120) : "";
            if (cleanEmail && !EMAIL_RE.test(cleanEmail)) return json({ error: "Email non valida" }, 400);
            const cleanPhone = data.phone ? String(data.phone).trim().slice(0, 24) : "";
            if (cleanPhone && !PHONE_RE.test(cleanPhone)) return json({ error: "Telefono non valido" }, 400);
            const guests = Math.floor(Number(data.guests) || 0);
            if (!Number.isFinite(guests) || guests < 1 || guests > 50) {
                return json({ error: "Numero coperti non valido (1-50)" }, 400);
            }
            const dateMs = Date.parse(String(data.date_time || ""));
            if (!Number.isFinite(dateMs)) return json({ error: "Data non valida" }, 400);
            const maxFuture = Date.now() + MAX_RESERVATION_ADVANCE_DAYS * 24 * 3600 * 1000;
            const minFuture = Date.now() - 60 * 60 * 1000; // tollera 1h indietro
            if (dateMs < minFuture || dateMs > maxFuture) {
                return json({ error: "Data prenotazione fuori intervallo consentito" }, 400);
            }
            const cleanNotes = data.notes ? String(data.notes).trim().slice(0, 500) : "";
            const duration = cleanDuration(data.duration);

            // Rate limit per IP+restaurant per evitare spam.
            const { data: rateRows } = await supabase.rpc("check_takeaway_rate_limit", {
                p_action: "public_booking_create",
                p_restaurant_id: data.restaurant_id,
                p_ip: clientIp(req),
                p_window_seconds: 3600,
                p_max_attempts: 6,
            });
            const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
            if (rate && rate.allowed === false) {
                return json(
                    { error: "Hai inviato troppe prenotazioni. Riprova fra un'ora." },
                    429,
                    { "Retry-After": String(rate.retry_after_seconds || 3600) }
                );
            }

            // Verify restaurant allows public reservations
            const { data: rest } = await supabase
                .from("restaurants").select("enable_public_reservations, is_active").eq("id", data.restaurant_id).maybeSingle();
            if (!rest || !rest.enable_public_reservations || rest.is_active === false) {
                return json({ error: "Prenotazioni non disponibili" }, 403);
            }
            const payload = {
                restaurant_id: data.restaurant_id,
                name: cleanName,
                email: cleanEmail || null,
                phone: cleanPhone || null,
                date_time: new Date(dateMs).toISOString(),
                guests,
                notes: cleanNotes || null,
                status: "PENDING",
                table_id: data.table_id || null,
                ...(duration ? { duration } : {}),
            };
            const { data: booking, error } = await supabase.from("bookings").insert(payload).select().single();
            if (error) return json({ error: error.message }, 500);
            return json({ success: true, data: booking });
        }

        // All other actions require auth
        if (!userId) return json({ error: "userId richiesto" }, 400);
        if (!targetRestaurantId) return json({ error: "Contesto ristorante non trovato" }, 400);

        const access = await verifyAccess(supabase, userId, targetRestaurantId, sessionToken);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            case "create": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const payload = {
                    restaurant_id: data.restaurant_id || targetRestaurantId,
                    table_id: data.table_id || null,
                    name: String(data.name || "").trim().slice(0, 80),
                    email: data.email ? String(data.email).trim().toLowerCase().slice(0, 120) : null,
                    phone: data.phone ? String(data.phone).trim().slice(0, 24) : null,
                    date_time: data.date_time,
                    guests: Math.max(1, Math.min(50, Math.floor(Number(data.guests) || 1))),
                    notes: data.notes ? String(data.notes).trim().slice(0, 500) : null,
                    ...(cleanDuration(data.duration) ? { duration: cleanDuration(data.duration) } : {}),
                    status: data.status || "PENDING",
                };
                const { data: booking, error } = await supabase.from("bookings").insert(payload).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: booking });
            }

            case "update": {
                if (!bookingId || !data) return json({ error: "bookingId e data richiesti" }, 400);
                const allowed = ["table_id", "name", "email", "phone", "date_time", "guests", "notes", "status", "duration"];
                const payload: any = {};
                for (const key of allowed) {
                    if (data[key] !== undefined) payload[key] = data[key];
                }
                if (payload.name !== undefined) payload.name = String(payload.name || "").trim().slice(0, 80);
                if (payload.email !== undefined) payload.email = payload.email ? String(payload.email).trim().toLowerCase().slice(0, 120) : null;
                if (payload.phone !== undefined) payload.phone = payload.phone ? String(payload.phone).trim().slice(0, 24) : null;
                if (payload.guests !== undefined) payload.guests = Math.max(1, Math.min(50, Math.floor(Number(payload.guests) || 1)));
                if (payload.notes !== undefined) payload.notes = payload.notes ? String(payload.notes).trim().slice(0, 500) : null;
                if (payload.duration !== undefined) payload.duration = cleanDuration(payload.duration);
                const { data: booking, error } = await supabase
                    .from("bookings")
                    .update(payload)
                    .eq("id", bookingId)
                    .select()
                    .single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: booking });
            }

            case "delete": {
                if (!bookingId) return json({ error: "bookingId richiesto" }, 400);
                const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
                if (error) return json({ error: error.message }, 500);
                break;
            }

            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-BOOKING] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
