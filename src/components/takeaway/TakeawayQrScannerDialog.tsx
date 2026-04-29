import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { DatabaseService } from '@/services/DatabaseService'
import type { TakeawayPickupQrOrder } from '@/services/types'
import { Camera, CheckCircle, QrCode, Warning, XCircle } from '@phosphor-icons/react'

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

export default function TakeawayQrScannerDialog({ open, onOpenChange, restaurantId }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const controlsRef = useRef<IScannerControls | null>(null)
    const lockedRef = useRef(false)
    const [manualValue, setManualValue] = useState('')
    const [scannerError, setScannerError] = useState<string | null>(null)
    const [resolving, setResolving] = useState(false)
    const [order, setOrder] = useState<TakeawayPickupQrOrder | null>(null)
    const [lastTokenOrUrl, setLastTokenOrUrl] = useState('')
    const [claiming, setClaiming] = useState<string | null>(null)

    const stopScanner = () => {
        controlsRef.current?.stop()
        controlsRef.current = null
        lockedRef.current = false
    }

    const resolveQr = async (value: string) => {
        const code = value.trim()
        if (!code || resolving) return
        setResolving(true)
        setScannerError(null)
        stopScanner()
        try {
            const next = await DatabaseService.resolveTakeawayPickupQr(restaurantId, code)
            setOrder(next)
            setLastTokenOrUrl(code)
            setManualValue('')
            toast.success(`Ordine #${String(next.pickup_number).padStart(3, '0')} trovato`)
        } catch (err: any) {
            setScannerError(err?.message || 'QR non valido')
            setOrder(null)
        } finally {
            setResolving(false)
        }
    }

    const startScanner = async () => {
        if (!open || order || controlsRef.current || resolving) return
        if (!videoRef.current) return
        setScannerError(null)
        try {
            const reader = new BrowserQRCodeReader()
            const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
                const text = result?.getText()
                if (!text || lockedRef.current) return
                lockedRef.current = true
                void resolveQr(text)
            })
            controlsRef.current = controls
        } catch (err: any) {
            setScannerError(err?.message || 'Fotocamera non disponibile. Inserisci il codice manualmente.')
        }
    }

    useEffect(() => {
        if (!open) {
            stopScanner()
            setOrder(null)
            setScannerError(null)
            setManualValue('')
            return
        }
        const timer = window.setTimeout(startScanner, 150)
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

    const progress = pickupProgress(order)
    const unpaid = order ? Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0)) : 0
    const canClaim = !!order && unpaid < 0.01 && order.status !== 'CANCELLED'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <QrCode size={20} weight="fill" className="text-amber-400" />
                        Scannerizza QR ritiro
                    </DialogTitle>
                </DialogHeader>

                {!order && (
                    <div className="space-y-4">
                        <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-black aspect-[4/3]">
                            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-amber-400/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
                            <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/70 px-3 py-2 text-xs text-zinc-200 backdrop-blur">
                                Inquadra il QR mostrato dal cliente.
                            </div>
                        </div>

                        {scannerError && (
                            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                                <Warning size={18} weight="fill" className="shrink-0 mt-0.5" />
                                <span>{scannerError}</span>
                            </div>
                        )}

                        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Inserimento manuale</div>
                            <div className="flex gap-2">
                                <Input
                                    value={manualValue}
                                    onChange={e => setManualValue(e.target.value)}
                                    placeholder="Incolla token o link QR"
                                    className="h-11 rounded-xl bg-black/25 border-white/10 text-white"
                                />
                                <Button
                                    disabled={!manualValue.trim() || resolving}
                                    onClick={() => resolveQr(manualValue)}
                                    className="h-11 bg-amber-500 hover:bg-amber-400 text-black font-bold"
                                >
                                    Cerca
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {order && (
                    <div className="space-y-4">
                        <Card className="bg-amber-500/10 border-amber-500/25 p-4 rounded-2xl">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-amber-200/80 font-bold">Ordine</div>
                                    <div className="text-5xl font-black text-amber-300 leading-none">#{String(order.pickup_number).padStart(3, '0')}</div>
                                    <div className="mt-2 text-sm text-zinc-300">{order.customer_name || 'Cliente'}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Totale</div>
                                    <div className="text-xl font-black text-zinc-100">{money(order.total_amount)}</div>
                                    {unpaid < 0.01 ? (
                                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-300">
                                            <CheckCircle size={13} weight="fill" /> Pagato
                                        </div>
                                    ) : (
                                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-xs font-bold text-red-300">
                                            <XCircle size={13} weight="fill" /> Da incassare {money(unpaid)}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 rounded-xl bg-black/20 border border-white/5 p-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-400">Ritiro prodotti</span>
                                    <span className="font-black text-white">{progress.picked}/{progress.total}</span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                                    <div
                                        className="h-full rounded-full bg-emerald-400 transition-all"
                                        style={{ width: `${progress.total > 0 ? Math.min(100, (progress.picked / progress.total) * 100) : 0}%` }}
                                    />
                                </div>
                            </div>
                        </Card>

                        {!canClaim && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                                Prima di consegnare i prodotti l'ordine deve risultare pagato.
                            </div>
                        )}

                        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                            {order.items.map(item => {
                                const remaining = Number(item.remaining_quantity || 0)
                                return (
                                    <div key={item.id} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-zinc-100 truncate">{item.name}</div>
                                                <div className="text-xs text-zinc-500 mt-0.5">
                                                    {item.picked_quantity} ritirati · {remaining} mancanti su {item.quantity}
                                                </div>
                                            </div>
                                            <div className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${remaining > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                                {remaining > 0 ? `${remaining}x` : 'OK'}
                                            </div>
                                        </div>
                                        {remaining > 0 && (
                                            <div className="mt-3 grid grid-cols-2 gap-2">
                                                <Button
                                                    disabled={!canClaim || !!claiming}
                                                    onClick={() => claim(item.id, 1)}
                                                    variant="outline"
                                                    className="border-white/10 text-zinc-100 hover:bg-white/5"
                                                >
                                                    Consegna 1
                                                </Button>
                                                <Button
                                                    disabled={!canClaim || !!claiming}
                                                    onClick={() => claim(item.id, remaining)}
                                                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold"
                                                >
                                                    Completa riga
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setOrder(null)
                                    setScannerError(null)
                                }}
                                className="border-white/10 text-zinc-100 hover:bg-white/5"
                            >
                                <Camera size={16} className="mr-2" /> Nuova scansione
                            </Button>
                            <Button onClick={() => onOpenChange(false)} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
                                Chiudi
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
