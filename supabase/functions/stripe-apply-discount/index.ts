import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10" as any,
    httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

function couponName(percentOff: number, duration: string, durationMonths?: number): string {
    if (duration === "forever") return `MINTHI_${percentOff}_FOREVER`;
    if (duration === "once") return `MINTHI_${percentOff}_ONCE`;
    return `MINTHI_${percentOff}_${durationMonths}M`;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { restaurantId, discountPercent, discountDuration, discountDurationMonths, reason, grantedBy } = await req.json();

        if (!restaurantId || !discountPercent || !discountDuration) {
            return new Response(JSON.stringify({ error: "Mancano parametri obbligatori" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Recupera il ristorante
        const { data: restaurant } = await supabase
            .from("restaurants")
            .select("stripe_subscription_id, stripe_customer_id")
            .eq("id", restaurantId)
            .single();

        if (!restaurant?.stripe_subscription_id) {
            return new Response(JSON.stringify({ error: "Il ristorante non ha un abbonamento attivo" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Crea o trova il coupon Stripe
        const name = couponName(discountPercent, discountDuration, discountDurationMonths);
        let couponId: string;

        try {
            const coupons = await stripe.coupons.list({ limit: 100 });
            const existing = coupons.data.find((c) => c.name === name && c.valid);
            if (existing) {
                couponId = existing.id;
            } else {
                const coupon = await stripe.coupons.create({
                    name,
                    percent_off: discountPercent,
                    duration: discountDuration === "once" || discountDuration === "forever"
                        ? discountDuration
                        : "repeating",
                    ...(discountDuration !== "once" && discountDuration !== "forever"
                        ? { duration_in_months: discountDurationMonths || 1 }
                        : {}),
                });
                couponId = coupon.id;
            }
        } catch (err) {
            console.error("Errore creazione coupon:", err);
            return new Response(JSON.stringify({ error: "Errore creazione coupon Stripe: " + err.message }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Applica il coupon all'abbonamento Stripe esistente
        await stripe.subscriptions.update(restaurant.stripe_subscription_id, {
            coupon: couponId,
        });

        // Disattiva eventuali sconti precedenti in DB
        await supabase
            .from("restaurant_discounts")
            .update({ is_active: false })
            .eq("restaurant_id", restaurantId)
            .eq("is_active", true);

        // Salva il nuovo sconto
        await supabase.from("restaurant_discounts").insert({
            restaurant_id: restaurantId,
            stripe_coupon_id: couponId,
            discount_percent: discountPercent,
            discount_duration: discountDuration,
            discount_duration_months: discountDurationMonths || null,
            reason: reason || null,
            granted_by: grantedBy || null,
            is_active: true,
            banner_dismissed: false,
        });

        console.log(`Sconto ${discountPercent}% applicato a ristorante ${restaurantId}`);

        return new Response(JSON.stringify({ success: true, couponId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error) {
        console.error("Errore stripe-apply-discount:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
