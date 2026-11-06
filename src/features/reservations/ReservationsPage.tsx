import { CalendarDays, ChevronLeft, ChevronRight, Link2, MoreVertical, Phone, Plus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { useFloor } from '@/features/floor/queries'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatTime, toDateInput } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Segmented } from '@/shared/ui/controls'
import { Badge, EmptyState, PageHeader, Skeleton, Stat } from '@/shared/ui/display'
import { Input } from '@/shared/ui/input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, useConfirm } from '@/shared/ui/overlay'
import { BookingDialog } from './BookingDialog'
import { useBookings, useDeleteBooking, useSetBookingStatus, type Booking } from './queries'
import { publicUrl } from '@/shared/lib/url'

const STATUS: Record<Booking['status'], { label: string; tone: 'brand' | 'success' | 'neutral' | 'danger' | 'warning' }> = {
  confirmed: { label: 'Confermata', tone: 'brand' },
  seated: { label: 'Al tavolo', tone: 'success' },
  completed: { label: 'Conclusa', tone: 'neutral' },
  cancelled: { label: 'Annullata', tone: 'danger' },
  no_show: { label: 'Non presentati', tone: 'warning' },
}

export function ReservationsPage() {
  const r = useRestaurant()
  const [day, setDay] = useState(() => new Date())
  const [view, setView] = useState<'list' | 'timeline'>('list')
  const [editing, setEditing] = useState<Booking | null>(null)
  const [creating, setCreating] = useState(false)
  const bookings = useBookings(day)
  const list = bookings.data ?? []
  const active = list.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show')
  const shift = (d: number) => setDay((x) => new Date(x.getFullYear(), x.getMonth(), x.getDate() + d))
  const isToday = toDateInput(day) === toDateInput(new Date())

  return (
    <>
      <PageHeader
        title="Prenotazioni"
        actions={<>
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl(`/prenota/${r.id}`)); toast.success('Link copiato') }}><Link2 />Link pubblico</Button>
          <Button onClick={() => setCreating(true)}><Plus />Nuova</Button>
        </>}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Giorno precedente"><ChevronLeft /></Button>
          <Input type="date" value={toDateInput(day)} onChange={(e) => e.target.value && setDay(new Date(`${e.target.value}T12:00`))} className="w-auto" />
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Giorno successivo"><ChevronRight /></Button>
          {!isToday && <Button variant="ghost" onClick={() => setDay(new Date())}>Oggi</Button>}
        </div>
        <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'Elenco' }, { value: 'timeline', label: 'Tavoli' }]} />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Prenotazioni" value={active.length} />
        <Stat label="Coperti" value={active.reduce((s, b) => s + b.guests, 0)} />
        <Stat label="Da assegnare" value={active.filter((b) => !b.table_id).length} />
      </div>

      {bookings.isLoading ? <Skeleton className="h-64" /> : list.length === 0 ? (
        <EmptyState icon={CalendarDays} title={`Nessuna prenotazione ${isToday ? 'oggi' : `il ${formatDate(day, { day: 'numeric', month: 'long' })}`}`} action={<Button onClick={() => setCreating(true)}><Plus />Aggiungi</Button>} />
      ) : view === 'list' ? (
        <BookingList list={list} onEdit={setEditing} />
      ) : (
        <Timeline list={active} day={day} onEdit={setEditing} />
      )}

      <BookingDialog open={creating || !!editing} booking={editing} day={day} onClose={() => { setCreating(false); setEditing(null) }} />
    </>
  )
}

