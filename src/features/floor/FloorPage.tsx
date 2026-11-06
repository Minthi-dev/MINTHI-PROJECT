import { BellRing, Plus, Settings2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { useNow } from '@/shared/hooks/useNow'
import { cn } from '@/shared/lib/cn'
import { elapsed, formatMoney } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Segmented } from '@/shared/ui/controls'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/shared/ui/display'
import { OpenTableDialog, PinDialog } from './OpenTableDialog'
import { useFloor, type FloorTable } from './queries'
import { TableSheet } from './TableSheet'

export function FloorPage() {
  const r = useRestaurant()
  const floor = useFloor()
  const now = useNow()
  const [room, setRoom] = useState('all')
  const [opening, setOpening] = useState<FloorTable | null>(null)
  const [pin, setPin] = useState<{ table: string; pin: string } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const data = floor.data
  const tables = useMemo(() => (data?.tables ?? []).filter((t) => room === 'all' || t.room_id === room), [data, room])
  const occupied = data ? [...data.sessionsByTable.keys()].length : 0
  const assistance = data ? [...data.sessionsByTable.values()].filter((s) => s.assistance_requested_at).length : 0

  return (
    <>
      <PageHeader
        title="Sala"
        description={data ? `${occupied} occupati · ${(data.tables.length - occupied)} liberi${assistance ? ` · ${assistance} chiedono assistenza` : ''}` : ' '}
        actions={r.isManager && (
          <Button variant="outline" asChild><Link to="/app/impostazioni/sala"><Settings2 />Tavoli e QR</Link></Button>
        )}
      />

      {data && data.rooms.length > 1 && (
        <Segmented className="mb-5 max-w-full overflow-x-auto" value={room} onChange={setRoom} options={[{ value: 'all', label: 'Tutte' }, ...data.rooms.map((rm) => ({ value: rm.id, label: rm.name }))]} />
      )}

      {floor.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : tables.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nessun tavolo"
          description="Crea sale e tavoli per iniziare a prendere ordini e stampare i QR."
          action={r.isManager && <Button asChild><Link to="/app/impostazioni/sala">Crea tavoli</Link></Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {tables.map((t) => {
            const s = data!.sessionsByTable.get(t.id)
            const st = s ? data!.stats.get(s.id) : undefined
            const due = st ? Math.max(0, st.total - st.paid) : 0
            return (
              <button
                key={t.id}
                onClick={() => (s ? setSelected(s.id) : setOpening(t))}
                className={cn(
                  'group relative flex min-h-32 flex-col justify-between rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
                  s ? 'border-primary/40 bg-accent/60' : 'bg-surface',
                  s?.assistance_requested_at && 'border-warning ring-2 ring-warning/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xl font-semibold tracking-tight">{t.name}</span>
                  {s ? (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="size-3.5" />{s.guests}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t.seats} posti</span>
                  )}
                </div>
                {s ? (
                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap gap-1">
                      {s.assistance_requested_at && <Badge tone="warning"><BellRing />Chiama</Badge>}
                      {!!st?.ready && <Badge tone="success">{st.ready} da servire</Badge>}
                      {!!st?.pending && <Badge tone="info">{st.pending} in cucina</Badge>}
                      {s.ayce && <Badge tone="brand">AYCE</Badge>}
                    </div>
                    <div className="flex items-end justify-between text-sm">
                      <span className="text-muted-foreground">{elapsed(s.opened_at, now)}</span>
                      <span className="font-semibold tabular">{formatMoney(due)}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground group-hover:text-primary">Libero · apri</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <OpenTableDialog
        table={opening}
        onClose={() => setOpening(null)}
        onOpened={(_sid, p) => {
          setPin({ table: opening!.name, pin: p })
          setOpening(null)
        }}
      />
      <PinDialog data={pin} onClose={() => setPin(null)} />
      <TableSheet sessionId={selected} onClose={() => setSelected(null)} tables={data?.tables ?? []} occupiedTableIds={new Set(data?.sessionsByTable.keys())} />
    </>
  )
}
