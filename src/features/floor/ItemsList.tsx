import { Check, MoreVertical, Undo2, X } from 'lucide-react'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { cn } from '@/shared/lib/cn'
import { formatMoney, formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Badge, EmptyState } from '@/shared/ui/display'
import { Menu, MenuContent, MenuItem, MenuTrigger, useConfirm } from '@/shared/ui/overlay'
import { useSetItemsStatus, type OrderItem } from './queries'

export const ITEM_STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' }> = {
  pending: { label: 'In attesa', tone: 'warning' },
  preparing: { label: 'In preparazione', tone: 'info' },
  ready: { label: 'Pronto', tone: 'success' },
  served: { label: 'Servito', tone: 'neutral' },
  cancelled: { label: 'Annullato', tone: 'danger' },
}

export function ItemsList({ items, orders }: { items: OrderItem[]; orders: { id: string; created_at: string; placed_by_staff: boolean }[] }) {
  const r = useRestaurant()
  const setStatus = useSetItemsStatus()
  const confirm = useConfirm()

  if (!orders.length) return <EmptyState title="Nessun ordine" description="Gli ordini dei clienti dal QR compaiono qui in tempo reale." />

  const ready = items.filter((i) => i.status === 'ready').map((i) => i.id)

  return (
    <div className="grid gap-4">
      {ready.length > 0 && (
        <Button variant="secondary" onClick={() => setStatus.mutate({ ids: ready, status: 'served' })} loading={setStatus.isPending}>
          <Check />Segna serviti tutti i pronti ({ready.length})
        </Button>
      )}
      {orders.map((o, idx) => {
        const its = items.filter((i) => i.order_id === o.id)
        return (
          <div key={o.id} className="overflow-hidden rounded-xl border bg-surface">
            <div className="flex items-center justify-between border-b bg-surface-2/60 px-4 py-2 text-xs text-muted-foreground">
              <span className="font-medium">Ordine {idx + 1} · {formatTime(o.created_at)}</span>
              <span>{o.placed_by_staff ? 'dallo staff' : 'dal cliente'}</span>
            </div>
            <ul className="divide-y">
              {its.map((it) => (
                <li key={it.id} className={cn('flex items-start gap-3 px-4 py-3', it.status === 'cancelled' && 'opacity-50')}>
                  <span className="mt-0.5 w-7 shrink-0 text-sm font-semibold tabular">{it.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium', it.status === 'cancelled' && 'line-through')}>{it.dish_name}</p>
                    {it.notes && <p className="text-xs text-muted-foreground">“{it.notes}”</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={ITEM_STATUS[it.status].tone}>{ITEM_STATUS[it.status].label}</Badge>
                      {it.course > 1 && <Badge>Portata {it.course}</Badge>}
                    </div>
                  </div>
                  <span className="text-sm tabular text-muted-foreground">{it.unit_price > 0 ? formatMoney(it.unit_price * it.quantity) : 'incluso'}</span>
                  {r.isFloorStaff && it.status !== 'cancelled' && (
                    <Menu>
                      <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Azioni piatto"><MoreVertical /></Button></MenuTrigger>
                      <MenuContent>
                        {it.status !== 'served' && <MenuItem onSelect={() => setStatus.mutate({ ids: [it.id], status: 'served' })}><Check />Servito</MenuItem>}
                        {it.status === 'served' && <MenuItem onSelect={() => setStatus.mutate({ ids: [it.id], status: 'ready' })}><Undo2 />Non ancora servito</MenuItem>}
                        <MenuItem danger onSelect={async () => {
                          if (await confirm({ title: `Annullare ${it.dish_name}?`, description: 'Il piatto verrà tolto dal conto.', confirmLabel: 'Annulla piatto', danger: true })) {
                            setStatus.mutate({ ids: [it.id], status: 'cancelled' })
                          }
                        }}><X />Annulla piatto</MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
