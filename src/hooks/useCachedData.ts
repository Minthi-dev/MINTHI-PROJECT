import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface CacheEntry<T> {
    data: T
    timestamp: number
}

interface UseCachedDataOptions {
    ttl?: number // Time to live in milliseconds
    cacheKey: string
    tableName: string
    filter?: { column: string; value: string }
    select?: string
    orderBy?: { column: string; ascending?: boolean }
}

const CACHE_PREFIX = 'minthi_cache_'

/**
 * Custom hook for cached data fetching with localStorage persistence
 * Falls back to API when cache is stale or missing
 */
export function useCachedData<T>(options: UseCachedDataOptions) {
    const {
        ttl = 5 * 60 * 1000, // Default 5 minutes
        cacheKey,
        tableName,
        filter,
        select = '*',
        orderBy
    } = options

    const [data, setData] = useState<T[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const fullCacheKey = `${CACHE_PREFIX}${cacheKey}`

    // Check if cache is valid
    const getCachedData = useCallback((): T[] | null => {
        try {
            const cached = localStorage.getItem(fullCacheKey)
            if (!cached) return null

            const entry: CacheEntry<T[]> = JSON.parse(cached)
            const now = Date.now()

            // Check if cache is still valid
            if (now - entry.timestamp < ttl) {
                return entry.data
            }

            // Cache expired, remove it
            localStorage.removeItem(fullCacheKey)
            return null
        } catch {
            return null
        }
    }, [fullCacheKey, ttl])

    // Save to cache
    const setCachedData = useCallback((newData: T[]) => {
        try {
            const entry: CacheEntry<T[]> = {
                data: newData,
                timestamp: Date.now()
            }
            localStorage.setItem(fullCacheKey, JSON.stringify(entry))
        } catch (e) {
            console.warn('Failed to cache data:', e)
        }
    }, [fullCacheKey])

    // Fetch from API
    const fetchFromAPI = useCallback(async () => {
        try {
            let query = supabase.from(tableName).select(select)

            if (filter) {
                query = query.eq(filter.column, filter.value)
            }

            if (orderBy) {
                query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true })
            }

            const { data: result, error: fetchError } = await query

            if (fetchError) throw fetchError

            const fetchedData = (result || []) as T[]
            setData(fetchedData)
            setCachedData(fetchedData)
            setError(null)
            return fetchedData
        } catch (e) {
            setError(e as Error)
            throw e
        }
    }, [tableName, select, filter, orderBy, setCachedData])

    // Initial load - try cache first, then API
    useEffect(() => {
        const loadData = async () => {
            setLoading(true)

            // Try cache first
            const cached = getCachedData()
            if (cached) {
                setData(cached)
                setLoading(false)
                // Optionally refresh in background
                return
            }

            // Fetch from API
            try {
                await fetchFromAPI()
            } catch {
                // Error already set in fetchFromAPI
            } finally {
                setLoading(false)
            }
        }

        loadData()
    }, [getCachedData, fetchFromAPI])

    // Force refresh
    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            await fetchFromAPI()
        } finally {
            setLoading(false)
        }
    }, [fetchFromAPI])

    // Invalidate cache
    const invalidate = useCallback(() => {
        localStorage.removeItem(fullCacheKey)
    }, [fullCacheKey])

    return {
        data,
        loading,
        error,
        refresh,
        invalidate
    }
}

/**
 * Clear all MINTHI cache entries
 */
export function clearAllCache() {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(CACHE_PREFIX)) {
            keysToRemove.push(key)
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
}

/**
 * Invalidate specific cache by table name pattern
 */
export function invalidateCacheByPattern(pattern: string) {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(CACHE_PREFIX) && key.includes(pattern)) {
            keysToRemove.push(key)
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
}
