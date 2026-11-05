import { useQuery } from '@tanstack/react-query'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { unwrap } from '@/shared/lib/api'
import { supabase } from '@/shared/lib/supabase'
import { useRealtimeInvalidate } from '@/shared/hooks/useRealtime'

export interface LiveItem {
  id: string
  order_id: string
  session_id: string | null
  dish_name: string
  quantity: number
  notes: string | null
  course: number
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled'
  created_at: string
  ready_at: string | null
  kind: 'dine_in' | 'takeaway'
  label: string // "Tavolo 4" o "Asporto #12"
  orderCreatedAt: string
}

/** Piatti attivi (in attesa, in preparazione, pronti) di tavoli e asporto, in tempo reale. */
export function useLiveItems(onNew?: () => void) {
  const r = useRestaurant()
  const key = ['r', r.id, 'live-items']
  useRealtimeInvalidate(`live:${r.id}`, [{ table: 'order_items', filter: `restaurant_id=eq.${r.id}` }, { table: 'orders', filter: `restaurant_id=eq.${r.id}` }], [key], onNew)
  return useQuery({
    queryKey: key,
    refetchInterval: 30_000,
    queryFn: async () => {
      const rows = unwrap(await supabase.from('order_items')
        .select('id, order_id, session_id, dish_name, quantity, notes, course, status, created_at, ready_at, orders!inner(kind, status, pickup_number, created_at), table_sessions(tables(name))')
        .eq('restaurant_id', r.id)
        .in('status', ['pending', 'preparing', 'ready'])
        .not('orders.status', 'in', '(awaiting_payment,cancelled)')
        .order('created_at'))
      return rows.map<LiveItem>((row) => {
        const o = row.orders as unknown as { kind: 'dine_in' | 'takeaway'; pickup_number: number | null; created_at: string }
        const tableName = (row.table_sessions as unknown as { tables?: { name?: string } } | null)?.tables?.name
        return {
          ...(row as unknown as LiveItem),
          kind: o.kind,
          orderCreatedAt: o.created_at,
          label: o.kind === 'takeaway' ? `Asporto #${o.pickup_number ?? ''}` : `Tavolo ${tableName ?? ''}`,
        }
      })
    },
  })
}
