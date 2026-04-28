import { tableFinalReceiptDedupeKey } from "./fiscal-outbox.ts";

function money(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function oneRelation(row: any): any {
    return Array.isArray(row) ? row[0] : row;
}

function objectId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object" && typeof (value as any).id === "string") return (value as any).id;
    return null;
}

function scheduledPrice(args: { schedule: any; fallback: number }): number {
    const schedule = args.schedule;
    if (!schedule) return Math.max(0, money(args.fallback));
    if (schedule.enabled === false) return 0;
    if (!schedule.useWeeklySchedule) return Math.max(0, money(schedule.defaultPrice));

    let maxPrice = Math.max(0, money(schedule.defaultPrice));
    for (const day of Object.values(schedule.schedule || {}) as any[]) {
        for (const meal of [day?.lunch, day?.dinner]) {
            if (meal && meal.enabled !== false) maxPrice = Math.max(maxPrice, money(meal.price));
        }
    }
    return maxPrice;
}

function copertoPrice(restaurant: any): number {
    return scheduledPrice({
        schedule: restaurant.weekly_coperto,
        fallback: Number(restaurant.cover_charge_per_person || 0),
    });
}

function aycePrice(restaurant: any): number {
    const legacy = typeof restaurant.all_you_can_eat === "object" && restaurant.all_you_can_eat
        ? Number(restaurant.all_you_can_eat.pricePerPerson || 0)
        : Number(restaurant.ayce_price || 0);
    return scheduledPrice({
        schedule: restaurant.weekly_ayce,
        fallback: legacy,
    });
}

export async function buildDineInFinalReceiptPayload(supabase: any, args: {
    session?: any;
    restaurantId: string;
    tableSessionId: string;
    paidAfter?: number;
    stripeSessionId?: string;
    stripePaymentIntentId?: string | null;
    stripePaymentTrace?: Record<string, unknown> | null;
}) {
    const { data: tableSession } = await supabase
        .from("table_sessions")
        .select("id, restaurant_id, paid_amount, customer_count, coperto_enabled, ayce_enabled, customer_email, customer_tax_code, customer_lottery_code")
        .eq("id", args.tableSessionId)
        .eq("restaurant_id", args.restaurantId)
        .maybeSingle();
    if (!tableSession) return { ready: false, reason: "table_session_not_found" };

    const { data: restaurant } = await supabase
        .from("restaurants")
        .select("id, cover_charge_per_person, ayce_price, all_you_can_eat, weekly_coperto, weekly_ayce")
        .eq("id", args.restaurantId)
        .maybeSingle();
    if (!restaurant) return { ready: false, reason: "restaurant_not_found" };

    const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("restaurant_id", args.restaurantId)
        .eq("table_session_id", args.tableSessionId)
        .neq("status", "CANCELLED");

    const orderIds = (orders || []).map((o: any) => o.id).filter(Boolean);
    if (orderIds.length === 0) return { ready: false, reason: "no_orders" };

    const { data: orderItems } = await supabase
        .from("order_items")
        .select("id, quantity, status, note, dish:dishes(name, price, vat_rate, is_ayce, exclude_from_all_you_can_eat)")
        .in("order_id", orderIds)
        .neq("status", "CANCELLED");

    const items: Array<{ description: string; quantity: number; unitPrice: number; vatRate?: number | string }> = [];
    for (const it of orderItems || []) {
        const dish = oneRelation((it as any).dish);
        if (!dish) continue;
        const includedInAyce = tableSession.ayce_enabled === true
            && dish.is_ayce === true
            && dish.exclude_from_all_you_can_eat !== true;
        if (includedInAyce) continue;
        const quantity = Number((it as any).quantity) || 1;
        const price = money(dish.price);
        if (price <= 0) continue;
        items.push({
            description: String(dish.name || "Voce menu").slice(0, 1000),
            quantity,
            unitPrice: price,
            vatRate: dish.vat_rate ?? undefined,
        });
    }

    const customers = Math.max(1, Number(tableSession.customer_count || 1));
    const cover = tableSession.coperto_enabled === true ? copertoPrice(restaurant) : 0;
    if (cover > 0) {
        items.push({
            description: "Coperto",
            quantity: customers,
            unitPrice: cover,
        });
    }

    const ayce = tableSession.ayce_enabled === true ? aycePrice(restaurant) : 0;
    if (ayce > 0) {
        items.push({
            description: "Menu All You Can Eat",
            quantity: customers,
            unitPrice: ayce,
        });
    }

    const tableTotal = money(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    const paidAfter = money(args.paidAfter ?? tableSession.paid_amount);
    if (tableTotal <= 0) return { ready: false, reason: "empty_total", tableTotal, paidAfter };
    if (paidAfter + 0.01 < tableTotal) {
        return { ready: false, reason: "not_fully_paid", tableTotal, paidAfter };
    }

    let paymentTrace: Record<string, unknown> | null = args.stripePaymentTrace || null;
    try {
        const { data: paymentRows } = await supabase
            .from("table_session_payments")
            .select("amount, currency, stripe_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_receipt_url, payment_method_type, raw_trace, created_at")
            .eq("restaurant_id", args.restaurantId)
            .eq("table_session_id", args.tableSessionId)
            .order("created_at", { ascending: true });
        const payments = (paymentRows || []).map((p: any) => ({
            provider: "stripe",
            amount: Number(p.amount) || 0,
            currency: p.currency || "eur",
            checkout_session_id: p.stripe_session_id || undefined,
            payment_intent_id: p.stripe_payment_intent_id || undefined,
            charge_id: p.stripe_charge_id || undefined,
            receipt_url: p.stripe_receipt_url || undefined,
            payment_method_type: p.payment_method_type || undefined,
            created_at: p.created_at || undefined,
        }));
        if (payments.length > 0) {
            paymentTrace = {
                provider: "stripe",
                payments,
                current: args.stripePaymentTrace || undefined,
            };
        }
    } catch {
        // Older deployments may not have the trace table yet during rollout.
    }

    const key = tableFinalReceiptDedupeKey(args.restaurantId, args.tableSessionId);
    return {
        ready: true,
        dedupeKey: key,
        tableTotal,
        paidAfter,
        payload: {
            restaurantId: args.restaurantId,
            tableSessionId: args.tableSessionId,
            stripeSessionId: args.stripeSessionId || args.session?.id || undefined,
            stripePaymentIntentId: args.stripePaymentIntentId || objectId(args.session?.payment_intent),
            issuedVia: "auto_stripe",
            idempotencyKey: key,
            items,
            electronicAmount: tableTotal,
            stripePaymentTrace: paymentTrace || undefined,
            customerEmail: tableSession.customer_email || args.session?.metadata?.customerEmail || args.session?.customer_details?.email || undefined,
            customerTaxCode: tableSession.customer_tax_code || args.session?.metadata?.customerTaxCode || undefined,
            customerLotteryCode: tableSession.customer_lottery_code || args.session?.metadata?.customerLotteryCode || undefined,
        },
    };
}
