import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || "re_BxHs15R4_5DGLqzQ6sSxwdUzQSDvmc6hF"

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
