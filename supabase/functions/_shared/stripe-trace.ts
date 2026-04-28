export function stripeId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object" && typeof (value as any).id === "string") return (value as any).id;
    return null;
}

function cleanUrl(value: unknown): string | null {
    if (typeof value !== "string") return null;
    if (!/^https:\/\/.+/i.test(value)) return null;
    return value.slice(0, 500);
}

export function stripePaymentTraceFromSession(session: any): Record<string, unknown> {
    const paymentIntent = session?.payment_intent;
    const charge = typeof paymentIntent === "object" ? paymentIntent?.latest_charge : null;
    const paymentMethodDetails = typeof charge === "object" ? charge?.payment_method_details : null;
    const paymentMethodType = paymentMethodDetails?.type
        || (Array.isArray(session?.payment_method_types) ? session.payment_method_types[0] : null);

    return {
        provider: "stripe",
        checkout_session_id: stripeId(session),
        payment_intent_id: stripeId(paymentIntent),
        charge_id: stripeId(charge),
        receipt_url: cleanUrl(typeof charge === "object" ? charge?.receipt_url : null),
        payment_method_type: paymentMethodType || null,
        amount_total: typeof session?.amount_total === "number" ? session.amount_total : null,
        currency: typeof session?.currency === "string" ? session.currency : null,
        livemode: typeof session?.livemode === "boolean" ? session.livemode : null,
    };
}

export function compactStripeTrace(trace: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!trace) return null;
    const entries = Object.entries(trace).filter(([, value]) => value !== null && value !== undefined && value !== "");
    return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export async function recordTableStripePayment(
    supabase: any,
    args: {
        restaurantId: string;
        tableSessionId: string;
        amount: number;
        session: any;
        trace?: Record<string, unknown> | null;
    }
) {
    const trace = compactStripeTrace(args.trace || stripePaymentTraceFromSession(args.session));
    const stripeSessionId = String(trace?.checkout_session_id || args.session?.id || "").trim();
    if (!stripeSessionId) return;

    const row = {
        restaurant_id: args.restaurantId,
        table_session_id: args.tableSessionId,
        provider: "stripe",
        status: "succeeded",
        amount: Math.round(Number(args.amount || 0) * 100) / 100,
        currency: String(trace?.currency || args.session?.currency || "eur").toLowerCase(),
        stripe_session_id: stripeSessionId,
        stripe_payment_intent_id: trace?.payment_intent_id || null,
        stripe_charge_id: trace?.charge_id || null,
        stripe_receipt_url: trace?.receipt_url || null,
        payment_method_type: trace?.payment_method_type || null,
        raw_trace: trace || {},
    };

    const { error } = await supabase
        .from("table_session_payments")
        .upsert(row, { onConflict: "stripe_session_id" });
    if (error) {
        console.warn("[stripe-trace] record table payment failed:", error.message || error);
    }
}
