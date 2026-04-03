const ALLOWED_ORIGINS = [
    "https://minthi.it",
    "https://www.minthi.it",
    "http://localhost:5173",
    "http://localhost:4173",
];

export function getCorsHeaders(req?: Request) {
    const origin = req?.headers?.get("origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
}

// Backwards-compatible default (for functions that don't pass req)
export const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
