/**
 * Shared authorization helpers for Edge Functions.
 * Verifies the Supabase anon key in the Authorization header.
 */

const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

/**
 * Verifies that the request contains a valid Authorization header
 * with the Supabase anon key (sent automatically by supabase.functions.invoke()).
 * Returns null if valid, or a Response with 401 if invalid.
 */
export function verifyApiKey(req: Request, corsHeaders: Record<string, string>): Response | null {
    const authHeader = req.headers.get('authorization') || req.headers.get('apikey') || ''
    const token = authHeader.replace('Bearer ', '')

    if (!SUPABASE_ANON_KEY || token !== SUPABASE_ANON_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    return null
}

/**
 * Allowed origins for redirect URLs (success_url, cancel_url, return_url).
 * Prevents open redirect attacks via Stripe checkout sessions.
 */
const ALLOWED_REDIRECT_ORIGINS = [
    'https://minthi.it',
    'https://www.minthi.it',
    'http://localhost:5173',
    'http://localhost:4173',
]

/**
 * Validates that a URL starts with one of the allowed origins.
 * Returns the URL if valid, or the fallback if invalid/missing.
 */
export function validateRedirectUrl(url: string | undefined | null, fallback: string): string {
    if (!url) return fallback
    try {
        const parsed = new URL(url)
        const origin = parsed.origin
        if (ALLOWED_REDIRECT_ORIGINS.includes(origin)) {
            return url
        }
    } catch {
        // Invalid URL
    }
    return fallback
}
