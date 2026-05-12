import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    return new Response(JSON.stringify({
        error: "Checkout abbonamento MINTHI disattivato. Stripe resta attivo solo per pagamenti clienti verso ristoratori.",
    }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
});
