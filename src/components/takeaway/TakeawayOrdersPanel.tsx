import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { DatabaseService } from '@/services/DatabaseService'
import type { Order } from '@/services/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShoppingBag, Clock, Bell, ForkKnife, CheckCircle, Trash, Receipt, CaretRight, Package, Check, ArrowsDownUp, FunnelSimple, CreditCard, MagnifyingGlass, CalendarBlank, XCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import TakeawayPaymentDialog from './TakeawayPaymentDialog'

interface Props {
    restaurantId: string
    restaurantName?: string
    takeawayRequireStripe?: boolean
    onPrintKitchenOrder?: (order: Order) => void
    onAutoPrintKitchenOrder?: (order: Order) => void
    onPrintReceipt?: (order: Order) => void
}

type Tab = 'active' | 'archive'
type StatusFilter = 'all' | 'preparing' | 'ready'
type SortOrder = 'oldest' | 'newest'
type ArchiveRange = 'today' | '7d' | '30d' | 'custom' | 'all'
type ArchiveStatusFilter = 'all' | 'paid' | 'picked_up' | 'cancelled' | 'unpaid'

const ACTIVE_STATUSES = new Set(['PENDING', 'PREPARING', 'READY'])
const ARCHIVE_STATUSES = new Set(['PAID', 'PICKED_UP', 'CANCELLED'])
const ARCHIVE_DISPLAY_LIMIT = 160

