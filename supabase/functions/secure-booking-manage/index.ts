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

    try {
        const { userId, action, bookingId, restaurantId, data } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
            // Verify restaurant allows public reservations
            const { data: rest } = await supabase
                .from("restaurants").select("enable_public_reservations, is_active").eq("id", data.restaurant_id).maybeSingle();
            if (!rest || !rest.enable_public_reservations || rest.is_active === false) {
                return json({ error: "Prenotazioni non disponibili" }, 403);
            }
            const payload = {
                restaurant_id: data.restaurant_id,
                name: data.name,
                email: data.email || null,
                phone: data.phone || null,
                date_time: data.date_time,
                guests: data.guests,
                notes: data.notes || null,
                status: "PENDING",
                table_id: data.table_id || null,
            };
            const { data: booking, error } = await supabase.from("bookings").insert(payload).select().single();
            if (error) return json({ error: error.message }, 500);
            return json({ success: true, data: booking });
        }

        // All other actions require auth
        if (!userId) return json({ error: "userId richiesto" }, 400);
        if (!targetRestaurantId) return json({ error: "Contesto ristorante non trovato" }, 400);

        const access = await verifyAccess(supabase, userId, targetRestaurantId);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            case "create": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const payload = {
                    restaurant_id: data.restaurant_id || targetRestaurantId,
                    table_id: data.table_id || null,
                    name: data.name,
                    email: data.email || null,
                    phone: data.phone || null,
                    date_time: data.date_time,
                    guests: data.guests,
                    notes: data.notes || null,
                    status: data.status || "PENDING",
                };
                const { data: booking, error } = await supabase.from("bookings").insert(payload).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: booking });
            }

            case "update": {
                if (!bookingId || !data) return json({ error: "bookingId e data richiesti" }, 400);
                const allowed = ["table_id", "name", "email", "phone", "date_time", "guests", "notes", "status"];
                const payload: any = {};
                for (const key of allowed) {
                    if (data[key] !== undefined) payload[key] = data[key];
                }
                const { error } = await supabase.from("bookings").update(payload).eq("id", bookingId);
                if (error) return json({ error: error.message }, 500);
                break;
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
