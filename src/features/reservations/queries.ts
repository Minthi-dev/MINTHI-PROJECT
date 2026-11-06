import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { unwrap } from '@/shared/lib/api'
import { supabase, type Tables, type TablesInsert } from '@/shared/lib/supabase'
import { useRealtimeInvalidate } from '@/shared/hooks/useRealtime'

export type Booking = Tables<'bookings'>

export function useBookings(day: Date) {
  const r = useRestaurant()
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const end = new Date(start.getTime() + 86400_000)
  const key = ['r', r.id, 'bookings', start.toISOString()]
  useRealtimeInvalidate(`bookings:${r.id}`, [{ table: 'bookings', filter: `restaurant_id=eq.${r.id}` }], [['r', r.id, 'bookings']])
  return useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await supabase.from('bookings').select('*').eq('restaurant_id', r.id)
      .gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at')),
  })
}

export function useSaveBooking() {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (b: Partial<Booking> & Pick<TablesInsert<'bookings'>, 'name' | 'starts_at' | 'guests'>) => {
      const row = { ...b, restaurant_id: r.id }
      return b.id
        ? unwrap(await supabase.from('bookings').update(row).eq('id', b.id).select().single())
        : unwrap(await supabase.from('bookings').insert(row).select().single())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['r', r.id, 'bookings'] })
      toast.success('Prenotazione salvata')
    },
  })
}

export function useSetBookingStatus() {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; status: Booking['status'] }) => unwrap(await supabase.from('bookings').update({ status: a.status }).eq('id', a.id).select('id').single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['r', r.id, 'bookings'] }),
  })
}

export function useDeleteBooking() {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('bookings').delete().eq('id', id).select('id')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['r', r.id, 'bookings'] })
      toast.success('Prenotazione eliminata')
    },
  })
}