const statusMeta: Record<string, { label: string; color: string; ring: string }> = {
    PENDING: { label: 'In attesa', color: 'bg-amber-500/20 text-amber-200 border-amber-500/40', ring: 'border-amber-500 text-amber-300 bg-amber-500/15' },
    PREPARING: { label: 'In cucina', color: 'bg-amber-500/20 text-amber-200 border-amber-500/40', ring: 'border-amber-500 text-amber-300 bg-amber-500/15' },
    READY: { label: 'Pronto', color: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40', ring: 'border-emerald-500 text-emerald-300 bg-emerald-500/15' },
    PICKED_UP: { label: 'Ritirato', color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30', ring: 'border-zinc-600 text-zinc-400 bg-zinc-800/40' },
    PAID: { label: 'Chiuso', color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30', ring: 'border-zinc-600 text-zinc-400 bg-zinc-800/40' },
    CANCELLED: { label: 'Annullato', color: 'bg-red-500/20 text-red-300 border-red-500/30', ring: 'border-red-500 text-red-300 bg-red-500/15' },
}

function orderDue(order: Order) {
    const total = Number(order.total_amount || 0)
    const paid = Number(order.paid_amount || 0)
    return Math.max(0, Math.round((total - paid) * 100) / 100)
}

function formatMinutes(mins: number) {
    const m = Math.max(0, Math.floor(mins))
    if (m >= 60) {
        const h = Math.floor(m / 60)
        const r = m % 60
        return `${h}h ${r}'`
    }
    return `${m}'`
}

function toInputDate(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function orderArchiveDate(order: Order) {
    return new Date(order.closed_at || order.picked_up_at || order.ready_at || order.created_at)
}

function archiveItemsLabel(order: Order) {
    const items = order.items || []
    if (items.length === 0) return 'Nessun piatto'
    const first = items.slice(0, 2).map((it: any) => `${it.quantity}x ${it.dish?.name || 'Piatto'}`).join(' · ')
    return items.length > 2 ? `${first} +${items.length - 2}` : first
}

export default function TakeawayOrdersPanel({ restaurantId, takeawayRequireStripe = false, onPrintKitchenOrder, onAutoPrintKitchenOrder, onPrintReceipt }: Props) {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Tab>('active')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [sortOrder, setSortOrder] = useState<SortOrder>('oldest')
    const [selected, setSelected] = useState<Order | null>(null)
    const [payOpen, setPayOpen] = useState(false)
    const [forceStripePayment, setForceStripePayment] = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)
    const [now, setNow] = useState(Date.now())
    const [archiveRange, setArchiveRange] = useState<ArchiveRange>('today')
    const [archiveFrom, setArchiveFrom] = useState(() => toInputDate(new Date()))
    const [archiveTo, setArchiveTo] = useState(() => toInputDate(new Date()))
    const [archiveSearch, setArchiveSearch] = useState('')
    const [archiveStatus, setArchiveStatus] = useState<ArchiveStatusFilter>('all')
    const knownKitchenPrintIdsRef = useRef<Set<string>>(new Set())
    const initialKitchenPrintLoadRef = useRef(true)

    // Re-render every 30s so the "N minuti fa" timer stays accurate
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30000)
        return () => clearInterval(t)
    }, [])

    const refresh = useCallback(async () => {
        try {
            const data = await DatabaseService.getTakeawayOrders(restaurantId)
            const nextOrders = data as Order[]
            setOrders(nextOrders)

            const printable = nextOrders.filter(o => o.status === 'PREPARING' || o.status === 'READY')
            if (onAutoPrintKitchenOrder && !initialKitchenPrintLoadRef.current) {
                for (const order of printable) {
                    if (!knownKitchenPrintIdsRef.current.has(order.id)) {
                        onAutoPrintKitchenOrder(order)
                    }
                }
            }
            knownKitchenPrintIdsRef.current = new Set(printable.map(o => o.id))
            initialKitchenPrintLoadRef.current = false
        } catch (e: any) {
            console.error('[takeaway-panel] refresh error', e)
        }
    }, [restaurantId, onAutoPrintKitchenOrder])

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

    // Partition orders once; filter/sort applied below based on UI state
    const { active, archive, counts } = useMemo(() => {
        const activeAll: Order[] = []
        const archiveAll: Order[] = []
        for (const o of orders) {
            if (ACTIVE_STATUSES.has(o.status)) activeAll.push(o)
            else if (ARCHIVE_STATUSES.has(o.status)) archiveAll.push(o)
        }
        const counts = {
            active: activeAll.length,
            pending: activeAll.filter(o => o.status === 'PREPARING').length,
            ready: activeAll.filter(o => o.status === 'READY').length,
            archive: archiveAll.length,
        }
        return { active: activeAll, archive: archiveAll, counts }
    }, [orders])

    const visible = useMemo(() => {
        if (tab === 'archive') {
            let list = [...archive]
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            let from: Date | null = null
            let to: Date | null = null

            if (archiveRange === 'today') {
                from = today
                to = new Date(today)
                to.setDate(to.getDate() + 1)
            } else if (archiveRange === '7d' || archiveRange === '30d') {
                from = new Date(today)
                from.setDate(from.getDate() - (archiveRange === '7d' ? 6 : 29))
                to = new Date(today)
                to.setDate(to.getDate() + 1)
            } else if (archiveRange === 'custom') {
                if (archiveFrom) from = new Date(`${archiveFrom}T00:00:00`)
                if (archiveTo) to = new Date(`${archiveTo}T23:59:59.999`)
            }

            if (from) list = list.filter(o => orderArchiveDate(o).getTime() >= from!.getTime())
            if (to) list = list.filter(o => orderArchiveDate(o).getTime() <= to!.getTime())

            if (archiveStatus === 'paid') list = list.filter(o => o.status === 'PAID')
            else if (archiveStatus === 'picked_up') list = list.filter(o => o.status === 'PICKED_UP')
            else if (archiveStatus === 'cancelled') list = list.filter(o => o.status === 'CANCELLED')
            else if (archiveStatus === 'unpaid') list = list.filter(o => orderDue(o) > 0.01)

            const q = archiveSearch.trim().toLowerCase()
            if (q) {
                list = list.filter(o => {
                    const haystack = [
                        String(o.pickup_number || '').padStart(3, '0'),
                        o.customer_name || '',
                        o.customer_phone || '',
                        archiveItemsLabel(o),
                    ].join(' ').toLowerCase()
                    return haystack.includes(q)
                })
            }

            return list
                .sort((a, b) => new Date(b.closed_at || b.created_at).getTime() - new Date(a.closed_at || a.created_at).getTime())
                .slice(0, ARCHIVE_DISPLAY_LIMIT)
        }
        let list = active
        if (statusFilter === 'preparing') list = list.filter(o => o.status === 'PREPARING')
        else if (statusFilter === 'ready') list = list.filter(o => o.status === 'READY')
        const sorted = [...list].sort((a, b) => {
            const ta = new Date(a.created_at).getTime()
            const tb = new Date(b.created_at).getTime()
            return sortOrder === 'oldest' ? ta - tb : tb - ta
        })
        return sorted
    }, [tab, active, archive, statusFilter, sortOrder, archiveRange, archiveFrom, archiveTo, archiveSearch, archiveStatus])

    const archiveStats = useMemo(() => {
        const revenue = visible.reduce((sum, o) => o.status === 'CANCELLED' ? sum : sum + Number(o.paid_amount || o.total_amount || 0), 0)
        return {
            count: tab === 'archive' ? visible.length : archive.length,
            revenue: Math.round(revenue * 100) / 100,
        }
    }, [visible, archive.length, tab])

    const changeStatus = async (o: Order, next: 'PREPARING' | 'READY' | 'PICKED_UP' | 'CANCELLED') => {
        try {
            await DatabaseService.updateTakeawayStatus(o.id, next)
            if (next === 'PICKED_UP') {
                toast.success(`#${String(o.pickup_number || 0).padStart(3, '0')} consegnato`, { duration: 2500 })
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

    const openPayment = (o: Order, forceStripeOnly = false) => {
        setSelected(o)
        setForceStripePayment(forceStripeOnly)
        setPayOpen(true)
    }
    const openDetail = (o: Order) => { setSelected(o); setDetailOpen(true) }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Package size={26} className="text-amber-400" weight="fill" /> Ordini asporto
                </h2>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                        <TabButton
                            active={tab === 'active'}
                            onClick={() => setTab('active')}
                            count={counts.active}
                            label="Attivi"
                            icon={<ForkKnife size={16} weight="fill" />}
                            accent="amber"
                        />
                        <TabButton
                            active={tab === 'archive'}
                            onClick={() => setTab('archive')}
                            count={counts.archive}
                            label="Archivio"
                            icon={<CheckCircle size={16} weight="fill" />}
                            accent="zinc"
                        />
                    </div>
                </div>
            </div>

            {/* Active filters bar */}
            {tab === 'active' && (
                <div className="flex flex-wrap items-center gap-2 bg-zinc-900/50 border border-white/10 rounded-xl p-2">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-sm font-medium px-2">
                        <FunnelSimple size={16} /> Mostra:
                    </div>
                    <div className="flex gap-1">
                        <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
                            Tutti <span className="opacity-60">({counts.active})</span>
                        </FilterPill>
                        <FilterPill
                            active={statusFilter === 'preparing'}
                            onClick={() => setStatusFilter('preparing')}
                            color="amber"
                        >
                            <ForkKnife size={14} className="mr-1" /> In cucina <span className="opacity-60">({counts.pending})</span>
                        </FilterPill>
                        <FilterPill
                            active={statusFilter === 'ready'}
                            onClick={() => setStatusFilter('ready')}
                            color="emerald"
                        >
                            <Bell size={14} className="mr-1" /> Pronti <span className="opacity-60">({counts.ready})</span>
                        </FilterPill>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                        <button
                            onClick={() => setSortOrder(s => s === 'oldest' ? 'newest' : 'oldest')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 transition-colors"
                            title="Cambia ordinamento"
                        >
                            <ArrowsDownUp size={14} />
                            {sortOrder === 'oldest' ? 'Più vecchi prima' : 'Più recenti prima'}
                        </button>
                    </div>
                </div>
            )}

            {tab === 'archive' && (
                <div className="space-y-3 rounded-xl bg-zinc-900/50 border border-white/10 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-sm font-medium px-1">
                            <CalendarBlank size={16} /> Periodo:
                        </div>
                        <div className="flex flex-wrap gap-1">
                            <FilterPill active={archiveRange === 'today'} onClick={() => setArchiveRange('today')}>Oggi</FilterPill>
                            <FilterPill active={archiveRange === '7d'} onClick={() => setArchiveRange('7d')}>7 giorni</FilterPill>
                            <FilterPill active={archiveRange === '30d'} onClick={() => setArchiveRange('30d')}>30 giorni</FilterPill>
                            <FilterPill active={archiveRange === 'all'} onClick={() => setArchiveRange('all')}>Tutti</FilterPill>
                            <FilterPill active={archiveRange === 'custom'} onClick={() => setArchiveRange('custom')}>Personalizzato</FilterPill>
                        </div>
                        <div className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300">
                            <span className="font-bold text-white">{archiveStats.count}</span> ordini
                            <span className="text-zinc-600">·</span>
                            <span className="font-bold text-emerald-300">€{archiveStats.revenue.toFixed(2)}</span>
                        </div>
                    </div>

                    {archiveRange === 'custom' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input type="date" value={archiveFrom} onChange={e => setArchiveFrom(e.target.value)} className="bg-black/20 border-white/10 h-9 text-sm" />
                            <Input type="date" value={archiveTo} onChange={e => setArchiveTo(e.target.value)} className="bg-black/20 border-white/10 h-9 text-sm" />
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[220px]">
                            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <Input
                                value={archiveSearch}
                                onChange={e => setArchiveSearch(e.target.value)}
                                placeholder="Cerca numero, cliente, telefono o piatto"
                                className="pl-9 bg-black/20 border-white/10 h-9 text-sm"
                            />
                        </div>
                        <div className="flex flex-wrap gap-1">
                            <FilterPill active={archiveStatus === 'all'} onClick={() => setArchiveStatus('all')}>Tutti</FilterPill>
                            <FilterPill active={archiveStatus === 'paid'} onClick={() => setArchiveStatus('paid')}>Chiusi</FilterPill>
                            <FilterPill active={archiveStatus === 'picked_up'} onClick={() => setArchiveStatus('picked_up')}>Ritirati</FilterPill>
                            <FilterPill active={archiveStatus === 'cancelled'} onClick={() => setArchiveStatus('cancelled')}>Annullati</FilterPill>
                            <FilterPill active={archiveStatus === 'unpaid'} onClick={() => setArchiveStatus('unpaid')} color="amber">Residuo</FilterPill>
                        </div>
                        {(archiveSearch || archiveStatus !== 'all' || archiveRange !== 'today') && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setArchiveRange('today')
                                    setArchiveFrom(toInputDate(new Date()))
                                    setArchiveTo(toInputDate(new Date()))
                                    setArchiveSearch('')
                                    setArchiveStatus('all')
                                }}
                                className="text-zinc-400 hover:text-white hover:bg-white/5"
                            >
                                <XCircle size={16} className="mr-1" /> Reset
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Orders grid */}
            {loading ? (
                <div className="text-center text-zinc-500 py-20 text-base">Caricamento...</div>
            ) : visible.length === 0 ? (
                <div className="text-center text-zinc-600 py-24">
                    <ShoppingBag size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-base uppercase tracking-widest font-semibold">
                        {tab === 'active' ? 'Nessun ordine attivo' : 'Archivio vuoto'}
                    </p>
                </div>
            ) : (
                <>
                    {tab === 'archive' && visible.length >= ARCHIVE_DISPLAY_LIMIT && (
                        <div className="text-center text-xs text-zinc-500 px-4 py-2 bg-white/[0.02] border border-white/10 rounded-lg">
                            Mostro i primi {ARCHIVE_DISPLAY_LIMIT} risultati: restringi periodo o ricerca per trovare gli altri ordini.
                        </div>
                    )}
                    {tab === 'archive' ? (
                        <div className="rounded-xl border border-white/10 bg-zinc-900/40 divide-y divide-white/10 overflow-hidden pb-0">
                            {visible.map(o => (
                                <TakeawayArchiveRow
                                    key={o.id}
                                    order={o}
                                    onDetail={openDetail}
                                    onPrint={onPrintKitchenOrder}
                                />
                            ))}
                        </div>
                    ) : (
                        <div
                            className="grid gap-3 content-start pb-20"
                            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
                        >
                            <AnimatePresence mode="popLayout">
                                {visible.map(o => (
                                    <TakeawayCard
                                        key={o.id}
                                        order={o}
                                        now={now}
                                        onStatus={changeStatus}
                                        onPay={openPayment}
                                        onDetail={openDetail}
                                        takeawayRequireStripe={takeawayRequireStripe}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </>
            )}

            <TakeawayPaymentDialog
                open={payOpen}
                onOpenChange={setPayOpen}
                order={selected}
                onPaid={refresh}
                onPrintReceipt={onPrintReceipt}
                forceStripeOnly={forceStripePayment}
            />

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-lg">Ordine #{String(selected?.pickup_number || 0).padStart(3, '0')}</DialogTitle>
                    </DialogHeader>
                    {selected && (
                        <div className="space-y-3">
                            <div className="bg-white/5 rounded-lg p-3 border border-white/10 space-y-1.5 text-sm">
                                <div className="flex justify-between"><span className="text-zinc-400">Cliente</span><span className="font-medium">{selected.customer_name}</span></div>
                                <div className="flex justify-between"><span className="text-zinc-400">Telefono</span><span className="font-mono">{selected.customer_phone}</span></div>
                                {selected.customer_notes && <div className="pt-1.5 border-t border-white/10"><span className="text-zinc-400 text-xs uppercase tracking-wider">Note cliente</span><p className="text-amber-300 text-sm mt-1">{selected.customer_notes}</p></div>}
                            </div>
                            <div className="bg-white/5 rounded-lg p-3 border border-white/10 space-y-1 text-sm">
                                {(selected.items || []).map((it: any) => (
                                    <div key={it.id} className="flex justify-between">
                                        <span>{it.quantity}× {it.dish?.name}</span>
                                        <span className="font-mono">€{(Number(it.dish?.price || 0) * it.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between pt-2 border-t border-white/10 font-bold text-base">
                                    <span>Totale</span><span>€{Number(selected.total_amount).toFixed(2)}</span>
                                </div>
                                {Number(selected.paid_amount || 0) > 0 && (
                                    <div className="flex justify-between text-emerald-300 text-sm">
                                        <span>Già pagato</span><span>€{Number(selected.paid_amount).toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {onPrintKitchenOrder && <Button size="sm" onClick={() => onPrintKitchenOrder(selected)} variant="outline" className="border-white/10"><Receipt size={14} className="mr-1" />Stampa comanda</Button>}
                                {selected.status !== 'PAID' && selected.status !== 'CANCELLED' && selected.status !== 'PICKED_UP' && (
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

/* ─────────────────── Sub-components ─────────────────── */

interface TakeawayCardProps {
    order: Order
    now: number
    onStatus: (o: Order, next: 'PREPARING' | 'READY' | 'PICKED_UP' | 'CANCELLED') => void
    onPay: (o: Order, forceStripeOnly?: boolean) => void
    onDetail: (o: Order) => void
    takeawayRequireStripe: boolean
}

function TakeawayArchiveRow({
    order,
    onDetail,
    onPrint,
}: {
    order: Order
    onDetail: (o: Order) => void
    onPrint?: (order: Order) => void
}) {
    const meta = statusMeta[order.status] || statusMeta.PAID
    const due = orderDue(order)
    const date = orderArchiveDate(order)
    return (
        <div className="grid grid-cols-[auto,1fr] sm:grid-cols-[84px,1fr,120px,150px] gap-3 items-center px-3 sm:px-4 py-3 hover:bg-white/[0.03] transition-colors">
            <div className="flex items-center justify-center w-16 h-16 rounded-xl border border-white/10 bg-black/30 text-amber-300 font-mono font-black text-xl">
                #{String(order.pickup_number || 0).padStart(2, '0')}
            </div>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge className={`${meta.color} border text-[10px] uppercase font-bold tracking-wide px-2 py-0.5`}>
                        {meta.label}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                        {date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} · {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <div className="font-semibold text-white truncate">{order.customer_name || 'Cliente'}</div>
                <div className="text-xs text-zinc-400 truncate">{archiveItemsLabel(order)}</div>
            </div>
            <div className="col-start-2 sm:col-start-auto text-sm sm:text-right">
                <div className="font-black text-white">€{Number(order.total_amount || 0).toFixed(2)}</div>
                {due > 0.01 ? (
                    <div className="text-xs font-semibold text-amber-300">Residuo €{due.toFixed(2)}</div>
                ) : (
                    <div className="text-xs text-emerald-300">Pagato</div>
                )}
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-2">
                {onPrint && order.status !== 'CANCELLED' && (
                    <Button size="sm" variant="outline" onClick={() => onPrint(order)} className="h-9 border-white/10 text-zinc-300 hover:bg-white/5">
                        <Receipt size={14} className="mr-1" /> Comanda
                    </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onDetail(order)} className="h-9 text-zinc-300 hover:text-white hover:bg-white/5">
                    Dettagli <CaretRight size={14} className="ml-1" />
                </Button>
            </div>
        </div>
    )
}

function TakeawayCard({ order: o, now, onStatus, onPay, onDetail, takeawayRequireStripe }: TakeawayCardProps) {
    const due = orderDue(o)
    const meta = statusMeta[o.status] || statusMeta.PREPARING
    const minutesAgo = Math.floor((now - new Date(o.created_at).getTime()) / 60000)
    const isArchive = o.status === 'PAID' || o.status === 'PICKED_UP'
    const isReady = o.status === 'READY'
    const itemsCount = (o.items || []).reduce((s: number, it: any) => s + (it.quantity || 0), 0)
    const lockedForStripePrepay = takeawayRequireStripe && o.status === 'PENDING' && due > 0.01

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
        >
            <Card className={cn(
                'flex flex-col rounded-2xl border shadow-lg transition-all duration-300 overflow-hidden h-full',
                isArchive ? 'bg-zinc-900/40 border-white/5' : isReady ? 'bg-zinc-900 border-emerald-500/40 shadow-emerald-500/10' : 'bg-zinc-900 border-white/10 hover:border-amber-500/40'
            )}>
                <CardHeader className="pb-3 pt-4 px-4 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'flex-shrink-0 w-[78px] h-[78px] rounded-2xl border-2 flex flex-col items-center justify-center font-mono font-bold shadow-inner',
                            meta.ring
                        )}>
                            <span className="text-[10px] uppercase tracking-widest opacity-70 leading-none mt-0.5">N°</span>
                            <span className="text-[28px] leading-tight">#{String(o.pickup_number || 0).padStart(2, '0')}</span>
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={`${meta.color} border text-xs uppercase font-bold tracking-wide px-2 py-0.5`}>
                                    {lockedForStripePrepay ? 'Attesa Stripe' : meta.label}
                                </Badge>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-zinc-100">
                                <Clock size={17} weight="fill" className="text-amber-400" />
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold leading-none">Attesa</div>
                                    <div className="text-lg font-black leading-tight text-white">{formatMinutes(minutesAgo)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 p-4 flex flex-col gap-3">
                    {/* Item list — bigger text */}
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 -mr-1">
                        {lockedForStripePrepay && (
                            <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100">
                                Ordine non inviato in cucina: pagamento online obbligatorio non ancora confermato.
                            </div>
                        )}
                        {(o.items || []).map((it: any) => (
                            <div key={it.id} className="flex items-start justify-between gap-2 text-sm">
                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                    <span className="text-amber-400 font-bold font-mono shrink-0">{it.quantity}×</span>
                                    <span className="text-zinc-200 leading-tight truncate">{it.dish?.name || '—'}</span>
                                </div>
                                {it.note && (
                                    <span className="text-amber-400/90 text-xs italic font-medium shrink-0" title={it.note}>
                                        ⚠ nota
                                    </span>
                                )}
                            </div>
                        ))}
                        {itemsCount === 0 && (
                            <div className="text-xs text-zinc-500 italic">Nessun piatto</div>
                        )}
                    </div>

                    {/* Totale / residuo */}
                    <div className="flex justify-between items-center pt-2.5 border-t border-white/10">
                        <div>
                            <div className="text-zinc-500 text-xs uppercase tracking-widest font-semibold">Totale</div>
                            <div className="font-bold text-lg text-zinc-100">€{Number(o.total_amount).toFixed(2)}</div>
                        </div>
                        {due > 0.01 ? (
                            <div className="text-right">
                                <div className="text-amber-400 text-xs uppercase tracking-widest font-semibold">Residuo</div>
                                <div className="text-amber-300 font-bold text-lg">€{due.toFixed(2)}</div>
                            </div>
                        ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/40 border text-sm font-bold px-2.5 py-1">
                                <Check size={14} weight="bold" className="mr-1" /> Pagato
                            </Badge>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2 mt-auto">
                        {o.status === 'PENDING' && lockedForStripePrepay && (
                            <Button
                                disabled
                                className="bg-zinc-800 text-zinc-400 border border-white/10 col-span-2 h-11 text-base"
                            >
                                <CreditCard size={18} weight="fill" className="mr-2" />Attesa pagamento Stripe
                            </Button>
                        )}
                        {o.status === 'PENDING' && !lockedForStripePrepay && (
                            <Button
                                onClick={() => onStatus(o, 'PREPARING')}
                                className="bg-amber-500 hover:bg-amber-400 text-black font-bold col-span-2 h-11 text-base shadow-lg shadow-amber-500/20"
                            >
                                <ForkKnife size={18} weight="fill" className="mr-2" />Avvia preparazione
                            </Button>
                        )}
                        {o.status === 'PREPARING' && (
                            <Button
                                onClick={() => onStatus(o, 'READY')}
                                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold col-span-2 h-11 text-base shadow-lg shadow-emerald-500/20"
                            >
                                <Bell size={18} weight="fill" className="mr-2" />Segna pronto
                            </Button>
                        )}
                        {o.status === 'READY' && (
                            <Button
                                onClick={() => {
                                    if (due > 0.01) {
                                        if (!confirm(`Residuo da incassare: €${due.toFixed(2)}.\nConfermi la consegna senza pagamento?`)) return
                                    }
                                    onStatus(o, 'PICKED_UP')
                                }}
                                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold col-span-2 h-12 text-base shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400/50 animate-[pulse_3s_ease-in-out_infinite]"
                            >
                                <CheckCircle size={20} weight="fill" className="mr-2" />Consegnato al cliente
                            </Button>
                        )}
                        {due > 0.01 && o.status !== 'CANCELLED' && o.status !== 'PICKED_UP' && (
                            <Button
                                size="sm"
                                onClick={() => onPay(o, lockedForStripePrepay)}
                                variant="outline"
                                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 col-span-2 h-10 text-sm font-semibold"
                            >
                                <Receipt size={16} className="mr-1.5" /> {lockedForStripePrepay ? 'Apri pagamento Stripe' : 'Gestisci pagamento'}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDetail(o)}
                            className="text-zinc-300 hover:text-white hover:bg-white/5 h-10 text-sm font-medium col-span-2"
                        >
                            <CaretRight size={14} className="mr-1" />Dettagli cliente
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}

function TabButton({
    active,
    onClick,
    count,
    icon,
    label,
    accent,
}: {
    active: boolean
    onClick: () => void
    count: number
    icon: React.ReactNode
    label: string
    accent: 'amber' | 'zinc'
}) {
    const activeBg = accent === 'amber' ? 'bg-amber-500 text-black' : 'bg-zinc-700 text-white'
    return (
        <button
            onClick={onClick}
            className={cn(
                'px-3.5 py-2 rounded-md text-sm flex items-center gap-1.5 transition-all font-semibold',
                active ? `${activeBg} shadow` : 'text-zinc-400 hover:bg-white/5'
            )}
        >
            {icon}
            {label}
            <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded text-xs font-bold',
                active ? 'bg-black/20' : 'bg-white/10'
            )}>{count}</span>
        </button>
    )
}

function FilterPill({
    active,
    onClick,
    color,
    children,
}: {
    active: boolean
    onClick: () => void
    color?: 'amber' | 'emerald'
    children: React.ReactNode
}) {
    const activeClass = color === 'amber'
        ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
        : color === 'emerald'
            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
            : 'bg-white/10 text-white border-white/20'
    return (
        <button
            onClick={onClick}
            className={cn(
                'inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-md border transition-colors',
                active ? activeClass : 'bg-transparent text-zinc-400 border-white/10 hover:text-zinc-200 hover:bg-white/5'
            )}
        >
            {children}
        </button>
    )
}
