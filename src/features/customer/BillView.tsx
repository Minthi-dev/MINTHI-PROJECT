import { useMutation, useQuery } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { useState } from 'react'
import { callFunction, rpc } from '@/shared/lib/api'
import { formatMoney } from '@/shared/lib/format'
import type { Bill } from '@/features/floor/queries'
import { Button } from '@/shared/ui/button'
import { Segmented, Stepper } from '@/shared/ui/controls'
import { Callout, Card, Skeleton } from '@/shared/ui/display'

export function BillView({ sessionId, token, onlinePayments, paymentResult }: { sessionId: string; token: string; onlinePayments: boolean; paymentResult: string | null }) {
  const bill = useQuery({ queryKey: ['guest-bill', sessionId], queryFn: async () => (await rpc('session_bill', { p_session_id: sessionId })) as unknown as Bill })
  const [mode, setMode] = useState<'full' | 'per_person'>('full')
  const [persons, setPersons] = useState(1)
  const pay = useMutation({
    mutationFn: () => callFunction<{ url: string }>('checkout', { kind: 'table', sessionId, mode, persons, qrToken: token }),
    onSuccess: (d) => { window.location.href = d.url },
  })
  const b = bill.data
  if (!b) return <Skeleton className="mt-4 h-64" />
  const amount = mode === 'full' ? b.due : Math.min(b.due, b.perPerson * persons)

  return (
    <div className="mt-4 grid gap-4">
      {paymentResult === 'ok' && <Callout tone="success" title="Pagamento ricevuto, grazie!">Il conto si aggiorna tra qualche secondo.</Callout>}
      {paymentResult === 'annullato' && <Callout tone="warning" title="Pagamento annullato">Nessun addebito effettuato.</Callout>}
      <Card>
        <ul className="divide-y">
          {b.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
              <span><span className="tabular text-muted-foreground">{l.quantity}× </span>{l.label}</span>
              <span className="tabular">{l.includedInAyce ? 'incluso' : formatMoney(l.total)}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-1 border-t bg-surface-2/60 px-4 py-3">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Totale</span><span className="tabular">{formatMoney(b.total)}</span></div>
          {b.paid > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Già pagato</span><span className="tabular">{formatMoney(b.paid)}</span></div>}
          <div className="flex justify-between text-lg font-semibold"><span>Da pagare</span><span className="tabular">{formatMoney(b.due)}</span></div>
        </div>
      </Card>
      {b.due > 0 && onlinePayments && (
        <Card className="grid gap-4 p-4">
          {b.guests > 1 && <Segmented value={mode} onChange={setMode} className="w-full" options={[{ value: 'full', label: 'Pago tutto' }, { value: 'per_person', label: 'Divido il conto' }]} />}
          {mode === 'per_person' && (
            <div className="flex items-center justify-between text-sm"><span>Pago per {persons} {persons === 1 ? 'persona' : 'persone'} ({formatMoney(b.perPerson)} a testa)</span><Stepper value={persons} onChange={setPersons} min={1} max={b.guests} /></div>
          )}
          <Button size="lg" onClick={() => pay.mutate()} loading={pay.isPending} disabled={amount < 0.5}><CreditCard />Paga {formatMoney(amount)}</Button>
          <p className="text-center text-xs text-muted-foreground">Carta, Apple Pay o Google Pay · pagamento sicuro con Stripe</p>
        </Card>
      )}
      {b.due > 0 && !onlinePayments && <p className="text-center text-sm text-muted-foreground">Per pagare chiedi il conto al personale.</p>}
    </div>
  )
}
