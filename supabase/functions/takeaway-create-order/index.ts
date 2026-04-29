// =====================================================================
// takeaway-create-order
// Public endpoint (no auth): customer scans QR → orders + optionally pays.
// Server-side price validation, atomic pickup number, optional Stripe flow.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateRedirectUrl } from "../_shared/auth.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2026-02-25.clover" as any,
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

function clientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        "unknown";
}

async function enforceRateLimit(req: Request, restaurantId: string): Promise<{ allowed: boolean; retryAfter: number }> {
    const { data, error } = await supabase.rpc("check_takeaway_rate_limit", {
        p_action: "takeaway_create_order",
        p_restaurant_id: restaurantId,
        p_ip: clientIp(req),
        p_window_seconds: 3600,
        p_max_attempts: 10,
    });
    if (error) {
        console.error("[TAKEAWAY] rate limit error:", error);
        return { allowed: false, retryAfter: 60 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: row?.allowed !== false, retryAfter: Number(row?.retry_after_seconds || 3600) };
}

async function createTakeawayCheckoutSession(args: {
    req: Request;
    restaurantId: string;
    stripeAccountId: string;
    orderId: string;
    pickupCode: string;
    pickupNumber: number;
    lineItems: Array<Record<string, unknown>>;
    customerEmail?: string;
    successUrl?: string;
    cancelUrl?: string;
    idempotencyKey: string;
}) {
    const origin = args.req.headers.get("origin") || "https://minthi.it";
    const defaultSuccess = `${origin}/client/takeaway/${args.restaurantId}/order/${args.pickupCode}?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancel = `${origin}/client/takeaway/${args.restaurantId}?payment=cancelled&code=${args.pickupCode}`;

    return await stripe.checkout.sessions.create(
        {
            mode: "payment",
            line_items: args.lineItems,
            success_url: validateRedirectUrl(args.successUrl, defaultSuccess),
            cancel_url: validateRedirectUrl(args.cancelUrl, defaultCancel),
            metadata: {
                paymentType: "takeaway_order",
                restaurantId: args.restaurantId,
                orderId: args.orderId,
                pickupCode: args.pickupCode,
                pickupNumber: String(args.pickupNumber),
            },
            ...(typeof args.customerEmail === "string" && args.customerEmail.length > 3 && args.customerEmail.length < 120
                ? { customer_email: args.customerEmail }
                : {}),
        },
        {
            stripeAccount: args.stripeAccountId,
            idempotencyKey: args.idempotencyKey,
        }
    );
}

async function estimateTakeawayMinutes(orderId: string, restaurantId: string, fallbackMinutes: number): Promise<number> {
    try {
        const { data: orderItems } = await supabase
            .from("order_items")
            .select("dish_id, quantity")
            .eq("order_id", orderId);
        if (!orderItems || orderItems.length === 0) return Math.max(5, fallbackMinutes || 8);

        const { data: stats } = await supabase.rpc("get_takeaway_dish_prep_stats", {
            p_restaurant_id: restaurantId,
            p_days: 45,
        });
        const { data: restaurantEstimate } = await supabase.rpc("get_takeaway_restaurant_prep_estimate", {
            p_restaurant_id: restaurantId,
        });

        const fallback = Math.max(2, Number(restaurantEstimate || fallbackMinutes || 8));
        const statMap = new Map((stats || []).map((s: any) => [s.dish_id, Number(s.estimate_minutes) || fallback]));
        const total = orderItems.reduce((sum: number, item: any) => {
            const each = statMap.get(item.dish_id) || fallback;
            return sum + each * (Number(item.quantity) || 1);
        }, 0);
        return Math.max(5, Math.min(120, Math.ceil(total || fallback)));
    } catch (e) {
        console.warn("[TAKEAWAY] estimate prep minutes fallback:", e);
        return Math.max(5, fallbackMinutes || 8);
    }
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json", ...extraHeaders },
        });

    let payload: any;
    try {
        payload = await req.json();
    } catch (e) {
        console.error("[TAKEAWAY] bad JSON body:", e);
        return json({ error: "Richiesta non valida" }, 400);
    }

    try {
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
            idempotencyKey,
        } = payload ?? {};

        // --- Input validation ---------------------------------------------------
        if (typeof restaurantId !== "string" || restaurantId.length !== 36) {
            return json({ error: "restaurantId non valido" }, 400);
        }
        if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
            return json({ error: "Elenco piatti non valido" }, 400);
        }
        const cleanName = sanitizeStr(customerName, MAX_NAME_LEN);
        const cleanLastName = sanitizeStr((payload as any)?.customerLastName, MAX_NAME_LEN);
        const cleanPhone = sanitizeStr(customerPhone, MAX_PHONE_LEN);
        const cleanNotes = sanitizeStr(customerNotes, MAX_NOTE_LEN);
        const cleanEmail = (sanitizeStr(customerEmail, 120) || "").toLowerCase();
        const customerTaxCode = (sanitizeStr((payload as any)?.customerTaxCode, 16) || "").toUpperCase();
        const customerLotteryCode = (sanitizeStr((payload as any)?.customerLotteryCode, 8) || "").toUpperCase();

        // Per-restaurant customer field preferences. Defaults preserve the
        // historical behaviour (name + phone required, others optional).
        const { data: prefsRow } = await supabase
            .from("restaurants")
            .select("takeaway_collect_first_name, takeaway_first_name_required, takeaway_collect_last_name, takeaway_last_name_required, takeaway_collect_phone, takeaway_phone_required, takeaway_collect_email, takeaway_email_required")
            .eq("id", restaurantId)
            .maybeSingle();
        const prefs = {
            collectFirstName: prefsRow?.takeaway_collect_first_name !== false,
            firstNameRequired: prefsRow?.takeaway_first_name_required !== false,
            collectLastName: !!prefsRow?.takeaway_collect_last_name,
            lastNameRequired: !!prefsRow?.takeaway_last_name_required,
            collectPhone: prefsRow?.takeaway_collect_phone !== false,
            phoneRequired: prefsRow?.takeaway_phone_required !== false,
            collectEmail: prefsRow?.takeaway_collect_email !== false,
            emailRequired: !!prefsRow?.takeaway_email_required,
        };

        if (prefs.collectFirstName && prefs.firstNameRequired && !cleanName) {
            return json({ error: "Nome cliente obbligatorio" }, 400);
        }
        if (prefs.collectLastName && prefs.lastNameRequired && !cleanLastName) {
            return json({ error: "Cognome cliente obbligatorio" }, 400);
        }
        if (prefs.collectPhone && prefs.phoneRequired && !cleanPhone) {
            return json({ error: "Telefono obbligatorio" }, 400);
        }
        if (prefs.collectEmail && prefs.emailRequired && !cleanEmail) {
            return json({ error: "Email obbligatoria" }, 400);
        }
        if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return json({ error: "Email cliente non valida" }, 400);
        }
        if (customerLotteryCode && !/^[A-Z0-9]{8}$/.test(customerLotteryCode)) {
            return json({ error: "Codice lotteria scontrini non valido (8 caratteri)" }, 400);
        }
        const displayName = [
            prefs.collectFirstName ? cleanName : null,
            prefs.collectLastName ? cleanLastName : null,
        ].filter(Boolean).join(" ").trim() || null;

        const chosenMethod = paymentMethod === "stripe" ? "stripe" : "pay_on_pickup";
        const cleanIdempotencyKey = sanitizeStr(idempotencyKey, 64);

        // --- Idempotency short-circuit ----------------------------------------
        // If the client retries (iPhone flaky network, double-tap), return the
        // existing order instead of creating a duplicate.
        let existingOrder: any = null;
        if (cleanIdempotencyKey) {
            const { data: existing } = await supabase
                .from("orders")
                .select("id, pickup_number, pickup_code, status, total_amount, paid_amount, takeaway_pickup_mode, takeaway_pickup_token")
                .eq("restaurant_id", restaurantId)
                .eq("idempotency_key", cleanIdempotencyKey)
                .maybeSingle();
            if (existing) {
                existingOrder = existing;
            }
        }

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
                "id, name, is_active, takeaway_enabled, takeaway_require_stripe, takeaway_pickup_mode, takeaway_estimated_minutes, takeaway_max_orders_per_hour, enable_stripe_payments, stripe_connect_account_id, stripe_connect_enabled"
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

        if (existingOrder && chosenMethod !== "stripe") {
            const estimatedMinutes = await estimateTakeawayMinutes(existingOrder.id, restaurantId, restaurant.takeaway_estimated_minutes);
            return json({
                success: true,
                orderId: existingOrder.id,
                pickupNumber: existingOrder.pickup_number,
                pickupCode: existingOrder.pickup_code,
                takeawayPickupMode: existingOrder.takeaway_pickup_mode || "code",
                takeawayPickupToken: existingOrder.takeaway_pickup_token || null,
                estimatedMinutes,
                paymentMethod: "pay_on_pickup",
                paymentRequired: true,
                deduplicated: true,
            });
        }

        if (existingOrder && chosenMethod === "stripe") {
            const remaining = Math.max(
                0,
                Math.round((Number(existingOrder.total_amount || 0) - Number(existingOrder.paid_amount || 0)) * 100) / 100
            );
            if (remaining <= 0.01) {
                const estimatedMinutes = await estimateTakeawayMinutes(existingOrder.id, restaurantId, restaurant.takeaway_estimated_minutes);
                return json({
                    success: true,
                    orderId: existingOrder.id,
                    pickupNumber: existingOrder.pickup_number,
                    pickupCode: existingOrder.pickup_code,
                    takeawayPickupMode: existingOrder.takeaway_pickup_mode || "code",
                    takeawayPickupToken: existingOrder.takeaway_pickup_token || null,
                    estimatedMinutes,
                    paymentMethod: "stripe",
                    paymentRequired: false,
                    deduplicated: true,
                });
            }

            const session = await createTakeawayCheckoutSession({
                req,
                restaurantId,
                stripeAccountId: restaurant.stripe_connect_account_id!,
                orderId: existingOrder.id,
                pickupCode: existingOrder.pickup_code,
                pickupNumber: existingOrder.pickup_number,
                customerEmail: undefined,
                successUrl,
                cancelUrl,
                idempotencyKey: `takeaway-order-retry-${existingOrder.id}-${Math.round(remaining * 100)}`,
                lineItems: [
                    {
                        price_data: {
                            currency: "eur",
                            product_data: { name: `Asporto #${existingOrder.pickup_number} — ${restaurant.name}`.slice(0, 120) },
                            unit_amount: Math.round(remaining * 100),
                        },
                        quantity: 1,
                    },
                ],
            });

            const estimatedMinutes = await estimateTakeawayMinutes(existingOrder.id, restaurantId, restaurant.takeaway_estimated_minutes);
            return json({
                success: true,
                orderId: existingOrder.id,
                pickupNumber: existingOrder.pickup_number,
                pickupCode: existingOrder.pickup_code,
                takeawayPickupMode: existingOrder.takeaway_pickup_mode || "code",
                takeawayPickupToken: existingOrder.takeaway_pickup_token || null,
                estimatedMinutes,
                paymentMethod: "stripe",
                checkoutUrl: session.url,
                sessionId: session.id,
                paymentRequired: true,
                deduplicated: true,
            });
        }

        const rate = await enforceRateLimit(req, restaurantId);
        if (!rate.allowed) {
            return json(
                { error: "Troppi ordini da questo dispositivo. Riprova più tardi." },
                429,
                { "Retry-After": String(rate.retryAfter) }
            );
        }

        const maxOrdersPerHour = Number((restaurant as any).takeaway_max_orders_per_hour || 0);
        if (maxOrdersPerHour > 0) {
            const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { count, error: countErr } = await supabase
                .from("orders")
                .select("id", { count: "exact", head: true })
                .eq("restaurant_id", restaurantId)
                .eq("order_type", "takeaway")
                .gte("created_at", since)
                .neq("status", "CANCELLED");
            if (countErr) {
                console.error("[TAKEAWAY] max orders count error:", countErr);
                return json({ error: "Errore controllo capacità cucina" }, 500);
            }
            if ((count || 0) >= maxOrdersPerHour) {
                return json({ error: "Troppe ordinazioni in questo momento. Riprova tra poco." }, 429);
            }
        }

        // --- Load dishes and authoritatively compute total --------------------
        const { data: dishes, error: dErr } = await supabase
            .from("dishes")
            .select("id, name, price, vat_rate, restaurant_id, is_active, is_available")
            .in("id", dishIds);
        if (dErr) return json({ error: "Errore lettura menu" }, 500);
        if (!dishes || dishes.length === 0) return json({ error: "Piatti non trovati" }, 400);

        const dishMap = new Map(dishes.map((d: any) => [d.id, d]));
        let total = 0;
        const resolvedItems: {
            dish_id: string;
            dish_name: string;
            unit_price: number;
            vat_rate: string | number | null;
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
                vat_rate: dish.vat_rate ?? null,
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
        const pickupMode = restaurant.takeaway_pickup_mode === "qr" ? "qr" : "code";
        const pickupToken = pickupMode === "qr" ? crypto.randomUUID() : null;

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
                takeaway_pickup_mode: pickupMode,
                takeaway_pickup_token: pickupToken,
                customer_name: displayName,
                customer_phone: prefs.collectPhone ? cleanPhone : null,
                customer_notes: cleanNotes,
                customer_email: prefs.collectEmail ? (cleanEmail || null) : null,
                customer_tax_code: customerTaxCode || null,
                customer_lottery_code: customerLotteryCode || null,
                paid_amount: 0,
                payments: [],
                payment_method: chosenMethod === "stripe" ? null : "pay_on_pickup",
                idempotency_key: cleanIdempotencyKey,
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
            dish_name_snapshot: it.dish_name,
            unit_price_snapshot: it.unit_price,
            vat_rate_snapshot: it.vat_rate,
        }));
        const { error: itErr } = await supabase.from("order_items").insert(itemRows);
        if (itErr) {
            console.error("[TAKEAWAY] order_items insert error:", itErr);
            // roll back order
            await supabase.from("orders").delete().eq("id", newOrder.id);
            return json({ error: "Errore creazione righe ordine" }, 500);
        }

        const estimatedMinutes = await estimateTakeawayMinutes(newOrder.id, restaurantId, restaurant.takeaway_estimated_minutes);

        // --- Cash flow: return pickup info --------------------------------------
        if (chosenMethod !== "stripe") {
            return json({
                success: true,
                orderId: newOrder.id,
                pickupNumber,
                pickupCode,
                takeawayPickupMode: pickupMode,
                takeawayPickupToken: pickupToken,
                estimatedMinutes,
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

        try {
            const session = await createTakeawayCheckoutSession({
                req,
                restaurantId,
                stripeAccountId: restaurant.stripe_connect_account_id!,
                orderId: newOrder.id,
                pickupCode,
                pickupNumber,
                lineItems,
                customerEmail: undefined,
                successUrl,
                cancelUrl,
                idempotencyKey: `takeaway-order-${newOrder.id}-${Math.round(total * 100)}`,
            });

            return json({
                success: true,
                orderId: newOrder.id,
                pickupNumber,
                pickupCode,
                takeawayPickupMode: pickupMode,
                takeawayPickupToken: pickupToken,
                estimatedMinutes,
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
