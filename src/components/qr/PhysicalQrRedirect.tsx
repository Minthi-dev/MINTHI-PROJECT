import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

/**
 * Landing page for physical printed QR codes that encode minthi.it/qr/{code}.
 *
 * Resolves the slug to a restaurant id via the public edge function
 * `resolve-qr-code`, then replaces the URL with the takeaway menu. If the
 * code is unassigned or invalid, shows a friendly message instead of a
 * confusing 404.
 */
export default function PhysicalQrRedirect() {
    const { code } = useParams<{ code: string }>()
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)
    const [waiting, setWaiting] = useState(true)

    useEffect(() => {
        let cancelled = false
        const run = async () => {
            const cleanCode = (code || '').trim().toLowerCase()
            if (!cleanCode) {
                setError('Codice QR non valido')
                setWaiting(false)
                return
            }
            try {
                const { data, error: invokeError } = await supabase.functions.invoke('resolve-qr-code', {
                    body: { code: cleanCode },
                })
                if (cancelled) return
                if (invokeError) {
                    setError("Impossibile aprire il QR. Verifica la connessione e riprova.")
                    setWaiting(false)
                    return
                }
                if (!data || data.error) {
                    setError(data?.error || 'QR non riconosciuto')
                    setWaiting(false)
                    return
                }
                if (!data.assigned || !data.restaurant?.id) {
                    setError(data.message || 'Questo QR non è ancora attivo')
                    setWaiting(false)
                    return
                }
                navigate(`/client/takeaway/${data.restaurant.id}`, { replace: true })
            } catch (err: any) {
                if (cancelled) return
                console.error('[PhysicalQrRedirect] error:', err)
                setError('Errore inatteso. Riprova fra un momento.')
                setWaiting(false)
            }
        }
        run()
        return () => { cancelled = true }
    }, [code, navigate])

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-amber-50 px-6 text-center">
            {waiting ? (
                <>
                    <div className="w-16 h-16 mb-6 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
                    <h1 className="text-2xl font-light tracking-[0.25em] uppercase">
                        min<span className="font-bold text-emerald-400">thi</span>
                    </h1>
                    <p className="text-sm text-zinc-400 mt-4">Apertura del menu in corso...</p>
                </>
            ) : (
                <>
                    <h1 className="text-2xl font-light tracking-[0.25em] uppercase mb-4">
                        min<span className="font-bold text-emerald-400">thi</span>
                    </h1>
                    <p className="text-base text-zinc-200 max-w-md">{error}</p>
                    <p className="text-xs text-zinc-500 mt-6">
                        Se sei un commerciante e vuoi attivare questo QR, contatta l'assistenza.
                    </p>
                </>
            )}
        </div>
    )
}
