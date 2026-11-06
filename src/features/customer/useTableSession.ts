import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PublicMenu } from '@/features/menu-view/types'
import { rpc, unwrap } from '@/shared/lib/api'
import { ensureSession, supabase } from '@/shared/lib/supabase'
import { useRealtimeInvalidate } from '@/shared/hooks/useRealtime'

export interface PublicRestaurant {
  id: string; name: string; logoUrl: string | null; address: string | null; phone: string | null; isActive: boolean
  theme: { style?: string; accent?: string }; dineInEnabled: boolean; viewOnlyMenu: boolean; coursesEnabled: boolean
  reservations: { enabled: boolean; durationMin: number; roomSelection: boolean; rooms: { id: string; name: string }[] }
  takeaway: { enabled: boolean; requireOnlinePayment: boolean; estimatedMinutes: number; pickupNotice: string | null; pickupMode: string; fields: Record<'firstName' | 'lastName' | 'phone' | 'email', 'off' | 'optional' | 'required'> }
  onlinePayments: boolean
  weeklySchedule: unknown
}

export interface TableEntry { tableId: string; tableName: string; restaurantId: string; hasOpenSession: boolean; restaurant: PublicRestaurant }

export function useTableEntry(token: string) {
  return useQuery({
    queryKey: ['table-entry', token],
    queryFn: async () => {
      await ensureSession()
      return (await rpc('get_table_entry', { p_qr_token: token })) as unknown as TableEntry | null
    },
  })
}

/** Sessione del tavolo a cui il cliente è già entrato (null = serve il PIN). */
export function useMySession(tableId: string | undefined) {
  return useQuery({
    queryKey: ['my-session', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      const rows = unwrap(await supabase.from('table_sessions').select('*').eq('table_id', tableId!).order('opened_at', { ascending: false }).limit(1))
      return rows[0] ?? null
    },
  })
}

export function usePublicMenu(restaurantId: string | undefined, context: 'table' | 'takeaway' = 'table') {
  return useQuery({
    queryKey: ['public-menu', restaurantId, context],
    enabled: !!restaurantId,
    staleTime: 60_000,
    queryFn: async () => (await rpc('get_public_menu', { p_restaurant_id: restaurantId!, p_context: context })) as unknown as PublicMenu,
  })
}

export function useSessionLive(sessionId: string | undefined, tableId: string | undefined) {
  const qc = useQueryClient()
  useRealtimeInvalidate(sessionId ? `guest:${sessionId}` : null, [
    { table: 'cart_items', filter: `session_id=eq.${sessionId}` },
    { table: 'order_items', filter: `session_id=eq.${sessionId}` },
    { table: 'table_sessions', filter: `id=eq.${sessionId}` },
    { table: 'payments', filter: `session_id=eq.${sessionId}` },
  ], [['cart', sessionId], ['guest-orders', sessionId], ['my-session', tableId], ['guest-bill', sessionId]])

  const cart = useQuery({
    queryKey: ['cart', sessionId],
    enabled: !!sessionId,
    queryFn: async () => unwrap(await supabase.from('cart_items').select('*').eq('session_id', sessionId!).order('created_at')),
  })
  const orders = useQuery({
    queryKey: ['guest-orders', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const [o, i] = await Promise.all([
        supabase.from('orders').select('id, created_at, total, status').eq('session_id', sessionId!).neq('status', 'cancelled').order('created_at'),
        supabase.from('order_items').select('id, order_id, dish_name, quantity, unit_price, status, notes, course').eq('session_id', sessionId!).order('created_at'),
      ])
      return { orders: unwrap(o), items: unwrap(i) }
    },
  })
  return { cart, orders, invalidate: () => qc.invalidateQueries({ queryKey: ['cart', sessionId] }) }
}
