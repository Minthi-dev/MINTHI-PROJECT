import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { DatabaseService } from '@/services/DatabaseService'
import type { Order } from '@/services/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShoppingBag, Timer, Bell, ForkKnife, CheckCircle, Wallet, CreditCard, Trash, Receipt, CaretRight, Copy, Package, User as UserIcon } from '@phosphor-icons/react'
import TakeawayPaymentDialog from './TakeawayPaymentDialog'
import TakeawayQRPosterButton from './TakeawayQRPosterButton'

interface Props {
    restaurantId: string
    restaurantName?: string
    onPrintOrder?: (order: Order) => void
}

type Tab = 'queue' | 'ready' | 'closed'

const statusMeta: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'In attesa pagamento', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    PREPARING: { label: 'In preparazione', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    READY: { label: 'Pronto', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    PICKED_UP: { label: 'Ritirato', color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' },
    PAID: { label: 'Completato', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    CANCELLED: { label: 'Annullato', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
}

function orderDue(order: Order) {
    const total = Number(order.total_amount || 0)
    const paid = Number(order.paid_amount || 0)
    return Math.max(0, Math.round((total - paid) * 100) / 100)
}

export default function TakeawayOrdersPanel({ restaurantId, restaurantName, onPrintOrder }: Props) {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Tab>('queue')
    const [selected, setSelected] = useState<Order | null>(null)
    const [payOpen, setPayOpen] = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)

    const refresh = useCallback(async () => {
        try {
            const data = await DatabaseService.getTakeawayOrders(restaurantId)
            setOrders(data as Order[])
        } catch (e: any) {
            console.error(e)
        }
    }, [restaurantId])

    useEffect(() => {
        let alive = true
        ;(async () => {
            setLoading(true)
            await refresh()
            if (alive) setLoading(false)
        })()
        const channel = supabase.channel(`takeaway_panel_${restaurantId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, (payload: any) => {
                if (payload.new?.order_type === 'takeaway' || payload.old?.order_type === 'takeaway') refresh()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => refresh())
            .subscribe()
        const interval = setInterval(refresh, 15000)
        return () => {
            alive = false
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [restaurantId, refresh])

    const grouped = useMemo(() => {
        const queue = orders.filter(o => o.status === 'PENDING' || o.status === 'PREPARING')
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const ready = orders.filter(o => o.status === 'READY')
            .sort((a, b) => new Date(a.ready_at || a.created_at).getTime() - new Date(b.ready_at || b.created_at).getTime())
        const closed = orders.filter(o => o.status === 'PAID' || o.status === 'PICKED_UP')
            .sort((a, b) => new Date(b.closed_at || b.created_at).getTime() - new Date(a.closed_at || a.created_at).getTime())
            .slice(0, 30)
        return { queue, ready, closed }
    }, [orders])

    const visible = grouped[tab]

    const changeStatus = async (o: Order, next: 'PREPARING' | 'READY' | 'PICKED_UP' | 'CANCELLED') => {
        try {
            await DatabaseService.updateTakeawayStatus(o.id, next)
            if (next === 'PICKED_UP') {
                toast.success(`#${String(o.pickup_number || 0).padStart(3, '0')} consegnato \u2014 rimosso dal display`, {
                    duration: 2500,
                })
            } else if (next === 'READY') {
                toast.success(`#${String(o.pickup_number || 0).padStart(3, '0')} pronto al ritiro`)
            } else if (next === 'PREPARING') {
                toast.success('In preparazione')
            } else {
                toast.success('Stato aggiornato')
            }
        } catch (e: any) {
            toast.error(e?.message || 'Errore')
        }
    }

    const openPayment = (o: Order) => { setSelected(o); setPayOpen(true) }
    const openDetail = (o: Order) => { setSelected(o); setDetailOpen(true) }

    const copyPickupLink = (o: Order) => {
        const url = `${window.location.origin}/client/takeaway/${restaurantId}/order/${o.pickup_code}`
        navigator.clipboard.writeText(url).then(() => toast.success('Link copiato')).catch(() => toast.error('Copia non riuscita'))
    }

    return (
        <div className="space-y-4">
            {/* Tabs header */}
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Package size={22} className="text-amber-400" weight="fill" /> Ordini asporto
                </h2>
                <div className="ml-auto flex items-center gap-2">
                    <TakeawayQRPosterButton
                        restaurantId={restaurantId}
                        restaurantName={restaurantName || 'Il mio locale'}
                        className="border-white/10 text-zinc-300 hover:text-amber-300 hover:bg-amber-500/5"
                    />
                    <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                        <TabButton active={tab === 'queue'} onClick={() => setTab('queue')} count={grouped.queue.length} icon={<ForkKnife size={14} />} label="In cucina" />
                        <TabButton active={tab === 'ready'} onClick={() => setTab('ready')} count={grouped.ready.length} icon={<Bell size={14} />} label="Pronti" />
                        <TabButton active={tab === 'closed'} onClick={() => setTab('closed')} count={grouped.closed.length} icon={<CheckCircle size={14} />} label="Chiusi" />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center text-zinc-500 py-20">Caricamento...</div>
            ) : visible.length === 0 ? (
                <div className="text-center text-zinc-600 py-20">
                    <ShoppingBag size={40} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm uppercase tracking-widest">Nessun ordine</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <AnimatePresence mode="popLayout">
                        {visible.map(o => {
                            const due = orderDue(o)
                            const meta = statusMeta[o.status] || statusMeta.PREPARING
                            const minutesAgo = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000)
                            return (
                                <motion.div key={o.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}>
                                    <Card className="bg-zinc-900/60 border-white/10 p-4 space-y-3 hover:border-amber-500/40 transition-colors">
                                        <div className="flex items-start gap-3">
                                            <div className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 flex items-center justify-center font-mono font-bold text-2xl ${o.status === 'READY' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 'bg-amber-500/15 border-amber-500 text-amber-300'}`}>
                                                #{String(o.pickup_number || 0).padStart(2, '0')}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold truncate flex items-center gap-1"><UserIcon size={12} className="text-zinc-400 flex-shrink-0" /> {o.customer_name || '—'}</div>
                                                <div className="text-xs text-zinc-400 font-mono">{o.customer_phone}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Badge className={`${meta.color} border text-[10px] uppercase`}>{meta.label}</Badge>
                                                    <span className="text-[10px] text-zinc-500 flex items-center gap-0.5"><Timer size={10} />{minutesAgo}m</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-xs text-zinc-300 space-y-0.5 max-h-20 overflow-y-auto">
                                            {(o.items || []).map((it: any) => (
                                                <div key={it.id} className="flex justify-between">
                                                    <span className="truncate mr-2">{it.quantity}× {it.dish?.name || '—'}</span>
                                                    {it.note && <span className="text-amber-400/80 text-[10px] italic">note</span>}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                            <div className="text-sm">
                                                <div className="text-zinc-500 text-[10px] uppercase tracking-wider">Totale</div>
                                                <div className="font-bold">€{Number(o.total_amount).toFixed(2)}</div>
                                            </div>
                                            {due > 0.01 ? (
                                                <div className="text-right">
                                                    <div className="text-amber-400 text-[10px] uppercase tracking-wider">Residuo</div>
                                                    <div className="text-amber-400 font-bold">€{due.toFixed(2)}</div>
                                                </div>
                                            ) : (
                                                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 border text-xs">
                                                    <CheckCircle size={12} className="mr-1" /> Pagato
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            {o.status === 'PENDING' && (
                                                <Button size="sm" onClick={() => changeStatus(o, 'PREPARING')} className="bg-amber-500 hover:bg-amber-400 text-black font-bold col-span-2"><ForkKnife size={14} className="mr-1" />Avvia preparazione</Button>
                                            )}
                                            {o.status === 'PREPARING' && (
                                                <Button size="sm" onClick={() => changeStatus(o, 'READY')} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold col-span-2"><Bell size={14} className="mr-1" />Segna pronto</Button>
                                            )}
                                            {o.status === 'READY' && (
                                                <Button
                                                    onClick={() => {
                                                        if (due > 0.01) {
                                                            if (!confirm(`Residuo da incassare: \u20ac${due.toFixed(2)}.\nConfermi la consegna senza pagamento?`)) return
                                                        }
                                                        changeStatus(o, 'PICKED_UP')
                                                    }}
                                                    className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold col-span-2 h-12 text-base shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400/40"
                                                >
                                                    <CheckCircle size={18} weight="fill" className="mr-2" />Consegnato al cliente
                                                </Button>
                                            )}
                                            {due > 0.01 && o.status !== 'CANCELLED' && o.status !== 'PICKED_UP' && (
                                                <Button size="sm" onClick={() => openPayment(o)} variant="outline" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10 col-span-2">
                                                    <Receipt size={14} className="mr-1" /> Pagamento
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={() => openDetail(o)} className="text-zinc-400 hover:text-white"><CaretRight size={14} className="mr-1" />Dettagli</Button>
                                            <Button size="sm" variant="ghost" onClick={() => copyPickupLink(o)} className="text-zinc-400 hover:text-white"><Copy size={14} className="mr-1" />Link</Button>
                                        </div>
                                    </Card>
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>
                </div>
            )}

            <TakeawayPaymentDialog
                open={payOpen}
                onOpenChange={setPayOpen}
                order={selected}
                onPaid={refresh}
                onPrintReceipt={onPrintOrder}
            />

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle>Ordine #{String(selected?.pickup_number || 0).padStart(3, '0')}</DialogTitle>
                    </DialogHeader>
                    {selected && (
                        <div className="space-y-3">
                            <div className="bg-white/5 rounded-lg p-3 border border-white/10 space-y-1 text-sm">
                                <div className="flex justify-between"><span className="text-zinc-400">Cliente</span><span>{selected.customer_name}</span></div>
                                <div className="flex justify-between"><span className="text-zinc-400">Telefono</span><span className="font-mono">{selected.customer_phone}</span></div>
                                {selected.customer_notes && <div className="pt-1"><span className="text-zinc-400 text-xs">Note:</span><p className="text-amber-300 text-sm">{selected.customer_notes}</p></div>}
                            </div>
                            <div className="bg-white/5 rounded-lg p-3 border border-white/10 space-y-1 text-sm">
                                {(selected.items || []).map((it: any) => (
                                    <div key={it.id} className="flex justify-between">
                                        <span>{it.quantity}× {it.dish?.name}</span>
                                        <span className="font-mono">€{(Number(it.dish?.price || 0) * it.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between pt-2 border-t border-white/10 font-bold">
                                    <span>Totale</span><span>€{Number(selected.total_amount).toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {onPrintOrder && <Button size="sm" onClick={() => onPrintOrder(selected)} variant="outline" className="border-white/10"><Receipt size={14} className="mr-1" />Stampa</Button>}
                                {selected.status !== 'PAID' && selected.status !== 'CANCELLED' && (
                                    <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 ml-auto" onClick={async () => {
                                        if (!confirm('Annullare questo ordine?')) return
                                        try {
                                            await DatabaseService.cancelTakeawayOrder(selected.id)
                                            toast.success('Ordine annullato')
                                            setDetailOpen(false)
                                            refresh()
                                        } catch (e: any) {
                                            toast.error(e?.message || 'Errore')
                                        }
                                    }}><Trash size={14} className="mr-1" />Annulla ordine</Button>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}

function TabButton({ active, onClick, count, icon, label }: { active: boolean; onClick: () => void; count: number; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition-all ${active ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:bg-white/5'}`}
        >
            {icon}
            {label}
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${active ? 'bg-black/20' : 'bg-white/10'}`}>{count}</span>
        </button>
    )
}
