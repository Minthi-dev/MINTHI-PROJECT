const allowedOrigins = [
    "https://minthi.it",
    "https://www.minthi.it",
    "http://localhost:5173",
    "http://localhost:5174",
];

export function getCorsHeaders(req?: Request) {
    const origin = req?.headers?.get("origin") || "";
    const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
}

// UUID validation helper
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(value: unknown): value is string {
    return typeof value === "string" && UUID_RE.test(value);
}

// Backwards-compatible export for existing edge functions
export const corsHeaders = {
    "Access-Control-Allow-Origin": "https://minthi.it",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
