import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { DatabaseService } from '@/services/DatabaseService'
import type { Category, Order } from '@/services/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ShoppingBag, Clock, Bell, ForkKnife, CheckCircle, Trash, Receipt, CaretRight, Package, Check, ArrowsDownUp, FunnelSimple, CreditCard, MagnifyingGlass, CalendarBlank, XCircle, Plus, Minus } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import TakeawayPaymentDialog from './TakeawayPaymentDialog'

interface Props {
    restaurantId: string
    restaurantName?: string
    takeawayRequireStripe?: boolean
    takeawayAutoPickupEnabled?: boolean
    onPrintKitchenOrder?: (order: Order) => void
    onAutoPrintKitchenOrder?: (order: Order) => void
    onPrintReceipt?: (order: Order) => void
}

type Tab = 'active' | 'archive'
type StatusFilter = 'all' | 'preparing' | 'ready'
type SortOrder = 'oldest' | 'newest'
type ArchiveRange = 'today' | '7d' | '30d' | 'custom' | 'all'
type ArchiveStatusFilter = 'all' | 'paid' | 'picked_up' | 'cancelled' | 'unpaid'
type CardSize = 'compact' | 'normal' | 'large'

// PENDING è escluso: gli ordini Stripe entrano in PENDING durante il
// checkout e diventano PREPARING solo dopo pagamento confermato. Lo
// staff non deve vedere ordini "in attesa pagamento Stripe" in cucina.
const ACTIVE_STATUSES = new Set(['PREPARING', 'READY'])
const ARCHIVE_STATUSES = new Set(['PAID', 'PICKED_UP', 'CANCELLED'])
const ARCHIVE_DISPLAY_LIMIT = 160
const AUTO_PICKUP_MS = 2 * 60 * 1000

const cardSizeConfig: Record<CardSize, {
    minWidth: number
    minHeight: number
    numberBox: string
    numberText: string
    header: string
    content: string
    itemText: string
    actionHeight: string
    listMax: string
}> = {
    compact: {
        minWidth: 260,
        minHeight: 292,
        numberBox: 'min-w-[76px]',
        numberText: 'text-[34px]',
        header: 'p-3',
        content: 'p-3 gap-2',
        itemText: 'text-base',
        actionHeight: 'h-10',
        listMax: 'max-h-32',
    },
    normal: {
        minWidth: 330,
        minHeight: 340,
        numberBox: 'min-w-[88px]',
        numberText: 'text-[40px]',
        header: 'p-3.5',
        content: 'p-3.5 gap-2.5',
        itemText: 'text-[17px]',
        actionHeight: 'h-11',
        listMax: 'max-h-40',
    },
    large: {
        minWidth: 420,
        minHeight: 398,
        numberBox: 'min-w-[104px]',
        numberText: 'text-[48px]',
        header: 'p-4',
        content: 'p-4 gap-3',
        itemText: 'text-lg',
        actionHeight: 'h-12',
        listMax: 'max-h-52',
    },
}

