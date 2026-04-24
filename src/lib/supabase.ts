import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Variabili d\'ambiente Supabase mancanti. Controlla il file .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const originalInvoke = supabase.functions.invoke.bind(supabase.functions)

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
    try {
        sessionToken = localStorage.getItem('minthi_session_token')
    } catch {
        sessionToken = null
    }

    if (!sessionToken) {
        return originalInvoke(functionName, options)
    }

    return originalInvoke(functionName, {
        ...options,
        body: { ...body, sessionToken },
    })
}) as typeof supabase.functions.invoke
