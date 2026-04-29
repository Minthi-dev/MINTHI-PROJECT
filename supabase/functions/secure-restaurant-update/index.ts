import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Fields that restaurant owners can update via frontend
const OWNER_ALLOWED_FIELDS = [
    "name", "address", "phone", "email", "logo_url",
    "all_you_can_eat", "ayce_price", "ayce_max_orders", "cover_charge_per_person",
    "lunch_time_start", "dinner_time_start", "enable_course_splitting", "reservation_duration",
    "weekly_coperto", "weekly_ayce", "weekly_service_hours", "waiter_password",
    "menu_style", "menu_primary_color", "view_only_menu_enabled",
    "enable_reservation_room_selection", "enable_public_reservations",
    "show_cooking_times", "enable_course_suggestions",
    "waiter_mode_enabled", "allow_waiter_payments",
    "vat_number", "billing_name", "enable_stripe_payments",
    "auto_deliver_ready_dishes",
    // Takeaway
    "takeaway_enabled", "dine_in_enabled", "takeaway_require_stripe",
    "takeaway_pickup_notice", "takeaway_pickup_mode", "takeaway_auto_print", "takeaway_auto_pickup_enabled", "takeaway_max_orders_per_hour",
    "takeaway_collect_first_name", "takeaway_first_name_required",
    "takeaway_collect_last_name", "takeaway_last_name_required",
    "takeaway_collect_phone", "takeaway_phone_required",
    "takeaway_collect_email", "takeaway_email_required",
];

// Admin can also update these fields
const ADMIN_EXTRA_FIELDS = ["is_active", "owner_id", "suspension_reason"];

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    try {
        const { userId, restaurantId, data, sessionToken } = await req.json();

        if (!userId || !restaurantId || !data || typeof data !== "object") {
            return new Response(
                JSON.stringify({ error: "Parametri mancanti (userId, restaurantId, data)" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
        if (!access.valid || access.isStaff) {
            return new Response(
                JSON.stringify({ error: "Non autorizzato" }),
                { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        const { data: restaurant } = await supabase
            .from("restaurants")
            .select("id, owner_id")
            .eq("id", restaurantId)
            .maybeSingle();

        if (!restaurant) {
            return new Response(
                JSON.stringify({ error: "Ristorante non trovato" }),
                { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        const isAdmin = access.isAdmin;

        // 3. Filter to allowed fields only (Stripe fields are NEVER allowed from frontend)
        const allowedFields = isAdmin
            ? [...OWNER_ALLOWED_FIELDS, ...ADMIN_EXTRA_FIELDS]
            : OWNER_ALLOWED_FIELDS;

        const safePayload: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                safePayload[key] = value;
            }
        }

        if (Object.keys(safePayload).length === 0) {
            return new Response(
                JSON.stringify({ error: "Nessun campo valido da aggiornare" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        // 4. Perform update with service_role (bypasses RLS)
        const { error: updateError } = await supabase
            .from("restaurants")
            .update(safePayload)
            .eq("id", restaurantId);

        if (updateError) {
            console.error(`[SECURE-RESTAURANT-UPDATE] Errore:`, updateError);
            return new Response(
                JSON.stringify({ error: updateError.message }),
                { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("[SECURE-RESTAURANT-UPDATE] Errore:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Errore interno" }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
    }
});
