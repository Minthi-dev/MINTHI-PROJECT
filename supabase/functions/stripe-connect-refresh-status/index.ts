import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = new Stripe(stripeKey, {
  apiVersion: "2026-02-25.clover" as any,
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, restaurantId, sessionToken } = await req.json();

    if (!restaurantId) {
      return new Response(JSON.stringify({ error: "restaurantId richiesto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
    if (!access.valid) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: restaurant, error: dbError } = await supabase
      .from("restaurants")
      .select("stripe_connect_account_id")
      .eq("id", restaurantId)
      .single();

    if (dbError || !restaurant) {
      return new Response(JSON.stringify({ error: "Ristorante non trovato" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!restaurant.stripe_connect_account_id) {
      return new Response(JSON.stringify({ error: "L'account non ha Stripe Connect" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let account: any;
    try {
      account = await stripe.accounts.retrieve(restaurant.stripe_connect_account_id);
    } catch (retrieveErr: any) {
      console.warn("Stripe account non valido, resetto collegamento:", retrieveErr?.message || retrieveErr);
      await supabase
        .from("restaurants")
        .update({ stripe_connect_account_id: null, stripe_connect_enabled: false })
        .eq("id", restaurantId)
        .eq("stripe_connect_account_id", restaurant.stripe_connect_account_id);

      return new Response(JSON.stringify({
        enabled: false,
        needsReconnect: true,
        error: "Account Stripe da ricollegare in modalità reale.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { error: updateErr } = await supabase
      .from("restaurants")
      .update({ stripe_connect_enabled: account.charges_enabled === true })
      .eq("id", restaurantId);

    if (updateErr) {
      console.error("DB update error:", updateErr.message);
    }

    return new Response(JSON.stringify({ enabled: account.charges_enabled === true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Errore Stripe Connect Refresh:", error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
