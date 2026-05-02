import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatabaseService } from '@/services/DatabaseService'
import type { TakeawayPickupQrOrder } from '@/services/types'
import { Check, CheckCircle, Receipt, ScanSmiley, ArrowsClockwise, Warning, XCircle, Package, User, Money, SpinnerGap } from '@phosphor-icons/react'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    restaurantId: string
}

function money(value: number | undefined | null) {
    return `€${Number(value || 0).toFixed(2)}`
}

function pickupProgress(order: TakeawayPickupQrOrder | null) {
    const items = order?.items || []
    const total = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const picked = items.reduce((sum, item) => sum + Number(item.picked_quantity || 0), 0)
    return { total, picked, remaining: Math.max(0, total - picked) }
}

// Native BarcodeDetector quando disponibile (Chrome/Edge mobile, Safari 17+).
// Fallback su @zxing/browser configurato per scansione molto rapida.
type NativeDetector = {
    detect: (source: CanvasImageSource | ImageBitmap) => Promise<Array<{ rawValue: string }>>
}

declare global {
    interface Window {
        BarcodeDetector?: new (init?: { formats?: string[] }) => NativeDetector
    }
}

export default function TakeawayQrScannerDialog({ open, onOpenChange, restaurantId }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const zxingControlsRef = useRef<IScannerControls | null>(null)
    const nativeFrameRef = useRef<number | null>(null)
    const lockedRef = useRef(false)
    const [manualValue, setManualValue] = useState('')
    const [scannerError, setScannerError] = useState<string | null>(null)
    const [resolving, setResolving] = useState(false)
    const [order, setOrder] = useState<TakeawayPickupQrOrder | null>(null)
    const [lastTokenOrUrl, setLastTokenOrUrl] = useState('')
    const [claiming, setClaiming] = useState<string | null>(null)
    const [scanning, setScanning] = useState(false)
    const [qrFound, setQrFound] = useState(false)

    const stopScanner = () => {
        if (zxingControlsRef.current) {
            try { zxingControlsRef.current.stop() } catch {}
            zxingControlsRef.current = null
        }
        if (nativeFrameRef.current !== null) {
            cancelAnimationFrame(nativeFrameRef.current)
            nativeFrameRef.current = null
        }
        if (streamRef.current) {
            try { streamRef.current.getTracks().forEach(t => t.stop()) } catch {}
            streamRef.current = null
        }
        lockedRef.current = false
        setScanning(false)
    }

    const resolveQr = async (value: string) => {
        const code = value.trim()
        if (!code || resolving) return
        setQrFound(true)
        setResolving(true)
        setScannerError(null)
        stopScanner()
        try {
            const next = await DatabaseService.resolveTakeawayPickupQr(restaurantId, code)
            setOrder(next)
            setLastTokenOrUrl(code)
            setManualValue('')
            try {
                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                    navigator.vibrate?.(40)
                }
            } catch {}
            toast.success(`Ordine #${String(next.pickup_number).padStart(3, '0')} trovato`)
        } catch (err: any) {
            setScannerError(err?.message || 'QR non valido')
            setOrder(null)
            setQrFound(false)
        } finally {
            setResolving(false)
        }
    }

    const startNativeDetector = async (stream: MediaStream): Promise<boolean> => {
        if (typeof window === 'undefined' || !window.BarcodeDetector) return false
        const video = videoRef.current
        if (!video) return false
        try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
            const tick = async () => {
                if (lockedRef.current || !videoRef.current) return
                try {
                    if (video.readyState >= 2) {
                        const codes = await detector.detect(video)
                        const first = codes[0]?.rawValue
                        if (first && !lockedRef.current) {
                            lockedRef.current = true
                            void resolveQr(first)
                            return
                        }
                    }
                } catch {
                    // detection error; keep polling
                }
                nativeFrameRef.current = requestAnimationFrame(tick)
            }
            nativeFrameRef.current = requestAnimationFrame(tick)
            return true
        } catch {
            return false
        }
    }

    const startZxingDetector = async (stream: MediaStream) => {
        const video = videoRef.current
        if (!video) return
        const hints = new Map<DecodeHintType, unknown>()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE])
        hints.set(DecodeHintType.TRY_HARDER, true)
        const reader = new BrowserQRCodeReader(hints, {
            delayBetweenScanAttempts: 25,
            delayBetweenScanSuccess: 100,
        })
        // Riusa lo stream già aperto: la versione decodeFromVideoDevice della
        // libreria farebbe un secondo getUserMedia e raddoppia il warmup.
        ;(video as any).srcObject = stream
        await video.play().catch(() => {})
        const controls = await (reader as any).decodeFromVideoElement(video, (result: any) => {
            const text = result?.getText?.()
            if (!text || lockedRef.current) return
            lockedRef.current = true
            void resolveQr(text)
        })
        zxingControlsRef.current = controls
    }

    const startScanner = async () => {
        if (!open || order || resolving) return
        if (!videoRef.current) return
        if (zxingControlsRef.current || nativeFrameRef.current !== null) return
        setScannerError(null)
        try {
            // Richiedi camera posteriore con risoluzione alta e autofocus
            // continuo: questo fa la differenza vera sul tempo di lettura.
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                    // @ts-expect-error advanced costraints non standard
                    advanced: [{ focusMode: 'continuous' }, { zoom: 1.0 }],
                },
            })
            streamRef.current = stream
            const video = videoRef.current
            video.srcObject = stream
            video.setAttribute('playsinline', 'true')
            video.muted = true
            await video.play().catch(() => {})
            setScanning(true)

            const usingNative = await startNativeDetector(stream)
            if (!usingNative) {
                await startZxingDetector(stream)
            }
        } catch (err: any) {
            setScanning(false)
            setScannerError(err?.message || 'Fotocamera non disponibile. Inserisci il codice manualmente.')
        }
    }

    useEffect(() => {
        if (!open) {
            stopScanner()
                setOrder(null)
                setScannerError(null)
                setManualValue('')
                setQrFound(false)
            return
        }
        const timer = window.setTimeout(startScanner, 50)
        return () => {
            window.clearTimeout(timer)
            stopScanner()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, order?.id])

    const claim = async (itemId: string, quantity: number) => {
        if (!order) return
        setClaiming(`${itemId}:${quantity}`)
        try {
            const result = await DatabaseService.claimTakeawayPickupItem({
                restaurantId,
                orderId: order.id,
                orderItemId: itemId,
                quantity,
                tokenOrUrl: lastTokenOrUrl,
            })
            setOrder(result.order)
            const done = pickupProgress(result.order).remaining === 0
            toast.success(done ? 'Ordine ritirato completamente' : 'Prodotto consegnato')
        } catch (err: any) {
            toast.error(err?.message || 'Errore consegna prodotto')
        } finally {
            setClaiming(null)
        }
    }

    const claimAll = async () => {
        if (!order) return
        const remaining = order.items.filter(item => Number(item.remaining_quantity || 0) > 0)
        if (remaining.length === 0) return
        setClaiming('__all__')
        try {
            let last = order
            for (const item of remaining) {
                const result = await DatabaseService.claimTakeawayPickupItem({
                    restaurantId,
                    orderId: order.id,
                    orderItemId: item.id,
                    quantity: Number(item.remaining_quantity || 0),
                    tokenOrUrl: lastTokenOrUrl,
                })
                last = result.order
            }
            setOrder(last)
            toast.success('Ordine ritirato completamente')
        } catch (err: any) {
            toast.error(err?.message || 'Errore consegna prodotti')
        } finally {
            setClaiming(null)
        }
    }

    const progress = pickupProgress(order)
    const unpaid = order ? Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0)) : 0
    const canClaim = !!order && unpaid < 0.01 && order.status !== 'CANCELLED'
    const completed = !!order && progress.total > 0 && progress.remaining === 0
    const progressPct = progress.total > 0 ? Math.min(100, (progress.picked / progress.total) * 100) : 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="top-[56%] sm:top-[50%] bg-zinc-950 border-white/10 text-white max-w-lg p-0 overflow-hidden rounded-[1.75rem] max-h-[92dvh]">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/5">
                    <DialogTitle className="flex items-center gap-2.5 text-white">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                            <ScanSmiley size={20} weight="fill" className="text-emerald-300" />
                        </div>
                        <div>
                            <div className="text-[15px] font-bold leading-tight">Ritiro asporto</div>
                            <div className="text-[11px] font-medium text-zinc-500">
                                {order ? 'Spunta i prodotti consegnati' : 'Inquadra il QR del cliente'}
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {!order && (
                    <div className="px-5 py-4 space-y-4">
                        <div className="relative mx-auto w-full max-w-[430px] overflow-hidden rounded-[1.35rem] bg-black aspect-[4/5] sm:aspect-[4/3] max-h-[58dvh]">
                            <video
                                ref={videoRef}
                                className="absolute inset-0 h-full w-full object-cover"
                                muted
                                playsInline
                                autoPlay
                            />
                            {/* Reticolo scan moderno con angoli */}
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="relative w-[68%] aspect-square">
                                    <div className="absolute inset-0 rounded-3xl shadow-[0_0_0_999px_rgba(0,0,0,0.55)]" />
                                    {[
                                        'top-0 left-0 border-l-[3px] border-t-[3px] rounded-tl-2xl',
                                        'top-0 right-0 border-r-[3px] border-t-[3px] rounded-tr-2xl',
                                        'bottom-0 left-0 border-l-[3px] border-b-[3px] rounded-bl-2xl',
                                        'bottom-0 right-0 border-r-[3px] border-b-[3px] rounded-br-2xl',
                                    ].map((cls, i) => (
                                        <div key={i} className={`absolute w-10 h-10 border-emerald-300 ${cls}`} />
                                    ))}
                                    {scanning && !qrFound && (
                                        <div className="absolute inset-x-3 top-3 h-[2px] bg-emerald-300/80 shadow-[0_0_12px_rgba(110,231,183,0.7)] animate-[scanner-line_1.15s_ease-in-out_infinite]" />
                                    )}
                                </div>
                            </div>
                            <style>{`@keyframes scanner-line { 0%{transform:translateY(0)} 50%{transform:translateY(calc(min(68vw, 330px) - 36px))} 100%{transform:translateY(0)} }`}</style>
                            {(qrFound || resolving) && (
                                <div className="absolute inset-0 bg-black/78 backdrop-blur-sm flex flex-col items-center justify-center text-center px-8">
                                    <div className="w-14 h-14 rounded-2xl bg-emerald-400 text-black flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                        <SpinnerGap size={28} weight="bold" className="animate-spin" />
                                    </div>
                                    <div className="mt-4 text-lg font-black text-white">QR trovato</div>
                                    <div className="mt-1 text-sm text-zinc-300 leading-snug">
                                        Carico l'ordine e preparo la consegna dei prodotti.
                                    </div>
                                </div>
                            )}
                            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl bg-black/70 px-3 py-2 backdrop-blur-md">
                                <span className="text-xs text-zinc-200 font-medium">
                                    {qrFound || resolving ? 'QR trovato' : scanning ? 'Inquadra il QR' : 'Avvio camera...'}
                                </span>
                                {scanning && !qrFound && (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        LIVE
                                    </span>
                                )}
                            </div>
                        </div>

                        {scannerError && (
                            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                                <Warning size={18} weight="fill" className="shrink-0 mt-0.5" />
                                <span className="leading-snug">{scannerError}</span>
                            </div>
                        )}

                        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
                                Inserimento manuale
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={manualValue}
                                    onChange={e => setManualValue(e.target.value)}
                                    placeholder="Token o link QR"
                                    className="h-11 rounded-xl bg-black/25 border-white/10 text-white"
                                />
                                <Button
                                    disabled={!manualValue.trim() || resolving}
                                    onClick={() => resolveQr(manualValue)}
                                    className="h-11 bg-emerald-500 hover:bg-emerald-400 text-black font-bold shrink-0"
                                >
                                    Cerca
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {order && (
                    <div className="flex flex-col max-h-[80vh]">
                        <div className="px-5 pt-4 pb-4 border-b border-white/5 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Ordine</div>
                                    <div className="mt-0.5 font-mono text-5xl font-black leading-none tracking-tight text-white">
                                        #{String(order.pickup_number).padStart(3, '0')}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Totale</div>
                                    <div className="text-2xl font-black text-white leading-tight">{money(order.total_amount)}</div>
                                    {unpaid < 0.01 ? (
                                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2 py-1 text-[11px] font-black text-emerald-300">
                                            <CheckCircle size={12} weight="fill" /> Pagato
                                        </div>
                                    ) : (
                                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-400/30 px-2 py-1 text-[11px] font-black text-red-300">
                                            <Money size={12} weight="fill" /> {money(unpaid)}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-bold uppercase tracking-wider">
                                        <User size={12} weight="fill" /> Cliente
                                    </div>
                                    <div className="mt-0.5 text-sm font-semibold text-zinc-100 truncate">{order.customer_name || 'Cliente'}</div>
                                </div>
                                <div className="w-28 shrink-0">
                                    <div className="flex justify-between text-[10px] text-zinc-500 font-bold mb-1">
                                        <span>Ritiro</span>
                                        <span>{progress.picked}/{progress.total}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${completed ? 'bg-emerald-400' : 'bg-emerald-500/80'}`}
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {!canClaim && unpaid >= 0.01 && (
                            <div className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                                <Warning size={16} weight="fill" className="shrink-0 mt-0.5" />
                                <span>L'ordine non è ancora pagato. Incassa il residuo prima di consegnare i prodotti.</span>
                            </div>
                        )}

                        {/* Lista prodotti */}
                        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
                            {order.items.map(item => {
                                const remaining = Number(item.remaining_quantity || 0)
                                const done = remaining === 0
                                return (
                                    <div
                                        key={item.id}
                                        className={`rounded-2xl border p-3 transition-all ${done ? 'border-white/5 bg-white/[0.02] opacity-35 grayscale' : 'border-white/10 bg-zinc-900/80 shadow-lg shadow-black/10'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center border ${done ? 'border-white/10 bg-white/[0.03] text-zinc-500' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'}`}>
                                                {done ? <CheckCircle size={20} weight="fill" /> : <Package size={20} weight="fill" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className={`font-semibold leading-snug ${done ? 'text-zinc-400 line-through decoration-white/30' : 'text-white'}`}>
                                                    {item.name}
                                                </div>
                                                <div className="mt-0.5 text-[11px] text-zinc-500">
                                                    {done ? 'Tutto consegnato' : `${item.picked_quantity} ritirati su ${item.quantity}`}
                                                </div>
                                            </div>
                                            {!done ? (
                                                <Button
                                                    disabled={!canClaim || !!claiming}
                                                    onClick={() => claim(item.id, remaining)}
                                                    size="icon"
                                                    aria-label={`Completa ${item.name}`}
                                                    title={`Completa ${item.name}`}
                                                    className="h-12 w-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/15"
                                                >
                                                    {claiming === `${item.id}:${remaining}` ? (
                                                        <SpinnerGap size={20} weight="bold" className="animate-spin" />
                                                    ) : (
                                                        <Check size={22} weight="bold" />
                                                    )}
                                                </Button>
                                            ) : (
                                                <div className="h-12 w-12 rounded-2xl bg-white/[0.03] border border-white/10 text-zinc-500 flex items-center justify-center">
                                                    <CheckCircle size={22} weight="fill" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Footer azioni */}
                        <div className="px-5 py-3 border-t border-white/5 bg-zinc-950/95 grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setOrder(null)
                                    setScannerError(null)
                                    setQrFound(false)
                                }}
                                className="h-12 border-white/15 bg-black/20 text-zinc-100 hover:bg-white/5 font-black rounded-2xl"
                            >
                                <ArrowsClockwise size={17} className="mr-2" /> Scansiona nuovo
                            </Button>
                            {progress.remaining > 0 ? (
                                <Button
                                    disabled={!canClaim || !!claiming}
                                    onClick={claimAll}
                                    className="h-12 bg-emerald-500 hover:bg-emerald-400 text-black font-black shadow-lg shadow-emerald-500/20 rounded-2xl"
                                >
                                    <CheckCircle size={17} weight="fill" className="mr-2" />
                                    {claiming === '__all__' ? 'Consegno...' : `Completa ritiro (${progress.remaining})`}
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => onOpenChange(false)}
                                    className="h-12 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-2xl"
                                >
                                    <Receipt size={17} weight="fill" className="mr-2" /> Chiudi
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {!order && (
                    <div className="px-5 pb-5 -mt-1">
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500 leading-snug">
                            <span className="text-emerald-300/90 font-semibold">Suggerimento:</span> tieni il telefono a 15-20 cm dal QR e assicurati che sia ben illuminato. La lettura è quasi istantanea.
                        </div>
                    </div>
                )}

                {!order && (
                    <div className="px-5 pb-5">
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="w-full h-10 text-zinc-400 hover:text-white hover:bg-white/5"
                        >
                            <XCircle size={16} className="mr-2" /> Annulla
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
