import { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from './errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { onError: (error) => toast.error(errorMessage(error)) },
  },
})
