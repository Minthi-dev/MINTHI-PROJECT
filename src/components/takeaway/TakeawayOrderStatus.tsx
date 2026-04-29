import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { DatabaseService } from '@/services/DatabaseService'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CheckCircle, Clock, ForkKnife, Bell, Warning, House, Receipt, QrCode, FloppyDisk } from '@phosphor-icons/react'
import QRCodeGenerator from '@/components/QRCodeGenerator'

type Status = 'PENDING' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'PAID' | 'CANCELLED'

const LABEL: Record<Status, { text: string; sub: string; color: string }> = {
    PENDING: { text: 'In attesa di pagamento', sub: 'Il tuo ordine non è ancora confermato', color: 'text-amber-300' },
    PREPARING: { text: 'In preparazione', sub: 'La cucina sta preparando il tuo ordine', color: 'text-amber-400' },
    READY: { text: 'Pronto al ritiro!', sub: 'Vieni al bancone a ritirare', color: 'text-emerald-400' },
    PICKED_UP: { text: 'Ritirato', sub: 'Grazie e buon appetito!', color: 'text-zinc-400' },
    PAID: { text: 'Ritirato', sub: 'Grazie e buon appetito!', color: 'text-zinc-400' },
    CANCELLED: { text: 'Annullato', sub: "L'ordine è stato annullato", color: 'text-red-400' },
}

