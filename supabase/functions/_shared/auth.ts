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
    // supabase.functions.invoke() sends the anon key in the 'apikey' header,
    // and either the anon key (unauthenticated) or the user's access token
    // (authenticated) in the 'Authorization' header. We accept the request
    // if EITHER header carries the anon key.
    const authToken = (req.headers.get('authorization') || '').replace('Bearer ', '')
    const apiKeyToken = (req.headers.get('apikey') || '').replace('Bearer ', '')

    if (!SUPABASE_ANON_KEY || (authToken !== SUPABASE_ANON_KEY && apiKeyToken !== SUPABASE_ANON_KEY)) {
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

/**
 * Verifies user access to a restaurant.
 * Checks users table (ADMIN/OWNER) and restaurant_staff (STAFF).
 */
export async function verifyAccess(
    supabase: any,
    userId: string,
    restaurantId?: string
): Promise<{
    valid: boolean;
    role: string | null;
    isAdmin: boolean;
    isOwner: boolean;
    isStaff: boolean;
    staffRestaurantId?: string;
}> {
    const deny = { valid: false, role: null, isAdmin: false, isOwner: false, isStaff: false };

    // 1. Check users table (ADMIN / OWNER)
    const { data: user } = await supabase
        .from("users").select("id, role").eq("id", userId).maybeSingle();

    if (user) {
        if (user.role === "ADMIN") {
            return { valid: true, role: "ADMIN", isAdmin: true, isOwner: false, isStaff: false };
        }
        if (restaurantId) {
            const { data: rest } = await supabase
                .from("restaurants").select("owner_id").eq("id", restaurantId).maybeSingle();
            if (rest && rest.owner_id === userId) {
                return { valid: true, role: "OWNER", isAdmin: false, isOwner: true, isStaff: false };
            }
        }
        return { ...deny, role: user.role };
    }

    // 2. Check restaurant_staff (STAFF)
    const { data: staff } = await supabase
        .from("restaurant_staff").select("id, restaurant_id, is_active")
        .eq("id", userId).eq("is_active", true).maybeSingle();

    if (staff && (!restaurantId || staff.restaurant_id === restaurantId)) {
        return { valid: true, role: "STAFF", isAdmin: false, isOwner: false, isStaff: true, staffRestaurantId: staff.restaurant_id };
    }

    return deny;
}
