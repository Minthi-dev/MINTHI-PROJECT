import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { getCorsHeaders, isValidUUID } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

// Genera un nome univoco per il coupon basato sui parametri
function couponName(percentOff: number, duration: string, durationMonths?: number): string {
    if (duration === "forever") return `MINTHI_${percentOff}_FOREVER`;
    if (duration === "once") return `MINTHI_${percentOff}_ONCE`;
    return `MINTHI_${percentOff}_${durationMonths}M`;
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    try {
        const { percent_off, duration, duration_in_months } = await req.json();

        if (!percent_off || !duration) {
            return new Response(JSON.stringify({ error: "Mancano percent_off o duration" }), {
                status: 400,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        const name = couponName(percent_off, duration, duration_in_months);

        // Cerca coupon Stripe esistente con stesso nome
        let existingCoupon = null;
        try {
            const coupons = await stripe.coupons.list({ limit: 100 });
            existingCoupon = coupons.data.find(
                (c) => c.name === name && c.valid
            );
        } catch (_) {
            // ignore list errors
        }

        if (existingCoupon) {
            return new Response(JSON.stringify({ couponId: existingCoupon.id }), {
                headers: { ...cors, "Content-Type": "application/json" },
                status: 200,
            });
        }

        // Crea nuovo coupon
        const couponParams: Stripe.CouponCreateParams = {
            name,
            percent_off,
            duration: duration === "once" || duration === "forever" ? duration : "repeating",
            ...(duration !== "once" && duration !== "forever"
                ? { duration_in_months: duration_in_months || 1 }
                : {}),
        };

        const coupon = await stripe.coupons.create(couponParams);

        return new Response(JSON.stringify({ couponId: coupon.id }), {
            headers: { ...cors, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error) {
        console.error("Errore stripe-create-coupon:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...cors, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
