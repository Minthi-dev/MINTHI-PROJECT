import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Variabili d\'ambiente Supabase mancanti. Controlla il file .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const originalInvoke = supabase.functions.invoke.bind(supabase.functions)

// Esponiamo un flag per evitare loop di redirect quando più chiamate
// concorrenti rilevano la sessione stale contemporaneamente.
let isHandlingStaleSession = false

function forceReloginForStaleSession(): Promise<never> {
    if (!isHandlingStaleSession) {
        isHandlingStaleSession = true
        try {
            localStorage.removeItem('minthi_user')
            localStorage.removeItem('minthi_session_token')
            localStorage.removeItem('minthi_session_expires_at')
        } catch { /* ignore */ }
        // Reload pulito → l'utente atterra automaticamente sulla pagina
        // di login. Una volta che digita le credenziali, tutto torna OK.
        try {
            const w = (typeof window !== 'undefined') ? window : null
            if (w) {
                // Toast nativo: alcune route potrebbero non avere sonner montato
                // al momento del redirect, quindi messaggio via alert leggero.
                setTimeout(() => { w.location.replace(w.location.origin + '/') }, 50)
            }
        } catch { /* ignore */ }
    }
    return Promise.reject(new Error('Sessione scaduta. Accedi di nuovo per continuare.'))
}

async function isAuthFailure(invokeResult: any): Promise<boolean> {
    const data = invokeResult?.data
    const error = invokeResult?.error
    // FunctionsHttpError carries the original Response in error.context
    const ctx: any = error?.context
    if (ctx && typeof ctx.status === 'number' && (ctx.status === 401 || ctx.status === 403)) {
        try {
            const cloned = typeof ctx.clone === 'function' ? ctx.clone() : null
            if (cloned) {
                const txt = await cloned.text()
                const lower = txt.toLowerCase()
                if (lower.includes('non autorizzato') || lower.includes('unauthorized') || lower.includes('auth richiesta')) {
                    return true
                }
            }
        } catch { /* ignore */ }
        return true
    }
    if (data && typeof data === 'object') {
        const errMsg = String((data as any).error || '').toLowerCase()
        if (errMsg.includes('non autorizzato') || errMsg.includes('unauthorized')) return true
    }
    return false
}

supabase.functions.invoke = ((functionName: string, options?: any) => {
    const body = options?.body
    const shouldAttachSession =
        body &&
        typeof body === 'object' &&
        !(body instanceof FormData) &&
        'userId' in body &&
        !('sessionToken' in body)

    if (!shouldAttachSession) {
        return originalInvoke(functionName, options)
    }

    let sessionToken: string | null = null
    let hasUser = false
    try {
        sessionToken = localStorage.getItem('minthi_session_token')
        hasUser = !!localStorage.getItem('minthi_user')
    } catch {
        sessionToken = null
    }

    // Stale-session guard: l'utente ha minthi_user (sembra loggato) ma
    // manca minthi_session_token. È lo stato di chi era loggato prima
    // del rollout del session token. Le edge function rifiuteranno
    // ogni chiamata. Forziamo subito un re-login pulito invece di
    // bombardare il backend con richieste non autorizzate.
    if (!sessionToken && hasUser) {
        return forceReloginForStaleSession()
    }

    if (!sessionToken) {
        // Caso normale: nessuno è loggato, lasciamo che la chiamata
        // proceda e l'edge function dichiari l'errore appropriato.
        return originalInvoke(functionName, options)
    }

    // Funzioni che gestiscono l'autenticazione direttamente: NON forzare
    // logout su 401/403 perché significherebbe loop infinito al login.
    const skipAutoRelogin = new Set(['login'])
    const skipName = functionName.split('/').pop() || functionName

    return (async () => {
        const result = await originalInvoke(functionName, {
            ...options,
            body: { ...body, sessionToken },
        })
        // Se la edge function ha rifiutato il sessionToken (token revocato,
        // expired, o segreto cambiato lato server), invalida lo stato
        // locale e manda al login. Senza questa logica l'utente resta in
        // uno stato "loggato ma 403 ovunque" e deve fare logout a mano.
        if (!skipAutoRelogin.has(skipName) && (await isAuthFailure(result))) {
            return forceReloginForStaleSession()
        }
        return result
    })()
}) as typeof supabase.functions.invoke
