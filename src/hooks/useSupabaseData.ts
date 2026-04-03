import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useSupabaseData<T>(
    tableName: string,
    initialData: T[] = [],
    filter?: { column: string; value: string },
    mapper?: (item: any) => T,
    orderBy?: { column: string; ascending: boolean },
    options?: {
        realtimeEnabled?: boolean  // default true; set false to use polling instead
        pollIntervalMs?: number    // polling interval when realtimeEnabled=false (default 30000ms)
    }
) {
    const [data, setData] = useState<T[]>(initialData)
    const [loading, setLoading] = useState(true)

    // Stable unique ID per istanza hook — evita collisioni channel tra componenti
    const channelIdRef = useRef(crypto.randomUUID())

    // Use ref for mapper to avoid infinite loops if an inline function is passed
    const mapperRef = useRef(mapper)
    useEffect(() => {
        mapperRef.current = mapper
    }, [mapper])

    const fetchData = useCallback(async () => {
        // If filter is provided but value is missing, skip fetch to avoid 400 errors (invalid UUID)
        if (filter && !filter.value) {
            setLoading(false)
            return
        }

        let query = supabase.from(tableName).select('*')
        if (filter) {
            query = query.eq(filter.column, filter.value)
        }
        if (orderBy) {
            query = query.order(orderBy.column, { ascending: orderBy.ascending })
        }

        const { data: result, error } = await query
        if (error) {
            console.error(`Error fetching ${tableName}:`, error)
            return
        }

        const currentMapper = mapperRef.current
        const mappedData = currentMapper ? result.map(currentMapper) : result as T[]
        setData(mappedData)
        setLoading(false)
    }, [tableName, filter?.column, filter?.value, orderBy?.column, orderBy?.ascending])

    useEffect(() => {
        // Skip if filter value is missing
        if (filter && !filter.value) return

        fetchData()

        const realtimeEnabled = options?.realtimeEnabled !== false // default true
        const pollIntervalMs = options?.pollIntervalMs ?? 30000

        if (!realtimeEnabled) {
            // Polling mode: fetch on interval instead of opening a realtime channel
            const pollTimer = setInterval(fetchData, pollIntervalMs)
            return () => clearInterval(pollTimer)
        }

        // Debounce: accumulate rapid events and do a single full refetch
        let debounceTimer: ReturnType<typeof setTimeout> | undefined
        let pendingEvents: Array<{ eventType: string; new: any; old: any }> = []

        // Realtime subscription — channel name unico per istanza
        const channel = supabase
            .channel(`${tableName}_${channelIdRef.current}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: tableName,
                    filter: filter ? `${filter.column}=eq.${filter.value}` : undefined
                },
                (payload) => {
                    pendingEvents.push({
                        eventType: payload.eventType,
                        new: payload.new,
                        old: payload.old
                    })

                    if (debounceTimer) clearTimeout(debounceTimer)
                    debounceTimer = setTimeout(() => {
                        const events = pendingEvents
                        pendingEvents = []

                        if (events.length > 1) {
                            fetchData()
                            return
                        }

                        const evt = events[0]
                        if (!evt) return
                        const currentMapper = mapperRef.current

                        if (evt.eventType === 'INSERT') {
                            const newItem = currentMapper ? currentMapper(evt.new) : evt.new as T
                            setData((prev) => {
                                const exists = prev.some((item: any) => item.id === (evt.new as any).id)
                                if (exists) return prev
                                return [...prev, newItem]
                            })
                        } else if (evt.eventType === 'UPDATE') {
                            const updatedItem = currentMapper ? currentMapper(evt.new) : evt.new as T
                            setData((prev) => {
                                const exists = prev.some((item: any) => item.id === (evt.new as any).id)
                                if (exists) {
                                    return prev.map((item: any) => (item.id === (evt.new as any).id ? updatedItem : item))
                                }
                                return [...prev, updatedItem]
                            })
                        } else if (evt.eventType === 'DELETE') {
                            setData((prev) => prev.filter((item: any) => item.id !== evt.old.id))
                        }
                    }, 300)
                }
            )
            .subscribe()

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer)
            supabase.removeChannel(channel)
        }
    }, [tableName, filter?.column, filter?.value, fetchData, options?.realtimeEnabled, options?.pollIntervalMs])

    return [data, loading, fetchData, setData] as const
}
