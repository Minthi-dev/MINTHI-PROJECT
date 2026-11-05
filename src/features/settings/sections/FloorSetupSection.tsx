import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreVertical, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { unwrap } from '@/shared/lib/api'
import { supabase, type Tables } from '@/shared/lib/supabase'
import { Button } from '@/shared/ui/button'
import { Select, Stepper } from '@/shared/ui/controls'
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/shared/ui/display'
import { Field, Input } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogFooter, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, useConfirm } from '@/shared/ui/overlay'

type Room = Tables<'rooms'>
type T = Tables<'tables'>

function useFloorSetup() {
  const r = useRestaurant()
  return useQuery({
    queryKey: ['r', r.id, 'floor', 'setup'],
    queryFn: async () => {
      const [rooms, tables] = await Promise.all([
        supabase.from('rooms').select('*').eq('restaurant_id', r.id).order('sort_order'),
        supabase.from('tables').select('*').eq('restaurant_id', r.id).order('sort_order').order('name'),
      ])
      return { rooms: unwrap(rooms), tables: unwrap(tables) }
    },
  })
}

function useMut<A>(fn: (a: A) => Promise<unknown>, ok?: string) {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries({ queryKey: ['r', r.id, 'floor'] }); if (ok) toast.success(ok) } })
}

