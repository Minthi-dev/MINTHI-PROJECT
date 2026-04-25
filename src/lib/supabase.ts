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

    return originalInvoke(functionName, {
        ...options,
        body: { ...body, sessionToken },
    })
}) as typeof supabase.functions.invoke
