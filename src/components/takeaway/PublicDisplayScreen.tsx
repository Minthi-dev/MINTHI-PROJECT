import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { DatabaseService } from '@/services/DatabaseService'
import { ForkKnife, Bell } from '@phosphor-icons/react'

interface DisplayOrder {
    id: string
    pickup_number: number
    status: string
    ready_at: string | null
    created_at: string
}

export default function PublicDisplayScreen() {
    const { restaurantId } = useParams<{ restaurantId: string }>()
    const [orders, setOrders] = useState<DisplayOrder[]>([])
    const [restaurantName, setRestaurantName] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const lastReadyIds = useRef<Set<string>>(new Set())
    const audioCtxRef = useRef<AudioContext | null>(null)

    // Beep on new READY order
    const beep = () => {
        try {
            let ctx = audioCtxRef.current
            if (!ctx) {
                ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
                audioCtxRef.current = ctx
            }
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.frequency.value = 880
            osc.type = 'sine'
            osc.connect(gain)
            gain.connect(ctx.destination)
            gain.gain.setValueAtTime(0.0001, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05)
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.65)
        } catch {}
    }

    const refresh = async () => {
        if (!restaurantId) return
        try {
            const data = await DatabaseService.getTakeawayDisplay(restaurantId)
            setOrders(data as DisplayOrder[])
            // Detect newly READY
            const readyIds = new Set((data as DisplayOrder[]).filter(o => o.status === 'READY').map(o => o.id))
            for (const id of readyIds) {
                if (!lastReadyIds.current.has(id)) beep()
            }
            lastReadyIds.current = readyIds
        } catch (e) {
            console.error('[DISPLAY] fetch error', e)
        }
    }

    useEffect(() => {
        if (!restaurantId) return
        let alive = true
        ;(async () => {
            try {
                const info = await DatabaseService.getTakeawayRestaurantInfo(restaurantId)
                if (alive) setRestaurantName(info?.name || '')
            } catch { /* ignore */ }
            await refresh()
            if (alive) setLoading(false)
        })()
        const interval = setInterval(refresh, 8000)

        const channel = supabase.channel(`display_${restaurantId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, (payload: any) => {
                if (payload.new?.order_type === 'takeaway' || payload.old?.order_type === 'takeaway') {
                    refresh()
                }
            }).subscribe()

        // Keep screen awake (best-effort)
        let wakeLock: any = null
        ;(async () => {
            try { if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen') } catch {}
        })()

        return () => {
            alive = false
            clearInterval(interval)
            supabase.removeChannel(channel)
            if (wakeLock) try { wakeLock.release() } catch {}
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId])

    const preparing = orders.filter(o => o.status === 'PREPARING').slice().sort((a, b) => a.pickup_number - b.pickup_number)
    const ready = orders.filter(o => o.status === 'READY').slice().sort((a, b) => a.pickup_number - b.pickup_number)

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-amber-400 text-xl">Caricamento...</div>
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Header */}
            <header className="px-8 py-5 border-b border-white/10 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{restaurantName}</h1>
                    <p className="text-amber-400 text-sm uppercase tracking-[0.3em]">Ordini asporto</p>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-mono font-bold">{new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
            </header>

            {/* Two columns */}
            <main className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden">
                {/* In preparation */}
                <section className="p-6 md:p-10 flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                        <ForkKnife size={32} weight="fill" className="text-amber-400" />
                        <h2 className="text-3xl md:text-4xl font-bold text-amber-400 uppercase tracking-wider">In preparazione</h2>
                    </div>
                    {preparing.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-zinc-600">
                            <div className="text-center">
                                <ForkKnife size={56} className="mx-auto opacity-30 mb-2" />
                                <div className="text-sm uppercase tracking-widest">Nessun ordine</div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 content-start">
                            <AnimatePresence mode="popLayout">
                                {preparing.map(o => (
                                    <motion.div
                                        key={o.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.6 }}
                                        className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl py-6 text-center font-mono text-4xl md:text-5xl font-bold text-amber-300"
                                    >
                                        #{String(o.pickup_number).padStart(3, '0')}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </section>

                {/* Ready */}
                <section className="p-6 md:p-10 flex flex-col bg-emerald-950/40">
                    <div className="flex items-center gap-3 mb-6">
                        <Bell size={32} weight="fill" className="text-emerald-400 animate-pulse" />
                        <h2 className="text-3xl md:text-4xl font-bold text-emerald-400 uppercase tracking-wider">Pronti al ritiro</h2>
                    </div>
                    {ready.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-zinc-600">
                            <div className="text-center">
                                <Bell size={56} className="mx-auto opacity-30 mb-2" />
                                <div className="text-sm uppercase tracking-widest">Nessun ordine pronto</div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 content-start">
                            <AnimatePresence mode="popLayout">
                                {ready.map(o => (
                                    <motion.div
                                        key={o.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{
                                            opacity: 1,
                                            scale: [1, 1.05, 1],
                                        }}
                                        transition={{ scale: { repeat: Infinity, duration: 1.6 } }}
                                        exit={{ opacity: 0, scale: 0.6 }}
                                        className="bg-emerald-500/15 border-2 border-emerald-400 rounded-xl py-6 text-center font-mono text-4xl md:text-5xl font-bold text-emerald-300 shadow-[0_0_30px_-5px_rgba(16,185,129,0.6)]"
                                    >
                                        #{String(o.pickup_number).padStart(3, '0')}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </section>
            </main>

            <footer className="px-6 py-3 text-center text-xs text-zinc-600 border-t border-white/5">
                Scansiona il QR code al bancone per ordinare · Aggiornato in tempo reale
            </footer>
        </div>
    )
}
