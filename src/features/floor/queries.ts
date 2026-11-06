import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { rpc, unwrap } from '@/shared/lib/api'
import { supabase, type Tables } from '@/shared/lib/supabase'
import { useRealtimeInvalidate } from '@/shared/hooks/useRealtime'

export type FloorTable = Tables<'tables'>
export type Session = Tables<'table_sessions'>
export type OrderItem = Tables<'order_items'>

export interface Bill {
  sessionId: string
  guests: number
  total: number
  paid: number
  due: number
  perPerson: number
  lines: { kind: 'item' | 'cover' | 'ayce'; label: string; quantity: number; unitPrice: number; total: number; includedInAyce?: boolean }[]
}

export const floorKeys = {
  all: (rid: string) => ['r', rid, 'floor'] as const,
  session: (rid: string, sid: string) => ['r', rid, 'floor', 'session', sid] as const,
  bill: (rid: string, sid: string) => ['r', rid, 'floor', 'bill', sid] as const,
}

/** Tavoli, sale e sessioni aperte con stato dei piatti: tutto ciò che serve alla mappa. */
export function useFloor() {
  const r = useRestaurant()
  const key = floorKeys.all(r.id)
  useRealtimeInvalidate(`floor:${r.id}`, [
    { table: 'table_sessions', filter: `restaurant_id=eq.${r.id}` },
    { table: 'order_items', filter: `restaurant_id=eq.${r.id}` },
    { table: 'payments', filter: `restaurant_id=eq.${r.id}` },
  ], [key])

  return useQuery({
    queryKey: key,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [tables, rooms, sessions] = await Promise.all([
        supabase.from('tables').select('*').eq('restaurant_id', r.id).eq('is_active', true).order('sort_order').order('name'),
        supabase.from('rooms').select('*').eq('restaurant_id', r.id).eq('is_active', true).order('sort_order'),
        supabase.from('table_sessions').select('*').eq('restaurant_id', r.id).eq('status', 'open'),
      ])
      const openSessions = unwrap(sessions)
      const ids = openSessions.map((s) => s.id)
      const [items, payments] = ids.length
        ? await Promise.all([
            supabase.from('order_items').select('session_id, status, quantity, unit_price').in('session_id', ids).neq('status', 'cancelled'),
            supabase.from('payments').select('session_id, amount, refunded_amount, status').in('session_id', ids).in('status', ['succeeded', 'refunded']),
          ])
        : [{ data: [] as { session_id: string | null; status: string; quantity: number; unit_price: number }[], error: null }, { data: [] as { session_id: string | null; amount: number; refunded_amount: number; status: string }[], error: null }]

      const stats = new Map<string, { pending: number; ready: number; total: number; paid: number }>()
      for (const s of openSessions) {
        stats.set(s.id, { pending: 0, ready: 0, total: s.cover_price * s.guests + (s.ayce ? s.ayce_price * s.guests : 0), paid: 0 })
      }
      for (const it of items.data ?? []) {
        const st = stats.get(it.session_id!)
        if (!st) continue
        if (it.status === 'pending' || it.status === 'preparing') st.pending += it.quantity
        if (it.status === 'ready') st.ready += it.quantity
        st.total += it.unit_price * it.quantity
      }
      for (const p of payments.data ?? []) {
        const st = stats.get(p.session_id!)
        if (st) st.paid += Number(p.amount) - Number(p.refunded_amount)
      }
      return {
        tables: unwrap(tables),
        rooms: unwrap(rooms),
        sessionsByTable: new Map(openSessions.map((s) => [s.table_id, s])),
        stats,
      }
    },
  })
}

