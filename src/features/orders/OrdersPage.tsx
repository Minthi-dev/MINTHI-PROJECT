import { Check, ListChecks } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSetItemsStatus } from '@/features/floor/queries'
import { ITEM_STATUS } from '@/features/floor/ItemsList'
import { useLiveItems, type LiveItem } from '@/features/kitchen/queries'
import { useNow } from '@/shared/hooks/useNow'
import { cn } from '@/shared/lib/cn'
import { elapsed } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Segmented } from '@/shared/ui/controls'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/shared/ui/display'

type View = 'table' | 'dish'
type StatusFilter = 'all' | 'pending' | 'ready'

/** Vista sala: cosa c'è da servire e cosa è in cucina, per tavolo o per piatto. */
export function OrdersPage() {
  const live = useLiveItems()
  const now = useNow()
  const setStatus = useSetItemsStatus()
  const [view, setView] = useState<View>('table')
  const [status, setStatusFilter] = useState<StatusFilter>('all')

  const items = useMemo(() => (live.data ?? []).filter((i) =>
    status === 'all' || (status === 'ready' ? i.status === 'ready' : i.status !== 'ready')), [live.data, status])

  const groups = useMemo(() => {
    const map = new Map<string, LiveItem[]>()
    for (const it of items) {
      const k = view === 'table' ? it.label : it.dish_name
      map.set(k, [...(map.get(k) ?? []), it])
    }
    return [...map.entries()].sort((a, b) => a[1][0].created_at.localeCompare(b[1][0].created_at))
  }, [items, view])

  const readyCount = (live.data ?? []).filter((i) => i.status === 'ready').length

  return (
    <>
      <PageHeader
        title="Ordini"
        description={readyCount ? `${readyCount} piatti pronti da servire` : 'Tutti i piatti in corso, in tempo reale.'}
        actions={<>
          <Segmented value={status} onChange={setStatusFilter} options={[{ value: 'all', label: 'Tutti' }, { value: 'pending', label: 'In cucina' }, { value: 'ready', label: 'Da servire' }]} />
          <Segmented value={view} onChange={setView} options={[{ value: 'table', label: 'Per tavolo' }, { value: 'dish', label: 'Per piatto' }]} />
        </>}
      />
      {live.isLoading ? <Skeleton className="h-64" /> : groups.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nessun piatto in corso" description="Quando arrivano ordini li vedi qui." />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(([title, its]) => {
            const ready = its.filter((i) => i.status === 'ready')
            const qty = its.reduce((s, i) => s + i.quantity, 0)
            return (
              <div key={title} className="overflow-hidden rounded-xl border bg-surface">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <div>
                    <p className="font-semibold">{title}{view === 'dish' && <span className="ml-1.5 text-muted-foreground">×{qty}</span>}</p>
                    <p className="text-xs text-muted-foreground">da {elapsed(its[0].created_at, now)}</p>
                  </div>
                  {ready.length > 0 && (
                    <Button size="sm" onClick={() => setStatus.mutate({ ids: ready.map((i) => i.id), status: 'served' })}><Check />Servi {ready.length}</Button>
                  )}
                </div>
                <ul className="divide-y">
                  {its.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="w-6 font-semibold tabular">{it.quantity}×</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{view === 'table' ? it.dish_name : it.label}</p>
                        {it.notes && <p className="truncate text-xs text-muted-foreground">“{it.notes}”</p>}
                      </div>
                      <button
                        disabled={it.status !== 'ready'}
                        onClick={() => setStatus.mutate({ ids: [it.id], status: 'served' })}
                        className={cn(it.status === 'ready' && 'cursor-pointer')}
                        aria-label={it.status === 'ready' ? 'Segna servito' : undefined}
                      >
                        <Badge tone={ITEM_STATUS[it.status].tone}>{ITEM_STATUS[it.status].label}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
