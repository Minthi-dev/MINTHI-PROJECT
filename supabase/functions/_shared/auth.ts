/**
 * Shared authorization helpers for Edge Functions.
 * Verifies the Supabase anon key in the Authorization header.
 */

const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SESSION_TTL_DAYS = Number(Deno.env.get('MINTHI_SESSION_TTL_DAYS') || '14')

type AppSession = {
    user_id: string
    role: 'ADMIN' | 'OWNER' | 'STAFF'
    restaurant_id: string | null
    expires_at: string
    revoked_at: string | null
}

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

function sessionSecret(): string {
    return Deno.env.get('MINTHI_SESSION_SECRET') ||
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
        Deno.env.get('SUPABASE_ANON_KEY') ||
        'minthi-session-fallback'
}

function randomToken(): string {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashSessionToken(token: string): Promise<string> {
    return sha256Hex(`${sessionSecret()}:${token}`)
}

export async function createAppSession(
    supabase: any,
    params: { userId: string; role: 'ADMIN' | 'OWNER' | 'STAFF'; restaurantId?: string | null }
): Promise<{ sessionToken: string; expiresAt: string }> {
    const sessionToken = randomToken()
    const tokenHash = await hashSessionToken(sessionToken)
    const expiresAt = new Date(Date.now() + Math.max(1, SESSION_TTL_DAYS) * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase.from('app_sessions').insert({
        user_id: params.userId,
        role: params.role,
        restaurant_id: params.restaurantId ?? null,
        token_hash: tokenHash,
        expires_at: expiresAt,
    })

    if (error) {
        console.error('[AUTH] createAppSession error:', error)
        throw new Error('Impossibile creare la sessione')
    }

    return { sessionToken, expiresAt }
}

export async function revokeAppSession(
    supabase: any,
    userId: string,
    sessionToken?: string | null
): Promise<void> {
    if (!userId || !sessionToken) return
    const tokenHash = await hashSessionToken(sessionToken)
    await supabase
        .from('app_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
}

export async function verifySessionToken(
    supabase: any,
    userId: string,
    sessionToken?: string | null
): Promise<{ valid: boolean; session?: AppSession }> {
    if (!userId || !sessionToken || typeof sessionToken !== 'string' || sessionToken.length < 32) {
        return { valid: false }
    }

    const tokenHash = await hashSessionToken(sessionToken)
    const { data: session, error } = await supabase
        .from('app_sessions')
        .select('user_id, role, restaurant_id, expires_at, revoked_at')
        .eq('user_id', userId)
        .eq('token_hash', tokenHash)
        .maybeSingle()

    if (error || !session) return { valid: false }
    if (session.revoked_at) return { valid: false }
    if (new Date(session.expires_at).getTime() <= Date.now()) return { valid: false }

    return { valid: true, session: session as AppSession }
}

/**
 * Verifies user access to a restaurant.
 * Checks users table (ADMIN/OWNER) and restaurant_staff (STAFF).
 */
export async function verifyAccess(
    supabase: any,
    userId: string,
    restaurantId?: string,
    sessionToken?: string | null
): Promise<{
    valid: boolean;
    role: string | null;
    isAdmin: boolean;
    isOwner: boolean;
    isStaff: boolean;
    staffRestaurantId?: string;
}> {
    const deny = { valid: false, role: null, isAdmin: false, isOwner: false, isStaff: false };

    const sessionResult = await verifySessionToken(supabase, userId, sessionToken)
    if (!sessionResult.valid || !sessionResult.session) {
        console.warn(`[AUTH] verifyAccess deny: session invalid userId=${userId} hasToken=${!!sessionToken}`)
        return deny
    }
    const appSession = sessionResult.session

    // 1. Check users table (ADMIN / OWNER)
    const { data: user } = await supabase
        .from("users").select("id, role").eq("id", userId).maybeSingle();

    if (user) {
        if (user.role === "ADMIN" && appSession.role === "ADMIN") {
            return { valid: true, role: "ADMIN", isAdmin: true, isOwner: false, isStaff: false };
        }
        if (user.role === "OWNER" && appSession.role === "OWNER" && restaurantId) {
            if (appSession.restaurant_id && appSession.restaurant_id !== restaurantId) {
                console.warn(`[AUTH] verifyAccess deny OWNER: session.restaurant=${appSession.restaurant_id} req.restaurant=${restaurantId}`)
                return { ...deny, role: "OWNER" }
            }
            const { data: rest } = await supabase
                .from("restaurants").select("owner_id").eq("id", restaurantId).maybeSingle();
            if (rest && rest.owner_id === userId) {
                return { valid: true, role: "OWNER", isAdmin: false, isOwner: true, isStaff: false };
            }
            // Fallback robust: il ristorante esiste ma owner_id è null o
            // disallineato. Se la app_session è stata creata col login
            // OWNER e collegata a questo restaurantId, il ristorante è
            // legittimamente del chiamante. Validiamo via session.
            if (rest && appSession.restaurant_id === restaurantId) {
                console.warn(`[AUTH] verifyAccess OWNER fallback via session: rest.owner_id=${rest.owner_id} userId=${userId} session.restaurant=${appSession.restaurant_id}`)
                return { valid: true, role: "OWNER", isAdmin: false, isOwner: true, isStaff: false };
            }
            console.warn(`[AUTH] verifyAccess deny OWNER: rest=${JSON.stringify(rest)} userId=${userId} session.restaurant=${appSession.restaurant_id}`)
        }
        if (user.role === "OWNER" && appSession.role === "OWNER" && !restaurantId) {
            return { valid: true, role: "OWNER", isAdmin: false, isOwner: true, isStaff: false, staffRestaurantId: appSession.restaurant_id ?? undefined };
        }
        console.warn(`[AUTH] verifyAccess deny: user.role=${user.role} session.role=${appSession.role} restaurantId=${restaurantId}`)
        return { ...deny, role: user.role };
    }

    // 2. Check restaurant_staff (STAFF)
    const { data: staff } = await supabase
        .from("restaurant_staff").select("id, restaurant_id, is_active")
        .eq("id", userId).eq("is_active", true).maybeSingle();

    if (staff && appSession.role === "STAFF" && (!restaurantId || staff.restaurant_id === restaurantId) && (!appSession.restaurant_id || appSession.restaurant_id === staff.restaurant_id)) {
        return { valid: true, role: "STAFF", isAdmin: false, isOwner: false, isStaff: true, staffRestaurantId: staff.restaurant_id };
    }

    // Legacy waiter sessions are not backed by restaurant_staff rows. They are
    // still server-created and scoped to a single restaurant via app_sessions.
    if (!staff && appSession.role === "STAFF" && appSession.restaurant_id && (!restaurantId || appSession.restaurant_id === restaurantId)) {
        return { valid: true, role: "STAFF", isAdmin: false, isOwner: false, isStaff: true, staffRestaurantId: appSession.restaurant_id };
    }

    console.warn(`[AUTH] verifyAccess deny final: userId=${userId} session.role=${appSession.role} session.restaurant=${appSession.restaurant_id} req.restaurant=${restaurantId} hasStaff=${!!staff}`)
    return deny;
}