export function FloorSetupSection() {
  const r = useRestaurant()
  const setup = useFloorSetup()
  const confirm = useConfirm()
  const [tableDialog, setTableDialog] = useState<T | 'new' | null>(null)
  const [bulk, setBulk] = useState(false)
  const [printing, setPrinting] = useState<T[] | null>(null)
  const [roomName, setRoomName] = useState('')

  const addRoom = useMut(async (name: string) => unwrap(await supabase.from('rooms').insert({ restaurant_id: r.id, name, sort_order: setup.data?.rooms.length ?? 0 }).select().single()), 'Sala creata')
  const delRoom = useMut(async (id: string) => unwrap(await supabase.from('rooms').delete().eq('id', id).select('id')), 'Sala eliminata')
  const delTable = useMut(async (id: string) => unwrap(await supabase.from('tables').delete().eq('id', id).select('id')), 'Tavolo eliminato')
  const rotate = useMut(async (id: string) => unwrap(await supabase.from('tables').update({ qr_token: [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('') }).eq('id', id).select('id').single()), 'Nuovo QR generato: ristampalo')

  if (!setup.data) return <Skeleton className="h-96" />
  const { rooms, tables } = setup.data
  const roomName_ = (id: string | null) => rooms.find((x) => x.id === id)?.name

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Sale" description="Facoltative: utili per locali con più ambienti (sala, dehors, terrazza)." />
        <CardBody className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {rooms.map((rm) => (
              <span key={rm.id} className="inline-flex items-center gap-1 rounded-full border bg-surface py-1 pl-3 pr-1 text-sm">
                {rm.name}
                <button className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-danger" aria-label={`Elimina ${rm.name}`} onClick={async () => { if (await confirm({ title: `Eliminare la sala ${rm.name}?`, description: 'I tavoli restano, senza sala.', danger: true, confirmLabel: 'Elimina' })) delRoom.mutate(rm.id) }}><Trash2 className="size-3.5" /></button>
              </span>
            ))}
            {rooms.length === 0 && <span className="text-sm text-muted-foreground">Nessuna sala</span>}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (roomName.trim()) { addRoom.mutate(roomName.trim()); setRoomName('') } }}>
            <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Nuova sala, es. Dehors" className="max-w-xs" />
            <Button type="submit" variant="outline" loading={addRoom.isPending}><Plus />Aggiungi</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Tavoli (${tables.length})`} description="Ogni tavolo ha un QR univoco da stampare e mettere sul tavolo."
          actions={<>
            {tables.length > 0 && <Button variant="outline" size="sm" onClick={() => setPrinting(tables.filter((t) => t.is_active))}><Printer />Stampa tutti i QR</Button>}
            <Button variant="outline" size="sm" onClick={() => setBulk(true)}>Aggiungi più tavoli</Button>
            <Button size="sm" onClick={() => setTableDialog('new')}><Plus />Tavolo</Button>
          </>} />
        {tables.length === 0 ? (
          <CardBody><EmptyState title="Nessun tavolo" description="Crea i tavoli uno alla volta o in blocco (es. da 1 a 20)." action={<Button onClick={() => setBulk(true)}>Crea tavoli in blocco</Button>} /></CardBody>
        ) : (
          <ul className="divide-y">
            {tables.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-14 font-semibold">{t.name}</span>
                <span className="flex-1 text-sm text-muted-foreground">{t.seats} posti{roomName_(t.room_id) ? ` · ${roomName_(t.room_id)}` : ''}{!t.is_active && ' · disattivato'}</span>
                <Button variant="ghost" size="sm" onClick={() => setPrinting([t])}><Printer />QR</Button>
                <Menu>
                  <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Azioni tavolo"><MoreVertical /></Button></MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => setTableDialog(t)}>Modifica</MenuItem>
                    <MenuItem onSelect={async () => { if (await confirm({ title: 'Generare un nuovo QR?', description: 'Il vecchio QR stampato smetterà di funzionare.', confirmLabel: 'Rigenera' })) rotate.mutate(t.id) }}><RefreshCw />Rigenera QR</MenuItem>
                    <MenuSeparator />
                    <MenuItem danger onSelect={async () => { if (await confirm({ title: `Eliminare il tavolo ${t.name}?`, danger: true, confirmLabel: 'Elimina' })) delTable.mutate(t.id) }}><Trash2 />Elimina</MenuItem>
                  </MenuContent>
                </Menu>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TableDialog value={tableDialog} rooms={rooms} count={tables.length} onClose={() => setTableDialog(null)} />
      <BulkDialog open={bulk} rooms={rooms} existing={tables} onClose={() => setBulk(false)} />
      {printing && <QrPrintSheet tables={printing} restaurant={r.restaurantName} onDone={() => setPrinting(null)} />}
    </div>
  )
}

function TableDialog({ value, rooms, count, onClose }: { value: T | 'new' | null; rooms: Room[]; count: number; onClose: () => void }) {
  const r = useRestaurant()
  const t = value && value !== 'new' ? value : null
  const [f, setF] = useState({ name: '', seats: 4, room: 'none', active: true })
  useEffect(() => { if (value) setF({ name: t?.name ?? String(count + 1), seats: t?.seats ?? 4, room: t?.room_id ?? 'none', active: t?.is_active ?? true }) }, [value, t, count])
  const save = useMut(async () => {
    const row = { name: f.name.trim(), seats: f.seats, room_id: f.room === 'none' ? null : f.room, is_active: f.active }
    return t ? unwrap(await supabase.from('tables').update(row).eq('id', t.id).select().single())
      : unwrap(await supabase.from('tables').insert({ ...row, restaurant_id: r.id, sort_order: count }).select().single())
  }, 'Tavolo salvato')
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t ? `Tavolo ${t.name}` : 'Nuovo tavolo'} size="sm">
        <form onSubmit={async (e) => { e.preventDefault(); await save.mutateAsync(undefined); onClose() }} className="grid gap-4">
          <Field label="Nome o numero"><Input required maxLength={30} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="flex items-center justify-between"><span className="text-sm font-medium">Posti</span><Stepper value={f.seats} onChange={(v) => setF({ ...f, seats: v })} min={1} max={100} /></div>
          {rooms.length > 0 && <Field label="Sala"><Select value={f.room} onValueChange={(v) => setF({ ...f, room: v })} options={[{ value: 'none', label: 'Nessuna' }, ...rooms.map((x) => ({ value: x.id, label: x.name }))]} /></Field>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" loading={save.isPending}>Salva</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BulkDialog({ open, rooms, existing, onClose }: { open: boolean; rooms: Room[]; existing: T[]; onClose: () => void }) {
  const r = useRestaurant()
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(10)
  const [seats, setSeats] = useState(4)
  const [room, setRoom] = useState('none')
  const save = useMut(async () => {
    const names = new Set(existing.map((t) => t.name))
    const rows = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => String(from + i)).filter((n) => !names.has(n))
      .map((name, i) => ({ restaurant_id: r.id, name, seats, room_id: room === 'none' ? null : room, sort_order: existing.length + i }))
    if (!rows.length) throw new Error('Questi tavoli esistono già.')
    return unwrap(await supabase.from('tables').insert(rows).select('id'))
  }, 'Tavoli creati')
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Crea tavoli in blocco" description="I numeri già esistenti vengono saltati." size="sm">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dal numero"><Input inputMode="numeric" value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} /></Field>
            <Field label="Al numero"><Input inputMode="numeric" value={to} onChange={(e) => setTo(Math.min(200, Number(e.target.value) || 1))} /></Field>
          </div>
          <div className="flex items-center justify-between"><span className="text-sm font-medium">Posti per tavolo</span><Stepper value={seats} onChange={setSeats} min={1} max={30} /></div>
          {rooms.length > 0 && <Field label="Sala"><Select value={room} onValueChange={setRoom} options={[{ value: 'none', label: 'Nessuna' }, ...rooms.map((x) => ({ value: x.id, label: x.name }))]} /></Field>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button loading={save.isPending} onClick={async () => { await save.mutateAsync(undefined); onClose() }}>Crea {Math.max(0, to - from + 1)} tavoli</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function printRoot() {
  let el = document.getElementById('qr-print-root')
  if (!el) {
    el = document.createElement('div')
    el.id = 'qr-print-root'
    el.className = 'qr-print-root'
    document.body.appendChild(el)
  }
  return el
}

/** Foglio di stampa con un QR per tavolo (A4, 2 colonne). */
export function QrPrintSheet({ tables, restaurant, onDone }: { tables: T[]; restaurant: string; onDone: () => void }) {
  const [codes, setCodes] = useState<Record<string, string>>({})
  useEffect(() => {
    Promise.all(tables.map(async (t) => [t.id, await QRCode.toDataURL(`${window.location.origin}/t/${t.qr_token}`, { width: 600, margin: 1, errorCorrectionLevel: 'M' })] as const))
      .then((entries) => setCodes(Object.fromEntries(entries)))
  }, [tables])
  useEffect(() => {
    if (Object.keys(codes).length !== tables.length) return
    const after = () => onDone()
    window.addEventListener('afterprint', after, { once: true })
    const t = setTimeout(() => window.print(), 100)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', after) }
  }, [codes, tables.length, onDone])

  return createPortal(
    <div className="qr-print fixed inset-0 z-[100] overflow-auto bg-white text-black print:static">
      <style>{`@media print { body > *:not(.qr-print-root) { display: none !important } @page { size: A4; margin: 12mm } } .qr-card { break-inside: avoid }`}</style>
      <div className="no-print sticky top-0 flex items-center justify-between border-b bg-white p-3"><span className="text-sm">Anteprima di stampa</span><Button variant="outline" onClick={onDone}>Chiudi</Button></div>
      <div className="grid grid-cols-2 gap-6 p-6">
        {tables.map((t) => (
          <div key={t.id} className="qr-card flex flex-col items-center gap-3 rounded-2xl border-2 border-black/80 p-6 text-center">
            <p className="text-sm font-medium uppercase tracking-widest">{restaurant}</p>
            <p className="text-4xl font-bold">Tavolo {t.name}</p>
            {codes[t.id] ? <img src={codes[t.id]} alt="" className="w-56" /> : <div className="size-56 animate-pulse bg-gray-100" />}
            <p className="text-sm">Inquadra il QR, inserisci il PIN che ti dà il personale e ordina dal telefono.</p>
            <p className="text-xs opacity-60">minthi</p>
          </div>
        ))}
      </div>
    </div>,
    printRoot(),
  )
}
