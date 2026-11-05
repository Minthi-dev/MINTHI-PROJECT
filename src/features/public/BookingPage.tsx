import { useMutation } from '@tanstack/react-query'
import { CalendarCheck, CalendarX2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PublicLayout, PublicMessage } from '@/features/customer/PublicLayout'
import { rpc } from '@/shared/lib/api'
import { formatDate, toDateInput } from '@/shared/lib/format'
import { ensureSession } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Select, Stepper } from '@/shared/ui/controls'
import { Card, Spinner } from '@/shared/ui/display'
import { Field, Input, Textarea } from '@/shared/ui/input'
import { usePublicRestaurant } from './TakeawayMenuPage'

interface Period { start: string; end: string }

/** Orari prenotabili per un giorno: ogni 30 minuti dentro le fasce, fino a 1 h prima della chiusura. */
function slotsFor(day: string, schedule: { days?: ({ lunch?: Period | null; dinner?: Period | null } | null)[] } | undefined) {
  const d = new Date(`${day}T12:00`)
  const conf = schedule?.days?.[d.getDay()]
  const out: string[] = []
  for (const p of [conf?.lunch, conf?.dinner]) {
    if (!p) continue
    const [sh, sm] = p.start.split(':').map(Number)
    let [eh, em] = p.end.split(':').map(Number)
    if (eh * 60 + em <= sh * 60 + sm) eh += 24
    for (let t = sh * 60 + sm; t <= eh * 60 + em - 60; t += 30) out.push(`${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  const now = new Date()
  return out.filter((s) => new Date(`${day}T${s}`) > new Date(now.getTime() + 30 * 60000))
}

export function BookingPage() {
  const { restaurantId = '' } = useParams()
  const info = usePublicRestaurant(restaurantId)
  const r = info.data
  const [f, setF] = useState({ date: toDateInput(new Date()), time: '', guests: 2, name: '', phone: '', email: '', notes: '', room: 'none' })
  const slots = useMemo(() => slotsFor(f.date, r?.weeklySchedule as never), [f.date, r])
  const book = useMutation({
    mutationFn: async () => {
      await ensureSession()
      return rpc('create_public_booking', {
        p_restaurant_id: restaurantId, p_name: f.name, p_phone: f.phone, p_email: f.email || (null as unknown as string),
        p_starts_at: new Date(`${f.date}T${f.time}`).toISOString(), p_guests: f.guests, p_notes: f.notes || (null as unknown as string),
        p_room_id: f.room === 'none' ? (null as unknown as string) : f.room,
      })
    },
  })

  if (info.isLoading) return <Spinner className="min-h-dvh" />
  if (!r) return <PublicMessage title="Locale non trovato" />
  if (!r.reservations.enabled) return <PublicLayout accent={r.theme?.accent} name={r.name} logoUrl={r.logoUrl}><PublicMessage icon={<CalendarX2 className="size-6 text-muted-foreground" />} title="Prenotazioni online non attive">{r.phone && <>Chiama il <a className="font-medium text-primary" href={`tel:${r.phone}`}>{r.phone}</a></>}</PublicMessage></PublicLayout>

  if (book.isSuccess) {
    return (
      <PublicLayout accent={r.theme?.accent} name={r.name} logoUrl={r.logoUrl}>
        <PublicMessage icon={<CalendarCheck className="size-6 text-success" />} title="Prenotazione inviata!">
          {f.guests} {f.guests === 1 ? 'persona' : 'persone'} · {formatDate(`${f.date}T${f.time}`, { weekday: 'long', day: 'numeric', month: 'long' })} alle {f.time}.<br />
          Per modifiche contatta il locale{r.phone ? ` al ${r.phone}` : ''}.
        </PublicMessage>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout accent={r.theme?.accent} name={r.name} logoUrl={r.logoUrl} subtitle={r.address ?? 'Prenota un tavolo'}>
      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight">Prenota un tavolo</h1>
        <form onSubmit={(e) => { e.preventDefault(); book.mutate() }} className="grid gap-5">
          <Card className="grid gap-4 p-4">
            <div className="flex items-center justify-between"><span className="font-medium">Persone</span><Stepper value={f.guests} onChange={(v) => setF({ ...f, guests: v })} min={1} max={20} /></div>
            <Field label="Giorno"><Input type="date" required min={toDateInput(new Date())} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, time: '' })} /></Field>
            <Field label="Orario">
              {slots.length === 0 ? <p className="text-sm text-muted-foreground">Nessun orario disponibile in questo giorno.</p> : (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button type="button" key={s} onClick={() => setF({ ...f, time: s })} className={f.time === s ? 'rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground' : 'rounded-lg border bg-surface py-2 text-sm hover:bg-muted'}>{s}</button>
                  ))}
                </div>
              )}
            </Field>
            {r.reservations.roomSelection && r.reservations.rooms.length > 0 && (
              <Field label="Sala preferita" optional><Select value={f.room} onValueChange={(v) => setF({ ...f, room: v })} options={[{ value: 'none', label: 'Nessuna preferenza' }, ...r.reservations.rooms.map((x) => ({ value: x.id, label: x.name }))]} /></Field>
            )}
          </Card>
          <Card className="grid gap-4 p-4">
            <Field label="Nome"><Input required autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Telefono"><Input required type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Email" optional><Input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Note" optional><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Allergie, seggiolone, occasione speciale…" /></Field>
          </Card>
          {book.error && <p className="text-sm text-danger">{(book.error as Error).message}</p>}
          <Button type="submit" size="lg" loading={book.isPending} disabled={!f.time}>Prenota</Button>
        </form>
      </main>
    </PublicLayout>
  )
}