export function useSessionDetail(sessionId: string | null) {
  const r = useRestaurant()
  return useQuery({
    queryKey: floorKeys.session(r.id, sessionId ?? ''),
    enabled: !!sessionId,
    queryFn: async () => {
      const [session, orders, items, payments, pin, receipts] = await Promise.all([
        supabase.from('table_sessions').select('*, tables(name)').eq('id', sessionId!).single(),
        supabase.from('orders').select('id, created_at, status, total, placed_by_staff').eq('session_id', sessionId!).order('created_at'),
        supabase.from('order_items').select('*').eq('session_id', sessionId!).order('created_at'),
        supabase.from('payments').select('*').eq('session_id', sessionId!).order('created_at'),
        supabase.from('session_secrets').select('pin').eq('session_id', sessionId!).maybeSingle(),
        supabase.from('fiscal_receipts').select('id, status, total, document_number, created_at, error').eq('session_id', sessionId!).order('created_at'),
      ])
      return {
        session: unwrap(session),
        orders: unwrap(orders),
        items: unwrap(items),
        payments: unwrap(payments),
        pin: pin.data?.pin ?? null,
        receipts: receipts.data ?? [],
      }
    },
  })
}

export function useBill(sessionId: string | null) {
  const r = useRestaurant()
  return useQuery({
    queryKey: floorKeys.bill(r.id, sessionId ?? ''),
    enabled: !!sessionId,
    queryFn: async () => (await rpc('session_bill', { p_session_id: sessionId! })) as unknown as Bill,
  })
}

function useFloorMutation<A, R = unknown>(fn: (a: A) => Promise<R>, success?: string) {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: floorKeys.all(r.id) })
      if (success) toast.success(success)
    },
  })
}

export const useOpenTable = () =>
  useFloorMutation(async (a: { tableId: string; guests: number; ayce: boolean; cover: boolean }) =>
    (await rpc('open_table_session', { p_table_id: a.tableId, p_guests: a.guests, p_ayce: a.ayce, p_cover: a.cover })) as unknown as { sessionId: string; pin: string })

export const useCloseTable = () =>
  useFloorMutation((a: { sessionId: string; force?: boolean }) => rpc('close_table_session', { p_session_id: a.sessionId, p_force: a.force ?? false }), 'Tavolo chiuso')

export const useRecordPayment = () =>
  useFloorMutation((a: { sessionId: string; method: 'cash' | 'card' | 'voucher' | 'other'; amount: number; label?: string }) =>
    rpc('record_payment', { p_session_id: a.sessionId, p_method: a.method, p_amount: a.amount, p_label: a.label ?? null as unknown as string }), 'Pagamento registrato')

export const useSetItemsStatus = () =>
  useFloorMutation((a: { ids: string[]; status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled' }) => rpc('set_items_status', { p_item_ids: a.ids, p_status: a.status }))

export const useRegeneratePin = () =>
  useFloorMutation((sessionId: string) => rpc('regenerate_session_pin', { p_session_id: sessionId }), 'Nuovo PIN generato')

export const useMoveTable = () =>
  useFloorMutation((a: { sessionId: string; tableId: string }) => rpc('move_table_session', { p_session_id: a.sessionId, p_table_id: a.tableId }), 'Tavolo spostato')

export const useClearAssistance = () =>
  useFloorMutation((sessionId: string) => rpc('set_assistance', { p_session_id: sessionId, p_requested: false }))

export const useUpdateSession = () =>
  useFloorMutation(async (a: { id: string; patch: { guests?: number; notes?: string; customer_email?: string | null; customer_tax_code?: string | null; customer_lottery_code?: string | null } }) =>
    unwrap(await supabase.from('table_sessions').update(a.patch).eq('id', a.id).select('id').single()), 'Tavolo aggiornato')

export function useCurrentPricing() {
  const r = useRestaurant()
  return useQuery({
    queryKey: ['r', r.id, 'pricing-now'],
    staleTime: 60_000,
    queryFn: async () => {
      const rows = (await rpc('pricing_at', { p_restaurant_id: r.id })) as unknown as { period: string | null; cover_price: number; ayce_available: boolean; ayce_price: number; ayce_max_rounds: number }[]
      return rows?.[0] ?? null
    },
  })
}