function BookingList({ list, onEdit }: { list: Booking[]; onEdit: (b: Booking) => void }) {
  const floor = useFloor()
  const setStatus = useSetBookingStatus()
  const del = useDeleteBooking()
  const confirm = useConfirm()
  const tableName = (id: string | null) => floor.data?.tables.find((t) => t.id === id)?.name

  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      <ul className="divide-y">
        {list.map((b) => (
          <li key={b.id} className={cn('flex items-center gap-4 px-4 py-3', ['cancelled', 'no_show', 'completed'].includes(b.status) && 'opacity-60')}>
            <span className="w-14 text-lg font-semibold tabular">{formatTime(b.starts_at)}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(b)}>
              <p className="truncate font-medium">{b.name} {b.source === 'public' && <Badge tone="info" className="ml-1">online</Badge>}</p>
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="size-3.5" />{b.guests}</span>
                <span>{tableName(b.table_id) ? `Tavolo ${tableName(b.table_id)}` : 'Tavolo da assegnare'}</span>
                {b.phone && <span className="flex items-center gap-1"><Phone className="size-3.5" />{b.phone}</span>}
              </p>
              {b.notes && <p className="truncate text-xs text-muted-foreground">“{b.notes}”</p>}
            </button>
            <Badge tone={STATUS[b.status].tone} className="hidden sm:inline-flex">{STATUS[b.status].label}</Badge>
            <Menu>
              <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Azioni"><MoreVertical /></Button></MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => onEdit(b)}>Modifica</MenuItem>
                {(['confirmed', 'seated', 'completed', 'no_show', 'cancelled'] as const).filter((s) => s !== b.status).map((s) => (
                  <MenuItem key={s} onSelect={() => setStatus.mutate({ id: b.id, status: s })}>Segna: {STATUS[s].label.toLowerCase()}</MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem danger onSelect={async () => { if (await confirm({ title: 'Eliminare la prenotazione?', danger: true, confirmLabel: 'Elimina' })) del.mutate(b.id) }}>Elimina</MenuItem>
              </MenuContent>
            </Menu>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Timeline({ list, day, onEdit }: { list: Booking[]; day: Date; onEdit: (b: Booking) => void }) {
  const floor = useFloor()
  const START = 11, END = 24
  const hours = Array.from({ length: END - START }, (_, i) => START + i)
  const rows = useMemo(() => [
    ...(floor.data?.tables ?? []).map((t) => ({ id: t.id, label: `Tav. ${t.name}`, items: list.filter((b) => b.table_id === t.id) })),
    { id: 'none', label: 'Da assegnare', items: list.filter((b) => !b.table_id) },
  ].filter((r) => r.id !== 'none' || r.items.length), [floor.data, list])
  const pos = (b: Booking) => {
    const d = new Date(b.starts_at)
    const startH = d.getHours() + d.getMinutes() / 60
    const left = ((startH - START) / (END - START)) * 100
    const width = (b.duration_min / 60 / (END - START)) * 100
    return { left: `${Math.max(0, left)}%`, width: `${Math.min(100 - Math.max(0, left), width)}%` }
  }
  void day
  return (
    <div className="overflow-x-auto rounded-xl border bg-surface">
      <div className="min-w-[900px]">
        <div className="flex border-b text-xs text-muted-foreground">
          <div className="w-28 shrink-0" />
          <div className="relative flex flex-1">{hours.map((h) => <div key={h} className="flex-1 border-l py-2 pl-1">{h}:00</div>)}</div>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="flex border-b last:border-0">
            <div className="flex w-28 shrink-0 items-center px-3 text-sm font-medium">{row.label}</div>
            <div className="relative h-12 flex-1">
              {hours.map((h, i) => <div key={h} className="absolute inset-y-0 border-l" style={{ left: `${(i / hours.length) * 100}%` }} />)}
              {row.items.map((b) => (
                <button key={b.id} onClick={() => onEdit(b)} style={pos(b)} className={cn('absolute inset-y-1.5 overflow-hidden rounded-md px-2 text-left text-xs font-medium text-primary-foreground shadow-sm', b.status === 'seated' ? 'bg-success' : 'bg-primary')}>
                  <span className="block truncate">{formatTime(b.starts_at)} {b.name} · {b.guests}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
