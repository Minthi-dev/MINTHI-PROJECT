import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useNavigate } from 'react-router-dom' // Restored

import { DatabaseService } from '../../services/DatabaseService' // Corrected path (../services -> ../../services)
import { Table, Order, TableSession, Restaurant, Room, Dish, Category } from '../../services/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card' // Restored
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog' // Restored DialogFooter
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BellRinging, Users, Plus, Pencil, Trash, SignOut, ForkKnife, MagnifyingGlass, CheckCircle, WarningCircle, X, CaretDown, CaretUp, GearSix, House, BellSimple, Receipt, User, Clock, Check, ArrowLeft, ChefHat, Funnel, ArrowsClockwise } from '@phosphor-icons/react' // Restored icons
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase' // Corrected path (../../supabaseClient -> ../../lib/supabase usually, or just check file tree)
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, AnimatePresence } from 'framer-motion'
import TableBillDialog from '../TableBillDialog'
import { getCurrentAyceSettings } from '../../utils/pricingUtils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu' // Restored
import { soundManager } from '../../utils/SoundManager'

interface WaiterDashboardProps {
    user: any
    onLogout: () => void
}

const WaiterDashboard = ({ user, onLogout }: WaiterDashboardProps) => {
    const [tables, setTables] = useState<Table[]>([])
    const [rooms, setRooms] = useState<any[]>([])
    const [sessions, setSessions] = useState<TableSession[]>([])
    const [activeOrders, setActiveOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [restaurantId, setRestaurantId] = useState<string | null>(null)
    const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
    const [activatingTable, setActivatingTable] = useState(false)
    const [dishes, setDishes] = useState<Dish[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const navigate = useNavigate()

    // Sorting State
    const [sortBy, setSortBy] = useState<'alpha' | 'seats' | 'status'>('status')
    const [now, setNow] = useState(new Date())

    // Payment Dialog State
    const [selectedTableForPayment, setSelectedTableForPayment] = useState<Table | null>(null)
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
    const [isReadyDrawerOpen, setIsReadyDrawerOpen] = useState(false)
    const [selectedTable, setSelectedTable] = useState<Table | null>(null)
    const [isTableModalOpen, setIsTableModalOpen] = useState(false)

    // Room Filter State
    const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all')

    // Table/Room Management State
    const [isManageDialogOpen, setIsManageDialogOpen] = useState(false)
    const [isAddTableDialogOpen, setIsAddTableDialogOpen] = useState(false)
    const [isEditTableDialogOpen, setIsEditTableDialogOpen] = useState(false)
    const [tableToEdit, setTableToEdit] = useState<Table | null>(null)
    const [newTableNumber, setNewTableNumber] = useState('')
    const [newTableSeats, setNewTableSeats] = useState('4')
    const [newTableRoomId, setNewTableRoomId] = useState<string>('')

    const [isAddRoomDialogOpen, setIsAddRoomDialogOpen] = useState(false)
    const [isEditRoomDialogOpen, setIsEditRoomDialogOpen] = useState(false)
    const [roomToEdit, setRoomToEdit] = useState<Room | null>(null)
    const [newRoomName, setNewRoomName] = useState('')

    // Table Activation Dialog State
    const [isActivateDialogOpen, setIsActivateDialogOpen] = useState(false)
    const [tableToActivate, setTableToActivate] = useState<Table | null>(null)
    const [activateCustomerCount, setActivateCustomerCount] = useState('2')
    const [activateAyceEnabled, setActivateAyceEnabled] = useState(false)
    const [activateCopertoEnabled, setActivateCopertoEnabled] = useState(false)

    // Activity Center State
    const [activityRoomFilter, setActivityRoomFilter] = useState<string>('all')
    const [justDeliveredIds, setJustDeliveredIds] = useState<Set<string>>(new Set())

    // Device ID for notification routing
    const deviceId = useMemo(() => {
        let id = localStorage.getItem('waiter_device_id')
        if (!id) {
            id = uuidv4()
            localStorage.setItem('waiter_device_id', id)
        }
        return id
    }, [])

    const handleQuickOrderClick = (table: Table) => {
        navigate(`/waiter/table/${table.id}/order`)
    }

    // Ready Items View Mode (like gestione ordini)
    const [readyViewMode, setReadyViewMode] = useState<'table' | 'dish'>('table')

    // Timer per calcolo durate — aggiorna solo `now` ogni minuto
    // Il re-render è limitato perché `now` è usato solo in getDetailedTableStatus (memoizzato)
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000)
        return () => clearInterval(interval)
    }, [])

    // Fetch initial data
    useEffect(() => {
        const initDashboard = async () => {
            try {
                setLoading(true)
                let rId = user.restaurant_id

                if (!rId) {
                    const { data: staffData } = await supabase
                        .from('restaurant_staff')
                        .select('restaurant_id')
                        .eq('user_id', user.id)
                        .single()
                    rId = staffData?.restaurant_id
                }

                if (!rId) {
                    const { data: restData } = await supabase
                        .from('restaurants')
                        .select('id')
                        .eq('owner_id', user.id)
                        .single()
                    rId = restData?.id
                }

                if (!rId) {
                    toast.error('Nessun ristorante associato a questo utente')
                    return
                }

                setRestaurantId(rId)
                restaurantIdRef.current = rId // Set ref immediately, don't wait for useEffect

                const { data: restMeta } = await supabase
                    .from('restaurants')
                    .select('*, waiter_mode_enabled, allow_waiter_payments, enable_course_splitting, all_you_can_eat, cover_charge_per_person')
                    .eq('id', rId)
                    .single()
                if (restMeta) {
                    setRestaurant(restMeta as Restaurant)
                }

                // Parallel fetch all data at once
                const [tbs, rms, ds, cats, sessResult, ordsResult] = await Promise.all([
                    DatabaseService.getTables(rId),
                    DatabaseService.getRooms(rId),
                    DatabaseService.getDishes(rId),
                    DatabaseService.getCategories(rId),
                    supabase.from('table_sessions').select('*').eq('restaurant_id', rId).eq('status', 'OPEN'),
                    supabase.from('orders')
                        .select(`
                            id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id,
                            items:order_items(id, order_id, dish_id, quantity, status, note, course_number, created_at, ready_at,
                                dish:dishes(id, name, price, category_id)
                            )
                        `)
                        .eq('restaurant_id', rId)
                        .eq('status', 'OPEN')
                ])
                setTables(tbs)
                setRooms(rms)
                setDishes(ds)
                setCategories(cats)
                setSessions(sessResult.data || [])
                setActiveOrders((ordsResult.data || []) as unknown as Order[])

            } catch (error) {
                console.error('Error loading waiter dashboard:', error)
                toast.error('Errore caricamento dashboard')
            } finally {
                setLoading(false)
            }
        }

        initDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])




    // Debounce ref per evitare refresh multipli in rapida successione
    const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const refreshSessionsDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    // Use refs for refresh functions to avoid stale closures in realtime handlers
    const restaurantIdRef = useRef(restaurantId)
    useEffect(() => { restaurantIdRef.current = restaurantId }, [restaurantId])

    // Refresh solo sessioni
    const refreshSessions = useCallback(async () => {
        const rId = restaurantIdRef.current
        if (!rId) return
        const { data: sess, error: sessErr } = await supabase
            .from('table_sessions')
            .select('*')
            .eq('restaurant_id', rId)
            .eq('status', 'OPEN')
        if (sess) setSessions(sess as TableSession[])
    }, [])

    // Refresh solo ordini (select specifico, no select *)
    const refreshOrders = useCallback(async () => {
        const rId = restaurantIdRef.current
        if (!rId) return
        const { data: ords } = await supabase
            .from('orders')
            .select(`
                id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id,
                items:order_items(id, order_id, dish_id, quantity, status, note, course_number, created_at, ready_at,
                    dish:dishes(id, name, price, category_id)
                )
            `)
            .eq('restaurant_id', rId)
            .eq('status', 'OPEN')
        if (ords) setActiveOrders(ords as unknown as Order[])
    }, [])

    // refreshData completo — usato per refresh manuale
    const refreshData = useCallback(async () => {
        await Promise.all([refreshSessions(), refreshOrders()])
    }, [refreshSessions, refreshOrders])

    // Realtime Subscriptions — stable handlers via useCallback
    useEffect(() => {
        if (!restaurantId) return

        const channel = supabase
            .channel(`waiter-dashboard:${restaurantId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'table_sessions',
                filter: `restaurant_id=eq.${restaurantId}`
            }, () => {
                if (refreshSessionsDebounceRef.current) clearTimeout(refreshSessionsDebounceRef.current)
                refreshSessionsDebounceRef.current = setTimeout(() => refreshSessions(), 300)
            })
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'orders',
                filter: `restaurant_id=eq.${restaurantId}`
            }, () => {
                if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current)
                refreshDebounceRef.current = setTimeout(() => refreshOrders(), 300)
            })
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'order_items',
                filter: `restaurant_id=eq.${restaurantId}`
            }, () => {
                if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current)
                refreshDebounceRef.current = setTimeout(() => refreshOrders(), 400)
            })
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'tables',
                filter: `restaurant_id=eq.${restaurantId}`
            }, () => {
                if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current)
                refreshDebounceRef.current = setTimeout(async () => {
                    const tbs = await DatabaseService.getTables(restaurantId)
                    setTables(tbs)
                }, 300)
            })
            .subscribe()

        return () => {
            if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current)
            if (refreshSessionsDebounceRef.current) clearTimeout(refreshSessionsDebounceRef.current)
            supabase.removeChannel(channel)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, refreshSessions, refreshOrders])

    // ... (getTableTotal, getSplitTotal, getDetailedTableStatus functions remain same) ...

    // ... (getTableTotal, getSplitTotal, getDetailedTableStatus functions remain same) ...

    const getTableTotal = (sessionId: string) => {
        const sessionOrders = activeOrders.filter(o => o.table_session_id === sessionId && o.status !== 'CANCELLED')
        // Sum only items that are not PAID
        return sessionOrders.reduce((sum, order) => {
            const validItems = order.items?.filter((i: any) => i.status !== 'CANCELLED' && i.status !== 'PAID') || []
            return sum + validItems.reduce((acc: number, item: any) => acc + ((item.dish?.price || 0) * item.quantity), 0)
        }, 0)
    }

    const getDetailedTableStatus = (tableId: string): { step: 'seated' | 'waiting' | 'eating' | 'free', label: string, time: string, color: string } => {
        const session = sessions.find(s => s.table_id === tableId)
        if (!session) return { step: 'free', label: 'Libero', time: '', color: 'bg-zinc-900/40 border-zinc-800' }

        const sessionOrders = activeOrders.filter(o => o.table_session_id === session.id && o.status !== 'CANCELLED')

        // 1. Seduti (Seated) - No orders yet
        if (sessionOrders.length === 0) {
            const duration = Math.floor((now.getTime() - new Date(session.opened_at).getTime()) / 60000)
            return {
                step: 'seated',
                label: 'Seduti',
                time: `${duration}m`,
                color: 'bg-blue-900/10 border-blue-500/20 ring-1 ring-blue-500/20 shadow-[0_0_15px_-3px_rgba(59,130,246,0.1)]'
            }
        }

        // 2. Attesa Cibo (Waiting) - Has orders that are NOT fully served
        const pendingOrders = sessionOrders.filter(o => o.status === 'OPEN')

        if (pendingOrders.length > 0) {
            const oldestPending = pendingOrders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]
            const duration = Math.floor((now.getTime() - new Date(oldestPending.created_at).getTime()) / 60000)
            return {
                step: 'waiting',
                label: 'In Attesa',
                time: `${duration}m`,
                color: 'bg-amber-900/10 border-amber-500/30 ring-1 ring-amber-500/20 shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)] animate-pulse-slow'
            }
        }

        // 3. Mangiando (Eating) - All orders served
        const lastServed = sessionOrders.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0]
        const duration = lastServed ? Math.floor((now.getTime() - new Date(lastServed.updated_at || lastServed.created_at).getTime()) / 60000) : 0

        return {
            step: 'eating',
            label: 'Mangiando',
            time: `${duration}m`,
            color: 'bg-emerald-900/10 border-emerald-500/20 ring-1 ring-emerald-500/20 shadow-[0_0_15px_-3px_rgba(16,185,129,0.1)]'
        }
    }

    // Assistance Requests Calculation (memoizzata)
    const assistanceRequests = useMemo(() => tables.filter(table => {
        if (!table.last_assistance_request) return false
        return true
    }), [tables])

    // Sound Logic for "Ready" items, New Orders AND Assistance Requests
    const prevReadyCountRef = useRef(0)
    const prevAssistanceCountRef = useRef(0)
    const prevOrderCountRef = useRef(0)
    const isFirstLoadRef = useRef(true)

    useEffect(() => {
        if (loading) return

        const currentReadyCount = activeOrders.reduce((acc, order) => {
            return acc + (order.items?.filter(i => i.status?.toUpperCase() === 'READY').length || 0)
        }, 0)

        const currentAssistanceCount = assistanceRequests.length
        const currentOrderCount = activeOrders.length

        if (isFirstLoadRef.current) {
            prevReadyCountRef.current = currentReadyCount
            prevAssistanceCountRef.current = currentAssistanceCount
            prevOrderCountRef.current = currentOrderCount
            isFirstLoadRef.current = false
            return
        }

        // Track order count changes (no toast - order notifications are only for RestaurantDashboard "Gestione Ordini" view)
        prevOrderCountRef.current = currentOrderCount

        // Check for new Ready Items (filter by room if active)
        const filteredReadyCount = activityRoomFilter === 'all'
            ? currentReadyCount
            : activeOrders.reduce((acc, order) => {
                const session = sessions.find(s => s.id === order.table_session_id)
                const table = tables.find(t => t.id === session?.table_id)
                if (!table || table.room_id !== activityRoomFilter) return acc
                return acc + (order.items?.filter(i => i.status?.toUpperCase() === 'READY').length || 0)
            }, 0)

        const prevFilteredReady = prevReadyCountRef.current
        if (filteredReadyCount > prevFilteredReady || (activityRoomFilter === 'all' && currentReadyCount > prevFilteredReady)) {
            soundManager.play('kitchen-bell')
            setTimeout(() => soundManager.play('success'), 400)
            toast.success('Ci sono piatti pronti da servire!', {
                icon: '🔔',
                duration: 6000,
                style: { background: '#422006', border: '1px solid #f59e0b', color: '#fbbf24' }
            })
        }

        // Check for new Assistance Requests (filter by room if active)
        const filteredAssistanceCount = activityRoomFilter === 'all'
            ? currentAssistanceCount
            : assistanceRequests.filter(t => {
                const tableRoom = rooms.find(r => r.id === t.room_id)
                return activityRoomFilter === 'all' || t.room_id === activityRoomFilter
            }).length

        const prevFilteredAssistance = prevAssistanceCountRef.current
        if (filteredAssistanceCount > prevFilteredAssistance || (activityRoomFilter === 'all' && currentAssistanceCount > prevFilteredAssistance)) {
            soundManager.play('alert')
            setTimeout(() => soundManager.play('alert'), 500)
            setTimeout(() => soundManager.play('alert'), 1000)
            toast.error('Nuova richiesta assistenza al tavolo!', {
                icon: '🚨',
                duration: 10000,
                style: { background: '#450a0a', border: '1px solid #ef4444', color: '#fca5a5' }
            })
        }

        prevReadyCountRef.current = currentReadyCount
        prevAssistanceCountRef.current = currentAssistanceCount

    }, [activeOrders, assistanceRequests, loading, activityRoomFilter, sessions, tables, rooms])

    const handleMarkAsDelivered = async (orderId: string, itemId: string) => {
        // Track in justDeliveredIds for grey-out effect before group disappears
        setJustDeliveredIds(prev => new Set([...prev, itemId]))

        await supabase
            .from('order_items')
            .update({ status: 'SERVED' })
            .eq('id', itemId)

        if (restaurantId && user?.role === 'STAFF') {
            DatabaseService.logWaiterActivity(restaurantId, user.id, 'DISH_DELIVERED', { orderId, itemId })
        }

        // Optimistic update
        setActiveOrders(prev => prev.map(o => {
            if (o.id === orderId) {
                return {
                    ...o,
                    items: o.items?.map(i => i.id === itemId ? { ...i, status: 'SERVED' } : i)
                }
            }
            return o
        }))
    }

    // Resolve assistance request
    const handleResolveAssistance = async (tableId: string) => {
        await supabase
            .from('tables')
            .update({ last_assistance_request: null })
            .eq('id', tableId)

        if (restaurantId && user?.role === 'STAFF') {
            DatabaseService.logWaiterActivity(restaurantId, user.id, 'BELL_RESOLVED', { tableId })
        }

        // Optimistic update
        setTables(prev => prev.map(t =>
            t.id === tableId ? { ...t, last_assistance_request: undefined } : t
        ))
        toast.success('Richiesta assistenza risolta')
    }

    const readyItems = useMemo(() => activeOrders.flatMap(o => {
        const session = sessions.find(s => s.id === o.table_session_id)
        if (!session) return []

        const table = tables.find(t => t.id === session.table_id)
        if (!table) return []

        return (o.items || [])
            .filter(i => i.status?.toUpperCase() === 'READY')
            .map(i => ({
                ...i,
                tableId: table.id,
                order_id: o.id,
                dish: i.dish || dishes.find(d => d.id === i.dish_id)
            }))
    }).sort((a, b) => new Date(a.created_at || Date.now()).getTime() - new Date(b.created_at || Date.now()).getTime()), [activeOrders, sessions, tables, dishes])

    // Pending items (in kitchen, not ready yet) for activity center
    const pendingItems = useMemo(() => activeOrders.flatMap(o => {
        const session = sessions.find(s => s.id === o.table_session_id)
        if (!session) return []
        const table = tables.find(t => t.id === session.table_id)
        if (!table) return []
        return (o.items || [])
            .filter(i => ['PENDING', 'IN_PREPARATION'].includes(i.status?.toUpperCase()))
            .map(i => ({
                ...i,
                tableId: table.id,
                tableName: table.number,
                roomName: rooms.find(r => r.id === table.room_id)?.name || null,
                order_id: o.id,
                dish: i.dish || dishes.find(d => d.id === i.dish_id)
            }))
    }).sort((a, b) => new Date(a.created_at || Date.now()).getTime() - new Date(b.created_at || Date.now()).getTime()), [activeOrders, sessions, tables, rooms, dishes])

    // Grouped display: ready items (+ just-delivered greyed) grouped by table, filtered by room
    const displayReadyItemsByTable = useMemo(() => {
        type DisplayItem = {
            id: string
            tableId: string
            tableName: string
            roomId: string | null | undefined
            roomName: string | null | undefined
            order_id: string
            dish: any
            quantity: number
            note: string | null | undefined
            created_at: string | null | undefined
            isDelivered: boolean
        }

        const allItems: DisplayItem[] = activeOrders.flatMap(o => {
            const session = sessions.find(s => s.id === o.table_session_id)
            if (!session) return []
            const table = tables.find(t => t.id === session.table_id)
            if (!table) return []

            // Apply room filter
            if (activityRoomFilter !== 'all' && table.room_id !== activityRoomFilter) return []

            const room = rooms.find(r => r.id === table.room_id)

            return (o.items || [])
                .filter(i => i.status?.toUpperCase() === 'READY' || justDeliveredIds.has(i.id))
                .map(i => ({
                    id: i.id,
                    tableId: table.id,
                    tableName: table.number,
                    roomId: table.room_id,
                    roomName: room?.name || null,
                    order_id: o.id,
                    dish: i.dish || dishes.find(d => d.id === i.dish_id),
                    quantity: i.quantity,
                    note: i.note,
                    created_at: i.created_at,
                    isDelivered: justDeliveredIds.has(i.id)
                }))
        })

        // Group by tableId, sort by oldest created_at
        const grouped = new Map<string, DisplayItem[]>()
        allItems.forEach(item => {
            const existing = grouped.get(item.tableId) || []
            existing.push(item)
            grouped.set(item.tableId, existing)
        })

        // Convert to array of table groups, sorted by table name
        return Array.from(grouped.entries())
            .map(([tableId, items]) => ({
                tableId,
                tableName: items[0].tableName,
                roomName: items[0].roomName,
                items: items.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()),
                allDelivered: items.every(i => i.isDelivered)
            }))
            .sort((a, b) => a.tableName.localeCompare(b.tableName))
    }, [activeOrders, sessions, tables, rooms, dishes, justDeliveredIds, activityRoomFilter])

    const sortTables = (tables: Table[]) => {
        return [...tables].sort((a, b) => {
            if (sortBy === 'alpha') return a.number.localeCompare(b.number)
            if (sortBy === 'seats') return (b.seats || 0) - (a.seats || 0)
            if (sortBy === 'status') {
                const statusA = getDetailedTableStatus(a.id).step
                const statusB = getDetailedTableStatus(b.id).step
                const priority = { 'waiting': 3, 'seated': 2, 'eating': 1, 'free': 0 }
                return priority[statusB] - priority[statusA]
            }
            return 0
        })
    }

    const handleTableClick = (table: Table) => {
        setSelectedTable(table)
        setIsTableModalOpen(true)
    }

    const openPaymentDialog = (e: React.MouseEvent, table: Table) => {
        e.stopPropagation()
        setSelectedTableForPayment(table)
        setIsPaymentDialogOpen(true)
    }

    const handleCloseTable = async (markAsPaid: boolean) => {
        if (!selectedTableForPayment) return

        // Permission Check
        if (!restaurant?.allow_waiter_payments) {
            toast.error('Non hai i permessi per effettuare pagamenti.')
            return
        }

        const session = sessions.find(s => s.table_id === selectedTableForPayment.id)
        if (!session) return

        // Check if there are unpaid items before closing?
        // Logic: Mark as Paid sets everything to PAID.
        // Logic: Empty Table (markAsPaid=false) sets everything to COMPLETED/CANCELLED?

        try {
            // Close ALL open orders for this session directly in DB (not just local state)
            await supabase
                .from('orders')
                .update({ status: 'PAID', closed_at: new Date().toISOString() })
                .eq('table_session_id', session.id)
                .neq('status', 'PAID')

            // Mark all order items as SERVED
            const { data: sessionOrderIds } = await supabase
                .from('orders')
                .select('id')
                .eq('table_session_id', session.id)
            if (sessionOrderIds && sessionOrderIds.length > 0) {
                await supabase
                    .from('order_items')
                    .update({ status: 'SERVED' })
                    .in('order_id', sessionOrderIds.map(o => o.id))
                    .neq('status', 'SERVED')
            }

            // Close session
            await DatabaseService.updateSession({
                ...session,
                status: 'CLOSED',
                closed_at: new Date().toISOString()
            })

            await DatabaseService.clearCart(session.id)

            setSessions(prev => prev.filter(s => s.id !== session.id))
            setActiveOrders(prev => prev.filter(o => o.table_session_id !== session.id))

            toast.success(markAsPaid ? 'Tavolo pagato e liberato' : 'Tavolo liberato')
            setIsPaymentDialogOpen(false)
            refreshData()
        } catch (error) {
            console.error('Error closing table:', error)
            toast.error('Errore durante la chiusura del tavolo')
        }
    }

    // Open activation dialog for a free table
    const activateTable = async (table: Table) => {
        setTableToActivate(table)
        setActivateCustomerCount(String(table.seats || 2))
        // Derive AYCE/coperto defaults from restaurant settings
        const ayceDefault = restaurant ? getCurrentAyceSettings(restaurant).enabled : false
        const copertoDefault = !!((restaurant?.cover_charge_per_person && restaurant.cover_charge_per_person > 0) || (restaurant as any)?.coperto_enabled)
        setActivateAyceEnabled(ayceDefault)
        setActivateCopertoEnabled(copertoDefault)
        setIsActivateDialogOpen(true)
    }

    // Confirm table activation with collected data
    const confirmActivateTable = async () => {
        if (!restaurantId || !tableToActivate) return
        setActivatingTable(true)
        try {
            // Find any old open sessions for this table and close their orders too
            const { data: oldSessions } = await supabase
                .from('table_sessions')
                .select('id')
                .eq('table_id', tableToActivate.id)
                .eq('status', 'OPEN')
            if (oldSessions && oldSessions.length > 0) {
                const oldSessionIds = oldSessions.map(s => s.id)
                // Close all orders from old sessions
                await supabase
                    .from('orders')
                    .update({ status: 'PAID', closed_at: new Date().toISOString() })
                    .in('table_session_id', oldSessionIds)
                    .neq('status', 'PAID')
            }
            await DatabaseService.closeAllOpenSessionsForTable(tableToActivate.id)

            const pin = Math.floor(1000 + Math.random() * 9000).toString()
            const newSession = await DatabaseService.createSession({
                table_id: tableToActivate.id,
                restaurant_id: restaurantId,
                status: 'OPEN',
                session_pin: pin,
                opened_at: new Date().toISOString(),
                customer_count: parseInt(activateCustomerCount) || 2,
                ayce_enabled: activateAyceEnabled,
                coperto_enabled: activateCopertoEnabled
            })
            setSessions(prev => [...prev, newSession])
            toast.success(`Tavolo ${tableToActivate.number} attivato! PIN: ${pin}`)
            setIsTableModalOpen(false)
            setIsActivateDialogOpen(false)
            setTableToActivate(null)
            refreshData()
        } catch (error) {
            console.error('Error activating table:', error)
            toast.error('Errore attivazione tavolo')
        } finally {
            setActivatingTable(false)
        }
    }




    // TABLE MANAGEMENT FUNCTIONS
    const handleAddTable = async () => {
        if (!restaurantId || !newTableNumber.trim()) {
            toast.error('Inserisci un numero/nome per il tavolo')
            return
        }
        try {
            const newTable = await DatabaseService.createTable({
                restaurant_id: restaurantId,
                number: newTableNumber.trim(),
                seats: parseInt(newTableSeats) || 4,
                room_id: (newTableRoomId && newTableRoomId !== 'none') ? newTableRoomId : undefined,
                is_active: true
            })
            setTables(prev => [...prev, newTable])
            setNewTableNumber('')
            setNewTableSeats('4')
            setNewTableRoomId('')
            setIsAddTableDialogOpen(false)
            toast.success(`Tavolo "${newTableNumber}" creato!`)
        } catch (error) {
            console.error('Error creating table:', error)
            toast.error('Errore nella creazione del tavolo')
        }
    }

    const handleEditTable = async () => {
        if (!tableToEdit) return
        try {
            await DatabaseService.updateTable(tableToEdit.id, {
                number: newTableNumber.trim(),
                seats: parseInt(newTableSeats) || 4,
                room_id: (newTableRoomId && newTableRoomId !== 'none') ? newTableRoomId : undefined
            })
            setTables(prev => prev.map(t => t.id === tableToEdit.id ? {
                ...t,
                number: newTableNumber.trim(),
                seats: parseInt(newTableSeats) || 4,
                room_id: (newTableRoomId && newTableRoomId !== 'none') ? newTableRoomId : undefined
            } : t))
            setTableToEdit(null)
            setIsEditTableDialogOpen(false)
            toast.success('Tavolo aggiornato!')
        } catch (error) {
            console.error('Error updating table:', error)
            toast.error('Errore nell\'aggiornamento del tavolo')
        }
    }

    const handleDeleteTable = async (tableId: string) => {
        const session = sessions.find(s => s.table_id === tableId)
        if (session) {
            toast.error('Impossibile eliminare un tavolo con una sessione attiva')
            return
        }
        try {
            await DatabaseService.deleteTable(tableId)
            setTables(prev => prev.filter(t => t.id !== tableId))
            setIsEditTableDialogOpen(false)
            setTableToEdit(null)
            toast.success('Tavolo eliminato!')
        } catch (error) {
            console.error('Error deleting table:', error)
            toast.error('Errore nell\'eliminazione del tavolo')
        }
    }

    const openEditTableDialog = (table: Table) => {
        setTableToEdit(table)
        setNewTableNumber(table.number)
        setNewTableSeats(String(table.seats || 4))
        setNewTableRoomId(table.room_id || '')
        setIsEditTableDialogOpen(true)
    }

    // ROOM MANAGEMENT FUNCTIONS
    const handleAddRoom = async () => {
        if (!restaurantId || !newRoomName.trim()) {
            toast.error('Inserisci un nome per la sala')
            return
        }
        try {
            await DatabaseService.createRoom({
                restaurant_id: restaurantId,
                name: newRoomName.trim(),
                is_active: true,
                order: rooms.length
            })
            const updatedRooms = await DatabaseService.getRooms(restaurantId)
            setRooms(updatedRooms)
            setNewRoomName('')
            setIsAddRoomDialogOpen(false)
            toast.success(`Sala "${newRoomName}" creata!`)
        } catch (error) {
            console.error('Error creating room:', error)
            toast.error('Errore nella creazione della sala')
        }
    }

    const handleEditRoom = async () => {
        if (!roomToEdit || !newRoomName.trim()) return
        try {
            await DatabaseService.updateRoom(roomToEdit.id, {
                name: newRoomName.trim()
            })
            setRooms(prev => prev.map(r => r.id === roomToEdit.id ? { ...r, name: newRoomName.trim() } : r))
            setRoomToEdit(null)
            setIsEditRoomDialogOpen(false)
            toast.success('Sala aggiornata!')
        } catch (error) {
            console.error('Error updating room:', error)
            toast.error('Errore nell\'aggiornamento della sala')
        }
    }

    const handleDeleteRoom = async (roomId: string) => {
        const tablesInRoom = tables.filter(t => t.room_id === roomId)
        if (tablesInRoom.length > 0) {
            toast.error('Impossibile eliminare una sala con tavoli assegnati. Riassegna prima i tavoli.')
            return
        }
        try {
            await DatabaseService.deleteRoom(roomId)
            setRooms(prev => prev.filter(r => r.id !== roomId))
            setIsEditRoomDialogOpen(false)
            setRoomToEdit(null)
            toast.success('Sala eliminata!')
        } catch (error) {
            console.error('Error deleting room:', error)
            toast.error('Errore nell\'eliminazione della sala')
        }
    }

    const openEditRoomDialog = (room: Room) => {
        setRoomToEdit(room)
        setNewRoomName(room.name)
        setIsEditRoomDialogOpen(true)
    }

    // Filtered tables based on room selection (memoizzata)
    const filteredTables = useMemo(() => selectedRoomFilter === 'all'
        ? tables
        : selectedRoomFilter === 'no-room'
            ? tables.filter(t => !t.room_id)
            : tables.filter(t => t.room_id === selectedRoomFilter), [tables, selectedRoomFilter])

    // Must be before early return to maintain consistent hook call order
    const sortedTables = useMemo(() => sortTables(filteredTables), [filteredTables, sortBy, sessions, activeOrders])
    const readyCount = readyItems.length
    const pendingCount = pendingItems.length
    const totalActivityCount = readyCount + pendingCount + assistanceRequests.length

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-screen gap-6 bg-black text-amber-50 px-4 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[60%] bg-amber-500/5 rounded-full blur-[150px] opacity-40" />
            </div>

            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="relative z-10 flex flex-col items-center gap-6"
            >
                <motion.div
                    initial={{ rotate: -20 }}
                    animate={{ rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
                    className="w-24 h-24 rounded-full bg-zinc-900/50 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-[0_0_50px_-10px_rgba(52,211,153,0.3)] backdrop-blur-md"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="48" height="48" fill="currentColor">
                        <path d="M240,32a16,16,0,0,0-16-16A168.21,168.21,0,0,0,55.77,65.23L44.47,53.94A8,8,0,0,0,33.16,65.25L46.61,78.7A168.16,168.16,0,0,0,16.21,247.45a8,8,0,0,0,.3,11.3,8,8,0,0,0,5.65,2.35,8.15,8.15,0,0,0,5.66-2.35l50.88-50.86A168.16,168.16,0,0,0,247.45,39.66a8,8,0,0,0,2.35-5.65A16.06,16.06,0,0,0,240,32Zm-44,82.34L113.66,196.69a152.17,152.17,0,0,1-81-81L115,33.34A152.17,152.17,0,0,1,196,114.34Z"></path>
                    </svg>
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-3xl font-light tracking-[0.25em] text-white uppercase flex items-center justify-center gap-1"
                >
                    min<span className="font-bold text-emerald-400">thi</span>
                </motion.h1>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="flex flex-col items-center gap-4 mt-2"
                >
                    <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2">Caricamento in corso...</p>
                </motion.div>
            </motion.div>
        </div>
    )

    // Helper function to render a table card - MATCHING ADMIN DASHBOARD GRAPHICS
    const renderTableCard = (table: Table) => {
        const session = sessions.find(s => s.table_id === table.id)
        const isActive = !!session
        const statusInfo = getDetailedTableStatus(table.id)
        const activeOrder = activeOrders.find(o => o.table_session_id === session?.id && o.status !== 'CANCELLED' && o.status !== 'PAID')

        const isTableMarkedInactive = table.is_active === false

        const hasStripePaymentToConfirm = session && (session.paid_amount || 0) > 0 && !session.receipt_issued

        // Exact styles from RestaurantDashboard.tsx
        const tableCardClasses = isTableMarkedInactive
            ? 'opacity-60 grayscale'
            : (() => {
                if (hasStripePaymentToConfirm) return 'bg-purple-900/40 border-purple-500/70 shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)] animate-pulse-slow' // Purple Stripe
                if (!isActive) return 'bg-black/40 border-emerald-500/20 shadow-[0_0_15px_-5px_rgba(16,185,129,0.1)] hover:border-emerald-500/40' // Green (Free)
                if (statusInfo.step === 'waiting') return 'bg-red-900/20 border-red-500/50 shadow-[0_0_15px_-5px_rgba(239,68,68,0.3)]' // Red (Waiting for food)
                return 'bg-amber-900/20 border-amber-500/50 shadow-[0_0_15px_-5px_rgba(245,158,11,0.3)]' // Yellow (Eating)
            })()

        return (
            <Card
                key={table.id}
                className={`relative overflow-hidden transition-all duration-300 group cursor-pointer ${tableCardClasses}`}
                onClick={() => {
                    if (isTableMarkedInactive) return
                    if (isActive) {
                        handleTableClick(table)
                    } else {
                        activateTable(table)
                    }
                }}
            >
                {isTableMarkedInactive && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 -rotate-12 border-2 border-white/20 px-3 py-1 rounded">Disattivato</span>
                    </div>
                )}
                {isActive && (
                    <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 blur-xl rounded-full -mr-8 -mt-8 pointer-events-none"></div>
                )}
                {!isActive && (
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 blur-xl rounded-full -mr-8 -mt-8 pointer-events-none"></div>
                )}

                <CardContent className="p-0 flex flex-col h-full">
                    <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 relative z-10">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={`text-2xl font-bold tracking-tight whitespace-nowrap ${isActive ? 'text-amber-500' : 'text-zinc-100'}`}>
                                {table.number}
                            </span>
                            <div className="flex items-center gap-1.5 text-zinc-400 bg-white/5 px-3 py-1 rounded-full shrink-0">
                                <User size={16} weight="bold" />
                                <span className="text-sm font-bold">{table.seats || 4}</span>
                            </div>
                        </div>
                        <Badge
                            variant={isActive ? 'default' : 'outline'}
                            className={isActive ? 'bg-amber-500 text-black border-none font-bold' : 'bg-transparent text-zinc-500 border-zinc-700'}
                        >
                            {isActive ? 'Occupato' : 'Libero'}
                        </Badge>
                    </div>

                    <div className="flex-1 p-5 flex flex-col items-center justify-center gap-3 relative z-10">
                        {isActive ? (
                            <>
                                <div className="text-center">
                                    <p className="text-[9px] text-amber-500/70 mb-1 uppercase tracking-[0.2em] font-semibold">PIN</p>
                                    <div className="bg-black/40 px-6 py-3 rounded-xl border border-amber-500/20 shadow-inner min-w-[120px]">
                                        <span className="text-4xl font-mono font-bold tracking-widest text-amber-500 whitespace-nowrap">
                                            {session?.session_pin || '...'}
                                        </span>
                                    </div>
                                </div>
                                {activeOrder && (
                                    <Badge variant="outline" className="text-[10px] bg-black/40 border-amber-500/30 text-amber-200">
                                        <CheckCircle size={10} className="mr-1" weight="fill" />
                                        {activeOrder.items?.filter(i => i.status === 'SERVED').length || 0} completati
                                    </Badge>
                                )}
                                {hasStripePaymentToConfirm && (
                                    <Badge variant="outline" className="text-[10px] bg-purple-500/20 border-purple-500/50 text-purple-200 mt-1">
                                        💳 Pagato Online {(session?.paid_amount || 0) > 0 ? `(€${session!.paid_amount!.toFixed(2)})` : ''}
                                    </Badge>
                                )}
                            </>
                        ) : (
                            <div className="text-center text-zinc-700 group-hover:text-zinc-500 transition-all duration-300">
                                <ForkKnife size={32} className="mx-auto mb-1" weight="duotone" />
                                <p className="text-xs font-medium">Clicca per Ordinare</p>
                            </div>
                        )}
                    </div>

                    <div className="p-3 bg-gradient-to-t from-muted/10 to-transparent border-t border-border/5 grid gap-2 relative z-10">
                        {isActive ? (
                            <div className={`grid gap-2 ${hasStripePaymentToConfirm ? 'grid-cols-1' : (restaurant?.allow_waiter_payments ? 'grid-cols-2' : 'grid-cols-1')}`}>
                                {hasStripePaymentToConfirm ? (
                                    <Button
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm hover:shadow transition-all h-8 text-xs font-bold"
                                        size="sm"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!restaurant?.allow_waiter_payments) {
                                                toast.error('Non hai i permessi di cassa per confermare lo scontrino');
                                                return;
                                            }
                                            try {
                                                await DatabaseService.updateSessionReceiptIssued(session.id, true);
                                                toast.success('Scontrino confermato!');
                                                refreshData();
                                            } catch (err) {
                                                toast.error('Errore nella conferma');
                                            }
                                        }}
                                    >
                                        <CheckCircle size={14} weight="fill" className="mr-1.5 shrink-0" />
                                        <span>Conferma Scontrino</span>
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="shadow-sm hover:shadow transition-shadow h-8 text-xs"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleQuickOrderClick(table)
                                            }}
                                        >
                                            <Plus size={14} className="shrink-0 mr-1.5" />
                                            <span>Ordina</span>
                                        </Button>
                                        {restaurant?.allow_waiter_payments && (
                                            <Button
                                                className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 shadow-sm hover:shadow transition-all h-8 text-xs"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openPaymentDialog(e, table)
                                                }}
                                            >
                                                <Receipt size={14} className="shrink-0 mr-1.5" />
                                                <span>Conto</span>
                                            </Button>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            <Button
                                className="w-full shadow-sm hover:shadow transition-shadow h-8 text-xs"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    activateTable(table)
                                }}
                            >
                                <Plus size={14} className="mr-1.5" />
                                Attiva
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="min-h-[100dvh] bg-zinc-950 p-4 md:p-6 pb-24 text-zinc-100 font-sans selection:bg-amber-500/30">
            {/* Background Ambience */}
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/10 via-zinc-950 to-zinc-950 pointer-events-none" />
            <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none brightness-100 contrast-150 mix-blend-overlay"></div>

            {/* Header */}
            <header className="sticky top-0 z-50 mb-4 sm:mb-8 bg-zinc-950/80 backdrop-blur-xl p-3 sm:p-4 rounded-b-2xl sm:rounded-b-3xl border-b border-white/5 shadow-2xl transition-all duration-300">
                {/* Top Row: Title + Settings/Logout */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-black shadow-lg shadow-amber-500/20 ring-1 ring-white/10 shrink-0">
                            <User size={22} weight="duotone" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">Gestione Sala</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                <p className="text-xs font-medium text-zinc-400">Attivo</p>
                            </div>
                        </div>
                    </div>
                    {/* Settings + Logout — fixed top right */}
                    <div className="flex items-center gap-1 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10 h-9 w-9 rounded-xl"
                            onClick={() => setIsManageDialogOpen(true)}
                        >
                            <GearSix size={18} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 h-9 w-9 rounded-xl"
                            onClick={onLogout}
                        >
                            <SignOut size={18} />
                        </Button>
                    </div>
                </div>

                {/* Bottom Row: Activity + Sort + Room Filter — scrollable */}
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
                    {/* Activity Button */}
                    <Button
                        variant={totalActivityCount > 0 ? "default" : "outline"}
                        size="sm"
                        className={`h-9 px-3 rounded-xl font-bold transition-all shadow-lg shrink-0 text-xs ${assistanceRequests.length > 0
                            ? 'bg-red-500 hover:bg-red-400 text-white border-transparent animate-pulse shadow-red-500/20'
                            : readyCount > 0
                            ? 'bg-amber-500 hover:bg-amber-400 text-black border-transparent animate-pulse shadow-amber-500/20'
                            : totalActivityCount > 0
                            ? 'bg-blue-500 hover:bg-blue-400 text-white border-transparent shadow-blue-500/20'
                            : 'text-zinc-400 bg-zinc-900/50 border-white/5 hover:bg-zinc-800 hover:text-white'
                            }`}
                        onClick={() => setIsReadyDrawerOpen(true)}
                    >
                        {assistanceRequests.length > 0 ? (
                            <BellSimple size={16} weight="fill" className="mr-1.5 animate-bounce text-yellow-400" />
                        ) : readyCount > 0 ? (
                            <BellRinging size={16} weight="fill" className="mr-1.5 animate-bounce" />
                        ) : pendingCount > 0 ? (
                            <Clock size={16} weight="fill" className="mr-1.5" />
                        ) : (
                            <CheckCircle size={16} className="mr-1.5" />
                        )}
                        Attività: {totalActivityCount}
                    </Button>

                    {/* Sort Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 px-3 rounded-xl bg-zinc-900/80 border-white/5 text-xs font-bold text-zinc-400 hover:text-white shrink-0">
                                <Funnel size={14} className="mr-1.5 text-amber-500" />
                                {sortBy === 'status' ? 'Stato' : sortBy === 'alpha' ? 'A-Z' : 'Posti'}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-zinc-950 border-zinc-800">
                            <DropdownMenuLabel className="text-xs text-zinc-500">Ordina per</DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-zinc-800" />
                            <DropdownMenuItem onClick={() => setSortBy('status')} className={sortBy === 'status' ? 'text-amber-500' : ''}>Stato</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSortBy('alpha')} className={sortBy === 'alpha' ? 'text-amber-500' : ''}>A-Z</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSortBy('seats')} className={sortBy === 'seats' ? 'text-amber-500' : ''}>Posti</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Room Filter */}
                    {rooms.length > 0 && (
                        <Select value={selectedRoomFilter} onValueChange={setSelectedRoomFilter}>
                            <SelectTrigger className="w-[120px] h-9 bg-zinc-900/80 border-white/5 text-xs font-bold rounded-xl shrink-0">
                                <House size={14} className="mr-1 text-amber-500 shrink-0" />
                                <SelectValue placeholder="Sale" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-950 border-zinc-800">
                                <SelectItem value="all">Tutte le Sale</SelectItem>
                                <SelectItem value="no-room">Senza Sala</SelectItem>
                                {rooms.map(room => (
                                    <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {/* Refresh button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10 shrink-0"
                        onClick={() => refreshData()}
                    >
                        <ArrowsClockwise size={16} />
                    </Button>
                </div>
            </header>

            {/* Tables grouped by Room */}
            <div className="relative z-10 space-y-8">
                {(() => {
                    // Group tables by room
                    const roomIds = new Set(rooms.map(r => r.id))
                    const tablesByRoom = new Map<string, Table[]>()
                    const noRoomTables: Table[] = []

                    sortedTables.forEach(table => {
                        if (table.room_id && roomIds.has(table.room_id)) {
                            const existing = tablesByRoom.get(table.room_id) || []
                            existing.push(table)
                            tablesByRoom.set(table.room_id, existing)
                        } else {
                            // Tables without room_id OR with a room_id pointing to a deleted/inactive room
                            noRoomTables.push(table)
                        }
                    })

                    // Render each room section
                    const roomSections: React.ReactNode[] = []

                    // Render rooms in order
                    rooms.forEach(room => {
                        const roomTables = tablesByRoom.get(room.id) || []
                        if (roomTables.length > 0) {
                            roomSections.push(
                                <div key={room.id} className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-bold text-white">{room.name}</h3>
                                        <div className="flex-1 h-px bg-white/10" />
                                        <span className="text-xs text-zinc-500">{roomTables.length} tavoli</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-4">
                                        {roomTables.map(table => renderTableCard(table))}
                                    </div>
                                </div>
                            )
                        }
                    })

                    // No-room tables (includes orphaned tables from deleted rooms)
                    if (noRoomTables.length > 0) {
                        roomSections.push(
                            <div key="no-room" className="space-y-4">
                                {rooms.length > 0 && (
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-bold text-white">Sala Principale</h3>
                                        <div className="flex-1 h-px bg-white/10" />
                                        <span className="text-xs text-zinc-500">{noRoomTables.length} tavoli</span>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-4">
                                    {noRoomTables.map(table => renderTableCard(table))}
                                </div>
                            </div>
                        )
                    }

                    return roomSections
                })()}
            </div>

            {/* Activity Center View (Full Screen) */}
            <AnimatePresence>
                {isReadyDrawerOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: '100%' }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-0 z-50 bg-zinc-950 flex flex-col"
                    >
                        {/* Header */}
                        <div className="px-3 py-3 border-b border-white/10 bg-zinc-900/50 backdrop-blur-md shrink-0 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            setIsReadyDrawerOpen(false)
                                            setJustDeliveredIds(new Set())
                                        }}
                                        className="text-zinc-400 hover:text-white h-9 w-9 shrink-0"
                                    >
                                        <ArrowLeft size={20} />
                                    </Button>
                                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 truncate">
                                        <BellRinging className="text-amber-500 shrink-0" weight="fill" size={20} />
                                        <span className="truncate">Centro Attività</span>
                                    </h2>
                                </div>
                                <Badge variant="outline" className="border-amber-500/30 text-amber-500 shrink-0 text-[10px]">
                                    {totalActivityCount}
                                </Badge>
                            </div>
                            {/* Room filter for activity center */}
                            {rooms.length > 0 && (
                                <Select value={activityRoomFilter} onValueChange={setActivityRoomFilter}>
                                    <SelectTrigger className="w-full h-8 bg-zinc-900/80 border-white/10 text-xs font-bold rounded-lg">
                                        <House size={14} className="mr-1.5 text-amber-500 shrink-0" />
                                        <SelectValue placeholder="Tutte le Sale" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                        <SelectItem value="all">Tutte le Sale</SelectItem>
                                        {rooms.map(room => (
                                            <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
                            {/* Assistance Requests Section — filtered by room */}
                            {(() => {
                                const filteredAssistance = activityRoomFilter === 'all'
                                    ? assistanceRequests
                                    : assistanceRequests.filter(t => t.room_id === activityRoomFilter)
                                return filteredAssistance.length > 0 ? (
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-red-500 flex items-center gap-2">
                                            <WarningCircle size={16} weight="fill" />
                                            Richieste Assistenza
                                        </h3>
                                        {filteredAssistance.map(t => {
                                            const room = rooms.find(r => r.id === t.room_id)
                                            return (
                                                <div key={t.id} className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex items-center justify-between animate-pulse-slow">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-black font-bold text-lg shrink-0">
                                                            {t.number}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-red-400">Richiesta Cameriere</p>
                                                            {room && <p className="text-xs text-red-300/40 font-medium">{room.name}</p>}
                                                            <p className="text-xs text-red-300/60">
                                                                {t.last_assistance_request ? new Date(t.last_assistance_request).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Adesso'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        className="bg-red-500 hover:bg-red-400 text-black font-bold h-9 px-4 rounded-lg"
                                                        onClick={() => handleResolveAssistance(t.id)}
                                                    >
                                                        <CheckCircle size={18} className="mr-2" weight="fill" />
                                                        Risolvi
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : null
                            })()}

                            {/* Ready Items Section — grouped by table */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                    <ChefHat size={16} />
                                    Piatti Pronti da Servire
                                    {activityRoomFilter !== 'all' && (
                                        <span className="text-amber-500 normal-case font-normal">
                                            — {rooms.find(r => r.id === activityRoomFilter)?.name}
                                        </span>
                                    )}
                                </h3>

                                {displayReadyItemsByTable.length === 0 ? (
                                    <div className="py-12 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-white/5 rounded-2xl bg-zinc-900/20">
                                        <ForkKnife size={48} className="mb-4 opacity-20" />
                                        <p>Nessun piatto pronto da servire</p>
                                    </div>
                                ) : (
                                    <AnimatePresence>
                                        {displayReadyItemsByTable.map(tableGroup => (
                                            <motion.div
                                                key={tableGroup.tableId}
                                                initial={{ opacity: 1 }}
                                                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                                transition={{ duration: 0.4 }}
                                                className={cn(
                                                    "rounded-2xl overflow-hidden border shadow-lg shadow-black/50 transition-all duration-300",
                                                    tableGroup.allDelivered
                                                        ? "border-zinc-700/30 bg-zinc-900/30 opacity-50"
                                                        : "border-amber-500/20 bg-zinc-900"
                                                )}
                                            >
                                                {/* Table Group Header */}
                                                <div className={cn(
                                                    "px-4 py-3 flex items-center justify-between border-b",
                                                    tableGroup.allDelivered
                                                        ? "border-zinc-700/20 bg-zinc-900/20"
                                                        : "border-amber-500/10 bg-amber-500/5"
                                                )}>
                                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                        <div className={cn(
                                                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-inner shrink-0",
                                                            tableGroup.allDelivered
                                                                ? "bg-zinc-700/50 text-zinc-400"
                                                                : "bg-amber-500 text-black"
                                                        )}>
                                                            <span className="truncate px-1 max-w-[2.25rem] text-center leading-none">
                                                                {tableGroup.tableName}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                            <p className={cn(
                                                                "font-bold text-sm truncate",
                                                                tableGroup.allDelivered ? "text-zinc-500" : "text-white"
                                                            )}>
                                                                Tavolo {tableGroup.tableName}
                                                            </p>
                                                            {tableGroup.roomName && (
                                                                <span className={cn(
                                                                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium truncate max-w-[7rem] shrink-0",
                                                                    tableGroup.allDelivered
                                                                        ? "bg-zinc-800 text-zinc-500"
                                                                        : "bg-zinc-800 text-zinc-400"
                                                                )}>
                                                                    <House size={9} className="shrink-0" />
                                                                    <span className="truncate">{tableGroup.roomName}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "text-[10px] font-bold whitespace-nowrap",
                                                                tableGroup.allDelivered
                                                                    ? "border-zinc-600 text-zinc-500"
                                                                    : "border-amber-500/40 text-amber-400 bg-amber-500/5"
                                                            )}
                                                        >
                                                            {tableGroup.items.filter(i => !i.isDelivered).length} da servire
                                                        </Badge>
                                                    </div>
                                                </div>

                                                {/* Dishes in this table group */}
                                                <div className="divide-y divide-white/5">
                                                    {tableGroup.items.map(item => (
                                                        <div
                                                            key={item.id}
                                                            className={cn(
                                                                "p-4 flex gap-4 transition-all duration-300",
                                                                item.isDelivered && "opacity-40"
                                                            )}
                                                        >
                                                            {/* Left stripe */}
                                                            <div className={cn(
                                                                "w-1 rounded-full shrink-0 self-stretch",
                                                                item.isDelivered ? "bg-zinc-600" : "bg-amber-500"
                                                            )} />

                                                            {/* Content */}
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className={cn(
                                                                    "font-bold text-base leading-tight mb-0.5",
                                                                    item.isDelivered ? "line-through text-zinc-500" : "text-white"
                                                                )}>
                                                                    {item.dish?.name || 'Piatto'}
                                                                </h4>
                                                                <p className="text-xs text-zinc-500 mb-1">
                                                                    Quantità: <span className={item.isDelivered ? "text-zinc-600" : "text-white font-bold"}>{item.quantity}</span>
                                                                    <span className="mx-2 text-zinc-700">·</span>
                                                                    {new Date(item.created_at || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </p>
                                                                {item.note && (
                                                                    <p className="text-xs text-amber-500/70 italic">Note: {item.note}</p>
                                                                )}
                                                            </div>

                                                            {/* Action button */}
                                                            <div className="flex flex-col justify-center shrink-0">
                                                                {item.isDelivered ? (
                                                                    <div className="h-11 w-11 rounded-full bg-zinc-700/40 flex items-center justify-center">
                                                                        <Check size={20} weight="bold" className="text-zinc-500" />
                                                                    </div>
                                                                ) : (
                                                                    <Button
                                                                        className="h-11 w-11 rounded-full bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 p-0"
                                                                        onClick={() => handleMarkAsDelivered(item.order_id, item.id)}
                                                                    >
                                                                        <Check size={20} weight="bold" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>

                            {/* In Cucina Section — pending/in preparation items */}
                            {(() => {
                                const filteredPending = activityRoomFilter === 'all'
                                    ? pendingItems
                                    : pendingItems.filter(i => {
                                        const table = tables.find(t => t.id === i.tableId)
                                        return table?.room_id === activityRoomFilter
                                    })

                                // Group by table
                                const grouped = new Map<string, typeof filteredPending>()
                                filteredPending.forEach(item => {
                                    const existing = grouped.get(item.tableId) || []
                                    existing.push(item)
                                    grouped.set(item.tableId, existing)
                                })

                                return filteredPending.length > 0 ? (
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400 flex items-center gap-2">
                                            <Clock size={16} weight="fill" />
                                            In Cucina ({filteredPending.length} piatti)
                                        </h3>
                                        {Array.from(grouped.entries()).map(([tableId, items]) => (
                                            <div key={tableId} className="rounded-xl border border-blue-500/15 bg-zinc-900/50 overflow-hidden">
                                                <div className="px-4 py-2.5 flex items-center gap-2.5 border-b border-blue-500/10 bg-blue-500/5">
                                                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm shrink-0">
                                                        {items[0].tableName}
                                                    </div>
                                                    <p className="font-semibold text-sm text-blue-300">Tavolo {items[0].tableName}</p>
                                                    {items[0].roomName && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{items[0].roomName}</span>
                                                    )}
                                                    <Badge variant="outline" className="ml-auto border-blue-500/30 text-blue-400 text-[10px]">
                                                        {items.length} in preparazione
                                                    </Badge>
                                                </div>
                                                <div className="divide-y divide-white/5">
                                                    {items.map(item => (
                                                        <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                                                            <div className="w-1 h-8 rounded-full bg-blue-500/40 shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-medium text-sm text-zinc-300 truncate">{item.dish?.name || 'Piatto'}</p>
                                                                <p className="text-[11px] text-zinc-600">
                                                                    x{item.quantity} · {new Date(item.created_at || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    {item.status?.toUpperCase() === 'IN_PREPARATION' && <span className="ml-2 text-blue-400">In preparazione</span>}
                                                                    {item.status?.toUpperCase() === 'PENDING' && <span className="ml-2 text-zinc-500">In attesa</span>}
                                                                </p>
                                                                {item.note && <p className="text-[11px] text-amber-500/50 italic mt-0.5">Note: {item.note}</p>}
                                                            </div>
                                                            <Clock size={16} className="text-blue-500/40 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null
                            })()}

                            {/* Empty state when no activity at all */}
                            {readyCount === 0 && pendingCount === 0 && assistanceRequests.length === 0 && (
                                <div className="py-16 flex flex-col items-center justify-center text-zinc-600">
                                    <CheckCircle size={56} className="mb-4 opacity-20" />
                                    <p className="text-lg font-medium text-zinc-500">Nessuna attività</p>
                                    <p className="text-sm text-zinc-600 mt-1">Tutti i piatti sono stati serviti</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Payment Dialog */}
            {/* Payment / Bill Dialog */}
            <TableBillDialog
                isOpen={isPaymentDialogOpen}
                onClose={() => setIsPaymentDialogOpen(false)}
                table={selectedTableForPayment}
                session={selectedTableForPayment ? (sessions.find(s => s.table_id === selectedTableForPayment.id) || null) : null}
                orders={selectedTableForPayment
                    ? activeOrders.filter(o => {
                        const sess = sessions.find(s => s.table_id === selectedTableForPayment.id)
                        return sess && o.table_session_id === sess.id
                    })
                    : []
                }
                restaurant={restaurant}
                onPaymentComplete={() => {
                    handleCloseTable(true)
                    setIsPaymentDialogOpen(false)
                }}
                onEmptyTable={() => {
                    handleCloseTable(false)
                    setIsPaymentDialogOpen(false)
                }}
                isWaiter={true}
            />

            {/* Table Management Modal */}
            <Dialog open={isTableModalOpen} onOpenChange={setIsTableModalOpen}>
                <DialogContent className="sm:max-w-lg bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-0 overflow-hidden max-h-[85vh] rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] outline-none">
                    {selectedTable && (() => {
                        const session = sessions.find(s => s.table_id === selectedTable.id)
                        const tableOrders = session
                            ? activeOrders.filter(o => o.table_session_id === session.id && o.status !== 'CANCELLED')
                            : []
                        const tableTotal = session ? getTableTotal(session.id) : 0
                        const statusInfo = getDetailedTableStatus(selectedTable.id)

                        return (
                            <>
                                {/* Header */}
                                <div className="p-6 bg-gradient-to-b from-zinc-900 to-zinc-950 border-b border-white/5">
                                    <DialogHeader>
                                        <DialogTitle className="text-2xl font-bold text-white flex items-center gap-3">
                                            <span className="bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl text-2xl text-amber-500 font-serif">{selectedTable.number}</span>
                                            <div className="flex flex-col">
                                                <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Gestione Tavolo</span>
                                                <span className={`text-sm font-medium ${statusInfo.step === 'free' ? 'text-zinc-500' :
                                                    statusInfo.step === 'seated' ? 'text-blue-400' :
                                                        statusInfo.step === 'waiting' ? 'text-amber-400' :
                                                            'text-emerald-400'
                                                    }`}>
                                                    {statusInfo.label} {statusInfo.time && `• ${statusInfo.time}`}
                                                </span>
                                            </div>
                                        </DialogTitle>
                                    </DialogHeader>
                                </div>

                                {/* Content */}
                                <ScrollArea className="flex-1 max-h-[50vh]">
                                    <div className="p-4">
                                        {!session ? (
                                            <div className="text-center py-12">
                                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-900 flex items-center justify-center">
                                                    <User size={32} className="text-zinc-700" />
                                                </div>
                                                <p className="text-zinc-500 mb-2">Tavolo libero</p>
                                                <p className="text-xs text-zinc-600">Nessun cliente seduto</p>
                                            </div>
                                        ) : tableOrders.length === 0 ? (
                                            <div className="text-center py-12">
                                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                    <Clock size={32} className="text-blue-500" />
                                                </div>
                                                <p className="text-zinc-400 mb-2">Clienti appena seduti</p>
                                                <p className="text-xs text-zinc-500">In attesa di ordinare</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Ordini attivi</h4>
                                                {tableOrders.map(order => {
                                                    const items = order.items || []
                                                    const readyCount = items.filter(i => i.status?.toUpperCase() === 'READY').length
                                                    const servedCount = items.filter(i => i.status?.toUpperCase() === 'SERVED' || i.status?.toUpperCase() === 'DELIVERED').length
                                                    const allReady = items.length > 0 && items.every(i => ['READY', 'SERVED', 'DELIVERED'].includes(i.status?.toUpperCase() || ''))
                                                    const allServed = items.length > 0 && items.every(i => ['SERVED', 'DELIVERED'].includes(i.status?.toUpperCase() || ''))
                                                    const pendingCount = items.length - servedCount

                                                    return (
                                                    <div key={order.id} className="bg-zinc-900/80 border border-white/5 rounded-xl p-4">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <Badge variant="outline" className={`text-[10px] ${
                                                                allServed ? 'text-emerald-400 border-emerald-500/30' :
                                                                readyCount > 0 ? 'text-amber-400 border-amber-500/30' :
                                                                    'text-blue-400 border-blue-500/30'
                                                                }`}>
                                                                {allServed ? 'Consegnato' :
                                                                    readyCount > 0 ? `${readyCount} Pronti` :
                                                                        'In Preparazione'}
                                                            </Badge>
                                                            <span className="text-xs text-zinc-500">
                                                                {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {items.map(item => {
                                                                const isServed = ['SERVED', 'DELIVERED'].includes(item.status?.toUpperCase() || '')
                                                                const isReady = item.status?.toUpperCase() === 'READY'
                                                                return (
                                                                <div key={item.id} className="flex justify-between items-center text-sm gap-2">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        <span className={`font-bold shrink-0 ${isServed ? 'text-zinc-600' : 'text-amber-500'}`}>{item.quantity}x</span>
                                                                        <span className={isServed ? 'text-zinc-500 line-through' : 'text-white'}>
                                                                            {item.dish?.name || 'Piatto'}
                                                                        </span>
                                                                        {isReady && (
                                                                            <Badge className="bg-amber-500 text-black text-[8px] px-1 shrink-0">PRONTO</Badge>
                                                                        )}
                                                                        {isServed && (
                                                                            <Badge className="bg-emerald-500/15 text-emerald-400 text-[8px] px-1 shrink-0">CONSEGNATO</Badge>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        <span className="text-zinc-400">€{((item.dish?.price || 0) * item.quantity).toFixed(2)}</span>
                                                                        {isReady && !isServed && (
                                                                            <Button
                                                                                size="sm"
                                                                                className="h-7 w-7 p-0 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
                                                                                onClick={() => handleMarkAsDelivered(order.id, item.id)}
                                                                            >
                                                                                <Check size={14} weight="bold" />
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                )
                                                            })}
                                                        </div>
                                                        <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                                                            <span className="text-xs text-zinc-500">Subtotale</span>
                                                            <span className="text-sm font-bold text-white">€{(order.total_amount || 0).toFixed(2)}</span>
                                                        </div>
                                                        {/* Mark all as delivered button — only show when items are READY */}
                                                        {readyCount > 0 && (
                                                            <Button
                                                                size="sm"
                                                                className="w-full mt-3 h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20"
                                                                onClick={async () => {
                                                                    const readyItems = items.filter(i => i.status?.toUpperCase() === 'READY')
                                                                    const readyIds = readyItems.map(i => i.id)
                                                                    await supabase.from('order_items').update({ status: 'SERVED' }).in('id', readyIds)
                                                                    setActiveOrders(prev => prev.map(o => {
                                                                        if (o.id === order.id) {
                                                                            return { ...o, items: o.items?.map(i => readyIds.includes(i.id) ? { ...i, status: 'SERVED' } : i) }
                                                                        }
                                                                        return o
                                                                    }))
                                                                    readyIds.forEach(id => setJustDeliveredIds(prev => new Set([...prev, id])))
                                                                    toast.success(`${readyCount} piatti segnati come consegnati`)
                                                                }}
                                                            >
                                                                <Check size={16} weight="bold" className="mr-2" />
                                                                Segna tutti come Consegnati ({readyCount})
                                                            </Button>
                                                        )}
                                                    </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>

                                {/* Footer */}
                                {session && (
                                    <div className="p-4 border-t border-white/5 bg-zinc-900/50 space-y-3">
                                        <div className="flex justify-between items-center py-3 px-4 bg-black/30 rounded-xl">
                                            <span className="text-sm font-bold text-zinc-400">Totale Tavolo</span>
                                            <span className="text-2xl font-black text-amber-500">€{tableTotal.toFixed(2)}</span>
                                        </div>

                                        {/* Primary Action: Ordina */}
                                        <Button
                                            className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 rounded-xl"
                                            onClick={() => {
                                                setIsTableModalOpen(false)
                                                handleQuickOrderClick(selectedTable)
                                            }}
                                        >
                                            <Plus size={20} className="mr-2" weight="bold" />
                                            Ordina
                                        </Button>

                                        {/* Payment buttons — only if permissions are active */}
                                        {restaurant?.allow_waiter_payments && (
                                            <Button
                                                className="w-full h-11 text-sm font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 rounded-xl"
                                                onClick={() => {
                                                    setIsTableModalOpen(false)
                                                    setSelectedTableForPayment(selectedTable)
                                                    setIsPaymentDialogOpen(true)
                                                }}
                                            >
                                                <Receipt size={18} className="mr-2" />
                                                Vai al Conto
                                            </Button>
                                        )}

                                        {/* Svuota Tavolo — always available */}
                                        <Button
                                            variant="outline"
                                            className="w-full h-10 text-sm border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl"
                                            onClick={async () => {
                                                if (!confirm(`Vuoi svuotare il tavolo ${selectedTable.number}? Gli ordini attivi verranno chiusi.`)) return
                                                try {
                                                    // Close all orders for this session directly in DB
                                                    await supabase
                                                        .from('orders')
                                                        .update({ status: 'PAID', closed_at: new Date().toISOString() })
                                                        .eq('table_session_id', session.id)
                                                        .neq('status', 'PAID')
                                                    // Mark all items as SERVED
                                                    const { data: sOrdIds } = await supabase.from('orders').select('id').eq('table_session_id', session.id)
                                                    if (sOrdIds && sOrdIds.length > 0) {
                                                        await supabase.from('order_items').update({ status: 'SERVED' }).in('order_id', sOrdIds.map(o => o.id)).neq('status', 'SERVED')
                                                    }
                                                    await DatabaseService.updateSession({
                                                        ...session,
                                                        status: 'CLOSED',
                                                        closed_at: new Date().toISOString()
                                                    })
                                                    await DatabaseService.clearCart(session.id)
                                                    setSessions(prev => prev.filter(s => s.id !== session.id))
                                                    setActiveOrders(prev => prev.filter(o => o.table_session_id !== session.id))
                                                    setIsTableModalOpen(false)
                                                    toast.success(`Tavolo ${selectedTable.number} liberato`)
                                                    refreshData()
                                                } catch (error) {
                                                    console.error('Error emptying table:', error)
                                                    toast.error('Errore nello svuotamento del tavolo')
                                                }
                                            }}
                                        >
                                            <Trash size={16} className="mr-2" />
                                            Svuota Tavolo
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            className="w-full h-9 text-xs text-zinc-500 hover:text-zinc-300"
                                            onClick={() => setIsTableModalOpen(false)}
                                        >
                                            Chiudi
                                        </Button>
                                    </div>
                                )}

                                {!session && (
                                    <div className="p-4 border-t border-white/5 space-y-3">
                                        <Button
                                            className="w-full h-12 text-base font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 rounded-xl"
                                            onClick={() => activateTable(selectedTable)}
                                            disabled={activatingTable}
                                        >
                                            {activatingTable ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                                    Attivazione...
                                                </div>
                                            ) : (
                                                <>
                                                    <Plus size={20} className="mr-2" weight="bold" />
                                                    Attiva Tavolo
                                                </>
                                            )}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="w-full h-10 border-white/10 text-zinc-400"
                                            onClick={() => setIsTableModalOpen(false)}
                                        >
                                            Chiudi
                                        </Button>
                                    </div>
                                )}
                            </>
                        )
                    })()}
                </DialogContent>
            </Dialog>

            {/* Table Activation Dialog */}
            <Dialog open={isActivateDialogOpen} onOpenChange={setIsActivateDialogOpen}>
                <DialogContent className="sm:max-w-md w-[95vw] bg-zinc-950 border-zinc-800 text-zinc-100">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users size={20} className="text-amber-500" />
                            Attiva Tavolo {tableToActivate?.number}
                        </DialogTitle>
                        <DialogDescription>Configura il tavolo prima di attivarlo</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-400">Numero Persone</Label>
                            <Input
                                type="number"
                                min="1"
                                max="50"
                                value={activateCustomerCount}
                                onChange={(e) => setActivateCustomerCount(e.target.value)}
                                className="bg-zinc-900 border-zinc-800 h-12 text-lg text-center"
                            />
                        </div>
                        {restaurant && getCurrentAyceSettings(restaurant).enabled && (
                            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-white/5">
                                <div>
                                    <p className="font-medium">AYCE (All You Can Eat)</p>
                                    <p className="text-xs text-zinc-500">Attiva il menu AYCE per questo tavolo</p>
                                </div>
                                <Button
                                    variant={activateAyceEnabled ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setActivateAyceEnabled(!activateAyceEnabled)}
                                    className={activateAyceEnabled ? "bg-amber-500 hover:bg-amber-600 text-black" : "border-zinc-700"}
                                >
                                    {activateAyceEnabled ? 'Attivo' : 'Disattivo'}
                                </Button>
                            </div>
                        )}
                        {((restaurant?.cover_charge_per_person && restaurant.cover_charge_per_person > 0) || (restaurant as any)?.coperto_enabled) && (
                            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-white/5">
                                <div>
                                    <p className="font-medium">Coperto</p>
                                    <p className="text-xs text-zinc-500">Applica il coperto a questo tavolo</p>
                                </div>
                                <Button
                                    variant={activateCopertoEnabled ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setActivateCopertoEnabled(!activateCopertoEnabled)}
                                    className={activateCopertoEnabled ? "bg-amber-500 hover:bg-amber-600 text-black" : "border-zinc-700"}
                                >
                                    {activateCopertoEnabled ? 'Attivo' : 'Disattivo'}
                                </Button>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsActivateDialogOpen(false)} className="border-zinc-700">
                            Annulla
                        </Button>
                        <Button
                            onClick={confirmActivateTable}
                            disabled={activatingTable}
                            className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
                        >
                            {activatingTable ? 'Attivazione...' : 'Attiva Tavolo'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Management Dialog - Main Menu */}
            <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
                <DialogContent className="sm:max-w-lg w-[95vw] bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden max-h-[85vh] flex flex-col">
                    <DialogHeader className="p-6 pb-4 border-b border-white/5 bg-zinc-900/50 shrink-0">
                        <DialogTitle className="text-xl font-bold flex items-center gap-3">
                            <GearSix size={24} className="text-amber-500" />
                            Gestione Tavoli e Sale
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500">
                            Aggiungi, modifica o elimina tavoli e sale
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="flex-1 max-h-[65vh] overflow-y-auto">
                        <div className="p-4 space-y-6">
                            {/* Tables Section */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Tavoli ({tables.length})</h3>
                                    <Button size="sm" onClick={() => { setIsManageDialogOpen(false); setIsAddTableDialogOpen(true); }} className="h-8 bg-amber-500 hover:bg-amber-400 text-black font-bold">
                                        <Plus size={16} className="mr-1" /> Aggiungi
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {tables.map(table => {
                                        const room = rooms.find(r => r.id === table.room_id)
                                        const session = sessions.find(s => s.table_id === table.id)
                                        return (
                                            <div key={table.id} className="flex items-center justify-between p-3 bg-zinc-900/80 rounded-xl border border-white/5">
                                                <div>
                                                    <span className="font-bold text-white">{table.number}</span>
                                                    <span className="text-xs text-zinc-500 ml-2">{table.seats} posti</span>
                                                    {room && <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/30 text-amber-400">{room.name}</Badge>}
                                                    {session && <Badge className="ml-2 text-[10px] bg-green-500/20 text-green-400 border-green-500/30">Attivo</Badge>}
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-amber-500" onClick={() => { setIsManageDialogOpen(false); openEditTableDialog(table); }}>
                                                    <Pencil size={16} />
                                                </Button>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Rooms Section */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Sale ({rooms.length})</h3>
                                    <Button size="sm" onClick={() => { setIsManageDialogOpen(false); setIsAddRoomDialogOpen(true); }} className="h-8 bg-amber-500 hover:bg-amber-400 text-black font-bold">
                                        <Plus size={16} className="mr-1" /> Aggiungi
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {rooms.length === 0 ? (
                                        <p className="text-sm text-zinc-600 text-center py-4">Nessuna sala configurata</p>
                                    ) : rooms.map(room => {
                                        const tablesInRoom = tables.filter(t => t.room_id === room.id).length
                                        return (
                                            <div key={room.id} className="flex items-center justify-between p-3 bg-zinc-900/80 rounded-xl border border-white/5">
                                                <div>
                                                    <span className="font-bold text-white">{room.name}</span>
                                                    <span className="text-xs text-zinc-500 ml-2">{tablesInRoom} tavoli</span>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-amber-500" onClick={() => { setIsManageDialogOpen(false); openEditRoomDialog(room); }}>
                                                    <Pencil size={16} />
                                                </Button>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </ScrollArea>

                    <DialogFooter className="p-4 border-t border-white/5 shrink-0">
                        <Button variant="outline" className="w-full border-white/10 text-zinc-400" onClick={() => setIsManageDialogOpen(false)}>Chiudi</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Table Dialog */}
            <Dialog open={isAddTableDialogOpen} onOpenChange={setIsAddTableDialogOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-6 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] outline-none">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Nuovo Tavolo</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome/Numero Tavolo</Label>
                            <Input value={newTableNumber} onChange={(e) => setNewTableNumber(e.target.value)} placeholder="Es. 1, A1, Terrazza 1" className="bg-black/20 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label>Posti</Label>
                            <Input type="number" value={newTableSeats} onChange={(e) => setNewTableSeats(e.target.value)} placeholder="4" className="bg-black/20 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label>Sala (opzionale)</Label>
                            <Select value={newTableRoomId} onValueChange={setNewTableRoomId}>
                                <SelectTrigger className="bg-black/20 border-white/10">
                                    <SelectValue placeholder="Nessuna sala" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-zinc-800">
                                    <SelectItem value="none">Nessuna sala</SelectItem>
                                    {rooms.map(room => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsAddTableDialogOpen(false)} className="border-white/10">Annulla</Button>
                        <Button onClick={handleAddTable} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">Crea Tavolo</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Table Dialog */}
            <Dialog open={isEditTableDialogOpen} onOpenChange={setIsEditTableDialogOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-6 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] outline-none">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Modifica Tavolo</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome/Numero Tavolo</Label>
                            <Input value={newTableNumber} onChange={(e) => setNewTableNumber(e.target.value)} className="bg-black/20 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label>Posti</Label>
                            <Input type="number" value={newTableSeats} onChange={(e) => setNewTableSeats(e.target.value)} className="bg-black/20 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label>Sala</Label>
                            <Select value={newTableRoomId} onValueChange={setNewTableRoomId}>
                                <SelectTrigger className="bg-black/20 border-white/10">
                                    <SelectValue placeholder="Nessuna sala" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-zinc-800">
                                    <SelectItem value="none">Nessuna sala</SelectItem>
                                    {rooms.map(room => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="flex justify-between gap-2">
                        <Button variant="destructive" onClick={() => tableToEdit && handleDeleteTable(tableToEdit.id)} className="mr-auto">
                            <Trash size={16} className="mr-1" /> Elimina
                        </Button>
                        <Button variant="outline" onClick={() => setIsEditTableDialogOpen(false)} className="border-white/10">Annulla</Button>
                        <Button onClick={handleEditTable} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">Salva</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Room Dialog */}
            <Dialog open={isAddRoomDialogOpen} onOpenChange={setIsAddRoomDialogOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-6 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] outline-none">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Nuova Sala</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome Sala</Label>
                            <Input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="Es. Terrazza, Sala Interna" className="bg-black/20 border-white/10" />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsAddRoomDialogOpen(false)} className="border-white/10">Annulla</Button>
                        <Button onClick={handleAddRoom} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">Crea Sala</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Room Dialog */}
            <Dialog open={isEditRoomDialogOpen} onOpenChange={setIsEditRoomDialogOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-6 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] outline-none">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Modifica Sala</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome Sala</Label>
                            <Input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} className="bg-black/20 border-white/10" />
                        </div>
                    </div>
                    <DialogFooter className="flex justify-between gap-2">
                        <Button variant="destructive" onClick={() => roomToEdit && handleDeleteRoom(roomToEdit.id)} className="mr-auto">
                            <Trash size={16} className="mr-1" /> Elimina
                        </Button>
                        <Button variant="outline" onClick={() => setIsEditRoomDialogOpen(false)} className="border-white/10">Annulla</Button>
                        <Button onClick={handleEditRoom} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">Salva</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


        </div >
    )
}

export default WaiterDashboard
