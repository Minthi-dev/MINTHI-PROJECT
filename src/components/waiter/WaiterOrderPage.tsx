import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DatabaseService } from '../../services/DatabaseService'
import { Table, Dish, Category, Restaurant } from '../../services/types'
import { toast } from 'sonner'
import { ArrowLeft, MagnifyingGlass, Plus, Minus, ShoppingCart, CaretDown, CheckCircle, PencilSimple, PaperPlaneRight, ArrowCounterClockwise, X } from '@phosphor-icons/react'
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentCopertoPrice } from '../../utils/pricingUtils'

interface OrderItem {
    dishId: string
    quantity: number
    notes: string
    courseNumber: number
    dish?: Dish
    delivered?: boolean // NEW: track delivered state
}

const WaiterOrderPage = () => {
    const { tableId } = useParams<{ tableId: string }>()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [table, setTable] = useState<Table | null>(null)
    const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [dishes, setDishes] = useState<Dish[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')

    // Order State — persisted to sessionStorage
    const [orderItems, setOrderItems] = useState<OrderItem[]>(() => {
        if (!tableId) return []
        try {
            const saved = sessionStorage.getItem(`waiter-cart-${tableId}`)
            return saved ? JSON.parse(saved) : []
        } catch {
            return []
        }
    })
    const [isCartOpen, setIsCartOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Course Selection Modal
    const [showCourseModal, setShowCourseModal] = useState(false)
    const [pendingDish, setPendingDish] = useState<{ dish: Dish, quantity: number, notes: string, fromDetail: boolean } | null>(null)
    const [maxCourse, setMaxCourse] = useState(2)

    // Confirmation Dialog
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [confirmActionType, setConfirmActionType] = useState<'standard' | 'delivered'>('standard')

    // Dish Detail
    const [selectedDishForDetail, setSelectedDishForDetail] = useState<Dish | null>(null)
    const [detailQuantity, setDetailQuantity] = useState(1)
    const [detailNotes, setDetailNotes] = useState('')

    // Cooking times
    const [cookingTimesMap, setCookingTimesMap] = useState<Record<string, number>>({})

    const categoryScrollRef = useRef<HTMLDivElement>(null)

    // Fetch data
    useEffect(() => {
        const init = async () => {
            if (!tableId) return
            try {
                setLoading(true)
                const { data: tableData } = await supabase
                    .from('tables')
                    .select('id, number, restaurant_id, token, seats, room_id, created_at, is_active, last_assistance_request, restaurants(*)')
                    .eq('id', tableId)
                    .single()

                if (!tableData) throw new Error('Tavolo non trovato')

                setTable(tableData)
                const rest = Array.isArray(tableData.restaurants) ? tableData.restaurants[0] : tableData.restaurants
                setRestaurant(rest)

                const restaurantId = tableData.restaurant_id || rest?.id
                if (restaurantId) {
                    const cats = await DatabaseService.getCategories(restaurantId)
                    setCategories(cats.filter((c: Category) => c.is_active !== false))

                    const allDishes = await DatabaseService.getDishes(restaurantId)
                    setDishes(allDishes.filter(d => d.is_available !== false))

                    if ((rest as any)?.show_cooking_times) {
                        const { data: timesData } = await supabase.rpc('get_dish_avg_cooking_times', { p_restaurant_id: restaurantId })
                        if (timesData) {
                            const map: Record<string, number> = {}
                            timesData.forEach((row: { dish_id: string, avg_minutes: number }) => {
                                map[row.dish_id] = row.avg_minutes
                            })
                            setCookingTimesMap(map)
                        }
                    }
                }
            } catch (error) {
                console.error('Error init:', error)
                toast.error('Errore caricamento dati')
                navigate('/waiter')
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [tableId, navigate])

    // Filter dishes
    const filteredDishes = useMemo(() => {
        return dishes.filter(dish => {
            const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (dish.short_code && dish.short_code.toLowerCase().includes(searchQuery.toLowerCase()))
            const matchesCategory = selectedCategory === 'all' || dish.category_id === selectedCategory
            return matchesSearch && matchesCategory
        })
    }, [dishes, searchQuery, selectedCategory])

    // Group dishes by category for display
    const groupedDishes = useMemo(() => {
        if (selectedCategory !== 'all') return null // No grouping when filtered
        const groups: { category: Category; dishes: Dish[] }[] = []
        for (const cat of categories) {
            const catDishes = filteredDishes.filter(d => d.category_id === cat.id)
            if (catDishes.length > 0) groups.push({ category: cat, dishes: catDishes })
        }
        // Uncategorized
        const uncategorized = filteredDishes.filter(d => !categories.find(c => c.id === d.category_id))
        if (uncategorized.length > 0) groups.push({ category: { id: 'other', name: 'Altro', restaurant_id: '', order: 999 } as Category, dishes: uncategorized })
        return groups
    }, [filteredDishes, categories, selectedCategory])

    // Add dish
    const handleAddClick = useCallback((dish: Dish, quantity: number = 1, notes: string = '', fromDetail: boolean = false) => {
        if (restaurant?.enable_course_splitting) {
            setPendingDish({ dish, quantity, notes, fromDetail })
            if (maxCourse < 2) setMaxCourse(2)
            setShowCourseModal(true)
        } else {
            performAddToOrder(dish, quantity, notes, 1, fromDetail)
        }
    }, [restaurant, maxCourse])

    const performAddToOrder = useCallback((dish: Dish, quantity: number, notes: string, courseNum: number, fromDetail: boolean) => {
        setOrderItems(prev => {
            if (notes) {
                const match = prev.find(i => i.dishId === dish.id && i.courseNumber === courseNum && i.notes === notes && !i.delivered)
                if (match) return prev.map(i => i === match ? { ...i, quantity: i.quantity + quantity } : i)
                return [...prev, { dishId: dish.id, quantity, notes, courseNumber: courseNum, dish }]
            } else {
                const existing = prev.find(i => i.dishId === dish.id && i.courseNumber === courseNum && !i.notes && !i.delivered)
                if (existing) return prev.map(i => i === existing ? { ...i, quantity: i.quantity + quantity } : i)
                return [...prev, { dishId: dish.id, quantity, notes: '', courseNumber: courseNum, dish }]
            }
        })

        toast.success(`+ ${dish.name}`, { duration: 1200, position: 'top-center' })

        if (fromDetail) setSelectedDishForDetail(null)
        setShowCourseModal(false)
        setPendingDish(null)
    }, [])

    const updateQuantity = useCallback((index: number, delta: number) => {
        setOrderItems(prev => {
            const newItems = [...prev]
            const item = newItems[index]
            const newQty = item.quantity + delta
            if (newQty <= 0) return newItems.filter((_, i) => i !== index)
            newItems[index] = { ...item, quantity: newQty }
            return newItems
        })
    }, [])

    const updateNote = useCallback((index: number, note: string) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, notes: note } : item))
    }, [])

    const moveToCourse = useCallback((index: number, courseNum: number) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, courseNumber: courseNum } : item))
    }, [])

    // Mark as delivered (keep in cart but transparent)
    const markAsDelivered = useCallback((index: number) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, delivered: true } : item))
        toast.success('Segnato come consegnato', { duration: 1500 })
    }, [])

    // Undo delivered
    const undoDelivered = useCallback((index: number) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, delivered: false } : item))
    }, [])

    // Remove item completely
    const removeItem = useCallback((index: number) => {
        setOrderItems(prev => prev.filter((_, i) => i !== index))
    }, [])

    // Persist cart
    useEffect(() => {
        if (tableId) {
            sessionStorage.setItem(`waiter-cart-${tableId}`, JSON.stringify(orderItems))
        }
    }, [orderItems, tableId])

    // Submit
    const handlePreSubmit = (type: 'standard' | 'delivered') => {
        const activeItems = orderItems.filter(i => !i.delivered)
        if (activeItems.length === 0) {
            toast.error('Nessun piatto da inviare')
            return
        }
        setConfirmActionType(type)
        setShowConfirmDialog(true)
    }

    const processOrderSubmission = async () => {
        const activeItems = orderItems.filter(i => !i.delivered)
        const deliveredItems = orderItems.filter(i => i.delivered)
        if (activeItems.length === 0) return
        if (!table || !restaurant) return

        setShowConfirmDialog(false)
        const isDelivered = confirmActionType === 'delivered'

        try {
            setSubmitting(true)

            const activeSession = await DatabaseService.getActiveSession(table.id)
            let sessionId = activeSession?.id

            if (!sessionId) {
                const copertoInfo = getCurrentCopertoPrice(
                    restaurant,
                    restaurant.lunch_time_start || '12:00',
                    restaurant.dinner_time_start || '19:00'
                )
                const newSession = await DatabaseService.createSession({
                    table_id: table.id,
                    restaurant_id: restaurant.id,
                    customer_count: table.seats || 2,
                    status: 'OPEN',
                    opened_at: new Date().toISOString(),
                    session_pin: String(Math.floor(1000 + Math.random() * 9000)),
                    coperto_enabled: true,
                    ayce_enabled: false
                })
                if (!newSession) throw new Error("Errore creazione sessione")
                sessionId = newSession.id
            }

            // Submit active (non-delivered) items grouped by course
            const courses = [...new Set(activeItems.map(i => i.courseNumber))].sort((a, b) => a - b)

            for (const courseNum of courses) {
                const itemsInCourse = activeItems.filter(i => i.courseNumber === courseNum)
                const totalAmount = itemsInCourse.reduce((sum, item) => sum + ((item.dish?.price || 0) * item.quantity), 0)

                const orderStatus = 'OPEN'
                const itemStatus = isDelivered ? 'SERVED' : 'PENDING'

                const { data: orderData, error: orderError } = await supabase
                    .from('orders')
                    .insert({
                        table_session_id: sessionId,
                        restaurant_id: restaurant.id,
                        status: orderStatus,
                        total_amount: totalAmount
                    })
                    .select()
                    .single()

                if (orderError) throw orderError

                const dbItems = itemsInCourse.map(item => ({
                    order_id: orderData.id,
                    dish_id: item.dishId,
                    quantity: item.quantity,
                    note: item.notes || null,
                    status: itemStatus,
                    course_number: courseNum,
                }))

                const uid = JSON.parse(localStorage.getItem('minthi_user') || '{}').id
                const { error: itemsError } = await supabase.functions.invoke('secure-order-items', {
                    body: { userId: uid, restaurantId: restaurant.id, action: 'insert_items', data: { items: dbItems } }
                })
                if (itemsError) throw itemsError
            }

            // Also submit delivered items as SERVED
            if (deliveredItems.length > 0) {
                const deliveredCourses = [...new Set(deliveredItems.map(i => i.courseNumber))].sort((a, b) => a - b)
                for (const courseNum of deliveredCourses) {
                    const itemsInCourse = deliveredItems.filter(i => i.courseNumber === courseNum)
                    const totalAmount = itemsInCourse.reduce((sum, item) => sum + ((item.dish?.price || 0) * item.quantity), 0)

                    const { data: orderData, error: orderError } = await supabase
                        .from('orders')
                        .insert({
                            table_session_id: sessionId,
                            restaurant_id: restaurant.id,
                            status: 'OPEN',
                            total_amount: totalAmount
                        })
                        .select()
                        .single()

                    if (orderError) throw orderError

                    const dbItems = itemsInCourse.map(item => ({
                        order_id: orderData.id,
                        dish_id: item.dishId,
                        quantity: item.quantity,
                        note: item.notes || null,
                        status: 'SERVED',
                        course_number: courseNum,
                    }))

                    const uid2 = JSON.parse(localStorage.getItem('minthi_user') || '{}').id
                    const { error: itemsError } = await supabase.functions.invoke('secure-order-items', {
                        body: { userId: uid2, restaurantId: restaurant.id, action: 'insert_items', data: { items: dbItems } }
                    })
                    if (itemsError) throw itemsError
                }
            }

            toast.success(isDelivered ? 'Ordine segnato come consegnato!' : 'Ordine inviato in cucina!')
            if (tableId) sessionStorage.removeItem(`waiter-cart-${tableId}`)
            navigate('/waiter')

        } catch (error) {
            console.error('Submit error:', error)
            toast.error("Errore nell'invio: " + (error as any)?.message)
        } finally {
            setSubmitting(false)
        }
    }

    // Compute max course used in cart (for dynamic course buttons)
    const maxUsedCourse = useMemo(() => {
        return orderItems.reduce((max, i) => Math.max(max, i.courseNumber), 1)
    }, [orderItems])
    const displayCourses = Math.min(maxUsedCourse + 1, 5) // Show used + 1, max 5

    // Totals
    const activeItems = orderItems.filter(i => !i.delivered)
    const deliveredItemsList = orderItems.filter(i => i.delivered)
    const totalAmount = activeItems.reduce((sum, item) => sum + ((item.dish?.price || 0) * item.quantity), 0)
    const totalItems = activeItems.reduce((sum, item) => sum + item.quantity, 0)
    const totalDelivered = deliveredItemsList.reduce((sum, item) => sum + item.quantity, 0)

    const openDishDetail = (dish: Dish, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedDishForDetail(dish)
        setDetailQuantity(1)
        setDetailNotes('')
    }

    const addFromDetail = () => {
        if (!selectedDishForDetail) return
        handleAddClick(selectedDishForDetail, detailQuantity, detailNotes, true)
    }

    // Get qty in cart for a dish
    const getCartQty = useCallback((dishId: string) => {
        return orderItems.filter(i => i.dishId === dishId && !i.delivered).reduce((sum, i) => sum + i.quantity, 0)
    }, [orderItems])

    if (loading) return (
        <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        </div>
    )

    // Render a dish card
    const renderDishCard = (dish: Dish) => {
        const qty = getCartQty(dish.id)
        return (
            <div
                key={dish.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors touch-manipulation ${qty > 0
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-zinc-900/30 border-zinc-800/50 active:bg-zinc-800/50'
                    }`}
                onClick={() => handleAddClick(dish)}
            >
                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                        <span className="font-medium text-zinc-100 text-sm leading-tight line-clamp-2">{dish.name}</span>
                        <span className="text-amber-500 font-bold text-sm shrink-0">€{dish.price.toFixed(2)}</span>
                    </div>
                    {dish.description && <p className="text-zinc-600 text-xs line-clamp-1 mt-0.5">{dish.description}</p>}
                    {(restaurant as any)?.show_cooking_times && cookingTimesMap[dish.id] > 0 && (
                        <span className="text-zinc-500 text-[11px] mt-0.5 inline-flex items-center gap-0.5">~{cookingTimesMap[dish.id]}min</span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {qty > 0 && (
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center justify-center">{qty}</span>
                    )}
                    <button
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-400 active:scale-90 transition-all"
                        onClick={(e) => openDishDetail(dish, e)}
                    >
                        <PencilSimple weight="bold" size={15} />
                    </button>
                    <button
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-500 active:scale-90 active:bg-amber-500/20 transition-all"
                        onClick={(e) => { e.stopPropagation(); handleAddClick(dish) }}
                    >
                        <Plus weight="bold" size={17} />
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-[100dvh] bg-zinc-950 text-foreground flex flex-col">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/50 z-40 flex items-center justify-between px-3">
                <div className="flex items-center gap-2">
                    <button onClick={() => navigate('/waiter')} className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white active:scale-95">
                        <ArrowLeft size={22} />
                    </button>
                    <div>
                        <h1 className="text-base font-bold text-white leading-none">Tavolo {table?.number}</h1>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{restaurant?.name}</p>
                    </div>
                </div>
                <div className="relative w-44 hidden md:block">
                    <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 w-3.5 h-3.5" />
                    <Input
                        placeholder="Cerca..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-8 bg-zinc-900 border-zinc-800 text-xs rounded-lg"
                    />
                </div>
            </header>

            {/* Category Bar */}
            <div className="fixed top-14 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/50">
                <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex p-2 px-3 gap-1.5" ref={categoryScrollRef}>
                        <button
                            onClick={() => setSelectedCategory('all')}
                            className={`rounded-full h-7 px-3.5 text-xs font-medium transition-colors shrink-0 ${selectedCategory === 'all'
                                ? 'bg-white text-black'
                                : 'bg-zinc-900 text-zinc-400 active:bg-zinc-800'
                                }`}
                        >
                            Tutti
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`rounded-full h-7 px-3.5 text-xs font-medium transition-colors shrink-0 ${selectedCategory === cat.id
                                    ? 'bg-amber-500 text-black'
                                    : 'bg-zinc-900 text-zinc-400 active:bg-zinc-800'
                                    }`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                    <ScrollBar orientation="horizontal" className="h-0" />
                </ScrollArea>

                {/* Mobile Search */}
                <div className="md:hidden px-3 pb-2">
                    <div className="relative">
                        <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 w-3.5 h-3.5" />
                        <Input
                            placeholder="Cerca piatto o codice..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 bg-zinc-900 border-zinc-800 text-xs rounded-lg"
                        />
                    </div>
                </div>
            </div>

            {/* Dish List */}
            <main className={`flex-1 pt-[140px] md:pt-[120px] px-3 max-w-2xl mx-auto w-full ${totalItems > 0 ? 'pb-24' : 'pb-6'}`}>
                {filteredDishes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                        <MagnifyingGlass size={40} className="mb-3 opacity-20" />
                        <p className="text-sm">Nessun piatto trovato</p>
                    </div>
                ) : groupedDishes ? (
                    // Grouped by category
                    <div className="space-y-4">
                        {groupedDishes.map(group => (
                            <div key={group.category.id}>
                                <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1">{group.category.name}</h2>
                                <div className="space-y-1.5">
                                    {group.dishes.map(dish => renderDishCard(dish))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    // Flat list when category is selected
                    <div className="space-y-1.5">
                        {filteredDishes.map(dish => renderDishCard(dish))}
                    </div>
                )}
            </main>

            {/* Cart Floating Bar */}
            <AnimatePresence>
                {totalItems > 0 && (
                    <motion.div
                        initial={{ y: 80 }}
                        animate={{ y: 0 }}
                        exit={{ y: 80 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 p-3 z-50 bg-gradient-to-t from-black via-black/95 to-transparent pt-8"
                    >
                        <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
                            <SheetTrigger asChild>
                                <button className="w-full h-13 rounded-2xl bg-amber-500 text-black shadow-lg shadow-amber-500/20 flex items-center justify-between px-5 py-3 active:scale-[0.98] transition-transform">
                                    <div className="flex items-center gap-2.5">
                                        <div className="bg-black/15 px-2.5 py-1 rounded-lg text-sm font-bold flex items-center gap-1.5">
                                            <ShoppingCart weight="bold" size={16} />
                                            {totalItems}
                                        </div>
                                        <span className="text-sm font-medium opacity-80">Vedi Ordine</span>
                                        {totalDelivered > 0 && (
                                            <span className="text-xs bg-green-600/30 text-green-900 px-2 py-0.5 rounded-full font-medium">+{totalDelivered} consegnati</span>
                                        )}
                                    </div>
                                    <span className="text-lg font-bold">€{totalAmount.toFixed(2)}</span>
                                </button>
                            </SheetTrigger>

                            <SheetContent side="bottom" className="max-h-[90dvh] h-[90dvh] bg-zinc-950 border-t border-zinc-800 p-0 flex flex-col rounded-t-[1.5rem] overflow-hidden z-[100]">
                                <SheetHeader className="p-5 pb-3 border-b border-zinc-800/50 shrink-0">
                                    <SheetTitle className="text-lg text-white flex items-center gap-2">
                                        <ShoppingCart className="text-amber-500" weight="bold" size={20} />
                                        Ordine · Tavolo {table?.number}
                                    </SheetTitle>
                                </SheetHeader>

                                {/* Cart Items */}
                                <div className="flex-1 overflow-y-auto p-3">
                                    {orderItems.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                                            <ShoppingCart size={40} className="mb-3 opacity-30" />
                                            <p className="text-sm">Carrello vuoto</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 pb-32">
                                            {/* Active items by course */}
                                            {Array.from({ length: displayCourses }, (_, i) => i + 1).map(courseNum => {
                                                const items = activeItems.filter(i => i.courseNumber === courseNum)
                                                if (items.length === 0) return null
                                                return (
                                                    <div key={courseNum}>
                                                        {restaurant?.enable_course_splitting && (
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="h-px flex-1 bg-zinc-800" />
                                                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Portata {courseNum}</span>
                                                                <div className="h-px flex-1 bg-zinc-800" />
                                                            </div>
                                                        )}
                                                        <div className="space-y-1.5">
                                                            {items.map((item) => {
                                                                const realIndex = orderItems.indexOf(item)
                                                                return (
                                                                    <div key={`${item.dishId}-${realIndex}`} className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-3">
                                                                        {/* Row 1: Name + Price + Qty */}
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="flex-1 font-medium text-sm text-zinc-100 truncate">{item.dish?.name}</span>
                                                                            <span className="text-zinc-500 text-xs">€{((item.dish?.price || 0) * item.quantity).toFixed(2)}</span>
                                                                        </div>
                                                                        {item.notes && <p className="text-xs text-amber-500/70 mt-1">{item.notes}</p>}

                                                                        {/* Row 2: Controls */}
                                                                        <div className="flex items-center gap-2 mt-2.5">
                                                                            {/* Quantity */}
                                                                            <div className="flex items-center gap-0.5 bg-zinc-800/50 rounded-lg">
                                                                                <button onClick={() => updateQuantity(realIndex, -1)} className="w-8 h-8 flex items-center justify-center text-zinc-400 active:text-white">
                                                                                    <Minus size={13} weight="bold" />
                                                                                </button>
                                                                                <span className="font-mono font-bold text-sm w-5 text-center text-zinc-200">{item.quantity}</span>
                                                                                <button onClick={() => updateQuantity(realIndex, 1)} className="w-8 h-8 flex items-center justify-center text-zinc-400 active:text-white">
                                                                                    <Plus size={13} weight="bold" />
                                                                                </button>
                                                                            </div>

                                                                            {/* Course buttons */}
                                                                            {restaurant?.enable_course_splitting && (
                                                                                <div className="flex items-center gap-0.5 bg-zinc-800/50 rounded-lg p-0.5">
                                                                                    {Array.from({ length: displayCourses }, (_, i) => i + 1).map(cn => (
                                                                                        <button
                                                                                            key={cn}
                                                                                            onClick={() => moveToCourse(realIndex, cn)}
                                                                                            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors ${item.courseNumber === cn
                                                                                                ? 'bg-amber-500 text-black'
                                                                                                : 'text-zinc-500 active:text-white'
                                                                                                }`}
                                                                                        >
                                                                                            {cn}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            )}

                                                                            <div className="flex-1" />

                                                                            {/* Delivered button */}
                                                                            <button
                                                                                onClick={() => markAsDelivered(realIndex)}
                                                                                className="h-8 px-2.5 flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-medium active:scale-95 transition-transform"
                                                                            >
                                                                                <CheckCircle size={14} weight="fill" />
                                                                                Consegnato
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )
                                            })}

                                            {/* Delivered items section */}
                                            {deliveredItemsList.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="h-px flex-1 bg-emerald-800/30" />
                                                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                                                            <CheckCircle size={12} weight="fill" /> Consegnati
                                                        </span>
                                                        <div className="h-px flex-1 bg-emerald-800/30" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        {deliveredItemsList.map((item) => {
                                                            const realIndex = orderItems.indexOf(item)
                                                            return (
                                                                <div key={`del-${item.dishId}-${realIndex}`} className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-900/20 border border-zinc-800/30 opacity-50">
                                                                    <CheckCircle size={16} weight="fill" className="text-emerald-500 shrink-0" />
                                                                    <span className="flex-1 text-sm text-zinc-400 line-through truncate">{item.dish?.name}</span>
                                                                    <span className="text-xs text-zinc-600">x{item.quantity}</span>
                                                                    <button
                                                                        onClick={() => undoDelivered(realIndex)}
                                                                        className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-amber-400 active:scale-90"
                                                                        title="Annulla consegnato"
                                                                    >
                                                                        <ArrowCounterClockwise size={14} weight="bold" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => removeItem(realIndex)}
                                                                        className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-red-400 active:scale-90"
                                                                        title="Rimuovi"
                                                                    >
                                                                        <X size={14} weight="bold" />
                                                                    </button>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-3 bg-zinc-900/80 border-t border-zinc-800/50 space-y-2.5 pb-8 md:pb-4">
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-zinc-400 text-sm font-medium">Totale</span>
                                        <span className="text-amber-500 text-xl font-bold">€{totalAmount.toFixed(2)}</span>
                                    </div>
                                    <Button
                                        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-base active:scale-[0.98] transition-transform"
                                        onClick={() => handlePreSubmit('standard')}
                                        disabled={submitting || activeItems.length === 0}
                                    >
                                        <PaperPlaneRight size={18} weight="fill" className="mr-2" />
                                        {submitting ? 'Invio...' : 'Invia in Cucina'}
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Confirm Dialog */}
            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white rounded-2xl w-[90vw] max-w-sm z-[200]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmActionType === 'standard' ? 'Inviare ordine in cucina?' : 'Confermare ordine consegnato?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                            {activeItems.length} piatt{activeItems.length === 1 ? 'o' : 'i'} da inviare.
                            {deliveredItemsList.length > 0 && ` ${deliveredItemsList.length} già consegnat${deliveredItemsList.length === 1 ? 'o' : 'i'}.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300 rounded-lg">
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={processOrderSubmission}
                            className="rounded-lg font-bold text-black bg-amber-500 hover:bg-amber-400"
                        >
                            Invia Ordine
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dish Detail Dialog */}
            <Dialog open={!!selectedDishForDetail} onOpenChange={(open) => !open && setSelectedDishForDetail(null)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden max-h-[85vh] flex flex-col">
                    <VisuallyHidden>
                        <DialogTitle>{selectedDishForDetail?.name || 'Dettaglio'}</DialogTitle>
                        <DialogDescription>Dettaglio piatto</DialogDescription>
                    </VisuallyHidden>
                    {selectedDishForDetail && (
                        <>
                            {selectedDishForDetail.image_url?.trim() && (
                                <div className="h-40 relative">
                                    <img src={selectedDishForDetail.image_url} alt="" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
                                </div>
                            )}
                            <div className="p-5 space-y-5">
                                <div>
                                    <h2 className="text-xl font-bold text-white">{selectedDishForDetail.name}</h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-amber-500 font-bold text-lg">€{selectedDishForDetail.price.toFixed(2)}</span>
                                        {selectedDishForDetail.allergens && selectedDishForDetail.allergens.length > 0 && (
                                            <div className="flex gap-1">
                                                {selectedDishForDetail.allergens.map(a => (
                                                    <Badge key={a} variant="outline" className="border-zinc-700 text-[10px] h-5">{a}</Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {selectedDishForDetail.description && (
                                        <p className="text-zinc-500 text-sm mt-2">{selectedDishForDetail.description}</p>
                                    )}
                                </div>

                                {/* Quantity */}
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Quantità</label>
                                    <div className="flex items-center gap-3 bg-zinc-900 p-1.5 rounded-xl border border-zinc-800 w-fit mt-2">
                                        <button onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))} className="w-9 h-9 flex items-center justify-center text-zinc-400 active:text-white rounded-lg active:bg-zinc-800">
                                            <Minus weight="bold" size={16} />
                                        </button>
                                        <span className="text-lg font-bold font-mono w-6 text-center">{detailQuantity}</span>
                                        <button onClick={() => setDetailQuantity(detailQuantity + 1)} className="w-9 h-9 flex items-center justify-center text-zinc-400 active:text-white rounded-lg active:bg-zinc-800">
                                            <Plus weight="bold" size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Note</label>
                                    <Textarea
                                        placeholder="Es. Senza cipolla, ben cotto..."
                                        value={detailNotes}
                                        onChange={(e) => setDetailNotes(e.target.value)}
                                        className="bg-zinc-900 border-zinc-800 min-h-[80px] mt-2 text-sm"
                                    />
                                </div>

                                <Button className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl active:scale-[0.98]" onClick={addFromDetail}>
                                    Aggiungi · €{(selectedDishForDetail.price * detailQuantity).toFixed(2)}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Course Selection Modal */}
            <Dialog open={showCourseModal} onOpenChange={(open) => {
                setShowCourseModal(open)
                if (!open) setPendingDish(null)
            }}>
                <DialogContent className="sm:max-w-xs bg-zinc-900 border-zinc-800 text-zinc-100 rounded-2xl p-5 z-[250]">
                    <DialogHeader>
                        <DialogTitle className="text-center text-lg text-amber-500">Scegli Portata</DialogTitle>
                        <DialogDescription className="text-center text-zinc-500 text-sm">
                            {pendingDish?.dish.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2 mt-3">
                        {Array.from({ length: maxCourse }, (_, i) => i + 1).map((courseNum) => (
                            <button
                                key={courseNum}
                                className="h-12 rounded-xl font-bold text-base border border-zinc-700 bg-zinc-800 text-white active:bg-zinc-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                onClick={() => {
                                    if (pendingDish) {
                                        performAddToOrder(pendingDish.dish, pendingDish.quantity, pendingDish.notes, courseNum, pendingDish.fromDetail)
                                    }
                                }}
                            >
                                <Layers className="w-4 h-4 text-amber-500" />
                                Portata {courseNum}
                            </button>
                        ))}
                        <button
                            className="h-10 rounded-xl text-sm text-amber-500 active:bg-amber-500/10 transition-colors flex items-center justify-center gap-1.5"
                            onClick={() => setMaxCourse(prev => prev + 1)}
                        >
                            <Plus size={14} weight="bold" />
                            Aggiungi portata
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default WaiterOrderPage
