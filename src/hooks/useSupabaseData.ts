import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useSupabaseData<T>(
    tableName: string,
    initialData: T[] = [],
    filter?: { column: string; value: string },
    mapper?: (item: any) => T
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

        const { data: result, error } = await query
        if (error) {
            console.error(`Error fetching ${tableName}:`, error)
            return
        }

        const currentMapper = mapperRef.current
        const mappedData = currentMapper ? result.map(currentMapper) : result as T[]
        setData(mappedData)
        setLoading(false)
    }, [tableName, filter?.column, filter?.value])

    useEffect(() => {
        // Skip subscription if filter value is missing
        if (filter && !filter.value) return

        fetchData()

        // Debounce ref per accumulare eventi rapidi
        let debounceTimer: ReturnType<typeof setTimeout> | undefined

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
                    // Debounce: accumula eventi rapidi in un singolo batch (300ms)
                    if (debounceTimer) clearTimeout(debounceTimer)
                    debounceTimer = setTimeout(() => {
                        const currentMapper = mapperRef.current
                        if (payload.eventType === 'INSERT') {
                            const newItem = currentMapper ? currentMapper(payload.new) : payload.new as T
                            setData((prev) => [...prev, newItem])
                        } else if (payload.eventType === 'UPDATE') {
                            const updatedItem = currentMapper ? currentMapper(payload.new) : payload.new as T
                            setData((prev) => {
                                const exists = prev.some((item: any) => item.id === (payload.new as any).id)
                                if (exists) {
                                    return prev.map((item: any) => (item.id === (payload.new as any).id ? updatedItem : item))
                                }
                                // Item not in state yet (was previously invisible due to RLS) — add it
                                return [...prev, updatedItem]
                            })
                        } else if (payload.eventType === 'DELETE') {
                            setData((prev) => prev.filter((item: any) => item.id !== payload.old.id))
                        }
                    }, 300)
                }
            )
            .subscribe()

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer)
            supabase.removeChannel(channel)
        }
    }, [tableName, filter?.column, filter?.value, fetchData])

    return [data, loading, fetchData, setData] as const
}
