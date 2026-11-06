import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { unwrap } from '@/shared/lib/api'
import { supabase, type Tables, type TablesUpdate } from '@/shared/lib/supabase'

export const settingsKeys = {
  restaurant: (id: string) => ['r', id, 'restaurant'] as const,
  settings: (id: string) => ['r', id, 'settings'] as const,
  takeaway: (id: string) => ['r', id, 'takeaway-settings'] as const,
}

export function useRestaurantRow() {
  const r = useRestaurant()
  return useQuery({
    queryKey: settingsKeys.restaurant(r.id),
    queryFn: async () => unwrap(await supabase.from('restaurants').select('*').eq('id', r.id).single()),
  })
}

export function useSettings() {
  const r = useRestaurant()
  return useQuery({
    queryKey: settingsKeys.settings(r.id),
    queryFn: async () => unwrap(await supabase.from('restaurant_settings').select('*').eq('restaurant_id', r.id).single()),
  })
}

export function useTakeawaySettings() {
  const r = useRestaurant()
  return useQuery({
    queryKey: settingsKeys.takeaway(r.id),
    queryFn: async () => unwrap(await supabase.from('takeaway_settings').select('*').eq('restaurant_id', r.id).single()),
  })
}

export function useUpdateSettings() {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: TablesUpdate<'restaurant_settings'>) =>
      unwrap(await supabase.from('restaurant_settings').update(patch).eq('restaurant_id', r.id).select().single()),
    onSuccess: (data) => {
      qc.setQueryData(settingsKeys.settings(r.id), data)
      toast.success('Impostazioni salvate')
    },
  })
}

export function useUpdateTakeawaySettings() {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: TablesUpdate<'takeaway_settings'>) =>
      unwrap(await supabase.from('takeaway_settings').update(patch).eq('restaurant_id', r.id).select().single()),
    onSuccess: (data) => {
      qc.setQueryData(settingsKeys.takeaway(r.id), data)
      toast.success('Impostazioni asporto salvate')
    },
  })
}

export function useUpdateRestaurant() {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Pick<TablesUpdate<'restaurants'>, 'name' | 'address' | 'phone' | 'email' | 'logo_url' | 'timezone' | 'setup_completed'>) =>
      unwrap(await supabase.from('restaurants').update(patch).eq('id', r.id).select().single()),
    onSuccess: (data: Tables<'restaurants'>) => {
      qc.setQueryData(settingsKeys.restaurant(r.id), data)
      qc.invalidateQueries({ queryKey: ['auth'] })
      toast.success('Dati del locale salvati')
    },
  })
}
