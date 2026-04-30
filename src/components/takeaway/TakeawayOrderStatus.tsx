import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { DatabaseService } from '@/services/DatabaseService'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    CheckCircle,
    Clock,
    ForkKnife,
    Bell,
    Warning,
    House,
    Receipt,
    QrCode,
    DownloadSimple,
    Package,
    ShareNetwork,
    Sparkle,
} from '@phosphor-icons/react'
import QRCodeGenerator from '@/components/QRCodeGenerator'

type Status = 'PENDING' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'PAID' | 'CANCELLED'

const LABEL: Record<Status, { text: string; sub: string; color: string; ring: string }> = {
    PENDING: { text: 'In attesa di pagamento', sub: 'Il tuo ordine non è ancora confermato', color: 'text-amber-300', ring: 'border-amber-500/30 bg-amber-500/10' },
    PREPARING: { text: 'In preparazione', sub: 'La cucina sta preparando il tuo ordine', color: 'text-amber-400', ring: 'border-amber-500/30 bg-amber-500/10' },
    READY: { text: 'Pronto al ritiro!', sub: 'Vieni al bancone a ritirare', color: 'text-emerald-400', ring: 'border-emerald-500/40 bg-emerald-500/10' },
    PICKED_UP: { text: 'Ritirato', sub: 'Grazie e buon appetito!', color: 'text-zinc-300', ring: 'border-zinc-500/30 bg-zinc-500/10' },
    PAID: { text: 'Ritirato', sub: 'Grazie e buon appetito!', color: 'text-zinc-300', ring: 'border-zinc-500/30 bg-zinc-500/10' },
    CANCELLED: { text: 'Annullato', sub: "L'ordine è stato annullato", color: 'text-red-400', ring: 'border-red-500/30 bg-red-500/10' },
}

/**
 * Renderizza una card QR ad alta risoluzione su canvas.
 * Viene condivisa come immagine PNG: su mobile il sistema mostra il foglio
 * nativo con "Salva immagine", che è l'unico percorso consentito dal browser
 * per arrivare al rullino foto senza app nativa.
 */
