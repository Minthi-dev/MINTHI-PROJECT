import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'

type Table = 'orders' | 'order_items' | 'cart_items' | 'table_sessions' | 'bookings' | 'payments'

/**
 * Invalida le query indicate quando cambiano le righe di una tabella.
 * La RLS filtra già gli eventi per l'utente; `filter` riduce il traffico.
 */
export function useRealtimeInvalidate(channel: string | null, subs: { table: Table; filter?: string }[], keys: QueryKey[], onEvent?: () => void) {
  const qc = useQueryClient()
  const subsKey = JSON.stringify(subs)
  const keysKey = JSON.stringify(keys)

  useEffect(() => {
    if (!channel) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const invalidate = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const k of JSON.parse(keysKey) as QueryKey[]) qc.invalidateQueries({ queryKey: k })
        onEvent?.()
      }, 150)
    }
    let ch = supabase.channel(channel)
    for (const s of JSON.parse(subsKey) as { table: Table; filter?: string }[]) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, invalidate)
    }
    ch.subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, subsKey, keysKey, qc])
}
