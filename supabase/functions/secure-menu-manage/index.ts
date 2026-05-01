import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const CATEGORY_FIELDS = new Set(["restaurant_id", "name", "is_active", "order"]);
const DISH_FIELDS = new Set([
    "restaurant_id",
    "name",
    "description",
    "price",
    "vat_rate",
    "category_id",
    "is_active",
    "image_url",
    "exclude_from_all_you_can_eat",
    "is_ayce",
    "allergens",
    "ayce_max_orders_per_person",
]);

function pickAllowed(source: any, allowed: Set<string>) {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(source || {})) {
        if (allowed.has(key) && value !== undefined) out[key] = value;
    }
    return out;
}

function cleanCategoryPayload(source: any) {
    const payload = pickAllowed(source, CATEGORY_FIELDS);
    if (payload.name !== undefined) payload.name = String(payload.name).trim().slice(0, 120);
    if (payload.order !== undefined) payload.order = Math.max(0, Math.floor(Number(payload.order) || 0));
    if (payload.is_active !== undefined) payload.is_active = payload.is_active !== false;
    return payload;
}

function cleanDishPayload(source: any) {
    const payload = pickAllowed(source, DISH_FIELDS);
    if (payload.name !== undefined) payload.name = String(payload.name).trim().slice(0, 160);
    if (payload.description !== undefined) {
        const clean = String(payload.description || "").trim().slice(0, 1000);
        payload.description = clean || null;
    }
    if (payload.price !== undefined) {
        const price = Number(payload.price);
        if (!Number.isFinite(price) || price < 0 || price > 99999) throw new Error("Prezzo non valido");
        payload.price = Math.round(price * 100) / 100;
    }
    if (payload.vat_rate !== undefined) {
        const vat = Number(payload.vat_rate);
        if (!Number.isFinite(vat) || vat < 0 || vat > 100) throw new Error("Aliquota IVA non valida");
        payload.vat_rate = Math.round(vat * 100) / 100;
    }
    if (payload.is_active !== undefined) payload.is_active = payload.is_active !== false;
    if (payload.exclude_from_all_you_can_eat !== undefined) payload.exclude_from_all_you_can_eat = payload.exclude_from_all_you_can_eat === true;
    if (payload.is_ayce !== undefined) payload.is_ayce = payload.is_ayce === true;
    if (payload.allergens !== undefined) {
        payload.allergens = Array.isArray(payload.allergens)
            ? payload.allergens.map((a: any) => String(a).trim()).filter(Boolean).slice(0, 30)
            : [];
    }
    if (payload.ayce_max_orders_per_person !== undefined) {
        if (payload.ayce_max_orders_per_person === null || payload.ayce_max_orders_per_person === "") {
            payload.ayce_max_orders_per_person = null;
        } else {
            const limit = Math.floor(Number(payload.ayce_max_orders_per_person));
            if (!Number.isFinite(limit) || limit < 1 || limit > 999) throw new Error("Limite AYCE non valido");
            payload.ayce_max_orders_per_person = limit;
        }
    }
    return payload;
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        const { userId, restaurantId, action, data, targetId, sessionToken } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti" }, 400);

        // For update/delete without restaurantId, look it up from the record
        let resolvedRestaurantId = restaurantId;
        if (!resolvedRestaurantId && targetId) {
            // Try categories first, then dishes
            const { data: cat } = await supabase.from("categories").select("restaurant_id").eq("id", targetId).maybeSingle();
            if (cat) {
                resolvedRestaurantId = cat.restaurant_id;
            } else {
                const { data: dish } = await supabase.from("dishes").select("restaurant_id, category_id").eq("id", targetId).maybeSingle();
                if (dish) {
                    resolvedRestaurantId = dish.restaurant_id;
                    if (!resolvedRestaurantId && dish.category_id) {
                        const { data: dishCat } = await supabase.from("categories").select("restaurant_id").eq("id", dish.category_id).maybeSingle();
                        resolvedRestaurantId = dishCat?.restaurant_id;
                    }
                }
            }
        }

        if (!resolvedRestaurantId) return json({ error: "restaurantId non determinabile" }, 400);

        // Verify owner or admin
        const access = await verifyAccess(supabase, userId, resolvedRestaurantId, sessionToken);
        if (!access.valid || access.isStaff) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            // ---- CATEGORIES ----
            case "create_category": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const payload = cleanCategoryPayload({ ...data, restaurant_id: resolvedRestaurantId });
                if (!payload.name) return json({ error: "Nome categoria richiesto" }, 400);
                const { data: result, error } = await supabase.from("categories").insert(payload).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: result });
            }
            case "update_category": {
                const id = targetId || data?.id;
                if (!id || !data) return json({ error: "id e data richiesti" }, 400);
                const payload = cleanCategoryPayload(data);
                delete payload.restaurant_id;
                const { data: result, error } = await supabase.from("categories").update(payload).eq("id", id).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: result });
            }
            case "delete_category": {
                const id = targetId;
                if (!id) return json({ error: "targetId richiesto" }, 400);
                const { error } = await supabase.from("categories").delete().eq("id", id);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            // ---- DISHES ----
            case "create_dish": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const payload = cleanDishPayload({ ...data, restaurant_id: resolvedRestaurantId });
                if (!payload.name || !payload.category_id || payload.price === undefined) {
                    return json({ error: "Nome, categoria e prezzo richiesti" }, 400);
                }
                const { data: result, error } = await supabase.from("dishes").insert(payload).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: result });
            }
            case "update_dish": {
                const id = targetId || data?.id;
                if (!id || !data) return json({ error: "id e data richiesti" }, 400);
                const payload = cleanDishPayload(data);
                delete payload.restaurant_id;
                const { data: result, error } = await supabase.from("dishes").update(payload).eq("id", id).select().single();
                if (error) return json({ error: error.message }, 500);
                return json({ success: true, data: result });
            }
            case "delete_dish": {
                const id = targetId;
                if (!id) return json({ error: "targetId richiesto" }, 400);
                const { error } = await supabase.from("dishes").delete().eq("id", id);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-MENU] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
