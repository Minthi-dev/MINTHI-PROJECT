import { useState, useEffect, useMemo } from 'react'
import { Order, OrderItem, Table, Dish } from '../services/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Check, Clock, Info } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { TableSession } from '../services/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface KitchenViewProps {
    orders: Order[]
    tables: Table[]
    dishes: Dish[]
    selectedCategoryIds?: string[]
    viewMode: 'table' | 'dish'

    onCompleteDish: (orderId: string, itemId: string) => void
    onCompleteOrder: (orderId: string) => void
    sessions: TableSession[]
    zoom?: number
    waiterModeEnabled?: boolean // Added for persistent ready items
}

export function KitchenView({ orders, tables, dishes, selectedCategoryIds = [], viewMode, onCompleteDish, onCompleteOrder, sessions, zoom = 1, waiterModeEnabled = false }: KitchenViewProps) {
    const [now, setNow] = useState(new Date())
    const [selectedDishInfo, setSelectedDishInfo] = useState<{ dish: Dish | undefined, itemId?: string } | null>(null)

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000 * 60)
        return () => clearInterval(interval)
    }, [])

    const getTableName = (tableId?: string, sessionId?: string) => {
        if (sessionId) {
            const session = sessions.find(s => s.id === sessionId)
            if (session) {
                const table = tables.find(t => t.id === session.table_id)
                if (table) return `${table.number}`
            }
        }
        if (tableId) {
            const table = tables.find(t => t.id === tableId)
            if (table) return `${table.number}`
        }
        return '?'
    }

    const formatTime = (minutes: number) => {
        const mins = Math.max(0, Math.floor(minutes))
        if (mins >= 60) {
            const hours = Math.floor(mins / 60)
            const remainingMins = mins % 60
            return `${hours}h ${remainingMins}'`
        }
        return `${mins}'`
    }

    const getDish = (dishId: string) => dishes.find(d => d.id === dishId)

    const isOrderComplete = (order: Order) => {
        return order.items?.every(item => item.status === 'SERVED' || item.status === 'READY')
    }

    const itemMatchesCategory = (item: OrderItem) => {
        if (!selectedCategoryIds || selectedCategoryIds.length === 0) return true
        const dish = getDish(item.dish_id)
        return dish && selectedCategoryIds.includes(dish.category_id)
    }

    const activeOrders = useMemo(() => {
        return orders
            .filter(o => ['OPEN', 'pending', 'preparing', 'ready'].includes(o.status))
            .filter(o => {
                // If waiter mode is enabled, keep the order visible if it has items that are ready but not served (delivered)
                // If NOT waiter mode, keep standard behavior (hide complete orders)
                if (waiterModeEnabled) {
                    // Check if any item is active OR ready (but not served/delivered which are final states for kitchen view usually, but 'ready' is intermediate here)
                    // Actually, we want to KEEP it if there are items that are 'ready'.
                    // Filter out only if ALL items are SERVED/DELIVERED/PAID.
                    // The isOrderComplete check usually filters out ready items too?
                    // Let's customize:
                    const hasActiveOrReadyItems = o.items?.some(item => {
                        const s = item.status?.toLowerCase()
                        return s !== 'served' && s !== 'delivered' && s !== 'paid' && s !== 'cancelled'
                        // Note: 'ready' is not in this list, so it returns true.
                        // But we also need to check if we should hide it.
                    })
                    return hasActiveOrReadyItems
                } else {
                    return !isOrderComplete(o)
                }
            })
            .filter(o => {
                if (!selectedCategoryIds || selectedCategoryIds.length === 0) return true
                return o.items?.some(item => itemMatchesCategory(item))
            })
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }, [orders, selectedCategoryIds, dishes, waiterModeEnabled])

    const dishesViewData = useMemo(() => {
        const dishMap = new Map<string, { dish: Dish | undefined, items: { order: Order, item: OrderItem }[] }>()

        activeOrders.forEach(order => {
            order.items?.forEach(item => {
                if (itemMatchesCategory(item)) {
                    const existing = dishMap.get(item.dish_id) || { dish: getDish(item.dish_id), items: [] }
                    existing.items.push({ order, item })
                    dishMap.set(item.dish_id, existing)
                }
            })
        })

        return Array.from(dishMap.values())
    }, [activeOrders, dishes, selectedCategoryIds])

    return (
        <div className="h-[calc(100vh-180px)] w-full overflow-hidden bg-black relative">
            <div
                className="px-2 origin-top-left transition-all duration-200 overflow-y-auto"
                style={{
                    transform: `scale(${zoom})`,
                    width: `${100 / zoom}%`,
                    height: `${100 / zoom}%`,
                    paddingBottom: `${100 / zoom}px` // Extra padding to prevent clipping
                }}
            >
                <div
                    className="grid gap-4 content-start pb-20"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
                >
                    {viewMode === 'table' ? (() => {
                        const ordersByTable = new Map<string, { tableName: string, orders: Order[] }>()

                        activeOrders.forEach(order => {
                            const tableName = getTableName(undefined, order.table_session_id)
                            const tableKey = tableName || 'unknown'

                            if (!ordersByTable.has(tableKey)) {
                                ordersByTable.set(tableKey, { tableName, orders: [] })
                            }
                            ordersByTable.get(tableKey)!.orders.push(order)
                        })

                        return Array.from(ordersByTable.values()).map(({ tableName, orders: tableOrders }) => {
                            const allItems = tableOrders.flatMap(order =>
                                (order.items?.filter(item => itemMatchesCategory(item)) || []).map(item => ({
                                    ...item,
                                    orderId: order.id,
                                    orderCreatedAt: order.created_at
                                }))
                            )

                            if (allItems.length === 0) return null

                            const oldestOrder = tableOrders.reduce((oldest, current) =>
                                new Date(current.created_at).getTime() < new Date(oldest.created_at).getTime() ? current : oldest
                            )
                            const timeDiff = (now.getTime() - new Date(oldestOrder.created_at).getTime()) / 1000 / 60
                            const allItemsDone = allItems.every(item => item.status === 'SERVED' || item.status === 'READY')

                            // Group items by course_number
                            const itemsByCourse: { [key: number]: typeof allItems } = {}
                            allItems.forEach(item => {
                                const courseNum = (item as any).course_number || 1
                                if (!itemsByCourse[courseNum]) itemsByCourse[courseNum] = []
                                itemsByCourse[courseNum].push(item)
                            })
                            const courseNumbers = Object.keys(itemsByCourse).map(Number).sort((a, b) => a - b)
                            const hasMultipleCourses = courseNumbers.length > 1

                            return (
                                <Card
                                    key={`table-${tableName}`}
                                    className="flex flex-col rounded-[2rem] border border-white/10 bg-zinc-900 shadow-[0_20px_50px_-12px_rgba(0,0,0,1)] transition-all duration-300 hover:border-amber-500/30 h-fit group/card overflow-hidden ring-1 ring-white/5"
                                >
                                    <CardHeader className="pb-4 pt-6 px-6 border-b border-white/10 shrink-0 bg-zinc-900">
                                        <div className="flex justify-between items-center w-full">
                                            <span className="text-3xl font-light text-zinc-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-[60%] tracking-tight">
                                                {tableName}
                                            </span>

                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xl bg-black/40 border border-white/5 shadow-inner">
                                                    <Clock weight="fill" className="h-5 w-5 text-amber-500" />
                                                    <span className="text-zinc-300">{formatTime(timeDiff)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="flex-1 p-4 flex flex-col gap-1">
                                        {courseNumbers.map((courseNum, courseIdx) => (
                                            <div key={courseNum}>
                                                {itemsByCourse[courseNum].map((item, idx) => {
                                                    const dish = getDish(item.dish_id)
                                                    const itemStatus = item.status?.toUpperCase?.() || item.status || ''
                                                    const isItemReady = itemStatus === 'READY'
                                                    const isItemDone = ['SERVED'].includes(itemStatus) || (isItemReady && !waiterModeEnabled)
                                                    // If waiter mode is ON, 'READY' is NOT considered 'Done' (it stays visible), but is 'Ready' state.
                                                    // If waiter mode is OFF, 'READY' is considered 'Done' (fades out or disappears).

                                                    const isDelivered = itemStatus === 'DELIVERED'
                                                    const dishName = dish?.name || `❓ Sconosciuto`

                                                    return (
                                                        <div
                                                            key={`${item.id}-${idx}`}
                                                            className={cn(
                                                                "flex items-center justify-between p-4 rounded-xl border transition-all duration-300 mb-3 group/item relative",
                                                                isDelivered
                                                                    ? "opacity-40 bg-zinc-950/50 border-transparent scale-[0.98]"
                                                                    : isItemDone
                                                                        ? "opacity-30 bg-zinc-950/50 border-transparent scale-[0.98] grayscale"
                                                                        : isItemReady && waiterModeEnabled
                                                                            ? "opacity-50 bg-amber-900/10 border-amber-500/30" // Persistent Ready State
                                                                            : "bg-zinc-800/50 border-white/10 hover:border-amber-500/40 hover:bg-zinc-800 hover:shadow-lg shadow-sm"
                                                            )}
                                                        >
                                                            <div
                                                                className="flex-1 cursor-pointer"
                                                                onClick={() => setSelectedDishInfo({ dish, itemId: item.id })}
                                                            >
                                                                <div className="flex items-baseline gap-3">
                                                                    <span className={cn(
                                                                        "text-3xl font-light transition-colors duration-300 shrink-0",
                                                                        isDelivered ? "text-zinc-600 line-through" : isItemDone ? "text-zinc-600" : "text-amber-500"
                                                                    )}>
                                                                        {item.quantity}
                                                                    </span>
                                                                    <div className="flex flex-col">
                                                                        <span className={cn(
                                                                            "text-lg font-medium leading-tight transition-colors duration-300 line-clamp-2",
                                                                            isDelivered ? "text-zinc-600 line-through decoration-zinc-500" : isItemDone ? "text-zinc-600" : "text-zinc-200 group-hover:text-pure-white"
                                                                        )}>
                                                                            {dishName}
                                                                        </span>
                                                                        {!dish && <span className="text-xs text-red-500">ID: {item.dish_id.slice(0, 8)}</span>}
                                                                    </div>
                                                                </div>
                                                                {item.note && (
                                                                    <div className="mt-2 text-amber-500 font-bold text-sm bg-amber-950/30 inline-block px-2 py-0.5 rounded border border-amber-900/50">
                                                                        ⚠️ {item.note}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <Button
                                                                size="icon"
                                                                variant={isItemDone ? "ghost" : "default"}
                                                                className={cn(
                                                                    "h-11 w-11 rounded-xl flex-shrink-0 ml-3 transition-all duration-500",
                                                                    isItemDone
                                                                        ? "text-zinc-800 bg-transparent"
                                                                        : "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_10px_20px_-10px_rgba(245,158,11,0.5)] active:scale-90"
                                                                )}
                                                                onClick={() => !isItemDone && onCompleteDish(item.orderId, item.id)}
                                                                disabled={isItemDone}
                                                            >
                                                                <Check weight="bold" className="h-5 w-5" />
                                                            </Button>
                                                        </div>
                                                    )
                                                })}

                                                {hasMultipleCourses && courseIdx < courseNumbers.length - 1 && (
                                                    // Divider
                                                    <div className="my-4 flex items-center gap-3 opacity-30">
                                                        <div className="flex-1 h-px bg-zinc-500" />
                                                        <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Portata Succ.</span>
                                                        <div className="flex-1 h-px bg-zinc-500" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {/* Complete Button */}
                                        {!allItemsDone && (
                                            <div className="mt-auto pt-5 pb-1 shrink-0">
                                                <Button
                                                    className="w-full h-12 text-lg font-bold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/5 hover:text-white hover:border-white/10 transition-all duration-300 active:scale-[0.98]"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        allItems.forEach(item => {
                                                            if (item.status !== 'SERVED' && item.status !== 'READY') {
                                                                onCompleteDish(item.orderId, item.id)
                                                            }
                                                        })
                                                    }}
                                                >
                                                    <Check weight="bold" className="h-5 w-5 mr-2" />
                                                    Completa Tutto
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )
                        })
                    })() : (
                        dishesViewData.map((data, idx) => {
                            const allItemsDone = data.items.every(({ item }) => item.status === 'SERVED' || item.status === 'READY')
                            if (allItemsDone) return null

                            return (
                                <Card
                                    key={`dish-view-${idx}`}
                                    className="flex flex-col shadow-lg border border-white/5 bg-zinc-900/60 backdrop-blur-md overflow-hidden h-fi hover:border-amber-500/20 transition-all"
                                >
                                    <CardHeader className="pb-2 border-b border-white/5 bg-white/5 p-3 shrink-0">
                                        <div
                                            className="flex justify-between items-center w-full cursor-pointer hover:opacity-80"
                                            onClick={() => setSelectedDishInfo({ dish: data.dish })}
                                        >
                                            <span className="text-xl font-medium text-zinc-100 leading-tight line-clamp-2">
                                                {data.dish?.name || 'Piatto Sconosciuto'}
                                            </span>
                                            {!data.dish && <Info className="text-red-500" />}
                                        </div>
                                    </CardHeader>

                                    <CardContent className="flex-1 p-3 flex flex-col gap-2">
                                        {data.items.map(({ order, item }, itemIdx) => {
                                            const tableName = getTableName(undefined, order.table_session_id)
                                            const timeDiff = (now.getTime() - new Date(order.created_at).getTime()) / 1000 / 60
                                            const itemStatus = item.status?.toUpperCase?.() || item.status || ''
                                            const isItemDone = ['SERVED', 'READY'].includes(itemStatus)
                                            const isDelivered = itemStatus === 'DELIVERED'

                                            return (
                                                <div
                                                    key={`dv-${item.id}-${itemIdx}`}
                                                    className={cn(
                                                        "flex items-center justify-between p-2 rounded-lg border transition-all",
                                                        isDelivered
                                                            ? "opacity-40 bg-black/20 border-transparent"
                                                            : isItemDone
                                                                ? "opacity-30 bg-black/20 border-transparent"
                                                                : "bg-black/40 border-white/5 hover:border-amber-500/20"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className={cn(
                                                            "text-3xl font-light",
                                                            isDelivered ? "text-zinc-600 line-through" : "text-amber-500"
                                                        )}>
                                                            {item.quantity}
                                                        </span>
                                                        <span className={cn(
                                                            "text-2xl font-bold",
                                                            isDelivered ? "text-zinc-600 line-through" : "text-zinc-300"
                                                        )}>
                                                            {tableName}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-4">
                                                        <div className="font-bold text-xl text-zinc-500 whitespace-nowrap">
                                                            {formatTime(timeDiff)}
                                                        </div>
                                                        <Button
                                                            size="icon"
                                                            variant={isItemDone ? "ghost" : "default"}
                                                            className={cn(
                                                                "h-12 w-12 rounded-lg flex-shrink-0",
                                                                isItemDone ? "text-zinc-600" : "bg-zinc-800 hover:bg-zinc-700 text-white border border-white/5"
                                                            )}
                                                            onClick={() => !isItemDone && onCompleteDish(order.id, item.id)}
                                                            disabled={isItemDone}
                                                        >
                                                            <Check weight="bold" className="h-6 w-6" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Dish Info Dialog */}
            <Dialog open={!!selectedDishInfo} onOpenChange={(open) => !open && setSelectedDishInfo(null)}>
                <DialogContent className="bg-slate-900 text-white border-slate-700">
                    <DialogHeader>
                        <DialogTitle>{selectedDishInfo?.dish?.name || 'Dettagli Piatto Sconosciuto'}</DialogTitle>
                        <DialogDescription>
                            Info dettagliate
                        </DialogDescription>
                    </DialogHeader>
                    <div>
                        {selectedDishInfo?.dish ? (
                            <div className="space-y-4">
                                {selectedDishInfo.dish.image_url?.trim() && (
                                    <img src={selectedDishInfo.dish.image_url} alt="Dish" className="w-full h-48 object-cover rounded-xl" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                )}
                                <p className="text-lg text-slate-300">{selectedDishInfo.dish.description || 'Nessuna descrizione.'}</p>
                                {selectedDishInfo.dish.allergens && selectedDishInfo.dish.allergens.length > 0 && (
                                    <div className="p-3 bg-red-950/30 rounded-lg border border-red-500/20">
                                        <p className="font-bold text-red-400">Allergeni:</p>
                                        <p className="text-red-200">{selectedDishInfo.dish.allergens.join(', ')}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-4 bg-yellow-950/30 rounded-xl border border-yellow-500/20 text-yellow-200">
                                <p>⚠ Attenzione: Questo piatto non esiste più nel database (ID: {selectedDishInfo?.itemId || '?'})</p>
                                <p className="text-sm mt-2">Potrebbe essere stato eliminato dal menu.</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
