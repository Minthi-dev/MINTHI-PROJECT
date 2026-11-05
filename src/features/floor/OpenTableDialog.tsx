import { useState } from 'react'
import { useCurrentPricing, useOpenTable, type FloorTable } from './queries'
import { formatMoney } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Stepper, SwitchRow } from '@/shared/ui/controls'
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/overlay'

export function OpenTableDialog({ table, onClose, onOpened }: { table: FloorTable | null; onClose: () => void; onOpened: (sessionId: string, pin: string) => void }) {
  const pricing = useCurrentPricing()
  const open = useOpenTable()
  const [guests, setGuests] = useState(2)
  const [ayce, setAyce] = useState(false)
  const [cover, setCover] = useState(true)
  const p = pricing.data

  const submit = async () => {
    if (!table) return
    const res = await open.mutateAsync({ tableId: table.id, guests, ayce, cover })
    onOpened(res.sessionId, res.pin)
  }

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Apri tavolo ${table?.name ?? ''}`} description="Il PIN da dare ai clienti comparirà subito dopo." size="sm">
        <div className="grid gap-2">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Persone</p>
              <p className="text-sm text-muted-foreground">{table?.seats} posti</p>
            </div>
            <Stepper value={guests} onChange={setGuests} min={1} max={60} />
          </div>
          {p && p.cover_price > 0 && (
            <SwitchRow title="Coperto" description={`${formatMoney(p.cover_price)} a persona`} checked={cover} onCheckedChange={setCover} />
          )}
          {p?.ayce_available && (
            <SwitchRow
              title="All You Can Eat"
              description={`${formatMoney(p.ayce_price)} a persona${p.ayce_max_rounds ? ` · max ${p.ayce_max_rounds} ordini` : ''}`}
              checked={ayce}
              onCheckedChange={setAyce}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={submit} loading={open.isPending}>Apri tavolo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PinDialog({ data, onClose }: { data: { table: string; pin: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Tavolo ${data?.table} aperto`} description="Comunica il PIN ai clienti: lo inseriranno dopo aver inquadrato il QR." size="sm">
        <div className="flex justify-center gap-2 py-4" aria-label={`PIN ${data?.pin}`}>
          {data?.pin.split('').map((d, i) => (
            <span key={i} className="flex h-16 w-14 items-center justify-center rounded-xl bg-accent text-3xl font-bold text-accent-foreground tabular">{d}</span>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full sm:w-auto">Fatto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
