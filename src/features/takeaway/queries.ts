import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { callFunction, rpc, unwrap } from '@/shared/lib/api'
import { supabase, type Tables } from '@/shared/lib/supabase'
import { useRealtimeInvalidate } from '@/shared/hooks/useRealtime'

export type TakeawayOrder = Tables<'orders'> & { order_items: Tables<'order_items'>[]; payments: Tables<'payments'>[] }

export function useTakeawayOrders(scope: 'active' | 'history') {
  const r = useRestaurant()
  const key = ['r', r.id, 'takeaway', scope]
  useRealtimeInvalidate(`takeaway:${r.id}:${scope}`, [{ table: 'orders', filter: `restaurant_id=eq.${r.id}` }, { table: 'payments', filter: `restaurant_id=eq.${r.id}` }], [key])
  return useQuery({
    queryKey: key,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase.from('orders').select('*, order_items(*), payments(*)').eq('restaurant_id', r.id).eq('kind', 'takeaway')
      if (scope === 'active') q = q.in('status', ['awaiting_payment', 'received', 'preparing', 'ready']).gte('created_at', new Date(Date.now() - 36 * 3600_000).toISOString())
      else q = q.in('status', ['picked_up', 'cancelled']).gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString()).order('created_at', { ascending: false }).limit(200)
      return unwrap(await q.order('created_at')) as unknown as TakeawayOrder[]
    },
  })
}

function useTakeawayMutation<A>(fn: (a: A) => Promise<unknown>, success?: string) {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['r', r.id, 'takeaway'] })
      if (success) toast.success(success)
    },
  })
}

export const useSetTakeawayStatus = () =>
  useTakeawayMutation((a: { id: string; status: 'received' | 'preparing' | 'ready' | 'picked_up' | 'cancelled' }) => rpc('set_takeaway_status', { p_order_id: a.id, p_status: a.status }))

export const useTakeawayPayment = () =>
  useTakeawayMutation((a: { id: string; method: 'cash' | 'card' | 'voucher' }) => rpc('record_takeaway_payment', { p_order_id: a.id, p_method: a.method }), 'Pagamento registrato')

export const useRefund = () =>
  useTakeawayMutation((a: { paymentId: string; amount?: number }) => callFunction('refund', a), 'Rimborso effettuato')

export function useFindPickup() {
  const r = useRestaurant()
  return useMutation({
    mutationFn: async (code: string) => (await rpc('find_pickup', { p_restaurant_id: r.id, p_code_or_token: code })) as unknown as { id: string } | null,
  })
}
