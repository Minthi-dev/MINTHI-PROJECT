import React, { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { DatabaseService } from '@/services/DatabaseService'
import type { Order, OrderPaymentEntry } from '@/services/types'
import { CreditCard, Wallet, X, Receipt, CheckCircle, Trash, ArrowCounterClockwise, Printer } from '@phosphor-icons/react'

interface Props {
    open: boolean
    onOpenChange: (o: boolean) => void
    order: Order | null
    onPaid?: () => void
    onPrintReceipt?: (order: Order) => void
}

export default function TakeawayPaymentDialog({ open, onOpenChange, order, onPaid, onPrintReceipt }: Props) {
    const [amount, setAmount] = useState('')
    const [label, setLabel] = useState('')
    const [processing, setProcessing] = useState(false)

    const total = Number(order?.total_amount || 0)
    const paid = Number(order?.paid_amount || 0)
    const remaining = useMemo(() => Math.max(0, Math.round((total - paid) * 100) / 100), [total, paid])
    const fullyPaid = remaining < 0.01

    useEffect(() => {
        if (open) {
            setAmount(remaining > 0 ? remaining.toFixed(2) : '')
            setLabel('')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, order?.id])

    if (!order) return null

    const parsedAmount = () => {
        const n = Number(String(amount).replace(',', '.'))
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : NaN
    }

    const registerManual = async (method: 'cash' | 'card_pos') => {
        const amt = parsedAmount()
        if (Number.isNaN(amt)) return toast.error('Importo non valido')
        if (amt > remaining + 0.01) return toast.error(`Massimo €${remaining.toFixed(2)}`)
        setProcessing(true)
        try {
            const res = await DatabaseService.registerTakeawayPayment(order.id, method, amt, label.trim() || undefined)
            toast.success(res.fullyPaid ? 'Ordine completamente pagato' : `Registrati €${amt.toFixed(2)}`)
            if (res.fullyPaid) onPaid?.()
            setAmount('')
            setLabel('')
        } catch (e: any) {
            toast.error(e?.message || 'Errore')
        } finally {
            setProcessing(false)
        }
    }

    const payStripeLink = async () => {
        const amt = parsedAmount()
        if (Number.isNaN(amt)) return toast.error('Importo non valido')
        if (amt > remaining + 0.01) return toast.error(`Massimo €${remaining.toFixed(2)}`)
        setProcessing(true)
        try {
            const res = await DatabaseService.createTakeawayStripeCheckout(order.id, amt, label.trim() || undefined)
            window.open(res.checkoutUrl, '_blank', 'noopener,noreferrer')
            toast.info('Link Stripe aperto: fai pagare il cliente con carta. Al completamento il pagamento viene registrato automaticamente.')
        } catch (e: any) {
            toast.error(e?.message || 'Errore')
        } finally {
            setProcessing(false)
        }
    }

    const refundLast = async () => {
        if (!confirm('Annullare l\'ultimo pagamento manuale?')) return
        setProcessing(true)
        try {
            await DatabaseService.refundLastTakeawayPayment(order.id)
            toast.success('Pagamento annullato')
        } catch (e: any) {
            toast.error(e?.message || 'Errore')
        } finally {
            setProcessing(false)
        }
    }

    const splitHalf = () => setAmount((remaining / 2).toFixed(2))
    const splitCustom = (n: number) => setAmount((remaining / n).toFixed(2))

    const payments: OrderPaymentEntry[] = (order.payments as any) || []

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!processing) onOpenChange(v) }}>
            <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Receipt size={20} className="text-amber-400" />
                        Pagamento ordine #{String(order.pickup_number || '').padStart(3, '0')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">Cliente</span>
                            <span>{order.customer_name || '—'}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-zinc-400">Telefono</span>
                            <span className="font-mono">{order.customer_phone || '—'}</span>
                        </div>
                        <div className="flex justify-between text-base mt-2 pt-2 border-t border-white/10">
                            <span>Totale</span>
                            <span className="font-bold">€{total.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-emerald-400">Già pagato</span>
                            <span className="text-emerald-400 font-semibold">€{paid.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between text-lg mt-2 pt-2 border-t border-white/10 ${fullyPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                            <span>{fullyPaid ? 'Pagato' : 'Residuo'}</span>
                            <span className="font-bold">{fullyPaid ? <CheckCircle size={20} /> : `€${remaining.toFixed(2)}`}</span>
                        </div>
                    </div>

                    {payments.length > 0 && (
                        <div className="bg-white/5 rounded-xl p-3 border border-white/10 max-h-32 overflow-y-auto">
                            <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Storico pagamenti</div>
                            <div className="space-y-1">
                                {payments.map((p, i) => (
                                    <div key={i} className="flex justify-between text-xs">
                                        <span>
                                            {p.method === 'cash' ? '💵' : p.method === 'stripe' ? '💳' : '🖥️'} {p.label || p.method}
                                        </span>
                                        <span className="font-mono">€{Number(p.amount).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!fullyPaid && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-zinc-400 uppercase tracking-wider">Importo (€)</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="bg-white/5 border-white/10 mt-1 text-lg"
                                    placeholder={remaining.toFixed(2)}
                                />
                                <div className="flex gap-2 mt-2">
                                    <Button size="sm" variant="outline" onClick={() => setAmount(remaining.toFixed(2))} className="border-white/10 text-xs">Residuo</Button>
                                    <Button size="sm" variant="outline" onClick={splitHalf} className="border-white/10 text-xs">Metà</Button>
                                    <Button size="sm" variant="outline" onClick={() => splitCustom(3)} className="border-white/10 text-xs">1/3</Button>
                                    <Button size="sm" variant="outline" onClick={() => splitCustom(4)} className="border-white/10 text-xs">1/4</Button>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-zinc-400 uppercase tracking-wider">Etichetta (opzionale)</label>
                                <Input value={label} onChange={e => setLabel(e.target.value)} maxLength={64} placeholder="Es. Cliente 1, Alla romana..." className="bg-white/5 border-white/10 mt-1" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                                <Button
                                    onClick={() => registerManual('cash')}
                                    disabled={processing}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white h-14 flex flex-col gap-0"
                                >
                                    <Wallet size={20} />
                                    <span className="text-xs">Contanti</span>
                                </Button>
                                <Button
                                    onClick={() => registerManual('card_pos')}
                                    disabled={processing}
                                    className="bg-blue-600 hover:bg-blue-500 text-white h-14 flex flex-col gap-0"
                                >
                                    <CreditCard size={20} />
                                    <span className="text-xs">POS carta</span>
                                </Button>
                                <Button
                                    onClick={payStripeLink}
                                    disabled={processing}
                                    className="bg-violet-600 hover:bg-violet-500 text-white h-14 flex flex-col gap-0"
                                >
                                    <CreditCard size={20} />
                                    <span className="text-xs">Stripe online</span>
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                        {payments.some(p => p.method === 'cash' || p.method === 'card_pos') && (
                            <Button onClick={refundLast} variant="outline" size="sm" disabled={processing} className="border-orange-500/30 text-orange-300 hover:bg-orange-500/10">
                                <ArrowCounterClockwise size={14} className="mr-1" /> Annulla ultimo
                            </Button>
                        )}
                        {onPrintReceipt && fullyPaid && (
                            <Button onClick={() => onPrintReceipt(order)} variant="outline" size="sm" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
                                <Printer size={14} className="mr-1" /> Stampa ricevuta
                            </Button>
                        )}
                        <Button onClick={() => onOpenChange(false)} variant="ghost" size="sm" className="ml-auto text-zinc-400">
                            <X size={14} className="mr-1" /> Chiudi
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
