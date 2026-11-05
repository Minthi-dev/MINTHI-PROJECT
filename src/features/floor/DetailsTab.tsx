import { ArrowRightLeft, KeyRound, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Select, Stepper } from '@/shared/ui/controls'
import { Card, CardBody, CardHeader } from '@/shared/ui/display'
import { Field, Input, Textarea } from '@/shared/ui/input'
import { useMoveTable, useRegeneratePin, useUpdateSession, type FloorTable, type Session } from './queries'

export function DetailsTab({ detail, tables, occupiedTableIds }: { detail: { session: Session; pin: string | null }; tables: FloorTable[]; occupiedTableIds: Set<string> }) {
  const s = detail.session
  const update = useUpdateSession()
  const regen = useRegeneratePin()
  const move = useMoveTable()
  const [guests, setGuests] = useState(s.guests)
  const [notes, setNotes] = useState(s.notes)
  const [email, setEmail] = useState(s.customer_email ?? '')
  const [taxCode, setTaxCode] = useState(s.customer_tax_code ?? '')
  const [lottery, setLottery] = useState(s.customer_lottery_code ?? '')
  const [target, setTarget] = useState<string>()

  useEffect(() => setGuests(s.guests), [s.guests])
  const free = tables.filter((t) => !occupiedTableIds.has(t.id))

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="PIN del tavolo" description="I clienti lo inseriscono dopo aver inquadrato il QR." />
        <CardBody className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-3xl font-bold tracking-[0.3em] tabular"><KeyRound className="size-5 text-muted-foreground" />{detail.pin ?? '----'}</span>
          <Button variant="outline" size="sm" onClick={() => regen.mutate(s.id)} loading={regen.isPending}><RefreshCw />Nuovo PIN</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tavolo" />
        <CardBody className="grid gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Persone</span>
            <Stepper value={guests} onChange={(v) => { setGuests(v); update.mutate({ id: s.id, patch: { guests: v } }) }} min={1} max={100} />
          </div>
          <Field label="Note per il servizio">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== s.notes && update.mutate({ id: s.id, patch: { notes } })} placeholder="Allergie, compleanno, seggiolone…" />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Sposta su un altro tavolo" className="flex-1">
              <Select value={target} onValueChange={setTarget} placeholder={free.length ? 'Scegli tavolo libero' : 'Nessun tavolo libero'} options={free.map((t) => ({ value: t.id, label: `Tavolo ${t.name}` }))} disabled={!free.length} />
            </Field>
            <Button variant="outline" disabled={!target} loading={move.isPending} onClick={() => target && move.mutate({ sessionId: s.id, tableId: target })}><ArrowRightLeft />Sposta</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Dati per lo scontrino" description="Facoltativi: email per l'invio, codice fiscale, codice lotteria." />
        <CardBody className="grid gap-3">
          <Field label="Email cliente"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Codice fiscale"><Input value={taxCode} onChange={(e) => setTaxCode(e.target.value.toUpperCase())} maxLength={16} /></Field>
            <Field label="Codice lotteria"><Input value={lottery} onChange={(e) => setLottery(e.target.value.toUpperCase())} maxLength={8} /></Field>
          </div>
          <Button variant="secondary" className="justify-self-start" loading={update.isPending}
            onClick={() => update.mutate({ id: s.id, patch: { customer_email: email || null, customer_tax_code: taxCode || null, customer_lottery_code: lottery || null } })}>
            Salva dati
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
