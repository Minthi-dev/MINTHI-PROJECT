// =====================================================================
// takeaway-create-order
// Public endpoint (no auth): customer scans QR → orders + optionally pays.
// Server-side price validation, atomic pickup number, optional Stripe flow.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateRedirectUrl } from "../_shared/auth.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

interface InputItem {
    dish_id: string;
    quantity: number;
    note?: string;
}

const MAX_ITEMS = 40;
const MAX_QTY_PER_ITEM = 30;
const MAX_NAME_LEN = 80;
const MAX_PHONE_LEN = 32;
const MAX_NOTE_LEN = 240;

function sanitizeStr(s: unknown, max: number): string | null {
    if (typeof s !== "string") return null;
    const trimmed = s.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, max);
}

function randomCode(len = 6): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    let out = "";
    for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
    return out;
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    try {
        const payload = await req.json();
        const {
            restaurantId,
            items,
            customerName,
            customerPhone,
            customerNotes,
            paymentMethod, // 'stripe' | 'pay_on_pickup'
            customerEmail,
            successUrl,
            cancelUrl,
        } = payload ?? {};

        // --- Input validation ---------------------------------------------------
        if (typeof restaurantId !== "string" || restaurantId.length !== 36) {
            return json({ error: "restaurantId non valido" }, 400);
        }
        if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
            return json({ error: "Elenco piatti non valido" }, 400);
        }
        const cleanName = sanitizeStr(customerName, MAX_NAME_LEN);
        const cleanPhone = sanitizeStr(customerPhone, MAX_PHONE_LEN);
        const cleanNotes = sanitizeStr(customerNotes, MAX_NOTE_LEN);
        if (!cleanName) return json({ error: "Nome cliente obbligatorio" }, 400);
        if (!cleanPhone) return json({ error: "Telefono obbligatorio" }, 400);

        const chosenMethod = paymentMethod === "stripe" ? "stripe" : "pay_on_pickup";

        // Validate item shape
        const dishIds: string[] = [];
        for (const it of items as InputItem[]) {
            if (!it || typeof it.dish_id !== "string" || it.dish_id.length !== 36) {
                return json({ error: "dish_id non valido" }, 400);
            }
            if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_QTY_PER_ITEM) {
                return json({ error: "Quantità non valida" }, 400);
            }
            if (it.note !== undefined && it.note !== null) {
                if (typeof it.note !== "string" || it.note.length > MAX_NOTE_LEN) {
                    return json({ error: "Nota non valida" }, 400);
                }
            }
            dishIds.push(it.dish_id);
        }

        // --- Load restaurant --------------------------------------------------
        const { data: restaurant, error: rErr } = await supabase
            .from("restaurants")
            .select(
                "id, name, is_active, takeaway_enabled, takeaway_require_stripe, takeaway_estimated_minutes, enable_stripe_payments, stripe_connect_account_id, stripe_connect_enabled"
            )
            .eq("id", restaurantId)
            .maybeSingle();

        if (rErr || !restaurant) return json({ error: "Ristorante non trovato" }, 404);
        if (restaurant.is_active === false) return json({ error: "Ristorante non attivo" }, 403);
        if (!restaurant.takeaway_enabled) return json({ error: "Asporto non attivo per questo ristorante" }, 403);

        if (chosenMethod === "pay_on_pickup" && restaurant.takeaway_require_stripe) {
            return json({ error: "Questo ristorante richiede il pagamento online" }, 400);
        }

        if (chosenMethod === "stripe") {
            if (!restaurant.enable_stripe_payments) {
                return json({ error: "Pagamenti online non attivi" }, 400);
            }
            if (!restaurant.stripe_connect_account_id || !restaurant.stripe_connect_enabled) {
                return json({ error: "Il ristorante non ha ancora completato la configurazione per ricevere pagamenti" }, 403);
            }
        }

        // --- Load dishes and authoritatively compute total --------------------
        const { data: dishes, error: dErr } = await supabase
            .from("dishes")
            .select("id, name, price, restaurant_id, is_active, is_available")
            .in("id", dishIds);
        if (dErr) return json({ error: "Errore lettura menu" }, 500);
        if (!dishes || dishes.length === 0) return json({ error: "Piatti non trovati" }, 400);

        const dishMap = new Map(dishes.map((d: any) => [d.id, d]));
        let total = 0;
        const resolvedItems: {
            dish_id: string;
            dish_name: string;
            unit_price: number;
            quantity: number;
            note: string | null;
        }[] = [];

        for (const it of items as InputItem[]) {
            const dish = dishMap.get(it.dish_id);
            if (!dish) return json({ error: `Piatto non trovato: ${it.dish_id}` }, 400);
            if (dish.restaurant_id !== restaurantId) {
                return json({ error: "Piatto non appartiene al ristorante" }, 400);
            }
            if (dish.is_active === false || dish.is_available === false) {
                return json({ error: `Piatto non disponibile: ${dish.name}` }, 400);
            }
            const unit = Number(dish.price) || 0;
            if (unit < 0) return json({ error: "Prezzo non valido" }, 400);
            total += unit * it.quantity;
            resolvedItems.push({
                dish_id: dish.id,
                dish_name: dish.name,
                unit_price: unit,
                quantity: it.quantity,
                note: it.note ? it.note.slice(0, MAX_NOTE_LEN) : null,
            });
        }
        total = Math.round(total * 100) / 100;
        if (total <= 0) return json({ error: "Totale non valido" }, 400);

        // --- Atomic pickup number --------------------------------------------
        const { data: nextNum, error: nErr } = await supabase.rpc("next_pickup_number", {
            p_restaurant_id: restaurantId,
        });
        if (nErr || typeof nextNum !== "number") {
            console.error("[TAKEAWAY] next_pickup_number error:", nErr);
            return json({ error: "Errore generazione numero ritiro" }, 500);
        }
        const pickupNumber = nextNum;
        const pickupCode = randomCode(6);

        // --- Insert order + items (status: PENDING when paying online, PENDING when cash — cashier confirms) ---
        // If customer pays on pickup, order is immediately visible to kitchen (PREPARING).
        // If customer pays online via Stripe, order stays PENDING until webhook confirms.
        const initialStatus = chosenMethod === "stripe" ? "PENDING" : "PREPARING";

        const { data: newOrder, error: oErr } = await supabase
            .from("orders")
            .insert({
                restaurant_id: restaurantId,
                table_session_id: null,
                order_type: "takeaway",
                status: initialStatus,
                total_amount: total,
                pickup_number: pickupNumber,
                pickup_code: pickupCode,
                customer_name: cleanName,
                customer_phone: cleanPhone,
                customer_notes: cleanNotes,
                paid_amount: 0,
                payments: [],
            })
            .select("id")
            .single();

        if (oErr || !newOrder) {
            console.error("[TAKEAWAY] order insert error:", oErr);
            return json({ error: "Errore creazione ordine" }, 500);
        }

        const itemRows = resolvedItems.map((it) => ({
            order_id: newOrder.id,
            restaurant_id: restaurantId,
            dish_id: it.dish_id,
            quantity: it.quantity,
            note: it.note,
            status: "PENDING",
            course_number: 1,
        }));
        const { error: itErr } = await supabase.from("order_items").insert(itemRows);
        if (itErr) {
            console.error("[TAKEAWAY] order_items insert error:", itErr);
            // roll back order
            await supabase.from("orders").delete().eq("id", newOrder.id);
            return json({ error: "Errore creazione righe ordine" }, 500);
        }

        // --- Cash flow: return pickup info --------------------------------------
        if (chosenMethod !== "stripe") {
            return json({
                success: true,
                orderId: newOrder.id,
                pickupNumber,
                pickupCode,
                estimatedMinutes: restaurant.takeaway_estimated_minutes,
                paymentRequired: true,
                paymentMethod: "pay_on_pickup",
            });
        }

        // --- Stripe flow: create Checkout Session on Connect account ----------
        const lineItems = resolvedItems
            .filter((i) => i.unit_price > 0)
            .map((i) => ({
                price_data: {
                    currency: "eur",
                    product_data: { name: i.dish_name.slice(0, 120) },
                    unit_amount: Math.round(i.unit_price * 100),
                },
                quantity: i.quantity,
            }));

        if (lineItems.length === 0) {
            return json({ error: "Totale Stripe = 0" }, 400);
        }

        const origin = req.headers.get("origin") || "https://minthi.it";
        const defaultSuccess = `${origin}/client/takeaway/${restaurantId}/order/${pickupCode}?payment=success`;
        const defaultCancel = `${origin}/client/takeaway/${restaurantId}?payment=cancelled&code=${pickupCode}`;

        try {
            const session = await stripe.checkout.sessions.create(
                {
                    payment_method_types: ["card"],
                    mode: "payment",
                    line_items: lineItems,
                    success_url: validateRedirectUrl(successUrl, defaultSuccess),
                    cancel_url: validateRedirectUrl(cancelUrl, defaultCancel),
                    metadata: {
                        paymentType: "takeaway_order",
                        restaurantId,
                        orderId: newOrder.id,
                        pickupCode,
                        pickupNumber: String(pickupNumber),
                    },
                    ...(typeof customerEmail === "string" && customerEmail.length > 3 && customerEmail.length < 120
                        ? { customer_email: customerEmail }
                        : {}),
                },
                { stripeAccount: restaurant.stripe_connect_account_id! }
            );

            return json({
                success: true,
                orderId: newOrder.id,
                pickupNumber,
                pickupCode,
                estimatedMinutes: restaurant.takeaway_estimated_minutes,
                paymentMethod: "stripe",
                checkoutUrl: session.url,
                sessionId: session.id,
            });
        } catch (stripeErr: any) {
            console.error("[TAKEAWAY] stripe error, cancelling order:", stripeErr);
            // Roll back the order if we cannot create the Stripe session.
            await supabase.from("order_items").delete().eq("order_id", newOrder.id);
            await supabase.from("orders").delete().eq("id", newOrder.id);
            return json({ error: "Errore pagamento: " + (stripeErr?.message || "Stripe") }, 502);
        }
    } catch (err: any) {
        console.error("[TAKEAWAY] generic error:", err);
        return json({ error: err?.message || "Errore interno" }, 500);
    }
});
