import { useEffect, useState } from 'react'
import { useFloor } from '@/features/floor/queries'
import { useSettings } from '@/features/settings/queries'
import { toDateInput } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Select, Stepper } from '@/shared/ui/controls'
import { Field, Input, Textarea } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/overlay'
import { useSaveBooking, type Booking } from './queries'

export function BookingDialog({ open, booking, day, onClose }: { open: boolean; booking: Booking | null; day: Date; onClose: () => void }) {
  const floor = useFloor()
  const settings = useSettings()
  const save = useSaveBooking()
  const [f, setF] = useState({ name: '', phone: '', email: '', date: toDateInput(day), time: '20:00', guests: 2, duration: 120, tableId: 'none', notes: '' })

  useEffect(() => {
    if (!open) return
    if (booking) {
      const d = new Date(booking.starts_at)
      setF({
        name: booking.name, phone: booking.phone ?? '', email: booking.email ?? '', date: toDateInput(d),
        time: d.toTimeString().slice(0, 5), guests: booking.guests, duration: booking.duration_min,
        tableId: booking.table_id ?? 'none', notes: booking.notes ?? '',
      })
    } else {
      setF((x) => ({ ...x, name: '', phone: '', email: '', notes: '', tableId: 'none', date: toDateInput(day), duration: settings.data?.reservation_duration_min ?? 120 }))
    }
  }, [open, booking, day, settings.data])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await save.mutateAsync({
      id: booking?.id,
      name: f.name.trim(), phone: f.phone || null, email: f.email || null,
      starts_at: new Date(`${f.date}T${f.time}`).toISOString(), guests: f.guests, duration_min: f.duration,
      table_id: f.tableId === 'none' ? null : f.tableId, notes: f.notes || null,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={booking ? 'Modifica prenotazione' : 'Nuova prenotazione'}>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="bn"><Input id="bn" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Telefono" htmlFor="bp"><Input id="bp" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Data" htmlFor="bd"><Input id="bd" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Ora" htmlFor="bt"><Input id="bt" type="time" required step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3"><span className="text-sm font-medium">Persone</span><Stepper value={f.guests} onChange={(v) => setF({ ...f, guests: v })} min={1} max={50} /></div>
            <div className="flex items-center gap-3"><span className="text-sm font-medium">Durata</span>
              <Select value={String(f.duration)} onValueChange={(v) => setF({ ...f, duration: Number(v) })} className="w-28" options={[60, 90, 120, 150, 180, 240].map((m) => ({ value: String(m), label: `${m / 60} h` }))} />
            </div>
          </div>
          <Field label="Tavolo" optional>
            <Select value={f.tableId} onValueChange={(v) => setF({ ...f, tableId: v })} options={[{ value: 'none', label: 'Da assegnare' }, ...(floor.data?.tables ?? []).map((t) => ({ value: t.id, label: `Tavolo ${t.name} (${t.seats} posti)` }))]} />
          </Field>
          <Field label="Email" optional><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Note" optional><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" loading={save.isPending}>Salva</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
