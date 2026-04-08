import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { getCorsHeaders } from "../_shared/cors.ts"
import { verifyAccess } from "../_shared/auth.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY environment variable is not set')
}

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

interface EmailRequest {
    to: string[];
    subject: string;
    html: string;
    text?: string;
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req)

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { userId, to, subject, html, text } = await req.json() as EmailRequest & { userId?: string }

        if (!userId) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
        }
        const access = await verifyAccess(supabase, userId)
        if (!access.valid) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
                status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
        }

        if (!to || !subject || !html) {
            throw new Error("Missing required fields: to, subject, html")
        }

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'EASYFOOD <onboarding@resend.dev>',
                to: to,
                subject: subject,
                html: html,
                text: text
            }),
        })

        if (!res.ok) {
            const errorText = await res.text()
            throw new Error(`Resend API Error: ${res.status} - ${errorText}`)
        }

        const data = await res.json()

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