export default function TakeawayOrderStatus() {
    const { restaurantId, pickupCode } = useParams<{ restaurantId: string; pickupCode: string }>()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [order, setOrder] = useState<{
        id: string
        pickup_number: number
        status: Status
        total_amount: number
        paid_amount: number
        ready_at: string | null
        created_at: string
        customer_name: string
        estimated_minutes: number
        takeaway_require_stripe: boolean
        takeaway_pickup_mode?: 'code' | 'qr'
        takeaway_pickup_token?: string | null
        items?: Array<{
            id: string
            name: string
            quantity: number
            picked_quantity: number
            remaining_quantity: number
            status?: string
        }>
    } | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)
    const [verifyingPayment, setVerifyingPayment] = useState(false)
    const [fiscalReceiptStatus, setFiscalReceiptStatus] = useState<'unknown' | 'pending' | 'ready'>('unknown')
    const [downloadingReceipt, setDownloadingReceipt] = useState(false)
    const stripeSessionId = searchParams.get('session_id') || undefined

    useEffect(() => {
        const justCreated = searchParams.get('created') === '1'
        const paymentSuccess = searchParams.get('payment') === 'success'
        if (justCreated) toast.success('Ordine inviato!')
        if (paymentSuccess && !searchParams.get('session_id')) toast.success('Pagamento completato!')
    }, [searchParams])

    useEffect(() => {
        const sessionId = searchParams.get('session_id')
        if (!restaurantId || !pickupCode || searchParams.get('payment') !== 'success' || !sessionId) return

        let alive = true
        ;(async () => {
            setVerifyingPayment(true)
            try {
                const result = await DatabaseService.verifyStripeSession(sessionId, restaurantId)
                if (!alive) return
                if (result?.paid) toast.success('Pagamento Stripe confermato!')
                const data = await DatabaseService.getTakeawayOrderStatus(restaurantId, pickupCode)
                if (alive && data) setOrder(data as any)
            } catch (e: any) {
                if (alive) toast.error(e?.message || 'Pagamento non verificato. Attendi qualche secondo.')
            } finally {
                if (alive) setVerifyingPayment(false)
            }
        })()

        return () => { alive = false }
    }, [restaurantId, pickupCode, searchParams])

    useEffect(() => {
        if (!restaurantId || !pickupCode) return
        let alive = true

        const fetchOrder = async () => {
            try {
                const data = await DatabaseService.getTakeawayOrderStatus(restaurantId, pickupCode)
                if (!alive) return
                if (!data) setNotFound(true)
                else setOrder(data as any)
            } catch (e) {
                console.error(e)
            } finally {
                if (alive) setLoading(false)
            }
        }
        fetchOrder()
        const poll = setInterval(fetchOrder, 30000)

        // Realtime subscription on orders table (read-only for this order id once known)
        // We re-subscribe when order.id arrives.

        return () => { alive = false; clearInterval(poll) }
    }, [restaurantId, pickupCode])

    // Poll for fiscal receipt readiness (only once payment is made and the
    // restaurant has fiscal receipts enabled; we discover this implicitly by
    // probing the public PDF endpoint which returns 202 while pending.)
    useEffect(() => {
        if (!order?.id || !restaurantId || !pickupCode) return
        if (Number(order.paid_amount) <= 0) return
        if (fiscalReceiptStatus === 'ready') return

        let cancelled = false
        let isReady = false
        let attempts = 0
        const probe = async () => {
            if (cancelled || isReady) return
            attempts += 1
            try {
                const { ready, status } = await DatabaseService.probeFiscalReceiptForTakeaway({
                    restaurantId,
                    pickupCode,
                    stripeSessionId,
                })
                if (cancelled) return
                if (ready) {
                    isReady = true
                    setFiscalReceiptStatus('ready')
                    return
                }
                setFiscalReceiptStatus(status && status !== 'unavailable' ? 'pending' : 'unknown')
            } catch {
                if (cancelled) return
                setFiscalReceiptStatus('unknown')
            }
            if (!cancelled && !isReady && attempts < 30) {
                setTimeout(probe, attempts < 5 ? 3000 : 10000)
            }
        }
        probe()
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order?.id, order?.paid_amount, restaurantId, pickupCode, stripeSessionId])

    const handleDownloadReceipt = async () => {
        if (!restaurantId || !pickupCode) return
        setDownloadingReceipt(true)
        try {
            await DatabaseService.openFiscalReceiptPdfForTakeaway({
                restaurantId,
                pickupCode,
                stripeSessionId,
            })
        } catch (err: any) {
            toast.error(err?.message || 'Scontrino non ancora disponibile, riprova fra poco')
        } finally {
            setDownloadingReceipt(false)
        }
    }

    useEffect(() => {
        if (!order?.id) return
        const channel = supabase.channel(`takeaway_${order.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (payload: any) => {
                const next = payload.new
                if (!next) return
                setOrder(prev => prev ? {
                    ...prev,
                    status: next.status,
                    paid_amount: next.paid_amount,
                    ready_at: next.ready_at,
                } : prev)
                if (next.status === 'READY') {
                    toast.success('Il tuo ordine è pronto!', { duration: 8000 })
                    try { new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQQAAAD//w==').play().catch(() => {}) } catch {}
                }
            }).subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [order?.id])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-amber-400">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full" />
            </div>
        )
    }
    if (notFound || !order) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-6 text-center">
                <div>
                    <Warning size={32} className="text-red-400 mx-auto mb-3" />
                    <h2 className="text-xl mb-2">Ordine non trovato</h2>
                    <p className="text-zinc-400 text-sm mb-4">Il codice inserito non è valido o è scaduto.</p>
                    <Button onClick={() => navigate(`/client/takeaway/${restaurantId}`)} variant="outline" className="border-white/20"><House size={16} className="mr-2" />Nuovo ordine</Button>
                </div>
            </div>
        )
    }

    const label = LABEL[order.status] || LABEL.PENDING
    const isReady = order.status === 'READY'
    const isClosed = order.status === 'PICKED_UP' || order.status === 'PAID' || order.status === 'CANCELLED'
    const unpaid = Math.max(0, Number(order.total_amount) - Number(order.paid_amount))
    const requiresOnlinePayment = Boolean(order.takeaway_require_stripe)
    const isPaid = unpaid < 0.01 && order.status !== 'CANCELLED'
    const receiptReady = fiscalReceiptStatus === 'ready'
    const pickupQrValue = restaurantId && order.takeaway_pickup_token
        ? `${window.location.origin}/takeaway-pickup/${restaurantId}?token=${order.takeaway_pickup_token}`
        : ''
    const qrMode = isPaid && order.takeaway_pickup_mode === 'qr' && !!pickupQrValue
    const pickupItems = order.items || []
    const totalPieces = pickupItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const pickedPieces = pickupItems.reduce((sum, item) => sum + Number(item.picked_quantity || 0), 0)
    const remainingPieces = Math.max(0, totalPieces - pickedPieces)

    const handleSavePickupQr = () => {
        if (!pickupQrValue) return
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(pickupQrValue)}`
        const safeNumber = String(order.pickup_number).padStart(3, '0')
        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="780" height="1060" viewBox="0 0 780 1060">
  <rect width="780" height="1060" rx="44" fill="#0a0a0a"/>
  <rect x="34" y="34" width="712" height="992" rx="36" fill="#17110a" stroke="#f59e0b" stroke-width="4"/>
  <text x="390" y="126" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fbbf24">RITIRO ASPORTO</text>
  <text x="390" y="220" text-anchor="middle" font-family="Arial, sans-serif" font-size="110" font-weight="900" fill="#fbbf24">#${safeNumber}</text>
  <image href="${qrUrl}" x="180" y="280" width="420" height="420"/>
  <text x="390" y="770" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff">Salva questo QR</text>
  <text x="390" y="822" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#d4d4d8">Mostralo al banco per validare il ritiro.</text>
  <text x="390" y="866" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#d4d4d8">Il personale scannerizza e spunta i prodotti consegnati.</text>
  <text x="390" y="942" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#a1a1aa">Non chiudere o perdere questa immagine prima del ritiro.</text>
</svg>`
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ritiro-asporto-${safeNumber}.svg`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success('QR salvato')
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-3 sm:p-4 flex flex-col items-center justify-start pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-md w-full space-y-3 pt-2 sm:pt-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`rounded-3xl p-6 text-center border shadow-xl ${isReady ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_60px_-10px_rgba(16,185,129,0.3)]' : 'bg-amber-500/10 border-amber-500/30'}`}
                >
                    <h1 className="text-[10px] text-zinc-400 uppercase tracking-[0.2em] mb-1">Ordine</h1>
                    <div className={`text-7xl sm:text-8xl font-bold font-mono tracking-tighter leading-none ${isReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                        #{String(order.pickup_number).padStart(3, '0')}
                    </div>
                    <div className={`mt-2 text-lg font-bold uppercase tracking-wide ${label.color}`}>{label.text}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{label.sub}</div>
                </motion.div>

                {/* Progress bar for non-closed orders */}
                {!isClosed && (
                    <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                            { k: 'PENDING', label: 'Ricevuto', icon: CheckCircle },
                            { k: 'PREPARING', label: 'In cucina', icon: ForkKnife },
                            { k: 'READY', label: 'Pronto', icon: Bell },
                        ].map((stage, i) => {
                            const reached = ['PENDING', 'PREPARING', 'READY'].indexOf(order.status) >= i
                            const Icon = stage.icon
                            return (
                                <div key={stage.k} className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${reached ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
                                    <Icon size={18} weight={reached ? 'fill' : 'regular'} />
                                    <div className="text-[10px] font-medium uppercase tracking-wider">{stage.label}</div>
                                </div>
                            )
                        })}
                    </div>
                )}

                <Card className="bg-zinc-900/40 border-white/5 p-2.5 rounded-2xl shadow-inner">
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div className="min-w-0">
                            <div className="text-zinc-500 uppercase tracking-wide">Cliente</div>
                            <div className="font-semibold text-zinc-200 truncate">{order.customer_name}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-zinc-500 uppercase tracking-wide">Totale</div>
                            <div className="font-bold text-zinc-200">€{Number(order.total_amount).toFixed(2)}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-zinc-500 uppercase tracking-wide">Stato</div>
                            {unpaid < 0.01 && order.status !== 'CANCELLED' ? (
                                <div className="font-bold text-emerald-400">Pagato</div>
                            ) : (
                                <div className="font-bold text-amber-400">Da pagare</div>
                            )}
                        </div>
                    </div>
                    {unpaid > 0.01 && (
                        <div className="flex justify-between text-xs pt-2 mt-2 border-t border-white/5">
                            <span className="text-amber-500/80">
                                {requiresOnlinePayment ? (verifyingPayment ? 'Verifica pagamento online' : 'Pagamento online in attesa') : 'Da pagare al ritiro'}
                            </span>
                            <span className="font-bold text-amber-400">€{unpaid.toFixed(2)}</span>
                        </div>
                    )}
                    {order.status === 'PREPARING' && (
                        <div className="flex justify-between text-xs pt-2 border-t border-white/5 mt-2">
                            <span className="text-zinc-500 flex items-center gap-1"><Clock size={12} />Tempo stimato</span>
                            <span className="font-medium text-zinc-300">~{order.estimated_minutes} min</span>
                        </div>
                    )}
                </Card>

                {qrMode && (
                    <Card className="bg-emerald-500/10 border-emerald-500/30 p-4 rounded-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <QrCode size={20} weight="fill" className="text-emerald-300" />
                            <div>
                                <div className="text-sm font-black uppercase tracking-wide text-emerald-200">QR ritiro</div>
                                <div className="text-xs text-emerald-100/75">Salvalo e mostralo al banco.</div>
                            </div>
                        </div>
                        <div className="rounded-2xl bg-white p-3 flex justify-center">
                            <QRCodeGenerator value={pickupQrValue} size={220} className="rounded-xl" />
                        </div>
                        <div className="mt-3 rounded-xl border border-emerald-400/20 bg-black/20 p-3 text-xs leading-relaxed text-emerald-50/85">
                            Mostra questo QR al personale. Verrà scannerizzato e ogni prodotto consegnato sarà spuntato. Salvalo adesso per non perderlo prima del ritiro.
                        </div>
                        <Button onClick={handleSavePickupQr} className="mt-3 w-full bg-emerald-400 hover:bg-emerald-300 text-black font-black">
                            <FloppyDisk size={17} weight="fill" className="mr-2" /> Salva QR ritiro
                        </Button>
                    </Card>
                )}

                {qrMode && pickupItems.length > 0 && (
                    <Card className="bg-zinc-900/50 border-white/5 p-3 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Ritiro prodotti</div>
                                <div className="text-sm font-semibold text-zinc-200">{remainingPieces} da ritirare · {pickedPieces} ritirati</div>
                            </div>
                            <div className="text-right text-xs text-zinc-500">{pickedPieces}/{totalPieces}</div>
                        </div>
                        <div className="space-y-2">
                            {pickupItems.map(item => (
                                <div key={item.id} className="rounded-xl bg-black/20 border border-white/5 p-2.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-zinc-100 truncate">{item.name}</div>
                                            <div className="text-xs text-zinc-500">{item.picked_quantity} ritirati · {item.remaining_quantity} mancanti</div>
                                        </div>
                                        <div className={`shrink-0 text-xs font-black rounded-full px-2 py-1 ${item.remaining_quantity > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                            {item.remaining_quantity > 0 ? `${item.remaining_quantity}x` : 'OK'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Fiscal receipt download */}
                {isPaid && (
                    <Card className={`${receiptReady ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/20'} p-3 rounded-2xl`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${receiptReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                <Receipt size={20} weight="fill" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`text-xs font-bold uppercase tracking-wider ${receiptReady ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    Scontrino
                                </div>
                                <div className={`text-[10px] leading-tight mt-0.5 line-clamp-2 ${receiptReady ? 'text-emerald-200/70' : 'text-amber-200/70'}`}>
                                    {receiptReady
                                        ? "Disponibile per il download."
                                        : "Scarica appena disponibile."}
                                </div>
                            </div>
                            <Button
                                onClick={handleDownloadReceipt}
                                disabled={downloadingReceipt}
                                size="sm"
                                className={`shrink-0 h-8 px-3 rounded-lg text-xs font-bold transition-all ${receiptReady ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20' : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20'} disabled:opacity-60`}
                            >
                                {downloadingReceipt ? 'Apertura...' : 'Scarica'}
                            </Button>
                        </div>
                    </Card>
                )}

                <div className="text-center text-xs text-zinc-500 pt-2">
                    {order.takeaway_pickup_mode === 'qr'
                        ? 'Salva questa pagina e il QR ritiro: servirà al banco quando l\'ordine sarà pronto.'
                        : `Salva questa pagina. Il numero #${String(order.pickup_number).padStart(3, '0')} sarà mostrato sullo schermo in sala quando pronto.`}
                </div>
            </div>
        </div>
    )
}
