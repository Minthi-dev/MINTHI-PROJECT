// Utilità HTTP condivise: CORS, risposte JSON, errori applicativi.

const ALLOWED_ORIGINS = new Set([
  "https://minthi.it",
  "https://www.minthi.it",
  "capacitor://localhost",
  "https://localhost",
]);

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://minthi.it",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export const badRequest = (message: string, code = "bad_request") => new HttpError(400, message, code);
export const unauthorized = (message = "Accesso richiesto.") => new HttpError(401, message, "unauthorized");
export const forbidden = (message = "Non autorizzato.") => new HttpError(403, message, "forbidden");
export const notFound = (message = "Non trovato.") => new HttpError(404, message, "not_found");

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

type Handler = (req: Request) => Promise<Response>;

/** Wrapper standard: OPTIONS, errori tipizzati, log degli imprevisti. */
export function handle(handler: Handler): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders(req) });
    }
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(req, { error: err.message, code: err.code }, err.status);
      }
      if (err && typeof err === "object" && "issues" in err) {
        return json(req, { error: "Dati non validi.", code: "validation", issues: (err as { issues: unknown }).issues }, 400);
      }
      console.error("[unhandled]", err);
      return json(req, { error: "Errore interno, riprova.", code: "internal" }, 500);
    }
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Corpo della richiesta non valido.");
  }
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return value;
}

export function money(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export function appUrl(): string {
  return (Deno.env.get("MINTHI_APP_URL") ?? "https://minthi.it").replace(/\/$/, "");
}

/** Usa l'origine della richiesta se è tra quelle ammesse (preview Vercel, localhost). */
export function returnBaseUrl(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  return isAllowedOrigin(origin) && !origin.startsWith("capacitor") ? origin : appUrl();
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function requireInternalKey(req: Request): void {
  const expected = Deno.env.get("MINTHI_INTERNAL_KEY") ?? "";
  const provided = req.headers.get("x-minthi-internal-key") ?? "";
  if (!expected || !constantTimeEqual(provided, expected)) throw forbidden();
}
