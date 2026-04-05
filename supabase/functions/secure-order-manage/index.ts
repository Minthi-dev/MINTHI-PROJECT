import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        const { userId, action, sessionId, orderIds, paymentMethod } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti" }, 400);

        // Determine restaurantId from session or orders
        let restaurantId: string | null = null;

        if (sessionId) {
            const { data: session } = await supabase
                .from("table_sessions").select("restaurant_id").eq("id", sessionId).maybeSingle();
            restaurantId = session?.restaurant_id || null;
        } else if (orderIds && orderIds.length > 0) {
            const { data: order } = await supabase
                .from("orders").select("restaurant_id").eq("id", orderIds[0]).maybeSingle();
            restaurantId = order?.restaurant_id || null;
        }

        if (!restaurantId) return json({ error: "Sessione o ordini non trovati" }, 404);

        // Verify caller has access to this restaurant (owner, admin, or staff)
        const access = await verifyAccess(supabase, userId, restaurantId);
        if (!access.valid) return json({ error: "Non autorizzato" }, 403);

        switch (action) {
            case "mark_paid_session": {
                if (!sessionId) return json({ error: "sessionId richiesto" }, 400);
                const pm = paymentMethod || "cash";
                const { error } = await supabase
                    .from("orders")
                    .update({ status: "PAID", payment_method: pm, closed_at: new Date().toISOString() })
                    .eq("table_session_id", sessionId)
                    .neq("status", "PAID");
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "cancel_session": {
                if (!sessionId) return json({ error: "sessionId richiesto" }, 400);
                const { error } = await supabase
                    .from("orders")
                    .update({ status: "CANCELLED", closed_at: new Date().toISOString() })
                    .eq("table_session_id", sessionId)
                    .neq("status", "PAID")
                    .neq("status", "COMPLETED");
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "mark_paid_stripe": {
                if (!orderIds || orderIds.length === 0) return json({ error: "orderIds richiesto" }, 400);
                const { error } = await supabase
                    .from("orders")
                    .update({ status: "PAID", payment_method: "stripe", closed_at: new Date().toISOString() })
                    .in("id", orderIds);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-ORDER] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
