import { ChefHat } from 'lucide-react'
import { ITEM_STATUS } from '@/features/floor/ItemsList'
import { formatMoney, formatTime } from '@/shared/lib/format'
import { Badge, EmptyState, Skeleton } from '@/shared/ui/display'

interface Data { orders: { id: string; created_at: string; total: number }[]; items: { id: string; order_id: string; dish_name: string; quantity: number; unit_price: number; status: string; notes: string | null }[] }

export function GuestOrders({ data }: { data?: Data }) {
  if (!data) return <Skeleton className="mt-4 h-40" />
  if (!data.orders.length) return <EmptyState className="mt-6" icon={ChefHat} title="Nessun ordine ancora" description="Scegli dal menu e invia l'ordine: qui segui la preparazione in tempo reale." />
  return (
    <div className="mt-4 grid gap-4">
      {data.orders.map((o, i) => (
        <div key={o.id} className="overflow-hidden rounded-xl border bg-surface">
          <div className="flex justify-between border-b bg-surface-2/60 px-4 py-2 text-sm"><span className="font-medium">Ordine {i + 1}</span><span className="text-muted-foreground">{formatTime(o.created_at)}</span></div>
          <ul className="divide-y">
            {data.items.filter((it) => it.order_id === o.id).map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-semibold tabular">{it.quantity}×</span>
                <span className="min-w-0 flex-1 truncate">{it.dish_name}</span>
                <Badge tone={ITEM_STATUS[it.status]?.tone}>{it.status === 'served' ? 'Servito' : ITEM_STATUS[it.status]?.label}</Badge>
                <span className="w-16 text-right tabular text-muted-foreground">{it.unit_price > 0 ? formatMoney(it.unit_price * it.quantity) : 'incluso'}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
