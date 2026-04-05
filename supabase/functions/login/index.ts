import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

function verifyPassword(plaintext: string, storedHash: string): boolean {
    if (!storedHash) return false;
    if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
        return bcrypt.compareSync(plaintext, storedHash);
    }
    return false;
}

serve(async (req) => {
    const cors = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { ...cors, "Content-Type": "application/json" },
        });
    }

    try {
        const { username, password } = await req.json();

        if (!username || !password || typeof username !== "string" || typeof password !== "string") {
            return new Response(JSON.stringify({ error: "username e password richiesti" }), {
                status: 400,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        const trimmedUsername = username.trim().toLowerCase();

        // 1. Check users table (ADMIN / OWNER) - by name then email (case-insensitive)
        let { data: matchedUsers, error: usersError } = await supabase
            .from("users")
            .select("id, email, name, role, password_hash")
            .ilike("name", trimmedUsername)
            .limit(1);

        if (!matchedUsers || matchedUsers.length === 0) {
            const { data, error } = await supabase
                .from("users")
                .select("id, email, name, role, password_hash")
                .ilike("email", trimmedUsername)
                .limit(1);
            matchedUsers = data;
            usersError = error;
        }

        if (usersError) {
            console.error("[LOGIN] Error fetching user:", usersError);
            return new Response(JSON.stringify({ error: "Errore interno" }), {
                status: 500,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        const u = matchedUsers?.[0];
        if (u) {
            const passwordMatch = verifyPassword(password, u.password_hash || "");
            if (passwordMatch) {
                let restaurant_id: string | null = null;
                let restaurant_name: string | null = null;

                if (u.role === "OWNER") {
                    const { data: rest } = await supabase.rpc("get_restaurant_for_login", {
                        p_owner_id: u.id,
                    });
                    if (!rest) {
                        return new Response(
                            JSON.stringify({ error: "Nessun ristorante associato a questo account." }),
                            { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
                        );
                    }
                    if (rest.is_active === false) {
                        return new Response(
                            JSON.stringify({ error: "Il tuo ristorante è stato temporaneamente sospeso." }),
                            { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
                        );
                    }
                    restaurant_id = rest.id;
                    restaurant_name = rest.name;
                }

                return new Response(
                    JSON.stringify({
                        user: { id: u.id, name: u.name, email: u.email, role: u.role, restaurant_id },
                        restaurant_name,
                    }),
                    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
                );
            }
        }

        // 2. Check restaurant_staff — case-insensitive username
        const { data: staffList } = await supabase
            .from("restaurant_staff")
            .select("id, restaurant_id, name, username, password, is_active, restaurant:restaurants(id, name, waiter_mode_enabled, is_active)")
            .ilike("username", trimmedUsername)
            .eq("is_active", true)
            .limit(1);

        const staffData = staffList?.[0];

        if (staffData && staffData.password) {
            const staffMatch = verifyPassword(password, staffData.password);
            if (staffMatch) {
                const rest = staffData.restaurant as any;
                if (rest?.is_active === false) {
                    return new Response(
                        JSON.stringify({ error: "Ristorante temporaneamente sospeso." }),
                        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({
                        user: {
                            id: staffData.id,
                            name: staffData.name,
                            email: staffData.username + "@local",
                            role: "STAFF",
                            restaurant_id: rest?.id || staffData.restaurant_id,
                        },
                        restaurant_name: rest?.name,
                    }),
                    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
                );
            }
        }

        // 3. Legacy waiter login (slug_cameriere)
        if (trimmedUsername.includes("_cameriere")) {
            const [slug] = trimmedUsername.split("_cameriere");
            const { data: restaurants } = await supabase
                .from("restaurants")
                .select("id, name, waiter_mode_enabled, waiter_password, is_active")
                .eq("waiter_mode_enabled", true);

            const target = (restaurants || []).find(
                (r: any) => r.name.toLowerCase().replace(/\s+/g, "-") === slug
            );

            if (target && target.waiter_password) {
                if (target.is_active === false) {
                    return new Response(
                        JSON.stringify({ error: "Ristorante temporaneamente sospeso." }),
                        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }

                const waiterMatch = verifyPassword(password, target.waiter_password);
                if (waiterMatch) {
                    return new Response(
                        JSON.stringify({
                            user: {
                                id: crypto.randomUUID(),
                                name: "Cameriere",
                                email: `waiter@${slug}.local`,
                                role: "STAFF",
                                restaurant_id: target.id,
                            },
                            restaurant_name: target.name,
                        }),
                        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
                    );
                }
            }
        }

        return new Response(
            JSON.stringify({ error: "Credenziali non valide" }),
            { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[LOGIN] Unexpected error:", error);
        return new Response(JSON.stringify({ error: "Errore interno del server" }), {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" },
        });
    }
});
