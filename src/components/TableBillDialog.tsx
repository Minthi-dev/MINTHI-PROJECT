import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Receipt, Trash, Circle, Check, Plus, Minus, ForkKnife, CurrencyEur, Clock, Users, Sparkle, X, ArrowLeft, Wallet, QrCode } from '@phosphor-icons/react'
import { Order, Table, TableSession, Restaurant, OrderItem, Dish } from '../services/types'
import { DatabaseService } from '../services/DatabaseService'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { getCurrentCopertoPrice, getCurrentAyceSettings } from '../utils/pricingUtils'
import { motion, AnimatePresence } from 'framer-motion'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import QRCodeGenerator from './QRCodeGenerator'

interface TableBillDialogProps {
    isOpen: boolean
    onClose: () => void
    table: Table | null
    session: TableSession | null
    orders: Order[]
    restaurant: Restaurant | null
    onPaymentComplete: () => void
    onEmptyTable?: () => void
    isWaiter?: boolean
}

interface SplitItem {
    id: string
    name: string
    price: number
    quantity: number // Always 1 for split items
    status: string
    isVirtual?: boolean
    originalId?: string // Link to original item if this is a split part
    originalItem?: any
    dish?: Dish
}

export default function TableBillDialog({
    isOpen,
    onClose,
    table,
    session,
    orders,
    restaurant,
    onPaymentComplete,
    onEmptyTable,
    isWaiter = false
}: TableBillDialogProps) {
    // Reset Split Mode when dialog opens
    useEffect(() => {
        if (isOpen) {
            setIsSplitMode(false)
            setEqualSplitMode(false)
            setSelectedSplitItems(new Set())
            setPaidItemIds(new Set())
            setPaidPersons(0)
            setCustomSplitCount(session?.customer_count || 2)
        }
    }, [isOpen, session])

    const [paidItemIds, setPaidItemIds] = useState<Set<string>>(new Set())
    const [isQrDialogOpen, setIsQrDialogOpen] = useState(false)

    const [isSplitMode, setIsSplitMode] = useState(false)
    const [selectedSplitItems, setSelectedSplitItems] = useState<Set<string>>(new Set())
    const [processingPayment, setProcessingPayment] = useState(false)
    const [deletingItem, setDeletingItem] = useState<string | null>(null)
    const [equalSplitMode, setEqualSplitMode] = useState(false)
    const [paidPersons, setPaidPersons] = useState(0)
    const [customSplitCount, setCustomSplitCount] = useState(0)

    // Calculate Pricing Settings (Coperto & AYCE)
    const pricingSettings = useMemo(() => {
        if (!restaurant) return { copertoPrice: 0, aycePrice: 0 }

        const lunchStart = restaurant.lunch_time_start || '12:00'
        const dinnerStart = restaurant.dinner_time_start || '19:00'

        const coperto = getCurrentCopertoPrice(restaurant, lunchStart, dinnerStart)
        const ayce = getCurrentAyceSettings(restaurant, lunchStart, dinnerStart)

        return {
            copertoPrice: coperto.price,
            aycePrice: ayce.price
        }
    }, [restaurant])

    // Calculate Virtual Items (Coperto & AYCE Cover)
    const virtualItems = useMemo(() => {
        const items: SplitItem[] = []
        if (!session || !restaurant) return items

        const customerCount = session.customer_count || 0

        // 1. Coperto Items
        // Check session flag first (default true if undefined), then pricing enabled check
        const isCopertoEnabled = session.coperto_enabled !== false // Default true
        if (isCopertoEnabled && pricingSettings.copertoPrice > 0) {
            for (let i = 0; i < customerCount; i++) {
                items.push({
                    id: `coperto-${session.id}-${i}`,
                    name: 'Coperto',
                    price: pricingSettings.copertoPrice,
                    quantity: 1,
                    status: 'SERVED',
                    isVirtual: true
                })
            }
        }

        // 2. All You Can Eat Items (Per Person Charge)
        const isAyceEnabled = session.ayce_enabled === true
        if (isAyceEnabled && pricingSettings.aycePrice > 0) {
            for (let i = 0; i < customerCount; i++) {
                items.push({
                    id: `ayce-cover-${session.id}-${i}`,
                    name: 'All You Can Eat',
                    price: pricingSettings.aycePrice,
                    quantity: 1,
                    status: 'SERVED',
                    isVirtual: true
                })
            }
        }

        return items
    }, [session, restaurant, pricingSettings])


    // Flatten Real Items (Handle AYCE price overrides + Expand Quantity > 1 for splitting)
    const realItemsExpanded = useMemo(() => {
        let items: SplitItem[] = []
        const isAyceEnabled = session?.ayce_enabled === true

        orders.forEach(order => {
            if (order.items) {
                order.items.forEach((item: any) => {
                    // Skip finished items
                    if (item.status === 'CANCELLED' || item.status === 'PAID' || paidItemIds.has(item.id)) return

                    // Determine effective price — use ?? to correctly handle price=0 dishes
                    let price = item.dish?.price ?? 0

                    // If AYCE session AND dish is included in AYCE, price is 0
                    if (isAyceEnabled && item.dish?.is_ayce) {
                        price = 0
                    }

                    // For display/logic: Expand quantity into individual items
                    // e.g. "Coca Cola x3" -> 3 separate "Coca Cola" lines
                    const qty = item.quantity || 1
                    for (let i = 0; i < qty; i++) {
                        items.push({
                            id: `${item.id}-split-${i}`, // Virtual split ID
                            originalId: item.id,      // Reference to real DB item
                            originalItem: item,
                            name: item.dish?.name || item.name || 'Piatto',
                            price: price,
                            quantity: 1, // Normalized to 1
                            status: item.status,
                            dish: item.dish
                        })
                    }
                })
            }
        })
        return items
    }, [orders, session, paidItemIds])

    // Specific list for display in "Split" view
    // Include ALL items (paid ones shown as greyed out)
    const splitPayableItems = useMemo(() => {
        const virt = virtualItems.filter(i => !paidItemIds.has(i.id))
        return [...realItemsExpanded, ...virt]
    }, [realItemsExpanded, virtualItems, paidItemIds])

    // Only unpaid items for selection/payment logic
    const unpaidSplitItems = useMemo(() => {
        return splitPayableItems.filter(i => !paidItemIds.has(i.id))
    }, [splitPayableItems, paidItemIds])

    // Items already marked as PAID in the database (for display in overview)
    const paidDbItems = useMemo(() => {
        const items: { name: string, price: number, quantity: number }[] = []
        const isAyceEnabled = session?.ayce_enabled === true

        orders.forEach(order => {
            if (order.items) {
                order.items.forEach((item: any) => {
                    if (item.status !== 'PAID') return

                    let price = item.dish?.price ?? 0
                    if (isAyceEnabled && item.dish?.is_ayce) {
                        price = 0
                    }

                    items.push({
                        name: item.dish?.name || item.name || 'Piatto',
                        price: price,
                        quantity: item.quantity || 1
                    })
                })
            }
        })
        return items
    }, [orders, session])


    // Calculate Total Amount (Full Bill)
    const totalAmount = useMemo(() => {
        return splitPayableItems.reduce((acc, item) => acc + item.price, 0)
    }, [splitPayableItems])

    const remainingAmount = Math.max(0, totalAmount - (session?.paid_amount || 0))


    const perPersonAmount = useMemo(() => {
        const count = Math.max(1, session?.customer_count || 1)
        return totalAmount / count
    }, [totalAmount, session])


    // Handle Split Payment Logic
    const handlePaySplit = async () => {
        if (selectedSplitItems.size === 0) return
        setProcessingPayment(true)

        try {
            // Check if paying everything
            if (selectedSplitItems.size === splitPayableItems.length) {
                onPaymentComplete()
                return
            }

            // Group selected non-virtual items by their Original DB ID
            // key: originalId, value: count of splits selected
            const selectedRealGroups = new Map<string, number>()
            const virtualIdsToHide: string[] = []

            selectedSplitItems.forEach(splitId => {
                const item = splitPayableItems.find(i => i.id === splitId)
                if (!item) return

                if (item.isVirtual) {
                    virtualIdsToHide.push(splitId)
                } else if (item.originalId) {
                    const current = selectedRealGroups.get(item.originalId) || 0
                    selectedRealGroups.set(item.originalId, current + 1)
                }
            })

            // Process Database Updates
            for (const [originalId, countToPay] of selectedRealGroups.entries()) {
                const itemWrapper = realItemsExpanded.find(i => i.originalId === originalId)
                if (!itemWrapper || !itemWrapper.originalItem) continue

                const originalItem = itemWrapper.originalItem
                const currentQty = originalItem.quantity

                if (countToPay >= currentQty) {
                    // Paying the Full quantity of this item row -> Mark entire row PAID
                    const { error } = await supabase
                        .from('order_items')
                        .update({ status: 'PAID' })
                        .eq('id', originalId)
                    if (error) throw error
                } else {
                    // Partial payment of a quantity row (e.g. paying 1 of 3 beers)
                    // 1. Decrement original row
                    const { error: updateError } = await supabase
                        .from('order_items')
                        .update({ quantity: currentQty - countToPay })
                        .eq('id', originalId)

                    if (updateError) throw updateError

                    // 2. Insert new row for paid items
                    // SANITIZATION FIX: Explicitly select fields
                    const { error: insertError } = await supabase
                        .from('order_items')
                        .insert({
                            order_id: originalItem.order_id,
                            dish_id: originalItem.dish_id,
                            course_number: originalItem.course_number,
                            note: originalItem.note,
                            quantity: countToPay,
                            status: 'PAID'
                        })

                    if (insertError) throw insertError
                }
            }

            // Update UI State locally
            setPaidItemIds(prev => {
                const newSet = new Set(prev)
                virtualIdsToHide.forEach(id => newSet.add(id))
                selectedSplitItems.forEach(id => newSet.add(id))
                // Also mark original DB IDs as paid when ALL their splits are paid
                selectedRealGroups.forEach((countToPay, originalId) => {
                    const itemWrapper = realItemsExpanded.find(i => i.originalId === originalId)
                    if (itemWrapper?.originalItem) {
                        if (countToPay >= itemWrapper.originalItem.quantity) {
                            newSet.add(originalId) // Mark original DB ID as paid too
                        }
                    }
                })
                return newSet
            })

            const totalPaid = Array.from(selectedSplitItems).reduce((sum, id) => {
                const item = splitPayableItems.find(i => i.id === id)
                return sum + (item?.price || 0)
            }, 0)

            toast.success(`Piatti saldati: €${totalPaid.toFixed(2)}`, { duration: 3000 })
            // Stay in split mode so user can continue paying other items
            setSelectedSplitItems(new Set())

        } catch (error) {
            console.error('Payment error:', error)
            toast.error('Errore durante il pagamento')
        } finally {
            setProcessingPayment(false)
        }
    }

    // Handle Delete Item from Bill (cancel order_item in DB)
    const handleDeleteItem = async (itemName: string, itemPrice: number) => {
        const deleteKey = `${itemName}-${itemPrice}`
        setDeletingItem(deleteKey)

        try {
            // Find a matching split item to get the original DB item
            const matchingItem = splitPayableItems.find(
                i => !i.isVirtual && i.name === itemName && i.price === itemPrice
            )
            if (!matchingItem?.originalId || !matchingItem.originalItem) {
                toast.error('Elemento non trovato')
                return
            }

            const originalItem = matchingItem.originalItem
            const currentQty = originalItem.quantity || 1

            if (currentQty > 1) {
                // Decrement quantity by 1
                const { error } = await supabase
                    .from('order_items')
                    .update({ quantity: currentQty - 1 })
                    .eq('id', matchingItem.originalId)
                if (error) throw error
            } else {
                // Cancel the entire item
                const { error } = await supabase
                    .from('order_items')
                    .update({ status: 'CANCELLED' })
                    .eq('id', matchingItem.originalId)
                if (error) throw error
            }

            toast.success(`${itemName} rimosso dal conto`, {
                duration: 3000,
                style: { background: '#422006', border: '1px solid #f59e0b', color: '#fef3c7' }
            })
        } catch (error) {
            console.error('Delete item error:', error)
            toast.error('Errore durante la rimozione')
        } finally {
            setDeletingItem(null)
        }
    }

    // Check if delete is allowed (admin always, waiter only with payment permissions)
    const canDeleteItems = !isWaiter || restaurant?.allow_waiter_payments

    const { splitTotal } = useMemo(() => {
        let total = 0
        selectedSplitItems.forEach(id => {
            const item = splitPayableItems.find(i => i.id === id)
            if (item) total += item.price
        })
        return { splitTotal: total }
    }, [selectedSplitItems, splitPayableItems])


    // Render Helper
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-xl w-[95vw] max-h-[85vh] md:max-h-[90vh] overflow-hidden bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-zinc-100 p-0 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] flex flex-col outline-none [&>button.absolute]:hidden" aria-describedby={undefined}>
                <VisuallyHidden>
                    <DialogTitle>Conto Tavolo {table?.number}</DialogTitle>
                </VisuallyHidden>

                {/* Header */}
                <div className="p-4 md:p-6 border-b border-white/5 bg-zinc-900/40 flex items-center justify-between shrink-0 relative z-20">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                                <Receipt size={20} weight="fill" />
                            </div>
                            <div>
                                <h2 className="text-lg md:text-xl font-bold tracking-tight">Conto Tavolo {table?.number}</h2>
                                <p className="text-xs text-zinc-400 mt-0.5 font-medium">
                                    {session?.customer_count || 1} Ospiti <span className="mx-1.5 opacity-50">•</span> PIN: <span className="font-mono text-white">{session?.session_pin}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10" onClick={() => setIsQrDialogOpen(true)}>
                            <QrCode size={20} weight="bold" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/10" onClick={onClose}>
                            <X size={16} weight="bold" />
                        </Button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    <AnimatePresence mode="wait">

                        {/* Mode 1: Main Overview */}
                        {!isSplitMode && !equalSplitMode && (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className="p-4 md:p-6"
                            >

                                {/* Receipt Card - Dark Glassmorphism */}
                                <div className="bg-black/20 backdrop-blur-2xl border border-white/5 text-zinc-100 rounded-[1.5rem] overflow-hidden shadow-2xl relative flex flex-col ring-1 ring-white/5">

                                    {/* Fluid Background Effect */}
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none -mr-32 -mt-32"></div>
                                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none -ml-32 -mb-32"></div>

                                    {/* Receipt Header */}
                                    <div className="p-6 border-b border-white/5 flex items-center justify-between relative z-10 bg-gradient-to-b from-white/5 to-transparent shrink-0">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold uppercase tracking-widest text-[10px] text-amber-500">{restaurant?.name || 'Ristorante'}</span>
                                            <span className="text-zinc-400 text-xs font-medium">{new Date().toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}</span>
                                        </div>
                                        <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-zinc-200 shadow-inner">
                                            {table?.number}
                                        </div>
                                    </div>

                                    <div className="max-h-[40vh] overflow-y-auto overscroll-contain relative z-10" style={{ WebkitOverflowScrolling: 'touch' }}>
                                        <div className="p-6 space-y-3">
                                            {(() => {
                                                // Group PAID items for display (greyed out, strikethrough)
                                                const paidGroups = new Map<string, { name: string, quantity: number, price: number, total: number }>()
                                                paidDbItems.forEach(item => {
                                                    const key = `${item.name}-${item.price}`
                                                    const existing = paidGroups.get(key)
                                                    if (existing) {
                                                        existing.quantity += item.quantity
                                                        existing.total += item.price * item.quantity
                                                    } else {
                                                        paidGroups.set(key, {
                                                            name: item.name,
                                                            quantity: item.quantity,
                                                            price: item.price,
                                                            total: item.price * item.quantity
                                                        })
                                                    }
                                                })

                                                // Group UNPAID items for clean receipt display — show ALL items including €0 AYCE dishes
                                                const displayGroups = new Map<string, { name: string, quantity: number, price: number, total: number, isAyce: boolean, isVirtual: boolean }>()

                                                splitPayableItems.forEach(item => {
                                                    const key = `${item.name}-${item.price}`
                                                    const existing = displayGroups.get(key)
                                                    if (existing) {
                                                        existing.quantity += 1
                                                        existing.total += item.price
                                                    } else {
                                                        displayGroups.set(key, {
                                                            name: item.name,
                                                            quantity: 1,
                                                            price: item.price,
                                                            total: item.price,
                                                            isAyce: item.price === 0 && !item.isVirtual,
                                                            isVirtual: !!item.isVirtual
                                                        })
                                                    }
                                                })

                                                if (displayGroups.size === 0 && paidGroups.size === 0) {
                                                    return (
                                                        <div className="py-12 flex flex-col items-center justify-center text-zinc-500 space-y-3 opacity-50">
                                                            <Receipt size={40} weight="duotone" />
                                                            <p className="font-medium">Conto saldato o vuoto</p>
                                                        </div>
                                                    )
                                                }

                                                return (
                                                    <>
                                                        {/* Paid items section */}
                                                        {paidGroups.size > 0 && (
                                                            <>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <CheckCircle size={14} weight="fill" className="text-emerald-500" />
                                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Pagato</span>
                                                                </div>
                                                                {Array.from(paidGroups.entries()).map(([key, item]) => (
                                                                    <div key={`paid-${key}`} className="flex justify-between items-baseline py-2 border-b border-white/5 last:border-0 rounded-lg px-2 -mx-2 opacity-50">
                                                                        <div className="flex gap-3 text-sm items-center">
                                                                            <span className="font-bold min-w-[24px] h-6 rounded bg-emerald-500/10 flex items-center justify-center text-xs text-emerald-500">{item.quantity}x</span>
                                                                            <span className="font-medium text-zinc-500 line-through">{item.name}</span>
                                                                        </div>
                                                                        <span className="font-mono font-bold text-sm tabular-nums text-zinc-600 line-through">
                                                                            {'\u20AC'}{item.total.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                                {displayGroups.size > 0 && (
                                                                    <div className="border-t border-white/10 my-2" />
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Unpaid items section */}
                                                        {paidGroups.size > 0 && displayGroups.size > 0 && (
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Clock size={14} weight="bold" className="text-amber-500" />
                                                                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Da pagare</span>
                                                            </div>
                                                        )}
                                                        {Array.from(displayGroups.entries()).map(([key, item]) => (
                                                            <div key={key} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0 group hover:bg-white/5 transition-colors rounded-lg px-2 -mx-2">
                                                                <div className="flex gap-3 text-sm items-center">
                                                                    <span className="font-bold min-w-[24px] h-6 rounded bg-white/10 flex items-center justify-center text-xs text-zinc-300">{item.quantity}x</span>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-zinc-200">{item.name}</span>
                                                                        {item.isAyce && <span className="text-[10px] text-amber-500/70 font-bold uppercase tracking-wider">AYCE incluso</span>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono font-bold text-sm tabular-nums text-zinc-300">
                                                                        {item.price === 0 ? <span className="text-emerald-500/70">{'\u20AC'}0.00</span> : `\u20AC${item.total.toFixed(2)}`}
                                                                    </span>
                                                                    {canDeleteItems && !item.isVirtual && (
                                                                        <button
                                                                            className="opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 max-md:opacity-60 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-600 hover:text-red-400"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                if (confirm(`Rimuovere ${item.quantity > 1 ? '1x ' : ''}${item.name} dal conto? Verrà cancellato anche dall'ordine.`)) {
                                                                                    handleDeleteItem(item.name, item.price)
                                                                                }
                                                                            }}
                                                                            disabled={deletingItem === `${item.name}-${item.price}`}
                                                                        >
                                                                            {deletingItem === `${item.name}-${item.price}` ? (
                                                                                <span className="animate-spin block w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full" />
                                                                            ) : (
                                                                                <Trash size={14} weight="bold" />
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    </div>

                                    {/* Receipt Footer */}
                                    <div className="p-6 border-t border-white/10 bg-black/20 backdrop-blur-md relative z-10 shrink-0">
                                        {(session?.paid_amount || 0) > 0 && (
                                            <div className="mb-3 space-y-1.5">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-emerald-500 font-medium flex items-center gap-1.5">
                                                        <CheckCircle size={14} weight="fill" />
                                                        Pagato online
                                                    </span>
                                                    <span className="font-mono font-bold text-emerald-400">{'\u20AC'}{(session?.paid_amount || 0).toFixed(2)}</span>
                                                </div>
                                                {remainingAmount > 0 && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-amber-500 font-medium">Da incassare</span>
                                                        <span className="font-mono font-bold text-amber-400">{'\u20AC'}{remainingAmount.toFixed(2)}</span>
                                                    </div>
                                                )}
                                                <div className="border-t border-white/10 pt-1.5" />
                                            </div>
                                        )}
                                        <div className="flex justify-between items-end">
                                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Totale</span>
                                            <div className="text-right">
                                                <span className="text-3xl font-black text-white tracking-tight drop-shadow-lg">{'\u20AC'}{totalAmount.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </motion.div>
                        )}


                        {/* Mode 2: Split by Items */}
                        {isSplitMode && (
                            <motion.div
                                key="split-items"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className="p-4 md:p-6"
                            >

                                {/* Glass Container */}
                                <div className="bg-black/20 backdrop-blur-2xl border border-white/5 text-zinc-100 rounded-[1.5rem] overflow-hidden shadow-2xl relative flex flex-col ring-1 ring-white/5">

                                    {/* Fluid Background Effect */}
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none -mr-32 -mt-32"></div>

                                    <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-zinc-500 z-10 bg-black/20 backdrop-blur-md shrink-0">
                                        <span>Seleziona Piatti</span>
                                        <button className="text-amber-500 hover:text-amber-400 transition-colors" onClick={() => {
                                            if (selectedSplitItems.size === unpaidSplitItems.length) setSelectedSplitItems(new Set())
                                            else setSelectedSplitItems(new Set(unpaidSplitItems.map(i => i.id)))
                                        }}>
                                            {selectedSplitItems.size === unpaidSplitItems.length && unpaidSplitItems.length > 0 ? 'Deseleziona Tutto' : 'Seleziona Tutto'}
                                        </button>
                                    </div>

                                    <div className="max-h-[40vh] overflow-y-auto overscroll-contain relative z-10" style={{ WebkitOverflowScrolling: 'touch' }}>
                                        <div className="p-4 space-y-2 pb-6">
                                            {splitPayableItems.map((item) => {
                                                const isPaid = paidItemIds.has(item.id)
                                                const isSelected = !isPaid && selectedSplitItems.has(item.id)
                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => {
                                                            if (isPaid) return // Can't interact with paid items
                                                            const newSet = new Set(selectedSplitItems)
                                                            if (newSet.has(item.id)) newSet.delete(item.id)
                                                            else newSet.add(item.id)
                                                            setSelectedSplitItems(newSet)
                                                        }}
                                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all select-none group ${isPaid
                                                            ? 'bg-white/[0.02] border-white/5 opacity-40 cursor-default'
                                                            : isSelected
                                                                ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_20px_-5px_rgba(245,158,11,0.2)] cursor-pointer'
                                                                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 cursor-pointer'
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${isPaid
                                                                ? 'bg-emerald-500/20 border-emerald-500/50'
                                                                : isSelected ? 'bg-amber-500 border-amber-500 scale-110' : 'border-zinc-600 bg-transparent group-hover:border-zinc-500'
                                                                }`}>
                                                                {isPaid && <Check size={14} weight="bold" className="text-emerald-500" />}
                                                                {isSelected && <Check size={14} weight="bold" className="text-black" />}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className={`text-sm font-medium transition-colors ${isPaid ? 'line-through text-zinc-600' : isSelected ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-300'}`}>{item.name}</span>
                                                                {isPaid && <span className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider">Pagato</span>}
                                                                {!isPaid && item.isVirtual && <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-wider">Autom</span>}
                                                            </div>
                                                        </div>
                                                        <span className={`font-mono font-bold transition-colors ${isPaid ? 'line-through text-zinc-700' : isSelected ? 'text-amber-500' : 'text-zinc-500 group-hover:text-zinc-400'}`}>€{item.price.toFixed(2)}</span>
                                                    </div>
                                                )
                                            })}
                                            {splitPayableItems.length === 0 && (
                                                <div className="py-20 flex flex-col items-center justify-center text-zinc-600 text-sm">
                                                    <Sparkle size={32} className="mb-2 opacity-20" />
                                                    <p>Nessun elemento da dividere</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}


                        {/* Mode 3: Equal Split */}
                        {equalSplitMode && (
                            <motion.div
                                key="equal-split"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className="p-4 md:p-6"
                            >
                                <div className="bg-black/20 backdrop-blur-2xl border border-white/5 text-zinc-100 rounded-[1.5rem] overflow-hidden shadow-2xl relative flex flex-col ring-1 ring-white/5">

                                    <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none -ml-32 -mt-32"></div>
                                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-fuchsia-500/10 blur-[100px] rounded-full pointer-events-none -mr-32 -mb-32"></div>

                                    <div className="relative z-10 flex flex-col items-center justify-center flex-1 p-6">

                                        {/* Number of people selector */}
                                        <div className="mb-6 flex flex-col items-center gap-2">
                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Dividi tra</span>
                                            <div className="flex items-center gap-3">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-10 w-10 rounded-full border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800"
                                                    onClick={() => { setCustomSplitCount(Math.max(2, customSplitCount - 1)); setPaidPersons(Math.min(paidPersons, Math.max(2, customSplitCount - 1))) }}
                                                >
                                                    <Minus size={16} weight="bold" />
                                                </Button>
                                                <span className="text-4xl font-black text-white w-16 text-center tabular-nums">{customSplitCount}</span>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-10 w-10 rounded-full border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800"
                                                    onClick={() => setCustomSplitCount(customSplitCount + 1)}
                                                >
                                                    <Plus size={16} weight="bold" />
                                                </Button>
                                            </div>
                                            <span className="text-xs text-zinc-500">persone</span>
                                        </div>

                                        {/* Per person amount */}
                                        <h3 className="text-sm text-zinc-400 mb-1 font-medium">Quota a Persona</h3>
                                        <div className="text-5xl font-black text-white tracking-tighter mb-6 tabular-nums">
                                            €{(totalAmount / Math.max(1, customSplitCount)).toFixed(2)}
                                        </div>

                                        {/* Payment progress */}
                                        <div className="w-full max-w-[280px] space-y-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-zinc-500">Pagato</span>
                                                <span className="font-bold text-zinc-300">{paidPersons} / {customSplitCount}</span>
                                            </div>
                                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-gradient-to-r from-amber-500 to-green-500 rounded-full"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(paidPersons / Math.max(1, customSplitCount)) * 100}%` }}
                                                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 px-4 rounded-lg border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
                                                    onClick={() => setPaidPersons(Math.max(0, paidPersons - 1))}
                                                    disabled={paidPersons === 0}
                                                >
                                                    <Minus size={14} className="mr-1" /> Annulla
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold"
                                                    onClick={() => {
                                                        const newPaid = Math.min(customSplitCount, paidPersons + 1)
                                                        setPaidPersons(newPaid)
                                                        toast.success(`Quota ${newPaid}/${customSplitCount} segnata: €${(totalAmount / Math.max(1, customSplitCount)).toFixed(2)}`, { duration: 2000 })
                                                    }}
                                                    disabled={paidPersons >= customSplitCount}
                                                >
                                                    <CheckCircle weight="fill" size={14} className="mr-1" /> Incassa €{(totalAmount / Math.max(1, customSplitCount)).toFixed(2)}
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <p className="text-xs text-zinc-600 mt-4 text-center max-w-[260px]">
                                            Totale: <span className="text-zinc-400 font-bold">€{totalAmount.toFixed(2)}</span> ÷ {customSplitCount}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>

                {/* Footer Action Bar */}
                <div className="p-4 md:p-6 border-t border-white/5 bg-zinc-900/40 relative z-20 shrink-0">
                    {isWaiter && !restaurant?.allow_waiter_payments ? (
                        <div className="w-full py-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center gap-2 text-red-400 text-sm font-bold">
                            <X size={16} />
                            Pagamenti disabilitati per i camerieri
                        </div>
                    ) : (
                        <>
                            {isSplitMode || equalSplitMode ? (
                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        className="h-12 px-6 rounded-xl border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
                                        onClick={() => { setIsSplitMode(false); setEqualSplitMode(false); setSelectedSplitItems(new Set()) }}
                                    >
                                        <ArrowLeft className="mr-2" /> Indietro
                                    </Button>

                                    {isSplitMode && (
                                        <Button
                                            className="flex-1 h-12 bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg rounded-xl shadow-lg shadow-amber-500/20"
                                            disabled={selectedSplitItems.size === 0 || processingPayment}
                                            onClick={handlePaySplit}
                                        >
                                            {processingPayment ? <span className="animate-pulse">Attendi...</span> : `Paga €${splitTotal.toFixed(2)}`}
                                        </Button>
                                    )}

                                    {equalSplitMode && (
                                        <Button
                                            className="flex-1 h-12 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-xl shadow-lg shadow-green-500/20 disabled:opacity-40"
                                            disabled={paidPersons < customSplitCount}
                                            onClick={() => {
                                                toast.success(`Tavolo ${table?.number} saldato alla romana`, { duration: 3000 })
                                                onPaymentComplete()
                                            }}
                                        >
                                            <CheckCircle weight="fill" className="mr-2" size={20} />
                                            {paidPersons >= customSplitCount ? 'Conferma Tavolo Saldato' : `Mancano ${customSplitCount - paidPersons} pagamenti`}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {/* Split Options - Always visible in footer */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            variant="outline"
                                            className="h-11 rounded-xl bg-zinc-900/50 backdrop-blur-md border-zinc-700/50 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 hover:border-amber-500/50 transition-all duration-300 group text-xs"
                                            onClick={() => { setIsSplitMode(true); setEqualSplitMode(false) }}
                                            disabled={totalAmount <= 0}
                                        >
                                            <ForkKnife className="mr-1.5 group-hover:scale-110 transition-transform" size={16} weight="duotone" />
                                            <span className="font-medium">Dividi per Piatti</span>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="h-11 rounded-xl bg-zinc-900/50 backdrop-blur-md border-zinc-700/50 text-zinc-300 hover:text-indigo-400 hover:bg-zinc-800 hover:border-indigo-500/50 transition-all duration-300 group text-xs"
                                            onClick={() => { setEqualSplitMode(true); setIsSplitMode(false) }}
                                            disabled={totalAmount <= 0}
                                        >
                                            <Users className="mr-1.5 group-hover:scale-110 transition-transform" size={16} weight="duotone" />
                                            <span className="font-medium">Alla Romana</span>
                                        </Button>
                                    </div>

                                    {remainingAmount <= 0 && totalAmount > 0 && session?.paid_amount ? (
                                        <Button
                                            className="w-full h-14 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xl rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 px-6"
                                            onClick={() => {
                                                toast.success(`Tavolo ${table?.number} saldato`, { duration: 3000 })
                                                onPaymentComplete()
                                            }}
                                        >
                                            <CheckCircle weight="fill" size={24} />
                                            <span>Conferma Scontrino e Chiudi</span>
                                        </Button>
                                    ) : (
                                        <Button
                                            className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xl rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-between px-6"
                                            onClick={() => {
                                                toast.success(`Tavolo ${table?.number} saldato`, { duration: 3000 })
                                                onPaymentComplete()
                                            }}
                                            disabled={remainingAmount <= 0 && totalAmount <= 0}
                                        >
                                            <div className="flex items-center gap-2">
                                                <CheckCircle weight="fill" size={24} />
                                                <span>{session?.paid_amount ? 'Incassa Rimanente' : 'Salda Tutto'}</span>
                                            </div>
                                            <span>€{remainingAmount.toFixed(2)}</span>
                                        </Button>
                                    )}

                                    {onEmptyTable && (
                                        <Button
                                            variant="ghost"
                                            className="text-zinc-500 hover:text-red-400 hover:bg-red-500/5 h-10 rounded-xl text-xs uppercase font-bold tracking-wider"
                                            onClick={() => {
                                                if (totalAmount > 0) {
                                                    if (confirm(`Ci sono ancora €${totalAmount.toFixed(2)} da saldare. Vuoi liberare il tavolo senza pagamento?`)) {
                                                        onEmptyTable()
                                                    }
                                                } else {
                                                    onEmptyTable()
                                                }
                                            }}
                                        >
                                            <Trash size={14} className="mr-1.5" />
                                            Libera Tavolo{totalAmount > 0 ? ' (Senza Pagamento)' : ''}
                                        </Button>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

            </DialogContent>

            {/* QR Code Dialog */}
            <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
                <DialogContent className="sm:max-w-sm bg-zinc-950 border-white/10 text-white rounded-[2rem] p-8 flex flex-col items-center justify-center shadow-2xl outline-none">
                    <DialogHeader className="mb-4 text-center">
                        <DialogTitle className="text-2xl font-bold text-amber-500">QR Code Tavolo {table?.number}</DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            Fai scansionare ai clienti per accedere al menu
                        </DialogDescription>
                    </DialogHeader>

                    <div className="bg-white p-4 rounded-xl shadow-inner mb-6">
                        {table && <QRCodeGenerator value={`${window.location.origin}/client/table/${table.id}`} size={200} />}
                    </div>

                    {session?.session_pin && (
                        <div className="text-center w-full bg-zinc-900/50 p-4 rounded-xl border border-white/5">
                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">PIN Accesso</p>
                            <p className="text-3xl font-mono font-black tracking-widest text-white">{session.session_pin}</p>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

        </Dialog>
    )
}
