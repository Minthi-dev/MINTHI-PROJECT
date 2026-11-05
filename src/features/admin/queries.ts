import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { callFunction, rpc } from '@/shared/lib/api'

export interface Overview {
  restaurants: number; activeRestaurants: number; orders30d: number; gmv30d: number; mrr: number
  perRestaurant: { id: string; name: string; status: string; createdAt: string; subscriptionStatus: string | null; orders30d: number; gmv30d: number; owner: string | null }[]
}

export function useOverview() {
  return useQuery({ queryKey: ['admin', 'overview'], queryFn: async () => (await rpc('admin_overview')) as unknown as Overview })
}

export function useAdminAction<T = unknown>(success?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => callFunction<T>('admin', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      if (success) import('sonner').then(({ toast }) => toast.success(success))
    },
  })
}
