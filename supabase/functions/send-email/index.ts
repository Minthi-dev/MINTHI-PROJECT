import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from "../_shared/cors.ts"
import { verifyApiKey } from "../_shared/auth.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY environment variable is not set')
}

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

    const authError = verifyApiKey(req, corsHeaders)
    if (authError) return authError

    try {
        const { to, subject, html, text }: EmailRequest = await req.json()

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
