import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DatabaseService } from '../../services/DatabaseService'
import { Table, Dish, Category, Restaurant } from '../../services/types'
import { toast } from 'sonner'
import { ArrowLeft, MagnifyingGlass, Plus, Minus, Trash, ShoppingCart, Info, CaretDown, CaretUp, CheckCircle, Warning, PencilSimple, PaperPlaneRight, Check } from '@phosphor-icons/react'
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { DishPlaceholder } from '@/components/ui/DishPlaceholder'
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentCopertoPrice } from '../../utils/pricingUtils'

interface OrderItem {
    dishId: string
    quantity: number
    notes: string
    courseNumber: number
    dish?: Dish
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

    // Order State — persisted to sessionStorage so refresh doesn't lose the cart
    const [orderItems, setOrderItems] = useState<OrderItem[]>(() => {
        if (!tableId) return []
        try {
            const saved = sessionStorage.getItem(`waiter-cart-${tableId}`)
            return saved ? JSON.parse(saved) : []
        } catch {
            return []
        }
    })
    const [activeCourse, setActiveCourse] = useState(1) // Legacy fallback
    const [isCartOpen, setIsCartOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Course Selection Modal State
    const [showCourseSelectionModal, setShowCourseSelectionModal] = useState(false)
    const [pendingDishToAdd, setPendingDishToAdd] = useState<{ dish: Dish, quantity: number, notes: string, isFromDetail: boolean } | null>(null)
    const [maxCourse, setMaxCourse] = useState(2)

    // Confirmation Dialog State
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [confirmActionType, setConfirmActionType] = useState<'standard' | 'delivered'>('standard')
    const [itemToMarkDelivered, setItemToMarkDelivered] = useState<number | null>(null)

    // Cooking times
    const [cookingTimesMap, setCookingTimesMap] = useState<Record<string, number>>({})

    // Refs for scrolling
    const categoryScrollRef = useRef<HTMLDivElement>(null)

    // Fetch Initial Data
    useEffect(() => {
        const init = async () => {
            if (!tableId) return
            try {
                setLoading(true)

                // Fetch Table & Restaurant
                const { data: tableData } = await supabase
                    .from('tables')
                    .select('*, restaurants(*)')
                    .eq('id', tableId)
                    .single()

                if (!tableData) throw new Error('Tavolo non trovato')

                setTable(tableData)
                // Fix: Handle potentially array or single object for joined resource
                const rest = Array.isArray(tableData.restaurants) ? tableData.restaurants[0] : tableData.restaurants
                setRestaurant(rest)

                const restaurantId = tableData.restaurant_id || rest?.id

                if (restaurantId) {
                    // Fetch Categories
                    const cats = await DatabaseService.getCategories(restaurantId)
                    setCategories(cats)

                    // Fetch Dishes
                    const allDishes = await DatabaseService.getDishes(restaurantId)
                    // Relaxed filter: show providing is_available is not explicitly false
                    setDishes(allDishes.filter(d => d.is_available !== false))

                    // Fetch cooking times if enabled
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

    // Filter Dishes
    const filteredDishes = useMemo(() => {
        return dishes.filter(dish => {
            const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (dish.short_code && dish.short_code.toLowerCase().includes(searchQuery.toLowerCase()))
            const matchesCategory = selectedCategory === 'all' || dish.category_id === selectedCategory
            return matchesSearch && matchesCategory
        })
    }, [dishes, searchQuery, selectedCategory])

    // Cart Logic
    const handleAddClick = (dish: Dish, quantity: number = 1, notes: string = '', isFromDetail: boolean = false) => {
        if (restaurant?.enable_course_splitting) {
            setPendingDishToAdd({ dish, quantity, notes, isFromDetail })
            if (maxCourse < 2) setMaxCourse(2)
            setShowCourseSelectionModal(true)
        } else {
            performAddToOrder(dish, quantity, notes, 1, isFromDetail)
        }
    }

    const performAddToOrder = (dish: Dish, quantity: number, notes: string, courseNum: number, isFromDetail: boolean) => {
        setOrderItems(prev => {
            if (notes) {
                const exactMatch = prev.find(i => i.dishId === dish.id && i.courseNumber === courseNum && i.notes === notes)
                if (exactMatch) {
                    return prev.map(i => i === exactMatch ? { ...i, quantity: i.quantity + quantity } : i)
                }
                return [...prev, { dishId: dish.id, quantity, notes, courseNumber: courseNum, dish }]
            } else {
                const existing = prev.find(i => i.dishId === dish.id && i.courseNumber === courseNum && !i.notes)
                if (existing) {
                    return prev.map(i => i === existing ? { ...i, quantity: i.quantity + quantity } : i)
                }
                return [...prev, { dishId: dish.id, quantity, notes: '', courseNumber: courseNum, dish }]
            }
        })

        toast.success(`Aggiunto: ${dish.name}${notes ? ' (con note)' : ''}`, { duration: 1500, position: 'top-center' })

        if (isFromDetail) {
            setSelectedDishForDetail(null)
        }
        setShowCourseSelectionModal(false)
        setPendingDishToAdd(null)
    }

    const updateQuantity = (index: number, delta: number) => {
        setOrderItems(prev => {
            const newItems = [...prev]
            const item = newItems[index]
            const newQty = item.quantity + delta

            if (newQty <= 0) {
                return newItems.filter((_, i) => i !== index)
            }

            newItems[index] = { ...item, quantity: newQty }
            return newItems
        })
    }

    const updateNote = (index: number, note: string) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, notes: note } : item))
    }

    const moveToCourse = (index: number, courseNum: number) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, courseNumber: courseNum } : item))
    }

    // Persist cart to sessionStorage on every change
    useEffect(() => {
        if (tableId) {
            sessionStorage.setItem(`waiter-cart-${tableId}`, JSON.stringify(orderItems))
        }
    }, [orderItems, tableId])

    // Mark a single cart item as already delivered without sending the whole cart
    const handleMarkSingleItemDelivered = async (index: number) => {
        const item = orderItems[index]
        if (!item || !table || !restaurant) return

        try {
            // Find or create session
            const { data: sessionData } = await supabase
                .from('table_sessions')
                .select('id')
                .eq('table_id', table.id)
                .eq('status', 'OPEN')
                .single()

            let sessionId = sessionData?.id

            if (!sessionId) {
                const newSession = await DatabaseService.createSession({
                    table_id: table.id,
                    restaurant_id: restaurant.id,
                    status: 'OPEN',
                    customer_count: table.seats || 2,
                })
                sessionId = newSession.id
            }

            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    table_session_id: sessionId,
                    restaurant_id: restaurant.id,
                    status: 'OPEN',
                    total_amount: (item.dish?.price || 0) * item.quantity
                })
                .select()
                .single()

            if (orderError) throw orderError

            await supabase.from('order_items').insert({
                order_id: orderData.id,
                dish_id: item.dishId,
                quantity: item.quantity,
                note: item.notes || null,
                status: 'SERVED',
                course_number: item.courseNumber,
            })

            // Remove from cart
            updateQuantity(index, -item.quantity)
            toast.success(`${item.dish?.name || 'Piatto'} segnato come già servito`)
        } catch (error) {
            console.error('Error marking item as delivered:', error)
            toast.error('Errore nel segnare il piatto come servito')
        }
    }

    // Submit Order Handling
    const handlePreSubmit = (type: 'standard' | 'delivered') => {
        if (orderItems.length === 0) return
        setConfirmActionType(type)
        setShowConfirmDialog(true)
    }

    const processOrderSubmission = async () => {
        if (orderItems.length === 0) return
        if (!table || !restaurant) return

        setShowConfirmDialog(false)
        const isDelivered = confirmActionType === 'delivered'

        try {
            setSubmitting(true)

            // Get or Create Session
            const activeSession = await DatabaseService.getActiveSession(table.id)
            let sessionId = activeSession?.id

            if (!sessionId) {
                // Determine cover charge using utility to respect weekly schedule
                const copertoInfo = getCurrentCopertoPrice(
                    restaurant,
                    restaurant.lunch_time_start || '12:00',
                    restaurant.dinner_time_start || '19:00'
                )

                // Create session with minimal required data AND correct flags
                const newSession = await DatabaseService.createSession({
                    table_id: table.id,
                    restaurant_id: restaurant.id,
                    coperto: copertoInfo.price, // Use calculated price
                    customer_count: table.seats || 2, // Default if unknown
                    status: 'OPEN',
                    coperto_enabled: true, // Default enabled for waiter sessions
                    ayce_enabled: false // Default disabled for waiter sessions (can be changed in table detail usually)
                })

                if (!newSession) throw new Error("Errore creazione sessione")
                sessionId = newSession.id
            }

            // Group by Course
            const courses = [...new Set(orderItems.map(i => i.courseNumber))].sort((a, b) => a - b)

            for (const courseNum of courses) {
                const itemsInCourse = orderItems.filter(i => i.courseNumber === courseNum)
                const totalAmount = itemsInCourse.reduce((sum, item) => sum + ((item.dish?.price || 0) * item.quantity), 0)

                // Determine Statuses
                // Standard: Order=OPEN, Items=PENDING
                // Delivered: Order=COMPLETED, Items=SERVED
                const orderStatus = isDelivered ? 'completed' : 'OPEN'
                const itemStatus = isDelivered ? 'SERVED' : 'PENDING'

                // Create Order
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

                // Create Order Items
                const dbItems = itemsInCourse.map(item => ({
                    order_id: orderData.id,
                    dish_id: item.dishId,
                    quantity: item.quantity,
                    note: item.notes || null,
                    status: itemStatus,
                    course_number: courseNum,
                }))

                const { error: itemsError } = await supabase
                    .from('order_items')
                    .insert(dbItems)

                if (itemsError) throw itemsError
            }

            toast.success(isDelivered ? 'Ordine segnato come consegnato!' : 'Ordine inviato in cucina!')
            if (tableId) sessionStorage.removeItem(`waiter-cart-${tableId}`)
            navigate('/waiter') // Return to dashboard

        } catch (error) {
            console.error('Submit error:', error)
            toast.error("Errore nell'invio dell'ordine: " + (error as any)?.message)
        } finally {
            setSubmitting(false)
        }
    }

    // Totals
    const totalAmount = orderItems.reduce((sum, item) => sum + ((item.dish?.price || 0) * item.quantity), 0)
    const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0)

    // Dish Detail Dialog State
    const [selectedDishForDetail, setSelectedDishForDetail] = useState<Dish | null>(null)
    const [detailQuantity, setDetailQuantity] = useState(1)
    const [detailNotes, setDetailNotes] = useState('')

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

    if (loading) return (
        <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center text-amber-500">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-xs uppercase tracking-widest font-medium">Caricamento Menù...</p>
            </div>
        </div>
    )

    return (
        <div className="min-h-[100dvh] bg-zinc-950 text-foreground flex flex-col pb-24">
            {/* 1. Header Fissa */}
            <header className="fixed top-0 left-0 right-0 h-16 bg-zinc-950/90 backdrop-blur-md border-b border-white/5 z-40 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/waiter')} className="text-zinc-400 hover:text-white hover:bg-white/5 -ml-2">
                        <ArrowLeft size={24} />
                    </Button>
                    <div>
                        <h1 className="text-lg font-bold text-white leading-none">Tavolo {table?.number}</h1>
                        <p className="text-xs text-zinc-500 font-medium">{restaurant?.name}</p>
                    </div>
                </div>

                {/* Search Toggle (Mobile) or Input (Desktop) */}
                <div className="relative w-48 hidden md:block">
                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                    <Input
                        placeholder="Cerca piatto..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 bg-zinc-900 border-zinc-800 text-sm rounded-full focus:ring-amber-500/50"
                    />
                </div>
            </header>

            {/* 2. Course & Category Sticky Navigation */}
            <div className="fixed top-16 left-0 right-0 z-30 bg-zinc-950 border-b border-white/5 shadow-2xl shadow-black/50">

                {/* Horizontal Category Scroll */}
                <ScrollArea className="w-full whitespace-nowrap bg-zinc-950">
                    <div className="flex p-2 px-4 gap-2" ref={categoryScrollRef}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCategory('all')}
                            className={`rounded-full border transition-all h-8 px-4 text-xs font-medium ${selectedCategory === 'all'
                                ? 'bg-white text-black border-white'
                                : 'bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600'
                                }`}
                        >
                            Tutti
                        </Button>
                        {categories.map(cat => (
                            <Button
                                key={cat.id}
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`rounded-full border transition-all h-8 px-4 text-xs font-medium ${selectedCategory === cat.id
                                    ? 'bg-amber-500 text-black border-amber-500'
                                    : 'bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600'
                                    }`}
                            >
                                {cat.name}
                            </Button>
                        ))}
                    </div>
                    <ScrollBar orientation="horizontal" className="h-0" />
                </ScrollArea>

                {/* Mobile Search Bar (if filtered) */}
                <div className="md:hidden px-4 pb-2">
                    <div className="relative">
                        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                        <Input
                            placeholder="Cerca piatto o codice..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 bg-zinc-900 border-zinc-800 text-sm rounded-xl focus:ring-amber-500/50"
                        />
                    </div>
                </div>
            </div>

            {/* 3. Main Content - Dish List - Spaced for fixed headers */}
            <main className="flex-1 pt-[230px] sm:pt-[260px] px-3 sm:px-4 space-y-2.5 max-w-2xl mx-auto w-full">
                {filteredDishes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                        <Info size={48} className="mb-4 opacity-20" />
                        <p>Nessun piatto trovato</p>
                    </div>
                ) : (
                    filteredDishes.map(dish => {
                        const qtyInCurrentCourse = orderItems.find(i => i.dishId === dish.id && i.courseNumber === activeCourse)?.quantity || 0
                        return (
                            <motion.div
                                key={dish.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`relative flex items-center gap-4 p-3 rounded-2xl border transition-all active:scale-[0.99] touch-manipulation cursor-pointer ${qtyInCurrentCourse > 0
                                    ? 'bg-amber-500/5 border-amber-500/30 shadow-lg shadow-amber-500/5'
                                    : 'bg-zinc-900/40 border-white/5 hover:border-white/10'
                                    }`}
                                onClick={() => handleAddClick(dish)}
                            >
                                {/* Image / Placeholder */}
                                <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-zinc-900 border border-white/5 relative">
                                    {dish.image_url ? (
                                        <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <DishPlaceholder iconSize={20} className="text-zinc-700" variant="fork" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-medium text-zinc-100 text-sm line-clamp-2 leading-tight pr-2">{dish.name}</h3>
                                        <span className="text-amber-500 font-bold text-sm whitespace-nowrap">€{dish.price.toFixed(2)}</span>
                                    </div>
                                    <p className="text-zinc-500 text-xs line-clamp-1 mt-0.5">{dish.description}</p>
                                    {(restaurant as any)?.show_cooking_times && cookingTimesMap[dish.id] != null && cookingTimesMap[dish.id] > 0 && (
                                        <p className="text-zinc-500 text-xs mt-0.5 flex items-center gap-1">
                                            <span>⏱</span>~{cookingTimesMap[dish.id]} min
                                        </p>
                                    )}
                                    {dish.allergens && dish.allergens.length > 0 && (
                                        <div className="flex gap-1 mt-1.5 overflow-hidden">
                                            {dish.allergens.map(a => (
                                                <span key={a} className="text-[9px] uppercase font-bold text-zinc-600 bg-zinc-900 px-1 rounded">{a.slice(0, 3)}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Add/Edit Buttons — larger for touch */}
                                <div className="flex flex-col gap-1.5">
                                    {/* Note/Edit Button */}
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-amber-500 hover:border-amber-500 active:scale-95 transition-all"
                                        onClick={(e) => openDishDetail(dish, e)}
                                    >
                                        <PencilSimple weight="bold" size={16} />
                                    </div>

                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center border transition-colors bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20 active:scale-95"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleAddClick(dish)
                                        }}
                                    >
                                        <Plus weight="bold" size={18} />
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })
                )}
            </main>

            {/* 4. Formatting Cart Floating Bar */}
            <AnimatePresence>
                {totalItems > 0 && (
                    <motion.div
                        initial={{ y: 100 }}
                        animate={{ y: 0 }}
                        exit={{ y: 100 }}
                        className="fixed bottom-0 left-0 right-0 p-4 z-50 bg-gradient-to-t from-black via-black/90 to-transparent pt-12"
                    >
                        <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
                            <SheetTrigger asChild>
                                <Button className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black shadow-xl shadow-amber-500/20 flex items-center justify-between px-6 text-lg font-bold">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-black/20 px-3 py-1 rounded-lg text-sm flex items-center gap-2">
                                            <ShoppingCart weight="bold" />
                                            {totalItems}
                                        </div>
                                        <span className="text-sm font-medium opacity-80">Vedi Ordine</span>
                                    </div>
                                    <span>€{totalAmount.toFixed(2)}</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="max-h-[90dvh] h-[90dvh] bg-zinc-950 border-t border-zinc-800 p-0 flex flex-col rounded-t-[2rem] overflow-hidden z-[100]">
                                <SheetHeader className="p-6 pb-2 border-b border-white/5 bg-zinc-900/50 shrink-0">
                                    <SheetTitle className="text-xl text-white flex items-center gap-2">
                                        <ShoppingCart className="text-amber-500" weight="duotone" />
                                        Riepilogo Ordine
                                    </SheetTitle>
                                </SheetHeader>

                                {/* Native scrolling for better mobile reliability */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    {orderItems.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                                            <ShoppingCart size={48} weight="duotone" className="mb-4 opacity-50" />
                                            <p>Nessun piatto selezionato</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 pb-32 md:pb-24">
                                            {[1, 2, 3, 4, 5].map(courseNum => {
                                                const items = orderItems.filter(i => i.courseNumber === courseNum)
                                                if (items.length === 0) return null
                                                return (
                                                    <div key={courseNum} className="space-y-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                                                            <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5">
                                                                {courseNum === 0 ? 'Bevande / Altro' : `Portata ${courseNum}`}
                                                            </Badge>
                                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                                                        </div>

                                                        {items.map((item) => {
                                                            const realIndex = orderItems.indexOf(item)
                                                            const uniqueId = `${item.dishId}-${realIndex}`
                                                            return (
                                                                <div key={uniqueId} className="flex gap-3 bg-zinc-900/50 p-3 rounded-xl border border-white/5 relative group">
                                                                    <div className="flex-1">
                                                                        <div className="flex justify-between items-start">
                                                                            <span className="font-bold text-zinc-200">{item.dish?.name}</span>
                                                                            <span className="text-zinc-400 text-sm">€{((item.dish?.price || 0) * item.quantity).toFixed(2)}</span>
                                                                        </div>
                                                                        {item.notes && <p className="text-xs text-amber-500 italic mt-1">{item.notes}</p>}

                                                                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                                                                            {/* Quantity Controls */}
                                                                            <div className="flex items-center gap-3 bg-black/40 rounded-lg p-1">
                                                                                <button
                                                                                    onClick={() => updateQuantity(realIndex, -1)}
                                                                                    className="w-8 h-8 flex items-center justify-center bg-zinc-800 rounded-md text-zinc-400 hover:text-white"
                                                                                >
                                                                                    <Minus size={14} weight="bold" />
                                                                                </button>
                                                                                <span className="font-mono font-bold w-6 text-center">{item.quantity}</span>
                                                                                <button
                                                                                    onClick={() => updateQuantity(realIndex, 1)}
                                                                                    className="w-8 h-8 flex items-center justify-center bg-zinc-800 rounded-md text-zinc-400 hover:text-white"
                                                                                >
                                                                                    <Plus size={14} weight="bold" />
                                                                                </button>
                                                                            </div>

                                                                            {/* Course Selection Buttons — larger for touch */}
                                                                            <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1">
                                                                                <span className="text-[10px] text-zinc-500 px-1 uppercase">Port.</span>
                                                                                {[1, 2, 3, 4, 5].map(cn => (
                                                                                    <button
                                                                                        key={cn}
                                                                                        onClick={() => moveToCourse(realIndex, cn)}
                                                                                        className={`w-8 h-8 flex items-center justify-center rounded-md text-xs font-bold transition-all ${item.courseNumber === cn
                                                                                            ? 'bg-amber-500 text-black'
                                                                                            : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                                                                                            }`}
                                                                                    >
                                                                                        {cn}
                                                                                    </button>
                                                                                ))}
                                                                            </div>

                                                                            <input
                                                                                type="text"
                                                                                placeholder="Note..."
                                                                                value={item.notes || ''}
                                                                                onChange={(e) => updateNote(realIndex, e.target.value)}
                                                                                className="h-8 text-xs bg-black/20 border-transparent focus:border-zinc-700 rounded-lg flex-1 min-w-0 px-2 text-zinc-300"
                                                                            />

                                                                            <button
                                                                                onClick={() => setItemToMarkDelivered(realIndex)}
                                                                                className="w-full h-10 flex items-center justify-center gap-2 bg-green-500/15 hover:bg-green-500/25 text-green-400 rounded-xl transition-all font-bold text-sm border border-green-500/20 active:scale-95 mt-1"
                                                                            >
                                                                                <CheckCircle size={18} weight="fill" />
                                                                                Segna come Consegnato
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Fixed Footer Actions */}
                                <div className="p-4 bg-zinc-900 border-t border-white/5 space-y-3 pb-8 md:pb-6 z-20 relative">
                                    <div className="flex justify-between items-center text-lg font-bold text-white">
                                        <span>Totale</span>
                                        <span className="text-amber-500 text-2xl">€{totalAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <Button
                                            className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-lg shadow-lg shadow-amber-500/20"
                                            onClick={() => handlePreSubmit('standard')}
                                            disabled={submitting}
                                        >
                                            <PaperPlaneRight size={20} weight="fill" className="mr-2" />
                                            Invia in Cucina
                                        </Button>
                                    </div>
                                    <div className="h-4 md:hidden" /> {/* Spacer for iOS Home Bar */}
                                </div>
                            </SheetContent>
                        </Sheet>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Confirmation Alert Dialog */}
            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white rounded-2xl w-[90vw] max-w-sm z-[200]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmActionType === 'standard' ? 'Inviare ordine in cucina?' : 'Confermare ordine consegnato?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                            {confirmActionType === 'standard'
                                ? 'I piatti verranno stampati in cucina e appariranno nel monitor.'
                                : 'L\'ordine verrà creato come "Completato" e non apparirà nel monitor cucina. Utile per cose già portate al tavolo.'
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:text-white text-zinc-300 rounded-lg">
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={processOrderSubmission}
                            className={`rounded-lg font-bold text-black ${confirmActionType === 'standard'
                                ? 'bg-amber-500 hover:bg-amber-400'
                                : 'bg-green-500 hover:bg-green-400'
                                }`}
                        >
                            {confirmActionType === 'standard' ? 'Invia Ordine' : 'Conferma Pronta Consegna'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Mark as Delivered Confirmation Dialog */}
            <AlertDialog open={itemToMarkDelivered !== null} onOpenChange={(open) => !open && setItemToMarkDelivered(null)}>
                <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white rounded-2xl w-[90vw] max-w-sm z-[200]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Segna come già consegnato?</AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                            <span className="font-bold text-white">{itemToMarkDelivered !== null ? orderItems[itemToMarkDelivered]?.dish?.name : ''}</span> verrà registrato come già servito e non apparirà in gestione ordini cucina.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:text-white text-zinc-300 rounded-lg">
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (itemToMarkDelivered !== null) {
                                    handleMarkSingleItemDelivered(itemToMarkDelivered)
                                }
                                setItemToMarkDelivered(null)
                            }}
                            className="bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold"
                        >
                            <CheckCircle weight="fill" className="mr-2" size={16} />
                            Conferma
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dish Detail Dialog */}
            <Dialog open={!!selectedDishForDetail} onOpenChange={(open) => !open && setSelectedDishForDetail(null)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden max-h-[90vh] flex flex-col">
                    <VisuallyHidden>
                        <DialogTitle>{selectedDishForDetail?.name || 'Dettaglio Piatto'}</DialogTitle>
                        <DialogDescription>Aggiungi questo piatto al tuo ordine con quantità e note personalizzate.</DialogDescription>
                    </VisuallyHidden>
                    {selectedDishForDetail && (
                        <>
                            <div className="h-48 relative">
                                {selectedDishForDetail.image_url ? (
                                    <img src={selectedDishForDetail.image_url} alt={selectedDishForDetail.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                        <DishPlaceholder iconSize={64} className="text-zinc-800" variant="fork" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
                                <div className="absolute bottom-4 left-4 right-4">
                                    <h2 className="text-2xl font-bold text-white">{selectedDishForDetail.name}</h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-amber-500 font-bold text-lg">€{selectedDishForDetail.price.toFixed(2)}</span>
                                        {selectedDishForDetail.allergens && (
                                            <div className="flex gap-1">
                                                {selectedDishForDetail.allergens.map(a => (
                                                    <Badge key={a} variant="outline" className="border-white/10 bg-black/40 text-[10px] h-5">{a}</Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 space-y-6">
                                <p className="text-zinc-400 text-sm">{selectedDishForDetail.description}</p>

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Quantità</label>
                                    <div className="flex items-center gap-4 bg-zinc-900 p-2 rounded-xl border border-zinc-800 w-fit">
                                        <Button variant="ghost" size="icon" onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))} className="h-10 w-10 text-zinc-400 hover:text-white hover:bg-white/5">
                                            <Minus weight="bold" />
                                        </Button>
                                        <span className="text-xl font-bold font-mono w-8 text-center">{detailQuantity}</span>
                                        <Button variant="ghost" size="icon" onClick={() => setDetailQuantity(detailQuantity + 1)} className="h-10 w-10 text-zinc-400 hover:text-white hover:bg-white/5">
                                            <Plus weight="bold" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Note e Richieste</label>
                                    <Textarea
                                        placeholder="Es. Senza cipolla, ben cotto..."
                                        value={detailNotes}
                                        onChange={(e) => setDetailNotes(e.target.value)}
                                        className="bg-zinc-900 border-zinc-800 focus:border-amber-500/50 min-h-[100px]"
                                    />
                                </div>

                                <Button className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg rounded-xl" onClick={addFromDetail}>
                                    Aggiungi all'ordine - €{(selectedDishForDetail.price * detailQuantity).toFixed(2)}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Course Selection Modal */}
            <Dialog open={showCourseSelectionModal} onOpenChange={(open) => {
                setShowCourseSelectionModal(open)
                if (!open) setPendingDishToAdd(null)
            }}>
                <DialogContent className="sm:max-w-xs bg-zinc-900 border-zinc-800 text-zinc-100 rounded-3xl p-6 shadow-2xl z-[250]">
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl text-amber-500">Scegli la Portata</DialogTitle>
                        <DialogDescription className="text-center text-zinc-400 mt-1">
                            Quando vuoi ricevere questo piatto?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 mt-4">
                        {Array.from({ length: maxCourse }, (_, i) => i + 1).map((courseNum) => (
                            <Button
                                key={courseNum}
                                variant="outline"
                                className="h-14 rounded-xl font-bold transition-all text-lg border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700 hover:text-white"
                                onClick={() => {
                                    if (pendingDishToAdd) {
                                        performAddToOrder(
                                            pendingDishToAdd.dish,
                                            pendingDishToAdd.quantity,
                                            pendingDishToAdd.notes,
                                            courseNum,
                                            pendingDishToAdd.isFromDetail
                                        )
                                    }
                                }}
                            >
                                <Layers className="w-5 h-5 mr-3 text-amber-500" />
                                Portata {courseNum}
                            </Button>
                        ))}
                        <Button
                            variant="ghost"
                            className="h-14 rounded-xl font-medium mt-2 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500 text-base"
                            onClick={() => setMaxCourse(prev => prev + 1)}
                        >
                            <Plus className="w-5 h-5 mr-2" />
                            Aggiungi nuova portata
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default WaiterOrderPage
