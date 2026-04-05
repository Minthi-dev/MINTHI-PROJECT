import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { hash as bcryptHash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        const { userId, action, data, targetUserId } = await req.json();
        const json = (body: any, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

        if (!userId || !action) return json({ error: "Parametri mancanti" }, 400);

        // Only ADMIN can manage users
        const { data: caller } = await supabase.from("users").select("id, role").eq("id", userId).maybeSingle();
        if (!caller || caller.role !== "ADMIN") return json({ error: "Non autorizzato: solo admin" }, 403);

        switch (action) {
            case "create": {
                if (!data) return json({ error: "data richiesto" }, 400);
                const payload = { ...data };
                if (payload.password) {
                    payload.password_hash = await bcryptHash(payload.password);
                    delete payload.password;
                }
                const { error } = await supabase.from("users").insert(payload);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "update": {
                const id = targetUserId || data?.id;
                if (!id || !data) return json({ error: "id e data richiesti" }, 400);
                const payload = { ...data };
                delete payload.id;
                if (payload.password) {
                    payload.password_hash = await bcryptHash(payload.password);
                    delete payload.password;
                }
                const { error } = await supabase.from("users").update(payload).eq("id", id);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            case "delete": {
                const id = targetUserId || data?.id;
                if (!id) return json({ error: "targetUserId richiesto" }, 400);
                if (id === userId) return json({ error: "Non puoi eliminare te stesso" }, 400);
                const { error } = await supabase.from("users").delete().eq("id", id);
                if (error) return json({ error: error.message }, 500);
                break;
            }
            default:
                return json({ error: `Azione non riconosciuta: ${action}` }, 400);
        }

        return json({ success: true });
    } catch (error: any) {
        console.error("[SECURE-USER] Errore:", error);
        return new Response(JSON.stringify({ error: error.message || "Errore interno" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
