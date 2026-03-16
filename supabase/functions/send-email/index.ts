import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY environment variable is not set')
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
    to: string[];
    subject: string;
    html: string;
    text?: string;
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (!RESEND_API_KEY) {
            return new Response(JSON.stringify({ error: "Servizio email non configurato" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        const { to, subject, html, text }: EmailRequest = await req.json()

        if (!to || !subject || !html) {
            throw new Error("Missing required fields: to, subject, html")
        }

        // Validate email recipients
        if (!Array.isArray(to) || to.length === 0 || to.length > 10) {
            throw new Error("Invalid recipients: must be an array of 1-10 email addresses")
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        for (const email of to) {
            if (typeof email !== 'string' || !emailRegex.test(email)) {
                throw new Error(`Invalid email address: ${email}`)
            }
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
        console.error("Send email error:", error.message)
        return new Response(JSON.stringify({ error: "Errore invio email" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
