import { useQuery } from '@tanstack/react-query'
import { Banknote, CheckCircle2, CreditCard, Printer, Receipt, Ticket } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { usePrinter } from '@/features/printing/usePrinter'
import { callFunction, rpc } from '@/shared/lib/api'
import { errorMessage } from '@/shared/lib/errors'
import { formatMoney, formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Segmented, Stepper } from '@/shared/ui/controls'
import { Badge, Card, Skeleton } from '@/shared/ui/display'
import { AffixInput, Field } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter, useConfirm } from '@/shared/ui/overlay'
import { useBill, useCloseTable, useRecordPayment, type Bill } from './queries'
import type { Tables } from '@/shared/lib/supabase'

const METHOD: Record<string, string> = { cash: 'Contanti', card: 'Carta / POS', voucher: 'Buoni pasto', other: 'Altro', stripe: 'Online' }

export function useFiscalActive() {
  const r = useRestaurant()
  return useQuery({ queryKey: ['r', r.id, 'fiscal-active'], staleTime: 5 * 60_000, queryFn: async () => (await rpc('fiscal_active', { p_restaurant_id: r.id })) as boolean })
}

export function BillTab({ sessionId, payments, receipts, onClosed }: {
  sessionId: string
  payments: Tables<'payments'>[]
  receipts: { id: string; status: string; total: number; document_number: string | null; error: string | null }[]
  onClosed: () => void
}) {
  const r = useRestaurant()
  const bill = useBill(sessionId)
  const close = useCloseTable()
  const fiscal = useFiscalActive()
  const confirm = useConfirm()
  const printer = usePrinter()
  const [paying, setPaying] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const b = bill.data

  if (!b) return <Skeleton className="h-64" />

  const activeReceipt = receipts.find((x) => ['pending', 'submitted', 'ready'].includes(x.status))

  const issueReceipt = async () => {
    setIssuing(true)
    try {
      const res = await callFunction<{ receipt: { status: string; error: string | null } }>('fiscal', { action: 'issue', restaurantId: r.id, sessionId })
      if (res.receipt.status === 'failed') toast.error(res.receipt.error ?? 'Emissione non riuscita')
      else toast.success(res.receipt.status === 'pending' ? 'Scontrino in coda di emissione' : 'Scontrino emesso')
      bill.refetch()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setIssuing(false)
    }
  }

  const closeTable = async () => {
    // ricarica il conto: un incasso appena registrato potrebbe non essere ancora visibile
    const fresh = (await bill.refetch()).data ?? b
    if (fresh.due > 0.01) {
      if (!r.isManager) return toast.error(`Restano ${formatMoney(fresh.due)} da incassare.`)
      const ok = await confirm({ title: 'Chiudere senza saldo?', description: `Restano ${formatMoney(fresh.due)} non incassati. Verrà registrato nel log.`, confirmLabel: 'Chiudi comunque', danger: true })
      if (!ok) return
      await close.mutateAsync({ sessionId, force: true })
    } else {
      if (fiscal.data && !activeReceipt) {
        const ok = await confirm({ title: 'Chiudere senza scontrino?', description: 'Non hai ancora emesso lo scontrino elettronico per questo tavolo.', confirmLabel: 'Chiudi senza scontrino' })
        if (!ok) return
      }
      await close.mutateAsync({ sessionId })
    }
    onClosed()
  }

  return (
    <div className="grid gap-4">
      <Card>
        <ul className="divide-y">
          {b.lines.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0"><span className="tabular text-muted-foreground">{l.quantity}× </span>{l.label}</span>
              <span className="tabular">{l.includedInAyce ? <Badge tone="brand">incluso</Badge> : formatMoney(l.total)}</span>
            </li>
          ))}
          {b.lines.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Conto vuoto</li>}
        </ul>
        <div className="grid gap-1 border-t bg-surface-2/60 px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Totale</span><span className="font-medium tabular">{formatMoney(b.total)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Pagato</span><span className="tabular">{formatMoney(b.paid)}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>Da pagare</span><span className="tabular">{formatMoney(b.due)}</span></div>
          {b.guests > 1 && b.due > 0 && <p className="text-right text-xs text-muted-foreground">{formatMoney(b.perPerson)} a persona</p>}
        </div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        {r.canTakePayments && b.due > 0 && <Button size="lg" onClick={() => setPaying(true)}><Banknote />Incassa</Button>}
        {printer.configured && <Button size="lg" variant="outline" onClick={() => printer.printBill(b, 'Conto tavolo')}><Printer />Preconto</Button>}
        {fiscal.data && r.canTakePayments && b.due <= 0.01 && b.total > 0 && !activeReceipt && (
          <Button size="lg" variant="outline" onClick={issueReceipt} loading={issuing}><Receipt />Emetti scontrino</Button>
        )}
        <Button size="lg" variant={b.due <= 0.01 ? 'primary' : 'outline'} onClick={closeTable} loading={close.isPending} className="sm:col-span-2">
          <CheckCircle2 />Chiudi tavolo
        </Button>
      </div>

      {(payments.length > 0 || receipts.length > 0) && (
        <div className="grid gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">Movimenti</h4>
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border bg-surface px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                {p.method === 'stripe' ? <CreditCard className="size-4 text-muted-foreground" /> : p.method === 'voucher' ? <Ticket className="size-4 text-muted-foreground" /> : <Banknote className="size-4 text-muted-foreground" />}
                {METHOD[p.method]} · {formatTime(p.created_at)}
                {p.status === 'pending' && <Badge tone="warning">in corso</Badge>}
                {p.status === 'failed' && <Badge tone="danger">non riuscito</Badge>}
                {p.refunded_amount > 0 && <Badge tone="danger">rimborsato {formatMoney(p.refunded_amount)}</Badge>}
              </span>
              <span className="font-medium tabular">{formatMoney(p.amount)}</span>
            </div>
          ))}
          {receipts.map((x) => (
            <div key={x.id} className="flex items-center justify-between rounded-lg border bg-surface px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><Receipt className="size-4 text-muted-foreground" />Scontrino {x.document_number ?? ''}</span>
              <Badge tone={x.status === 'ready' ? 'success' : x.status === 'failed' ? 'danger' : x.status === 'voided' ? 'neutral' : 'warning'}>
                {{ pending: 'in coda', submitted: 'inviato', ready: 'emesso', failed: 'errore', voided: 'annullato' }[x.status]}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <PaymentDialog open={paying} onClose={() => setPaying(false)} bill={b} sessionId={sessionId} />
    </div>
  )
}

function PaymentDialog({ open, onClose, bill, sessionId }: { open: boolean; onClose: () => void; bill: Bill; sessionId: string }) {
  const record = useRecordPayment()
  const [method, setMethod] = useState<'cash' | 'card' | 'voucher'>('card')
  const [mode, setMode] = useState<'full' | 'persons' | 'custom'>('full')
  const [persons, setPersons] = useState(1)
  const [custom, setCustom] = useState('')
  const [received, setReceived] = useState('')

  const amount = Math.round((mode === 'full' ? bill.due : mode === 'persons' ? Math.min(bill.due, bill.perPerson * persons) : Number(custom.replace(',', '.')) || 0) * 100) / 100
  const change = method === 'cash' && Number(received.replace(',', '.')) > amount ? Number(received.replace(',', '.')) - amount : 0

  const submit = async () => {
    await record.mutateAsync({ sessionId, method, amount })
    setReceived('')
    setCustom('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Incassa" description={`Da pagare: ${formatMoney(bill.due)}`} size="sm">
        <div className="grid gap-4">
          <Field label="Metodo">
            <Segmented value={method} onChange={setMethod} className="w-full" options={[{ value: 'card', label: 'Carta' }, { value: 'cash', label: 'Contanti' }, { value: 'voucher', label: 'Buoni' }]} />
          </Field>
          <Field label="Importo">
            <Segmented value={mode} onChange={setMode} className="w-full" options={[{ value: 'full', label: 'Tutto' }, { value: 'persons', label: 'A persona' }, { value: 'custom', label: 'Libero' }]} />
          </Field>
          {mode === 'persons' && (
            <div className="flex items-center justify-between"><span className="text-sm">Quante persone pagano</span><Stepper value={persons} onChange={setPersons} min={1} max={bill.guests} /></div>
          )}
          {mode === 'custom' && <AffixInput prefix="€" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0,00" autoFocus />}
          {method === 'cash' && (
            <Field label="Ricevuto" hint={change > 0 ? `Resto: ${formatMoney(change)}` : 'Facoltativo, per calcolare il resto'}>
              <AffixInput prefix="€" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0,00" />
            </Field>
          )}
          <div className="rounded-xl bg-accent px-4 py-3 text-center">
            <p className="text-xs text-accent-foreground/80">Incasso</p>
            <p className="text-2xl font-semibold tabular text-accent-foreground">{formatMoney(amount)}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={submit} loading={record.isPending} disabled={amount <= 0 || amount > bill.due + 0.01}>Registra incasso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