async function buildPickupQrPoster(opts: {
    qrUrl: string
    pickupNumber: string
    restaurantName?: string
}): Promise<{ blob: Blob; dataUrl: string }> {
    const { qrUrl, pickupNumber, restaurantName } = opts
    const W = 1080
    const H = 1600
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas non supportato')

    ctx.fillStyle = '#070707'
    ctx.fillRect(0, 0, W, H)

    const PADDING = 58
    ctx.fillStyle = '#101010'
    roundRect(ctx, PADDING, PADDING, W - PADDING * 2, H - PADDING * 2, 64, true, false)
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 5
    roundRect(ctx, PADDING, PADDING, W - PADDING * 2, H - PADDING * 2, 64, false, true)

    ctx.fillStyle = '#86efac'
    ctx.font = '800 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('QR RITIRO ASPORTO', W / 2, 154)

    if (restaurantName) {
        ctx.fillStyle = '#a1a1aa'
        ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        ctx.fillText(restaurantName.toUpperCase(), W / 2, 196)
    }

    ctx.fillStyle = '#ffffff'
    ctx.font = '800 48px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText('Mostralo al banco', W / 2, 270)

    ctx.fillStyle = '#d4d4d8'
    ctx.font = '500 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText('Il personale scannerizza il QR e consegna i prodotti.', W / 2, 316)

    const qrSize = 700
    const qrX = (W - qrSize) / 2
    const qrY = 390
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, qrX - 26, qrY - 26, qrSize + 52, qrSize + 52, 38, true, false)
    const qrImg = await loadImage(await fetchImageAsDataUrl(qrUrl))
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

    ctx.fillStyle = '#18181b'
    roundRect(ctx, 128, 1195, W - 256, 172, 34, true, false)
    ctx.strokeStyle = '#3f3f46'
    ctx.lineWidth = 2
    roundRect(ctx, 128, 1195, W - 256, 172, 34, false, true)

    ctx.fillStyle = '#f4f4f5'
    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText('Salva questa immagine', W / 2, 1260)

    ctx.fillStyle = '#a1a1aa'
    ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText("Ti serve per ritirare l'ordine anche se chiudi la pagina.", W / 2, 1306)

    ctx.fillStyle = '#71717a'
    ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText(`Codice di riserva: #${pickupNumber}`, W / 2, 1464)

    const dataUrl = canvas.toDataURL('image/png', 0.95)
    const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob fallito'))), 'image/png', 0.95)
    })
    return { blob, dataUrl }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
    if (fill) ctx.fill()
    if (stroke) ctx.stroke()
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Caricamento QR fallito'))
        img.src = src
    })
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) throw new Error(`QR non generato (${res.status})`)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
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
        restaurant_name?: string | null
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
    const [savingQr, setSavingQr] = useState(false)
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

        return () => { alive = false; clearInterval(poll) }
    }, [restaurantId, pickupCode])

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

    const pickupQrValue = useMemo(() => {
        if (!restaurantId || !order?.takeaway_pickup_token) return ''
        return `${window.location.origin}/takeaway-pickup/${restaurantId}?token=${order.takeaway_pickup_token}`
    }, [restaurantId, order?.takeaway_pickup_token])

    const handleSavePickupQr = async () => {
        if (!pickupQrValue || !order) return
        setSavingQr(true)
        const safeNumber = String(order.pickup_number).padStart(3, '0')
        try {
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=720x720&margin=0&qzone=1&data=${encodeURIComponent(pickupQrValue)}`
            const { blob, dataUrl } = await buildPickupQrPoster({
                qrUrl: qrApiUrl,
                pickupNumber: safeNumber,
                restaurantName: order.restaurant_name || undefined,
            })
            const fileName = `ritiro-asporto-${safeNumber}.png`
            const file = new File([blob], fileName, { type: 'image/png' })

            // Su iOS/Android moderni, navigator.share con file mostra il share
            // sheet nativo dove "Salva immagine" mette il file nel rullino.
            // Questa è l'unica via di salvataggio in rullino da web mobile.
            const nav = navigator as any
            if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
                try {
                    await nav.share({
                        files: [file],
                        title: `Ritiro asporto #${safeNumber}`,
                        text: 'Salva questa immagine: il QR ti servirà al banco per ritirare l\'ordine.',
                    })
                    toast.success('Tocca "Salva immagine" per metterlo nel rullino foto')
                    return
                } catch (err: any) {
                    if (err?.name === 'AbortError') return
                    // se share fallisce per altro motivo, fallback al download
                }
            }

            // Fallback: apri immagine in nuova tab (su iOS Safari così l'utente
            // può tap-tenere → Aggiungi a Foto). Su desktop scarica direttamente.
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
            if (isMobile) {
                const w = window.open()
                if (w) {
                    w.document.write(`
                        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
                        <title>Ritiro #${safeNumber}</title>
                        <style>html,body{margin:0;background:#000;color:#fff;font-family:-apple-system,sans-serif;text-align:center}
                        .hint{padding:14px;font-size:13px;color:#a1a1aa;background:#0a0a0a;position:sticky;top:0}
                        img{display:block;max-width:100%;height:auto;margin:0 auto}
                        </style></head><body>
                        <div class="hint">Tieni premuto sull'immagine → <b>Salva immagine</b> per metterla nel rullino foto.</div>
                        <img src="${dataUrl}" alt="QR ritiro #${safeNumber}" />
                        </body></html>`)
                    w.document.close()
                    toast.success('Tieni premuto sull\'immagine e tocca "Salva immagine"')
                    return
                }
            }
            // Desktop: download diretto
            const a = document.createElement('a')
            a.href = dataUrl
            a.download = fileName
            document.body.appendChild(a)
            a.click()
            a.remove()
            toast.success('QR salvato')
        } catch (err: any) {
            toast.error(err?.message || 'Impossibile salvare il QR')
        } finally {
            setSavingQr(false)
        }
    }

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
    const qrMode = isPaid && order.takeaway_pickup_mode === 'qr' && !!pickupQrValue
    const pickupItems = order.items || []
    const totalPieces = pickupItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const pickedPieces = pickupItems.reduce((sum, item) => sum + Number(item.picked_quantity || 0), 0)
    const remainingPieces = Math.max(0, totalPieces - pickedPieces)
    const orderNumber = String(order.pickup_number).padStart(3, '0')
    const pickupProgressPct = totalPieces > 0 ? Math.min(100, (pickedPieces / totalPieces) * 100) : 0

    return (
        <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="max-w-md mx-auto px-3 sm:px-4 pt-3 sm:pt-5 space-y-3">
                {/* HERO: dipende dalla modalità */}
                {qrMode ? (
                    <QrHero
                        qrValue={pickupQrValue}
                        orderNumber={orderNumber}
                        onSave={handleSavePickupQr}
                        saving={savingQr}
                    />
                ) : (
                    <CodeHero
                        orderNumber={orderNumber}
                        label={label}
                        isReady={isReady}
                    />
                )}

                {/* Stato + progress stadi (per ordini non chiusi) */}
                {!isClosed && (
                    <Card className={`border ${label.ring} p-3 rounded-2xl`}>
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className={`text-sm font-black ${label.color}`}>{label.text}</div>
                                <div className="text-[11px] text-zinc-400 leading-tight">{label.sub}</div>
                            </div>
                            {order.status === 'PREPARING' && (
                                <div className="flex items-center gap-1 text-xs font-semibold text-zinc-300 bg-black/30 border border-white/10 rounded-full px-2.5 py-1">
                                    <Clock size={12} weight="fill" />~{order.estimated_minutes}'
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 mt-1">
                            {[
                                { k: 'PENDING', label: 'Ricevuto', icon: CheckCircle },
                                { k: 'PREPARING', label: 'Cucina', icon: ForkKnife },
                                { k: 'READY', label: 'Pronto', icon: Bell },
                            ].map((stage, i) => {
                                const reached = ['PENDING', 'PREPARING', 'READY'].indexOf(order.status) >= i
                                const Icon = stage.icon
                                return (
                                    <div
                                        key={stage.k}
                                        className={`relative py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${reached ? 'bg-amber-500/15 ring-1 ring-amber-500/30 text-amber-300' : 'bg-white/[0.03] text-zinc-600'}`}
                                    >
                                        <Icon size={16} weight={reached ? 'fill' : 'regular'} />
                                        <div className="text-[10px] font-bold uppercase tracking-wider">{stage.label}</div>
                                    </div>
                                )
                            })}
                        </div>
                    </Card>
                )}

                {/* Card cliente / pagamento */}
                <Card className="bg-zinc-900/50 border-white/5 p-3 rounded-2xl">
                    <div className="grid grid-cols-3 gap-3 text-[11px]">
                        <div className="min-w-0">
                            <div className="text-zinc-500 uppercase tracking-wide font-bold">Cliente</div>
                            <div className="font-semibold text-zinc-100 truncate text-[13px]">{order.customer_name}</div>
                        </div>
                        <div className="text-center min-w-0">
                            <div className="text-zinc-500 uppercase tracking-wide font-bold">Totale</div>
                            <div className="font-black text-white text-[13px]">€{Number(order.total_amount).toFixed(2)}</div>
                        </div>
                        <div className="text-right min-w-0">
                            <div className="text-zinc-500 uppercase tracking-wide font-bold">Pagamento</div>
                            {isPaid ? (
                                <div className="font-black text-emerald-400 text-[13px]">Pagato</div>
                            ) : (
                                <div className="font-black text-amber-400 text-[13px]">Da pagare</div>
                            )}
                        </div>
                    </div>
                    {unpaid > 0.01 && (
                        <div className="flex justify-between items-center text-xs pt-2 mt-2 border-t border-white/5">
                            <span className="text-amber-300/80 font-medium">
                                {requiresOnlinePayment ? (verifyingPayment ? 'Verifica pagamento...' : 'In attesa di pagamento online') : 'Da pagare al ritiro'}
                            </span>
                            <span className="font-black text-amber-300">€{unpaid.toFixed(2)}</span>
                        </div>
                    )}
                </Card>

                {/* Lista prodotti per il ritiro (solo modalità QR pagata) */}
                {qrMode && pickupItems.length > 0 && (
                    <Card className="bg-zinc-900/50 border-white/5 p-3 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                                    <Package size={16} weight="fill" className="text-emerald-300" />
                                </div>
                                <div>
                                    <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold">Ritiro prodotti</div>
                                    <div className="text-[13px] font-bold text-zinc-100 leading-tight">
                                        {remainingPieces === 0 ? 'Tutto consegnato' : `${remainingPieces} da ritirare`}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[11px] text-zinc-500">Avanzamento</div>
                                <div className="text-sm font-black text-emerald-300 font-mono tabular-nums">{pickedPieces}/{totalPieces}</div>
                            </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
                            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pickupProgressPct}%` }} />
                        </div>
                        <div className="space-y-1.5">
                            {pickupItems.map(item => (
                                <div
                                    key={item.id}
                                    className={`rounded-xl px-3 py-2 flex items-center justify-between gap-3 transition-all ${
                                        item.remaining_quantity === 0
                                            ? 'bg-emerald-500/5 border border-emerald-500/20'
                                            : 'bg-black/20 border border-white/5'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className={`text-sm font-semibold truncate ${item.remaining_quantity === 0 ? 'text-emerald-200/90' : 'text-zinc-100'}`}>
                                            {item.name}
                                        </div>
                                        <div className="text-[11px] text-zinc-500">
                                            {item.remaining_quantity === 0
                                                ? `Consegnati ${item.picked_quantity}/${item.quantity}`
                                                : `${item.picked_quantity} ritirati · ${item.remaining_quantity} mancanti`}
                                        </div>
                                    </div>
                                    <div className={`shrink-0 text-[11px] font-black rounded-full px-2 py-0.5 ${item.remaining_quantity > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                        {item.remaining_quantity > 0 ? `${item.remaining_quantity}×` : <CheckCircle size={11} weight="fill" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Scontrino fiscale */}
                {isPaid && (
                    <Card className={`p-3 rounded-2xl ${receiptReady ? 'bg-emerald-500/8 border-emerald-500/25' : 'bg-amber-500/5 border-amber-500/20'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${receiptReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                <Receipt size={18} weight="fill" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`text-[11px] font-black uppercase tracking-wider ${receiptReady ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    Scontrino fiscale
                                </div>
                                <div className={`text-[11px] leading-tight mt-0.5 ${receiptReady ? 'text-emerald-100/70' : 'text-amber-100/70'}`}>
                                    {receiptReady ? 'Disponibile per il download' : 'Sarà disponibile fra qualche istante'}
                                </div>
                            </div>
                            <Button
                                onClick={handleDownloadReceipt}
                                disabled={downloadingReceipt}
                                size="sm"
                                className={`shrink-0 h-9 px-3 rounded-lg text-xs font-black transition-all ${receiptReady ? 'bg-emerald-500 hover:bg-emerald-400 text-black' : 'bg-amber-500 hover:bg-amber-400 text-black'} disabled:opacity-60`}
                            >
                                <DownloadSimple size={14} weight="bold" className="mr-1" />
                                {downloadingReceipt ? 'Apro...' : 'Scarica'}
                            </Button>
                        </div>
                    </Card>
                )}

                {/* Hint finale */}
                <div className="text-center text-[11px] text-zinc-500 pt-1 px-2 leading-relaxed">
                    {qrMode
                        ? <>Il QR e' il tuo codice di ritiro. Salvalo subito e mostralo al banco quando l'ordine e' pronto.</>
                        : <>Conserva questa pagina. Il numero <span className="font-mono font-bold text-zinc-400">#{orderNumber}</span> verrà mostrato sullo schermo quando il tuo ordine sarà pronto.</>
                    }
                </div>
            </div>
        </div>
    )
}

/* ─────────────────── Hero per modalità QR ─────────────────── */
function QrHero({
    qrValue,
    orderNumber,
    onSave,
    saving,
}: {
    qrValue: string
    orderNumber: string
    onSave: () => void
    saving: boolean
}) {
    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="relative overflow-hidden rounded-[1.7rem] border border-emerald-500/25 bg-zinc-900/80 shadow-[0_24px_60px_-36px_rgba(16,185,129,0.65)]"
        >
            <div className="px-4 pt-4 pb-4">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-3 text-center">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-black/25 border border-emerald-400/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                        <Sparkle size={11} weight="fill" /> QR ritiro
                    </div>
                    <h1 className="mt-2 text-2xl font-black leading-tight text-white">
                        Salva il QR e mostralo al banco
                    </h1>
                    <p className="mt-1 text-sm text-emerald-100/75 leading-snug">
                        Serve per validare il ritiro e spuntare solo i prodotti consegnati.
                    </p>
                </div>

                <div className="mt-3 rounded-[1.35rem] bg-white p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]">
                    <QRCodeGenerator value={qrValue} size={312} className="rounded-xl w-full h-auto" />
                </div>

                <Button
                    onClick={onSave}
                    disabled={saving}
                    className="mt-3 w-full h-12 bg-emerald-400 hover:bg-emerald-300 text-black font-black text-[15px] rounded-2xl shadow-lg shadow-emerald-500/20 disabled:opacity-70"
                >
                    {saving ? (
                        <>
                            <motion.span
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                                className="mr-2 inline-block w-4 h-4 border-2 border-black/40 border-t-transparent rounded-full"
                            />
                            Apro condivisione...
                        </>
                    ) : (
                        <>
                            <ShareNetwork size={17} weight="fill" className="mr-2" />
                            Salva nel rullino
                        </>
                    )}
                </Button>

                <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 items-center rounded-2xl border border-white/8 bg-black/25 px-3 py-2.5">
                    <p className="text-[12px] leading-snug text-zinc-300">
                        Se chiudi questa pagina, usa l'immagine salvata per il ritiro.
                    </p>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-mono font-black tracking-widest text-zinc-400">
                        #{orderNumber}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

/* ─────────────────── Hero per modalità codice ─────────────────── */
function CodeHero({
    orderNumber,
    label,
    isReady,
}: {
    orderNumber: string
    label: { text: string; sub: string; color: string; ring: string }
    isReady: boolean
}) {
    return (
        <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className={`relative overflow-hidden rounded-3xl border p-6 text-center shadow-2xl ${
                isReady
                    ? 'bg-gradient-to-b from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/40 shadow-[0_30px_60px_-30px_rgba(16,185,129,0.5)]'
                    : 'bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/30'
            }`}
        >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 blur-3xl opacity-70" style={{ background: isReady ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.2)' }} />
            <div className="relative">
                <div className="text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-black mb-1">Ordine</div>
                <div className={`font-mono font-black tracking-tight leading-none text-[clamp(64px,22vw,108px)] ${isReady ? 'text-emerald-300' : 'text-amber-300'}`}>
                    #{orderNumber}
                </div>
                <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-black uppercase tracking-wide ${isReady ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/40 bg-amber-500/10 text-amber-200'}`}>
                    {isReady && <Bell size={13} weight="fill" />}
                    <QrCode size={13} weight="fill" className={isReady ? 'hidden' : 'inline'} />
                    {label.text}
                </div>
            </div>
        </motion.div>
    )
}
