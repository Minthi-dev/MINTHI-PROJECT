import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    return new Response(JSON.stringify({
        error: "Gestione prezzi abbonamento Stripe MINTHI disattivata.",
    }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
});
