import { ChefHat, Maximize2, Printer, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSetItemsStatus } from '@/features/floor/queries'
import { ITEM_STATUS } from '@/features/floor/ItemsList'
import { usePrinter } from '@/features/printing/usePrinter'
import { useNow } from '@/shared/hooks/useNow'
import { cn } from '@/shared/lib/cn'
import { elapsed, formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Segmented } from '@/shared/ui/controls'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/shared/ui/display'
import { useLiveItems, type LiveItem } from './queries'
import { playChime, unlockAudio } from './sound'

const NEXT: Record<string, LiveItem['status']> = { pending: 'preparing', preparing: 'ready', ready: 'pending' }

export function KitchenPage() {
  const [sound, setSound] = useState(() => localStorage.getItem('minthi-kitchen-sound') !== 'off')
  const [filter, setFilter] = useState<'todo' | 'all'>('todo')
  const known = useRef<Set<string> | null>(null)
  const printer = usePrinter()
  const now = useNow(20_000)
  const setStatus = useSetItemsStatus()

  const live = useLiveItems()
  const items = live.data ?? []

  // suono e stampa automatica sui nuovi ordini
  const orderIds = useMemo(() => new Set(items.map((i) => i.order_id)), [items])
  useEffect(() => {
    if (!live.data) return
    if (known.current) {
      const fresh = [...orderIds].filter((id) => !known.current!.has(id))
      if (fresh.length) {
        if (sound) playChime()
        if (printer.settings.autoPrintKitchen) {
          for (const id of fresh) {
            const its = items.filter((i) => i.order_id === id)
            void printer.printKitchen(its[0].label, its.map((i) => ({ name: i.dish_name, quantity: i.quantity, notes: i.notes, course: i.course })))
          }
        }
      }
    }
    known.current = orderIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIds])

  const tickets = useMemo(() => {
    const map = new Map<string, LiveItem[]>()
    for (const it of items) {
      if (filter === 'todo' && it.status === 'ready') continue
      map.set(it.order_id, [...(map.get(it.order_id) ?? []), it])
    }
    return [...map.values()].sort((a, b) => a[0].orderCreatedAt.localeCompare(b[0].orderCreatedAt))
  }, [items, filter])

  return (
    <div onPointerDown={unlockAudio}>
      <PageHeader
        title="Cucina"
        description="Tocca un piatto per farlo avanzare: in attesa → in preparazione → pronto."
        actions={
          <>
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'todo', label: 'Da fare' }, { value: 'all', label: 'Tutti' }]} />
            <Button variant="outline" size="icon" aria-label={sound ? 'Disattiva suono' : 'Attiva suono'} onClick={() => { const v = !sound; setSound(v); localStorage.setItem('minthi-kitchen-sound', v ? 'on' : 'off'); if (v) playChime() }}>
              {sound ? <Volume2 /> : <VolumeX />}
            </Button>
            <Button variant="outline" size="icon" aria-label="Schermo intero" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 /></Button>
          </>
        }
      />

      {live.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-60" />)}</div>
      ) : tickets.length === 0 ? (
        <EmptyState icon={ChefHat} title="Tutto fatto!" description="I nuovi ordini compariranno qui con un segnale acustico." />
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tickets.map((its) => {
            const head = its[0]
            const mins = Math.floor((now - new Date(head.orderCreatedAt).getTime()) / 60000)
            const pendingIds = its.filter((i) => i.status !== 'ready').map((i) => i.id)
            return (
              <div key={head.order_id} className={cn('overflow-hidden rounded-xl border bg-surface shadow-sm', mins >= 20 && 'border-danger/60', mins >= 10 && mins < 20 && 'border-warning/70')}>
                <div className={cn('flex items-center justify-between px-4 py-2.5', head.kind === 'takeaway' ? 'bg-info/12' : 'bg-surface-2')}>
                  <div>
                    <p className="font-semibold">{head.label}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(head.orderCreatedAt)} · {elapsed(head.orderCreatedAt, now)}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Stampa comanda" onClick={() => printer.printKitchen(head.label, its.map((i) => ({ name: i.dish_name, quantity: i.quantity, notes: i.notes, course: i.course })))}>
                    <Printer />
                  </Button>
                </div>
                <ul className="divide-y">
                  {its.sort((a, b) => a.course - b.course).map((it) => (
                    <li key={it.id}>
                      <button onClick={() => setStatus.mutate({ ids: [it.id], status: NEXT[it.status] })} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60', it.status === 'ready' && 'opacity-60')}>
                        <span className="text-lg font-bold tabular">{it.quantity}</span>
                        <div className="min-w-0 flex-1">
                          <p className={cn('font-medium leading-snug', it.status === 'ready' && 'line-through')}>{it.dish_name}</p>
                          {it.notes && <p className="text-sm font-medium text-warning-foreground">⚠ {it.notes}</p>}
                          {it.course > 1 && <p className="text-xs text-muted-foreground">Portata {it.course}</p>}
                        </div>
                        <Badge tone={ITEM_STATUS[it.status].tone}>{ITEM_STATUS[it.status].label}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
                {pendingIds.length > 0 && (
                  <div className="border-t p-2">
                    <Button variant="secondary" className="w-full" onClick={() => setStatus.mutate({ ids: pendingIds, status: 'ready' })}>Tutto pronto</Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