const statusMeta: Record<string, { label: string; color: string; ring: string }> = {
    PENDING: { label: 'In attesa', color: 'bg-amber-500/20 text-amber-200 border-amber-500/40', ring: 'border-amber-500 text-amber-300 bg-amber-500/15' },
    PREPARING: { label: 'In cucina', color: 'bg-amber-500/20 text-amber-200 border-amber-500/40', ring: 'border-amber-500 text-amber-300 bg-amber-500/15' },
    READY: { label: 'Da consegnare', color: 'bg-emerald-500/25 text-emerald-100 border-emerald-400/60', ring: 'border-emerald-400 text-emerald-200 bg-emerald-500/20' },
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

function orderMatchesCategories(order: Order, categoryIds: string[]) {
    if (categoryIds.length === 0) return true
    return (order.items || []).some((it: any) => it.dish?.category_id && categoryIds.includes(it.dish.category_id))
}

function readySince(order: Order) {
    const raw = order.ready_at || order.created_at
    return raw ? new Date(raw).getTime() : null
}

function formatCountdown(ms: number) {
    const total = Math.max(0, Math.ceil(ms / 1000))
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    if (minutes <= 0) return `${seconds}s`
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export default function TakeawayOrdersPanel({ restaurantId, takeawayRequireStripe = false, takeawayAutoPickupEnabled = false, onPrintKitchenOrder, onAutoPrintKitchenOrder, onPrintReceipt }: Props) {
    const [orders, setOrders] = useState<Order[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Tab>('active')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [sortOrder, setSortOrder] = useState<SortOrder>('oldest')
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
    const [cardSize, setCardSize] = useState<CardSize>('compact')
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
    const autoPickupInFlightRef = useRef<Set<string>>(new Set())

    // Re-render often enough for the ready countdown and auto-pickup timer.
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 5000)
        return () => clearInterval(t)
    }, [])

    // Hash veloce dello stato ordini per evitare setOrders quando i dati
    // sono identici → previene flicker di AnimatePresence quando il
    // realtime e il polling fired insieme producono lo stesso risultato.
    const ordersSignatureRef = useRef<string>('')

    const refresh = useCallback(async () => {
        try {
            const data = await DatabaseService.getTakeawayOrders(restaurantId)
            const nextOrders = data as Order[]
            const signature = nextOrders
                .map(o => `${o.id}:${o.status}:${o.paid_amount}:${(o.items || []).length}`)
                .join('|')
            if (signature !== ordersSignatureRef.current) {
                ordersSignatureRef.current = signature
                setOrders(nextOrders)
            }

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
        let pendingRefresh: ReturnType<typeof setTimeout> | null = null

        // Debounce: il realtime può sparare 5+ eventi in 200ms quando un
        // ordine cambia stato + items vengono toccati. Coalisce tutto in
        // una singola fetch dopo 250ms di quiete.
        const scheduleRefresh = () => {
            if (pendingRefresh) clearTimeout(pendingRefresh)
            pendingRefresh = setTimeout(() => {
                pendingRefresh = null
                if (alive) refresh()
            }, 250)
        }

        ;(async () => {
            setLoading(true)
            await refresh()
            if (alive) setLoading(false)
        })()

        const channel = supabase.channel(`takeaway_panel_${restaurantId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, (payload: any) => {
                if (payload.new?.order_type === 'takeaway' || payload.old?.order_type === 'takeaway') scheduleRefresh()
            })
            // order_items non ha filter restaurant_id (la tabella non lo
            // espone), ma il check su orders.restaurant_id sopra basta a
            // intercettare i cambi rilevanti — qui solo come backup.
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => scheduleRefresh())
            .subscribe()

        // Polling di sicurezza più lento: il realtime gestisce gli update
        // immediati, il polling serve solo come fallback se la subscription
        // si stacca (sleep tablet, perdita rete, ecc.).
        const interval = setInterval(scheduleRefresh, 30000)

        return () => {
            alive = false
            if (pendingRefresh) clearTimeout(pendingRefresh)
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [restaurantId, refresh])

    useEffect(() => {
        let alive = true
        DatabaseService.getCategoriesForMenu(restaurantId)
            .then(data => {
                if (alive) setCategories(data || [])
            })
            .catch(e => {
                console.error('[takeaway-panel] categories error', e)
            })
        return () => { alive = false }
    }, [restaurantId])

    useEffect(() => {
        if (!takeawayAutoPickupEnabled) return

        for (const order of orders) {
            if (order.status !== 'READY') continue
            if (orderDue(order) > 0.01) continue
            const readyAt = readySince(order)
            if (!readyAt || now - readyAt < AUTO_PICKUP_MS) continue
            if (autoPickupInFlightRef.current.has(order.id)) continue

            autoPickupInFlightRef.current.add(order.id)
            DatabaseService.updateTakeawayStatus(order.id, 'PICKED_UP')
                .then(() => {
                    toast.success(`#${String(order.pickup_number || 0).padStart(3, '0')} chiuso automaticamente`)
                    refresh()
                })
                .catch((e: any) => {
                    toast.error(e?.message || 'Errore chiusura automatica')
                })
                .finally(() => {
                    autoPickupInFlightRef.current.delete(order.id)
                })
        }
    }, [orders, now, takeawayAutoPickupEnabled, refresh])

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

    const categoryCounts = useMemo(() => {
        const map = new Map<string, number>()
        for (const o of active) {
            const seen = new Set<string>()
            for (const it of o.items || []) {
                const categoryId = (it as any).dish?.category_id
                if (categoryId) seen.add(categoryId)
            }
            seen.forEach(id => map.set(id, (map.get(id) || 0) + 1))
        }
        return map
    }, [active])

    const visible = useMemo(() => {
        if (tab === 'archive') {
            let list = [...archive]
            if (selectedCategoryIds.length > 0) list = list.filter(o => orderMatchesCategories(o, selectedCategoryIds))
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
        if (selectedCategoryIds.length > 0) list = list.filter(o => orderMatchesCategories(o, selectedCategoryIds))
        if (statusFilter === 'preparing') list = list.filter(o => o.status === 'PREPARING')
        else if (statusFilter === 'ready') list = list.filter(o => o.status === 'READY')
        const sorted = [...list].sort((a, b) => {
            const ta = new Date(a.created_at).getTime()
            const tb = new Date(b.created_at).getTime()
            return sortOrder === 'oldest' ? ta - tb : tb - ta
        })
        return sorted
    }, [tab, active, archive, selectedCategoryIds, statusFilter, sortOrder, archiveRange, archiveFrom, archiveTo, archiveSearch, archiveStatus])

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
                toast.success(`#${String(o.pickup_number || 0).padStart(3, '0')} consegnato`, {
                    duration: 5000,
                    action: {
                        label: 'Annulla',
                        onClick: async () => {
                            try {
                                await DatabaseService.updateTakeawayStatus(o.id, 'READY')
                                toast.success('Consegna annullata')
                                refresh()
                            } catch (err: any) {
                                toast.error(err?.message || 'Impossibile annullare')
                            }
                        },
                    },
                })
            } else if (next === 'READY') {
                toast.success(`#${String(o.pickup_number || 0).padStart(3, '0')} pronto al ritiro`)
            } else if (next === 'PREPARING') {
                toast.success('In preparazione')
            } else {
                toast.success('Stato aggiornato')
            }
            refresh()
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
                    {categories.length > 0 && (
                        <CategoryFilterButton
                            categories={categories}
                            selectedCategoryIds={selectedCategoryIds}
                            counts={categoryCounts}
                            onChange={setSelectedCategoryIds}
                        />
                    )}
                    <CardSizeControl value={cardSize} onChange={setCardSize} />
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
                            <Bell size={14} className="mr-1" /> Da consegnare <span className="opacity-60">({counts.ready})</span>
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
                            className={cn('grid content-start pb-20', cardSize === 'compact' ? 'gap-2.5' : 'gap-3')}
                            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSizeConfig[cardSize].minWidth}px, 1fr))` }}
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
                                        takeawayAutoPickupEnabled={takeawayAutoPickupEnabled}
                                        cardSize={cardSize}
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
    takeawayAutoPickupEnabled: boolean
    cardSize: CardSize
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
        <div className="grid grid-cols-[auto,1fr] sm:grid-cols-[68px,1fr,96px,132px] gap-2.5 items-center px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
            <div className="flex items-center justify-center w-14 h-14 rounded-xl border border-white/10 bg-black/30 text-amber-300 font-mono font-black text-lg">
                #{String(order.pickup_number || 0).padStart(3, '0')}
            </div>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    <Badge className={`${meta.color} border text-[10px] uppercase font-bold tracking-wide px-2 py-0.5`}>
                        {meta.label}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                        {date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} · {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <div className="font-semibold text-white text-sm truncate">{order.customer_name || 'Cliente'}</div>
                <div className="text-[13px] text-zinc-300 truncate">{archiveItemsLabel(order)}</div>
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
                    <Button size="sm" variant="outline" onClick={() => onPrint(order)} className="h-8 border-white/10 text-zinc-300 hover:bg-white/5">
                        <Receipt size={14} className="mr-1" /> Comanda
                    </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onDetail(order)} className="h-8 text-zinc-300 hover:text-white hover:bg-white/5">
                    Dettagli <CaretRight size={14} className="ml-1" />
                </Button>
            </div>
        </div>
    )
}

function TakeawayCard({ order: o, now, onStatus, onPay, onDetail, takeawayRequireStripe, takeawayAutoPickupEnabled, cardSize }: TakeawayCardProps) {
    const due = orderDue(o)
    const meta = statusMeta[o.status] || statusMeta.PREPARING
    const minutesAgo = Math.floor((now - new Date(o.created_at).getTime()) / 60000)
    const isArchive = o.status === 'PAID' || o.status === 'PICKED_UP'
    const isReady = o.status === 'READY'
    const isPreparing = o.status === 'PREPARING'
    const itemsCount = (o.items || []).reduce((s: number, it: any) => s + (it.quantity || 0), 0)
    const lockedForStripePrepay = takeawayRequireStripe && o.status === 'PENDING' && due > 0.01
    const cfg = cardSizeConfig[cardSize]
    const readyAt = readySince(o)
    const autoPickupRemainingMs = readyAt ? Math.max(0, AUTO_PICKUP_MS - (now - readyAt)) : AUTO_PICKUP_MS

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
        >
            <Card className={cn(
                'relative flex h-full flex-col overflow-hidden rounded-xl border bg-zinc-950/80 shadow-sm transition-all duration-200',
                isArchive ? 'border-white/5 opacity-80' : isReady ? 'border-emerald-400/70 ring-1 ring-emerald-400/25 shadow-emerald-500/10' : 'border-white/10 hover:border-amber-500/45',
                isPreparing && 'border-amber-500/35'
            )}
                style={{ minHeight: cfg.minHeight }}
            >
                <div className={cn('h-1 w-full shrink-0', isReady ? 'bg-emerald-400' : lockedForStripePrepay ? 'bg-zinc-600' : 'bg-amber-500')} />
                {!isArchive && o.status !== 'CANCELLED' && (
                    <button
                        type="button"
                        onClick={() => {
                            if (!confirm(`Annullare l'ordine asporto #${String(o.pickup_number || 0).padStart(3, '0')}?`)) return
                            onStatus(o, 'CANCELLED')
                        }}
                        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-zinc-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                        title="Annulla ordine"
                        aria-label="Annulla ordine"
                    >
                        <XCircle size={16} weight="bold" />
                    </button>
                )}
                <CardContent className={cn('flex flex-1 flex-col gap-2.5', cfg.content)}>
                    {/* Header compatto: ordine # in evidenza + meta inline (attesa, pagamento) */}
                    <div className="flex items-baseline gap-3 pr-8">
                        <div className={cn(
                            'font-mono font-black tracking-tight leading-none',
                            cfg.numberText,
                            isReady ? 'text-emerald-300' : lockedForStripePrepay ? 'text-zinc-400' : 'text-amber-300'
                        )}>
                            #{String(o.pickup_number || 0).padStart(3, '0')}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-zinc-400">
                            <span className="inline-flex items-center gap-1">
                                <Clock size={13} weight="fill" />
                                {formatMinutes(minutesAgo)}
                            </span>
                            <span className={cn(
                                'font-bold',
                                due > 0.01 ? 'text-amber-300' : 'text-emerald-300'
                            )}>
                                {due > 0.01 ? `−€${due.toFixed(2)}` : 'Pagato'}
                            </span>
                            {lockedForStripePrepay && (
                                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-amber-200">
                                    attesa Stripe
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Lista piatti — il contenuto principale, in evidenza */}
                    <div className={cn('flex-1 space-y-1 overflow-y-auto pr-1 -mr-1', cfg.listMax)}>
                        {lockedForStripePrepay && (
                            <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100">
                                Pagamento Stripe non ancora confermato.
                            </div>
                        )}
                        {(o.items || []).map((it: any) => (
                            <div key={it.id} className={cn('flex items-baseline gap-2', cfg.itemText)}>
                                <span className="font-mono font-black text-amber-300 shrink-0">{it.quantity}×</span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-white leading-snug break-words">{it.dish?.name || '—'}</div>
                                    {it.note && (
                                        <div className="mt-0.5 text-xs font-medium text-amber-300/90 leading-snug">⚠ {it.note}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {itemsCount === 0 && (
                            <div className="text-sm text-zinc-500 italic">Nessun piatto</div>
                        )}
                    </div>

                    {/* Totale compatto — singola riga, niente sezione separata */}
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-bold uppercase tracking-wider text-zinc-500">Totale</span>
                        <span className="text-lg font-black text-white">€{Number(o.total_amount).toFixed(2)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-auto">
                        {o.status === 'PENDING' && lockedForStripePrepay && (
                            <Button
                                disabled
                                className={cn('bg-zinc-800 text-zinc-400 border border-white/10 col-span-2 text-base', cfg.actionHeight)}
                            >
                                <CreditCard size={18} weight="fill" className="mr-2" />Attesa pagamento Stripe
                            </Button>
                        )}
                        {o.status === 'PENDING' && !lockedForStripePrepay && (
                            <Button
                                onClick={() => onStatus(o, 'PREPARING')}
                                className={cn('bg-amber-500 hover:bg-amber-400 text-black font-bold col-span-2 text-base shadow-lg shadow-amber-500/20', cfg.actionHeight)}
                            >
                                <ForkKnife size={18} weight="fill" className="mr-2" />Avvia preparazione
                            </Button>
                        )}
                        {o.status === 'PREPARING' && (
                            <Button
                                onClick={() => onStatus(o, 'READY')}
                                className={cn('bg-amber-500 hover:bg-amber-400 text-black font-bold col-span-2 text-base shadow-lg shadow-amber-500/20', cfg.actionHeight)}
                            >
                                <Bell size={18} weight="fill" className="mr-2" />Segna pronto
                            </Button>
                        )}
                        {o.status === 'READY' && takeawayAutoPickupEnabled && (
                            <div className="col-span-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-center">
                                <div className="text-sm font-black uppercase tracking-wide text-emerald-200">
                                    Da consegnare
                                </div>
                                <div className="text-xs font-semibold text-emerald-200/80">
                                    {due > 0.01
                                        ? 'Incassa il residuo: non si chiude automaticamente'
                                        : `Chiusura automatica tra ${formatCountdown(autoPickupRemainingMs)}`}
                                </div>
                            </div>
                        )}
                        {o.status === 'READY' && !takeawayAutoPickupEnabled && (
                            <Button
                                onClick={() => {
                                    if (due > 0.01) {
                                        if (!confirm(`Residuo da incassare: €${due.toFixed(2)}.\nConfermi la consegna senza pagamento?`)) return
                                    }
                                    onStatus(o, 'PICKED_UP')
                                }}
                                className={cn('bg-emerald-500 hover:bg-emerald-400 text-white font-black col-span-2 text-base shadow-xl shadow-emerald-500/40 ring-2 ring-emerald-300/70 animate-[pulse_2s_ease-in-out_infinite]', cfg.actionHeight)}
                            >
                                <CheckCircle size={22} weight="fill" className="mr-2" />Consegna ora
                            </Button>
                        )}
                        {due > 0.01 && o.status !== 'CANCELLED' && o.status !== 'PICKED_UP' && (
                            <Button
                                size="sm"
                                onClick={() => onPay(o, lockedForStripePrepay)}
                                variant="outline"
                                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 col-span-2 h-9 text-sm font-semibold"
                            >
                                <Receipt size={16} className="mr-1.5" /> {lockedForStripePrepay ? 'Apri pagamento Stripe' : 'Gestisci pagamento'}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDetail(o)}
                            className="text-zinc-300 hover:text-white hover:bg-white/5 h-9 text-sm font-medium col-span-2"
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

function CategoryFilterButton({
    categories,
    selectedCategoryIds,
    counts,
    onChange,
}: {
    categories: Category[]
    selectedCategoryIds: string[]
    counts: Map<string, number>
    onChange: (ids: string[]) => void
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={selectedCategoryIds.length > 0 ? 'default' : 'outline'}
                    size="sm"
                    className="h-10 border-white/10 bg-black/40 hover:bg-zinc-900/60 backdrop-blur-sm text-zinc-300"
                >
                    <FunnelSimple size={16} className={selectedCategoryIds.length > 0 ? 'mr-2 text-amber-500' : 'mr-2'} />
                    Filtra
                    {selectedCategoryIds.length > 0 && (
                        <span className="ml-1.5 rounded-full bg-amber-500 text-black font-bold w-4 h-4 text-[10px] flex items-center justify-center">
                            {selectedCategoryIds.length}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-0 bg-zinc-950 border-zinc-800 text-zinc-100 shadow-xl" align="end">
                <div className="p-2 border-b border-white/10">
                    <h4 className="font-medium text-xs text-zinc-500 uppercase tracking-wider">Categorie piatti</h4>
                </div>
                <div className="p-2 max-h-64 overflow-y-auto space-y-1">
                    {categories.map(cat => {
                        const active = selectedCategoryIds.includes(cat.id)
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                className="flex w-full items-center gap-2 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors text-left"
                                onClick={() => {
                                    onChange(
                                        active
                                            ? selectedCategoryIds.filter(id => id !== cat.id)
                                            : [...selectedCategoryIds, cat.id]
                                    )
                                }}
                            >
                                <span className={cn(
                                    'w-4 h-4 rounded-sm border flex items-center justify-center transition-colors shrink-0',
                                    active ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-700 bg-black/40'
                                )}>
                                    {active && <Check size={10} weight="bold" />}
                                </span>
                                <span className="text-sm text-zinc-300 truncate flex-1">{cat.name}</span>
                                {counts.has(cat.id) && (
                                    <span className="text-xs font-mono text-zinc-500">{counts.get(cat.id)}</span>
                                )}
                            </button>
                        )
                    })}
                </div>
                {selectedCategoryIds.length > 0 && (
                    <div className="p-2 border-t border-white/10">
                        <Button variant="ghost" size="sm" className="w-full h-8 text-xs text-zinc-400 hover:text-white" onClick={() => onChange([])}>
                            Resetta filtri
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    )
}

function CardSizeControl({
    value,
    onChange,
}: {
    value: CardSize
    onChange: (value: CardSize) => void
}) {
    const sizes: CardSize[] = ['compact', 'normal', 'large']
    const index = sizes.indexOf(value)
    const label = value === 'compact' ? '80%' : value === 'normal' ? '100%' : '120%'

    return (
        <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl border border-white/10 backdrop-blur-sm">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(sizes[Math.max(0, index - 1)])}
                disabled={index === 0}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-30"
                title="Blocchi più piccoli"
                aria-label="Blocchi più piccoli"
            >
                <Minus size={14} />
            </Button>
            <span className="w-10 text-center text-xs font-bold font-mono text-zinc-500">
                {label}
            </span>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(sizes[Math.min(sizes.length - 1, index + 1)])}
                disabled={index === sizes.length - 1}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-30"
                title="Blocchi più grandi"
                aria-label="Blocchi più grandi"
            >
                <Plus size={14} />
            </Button>
        </div>
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
