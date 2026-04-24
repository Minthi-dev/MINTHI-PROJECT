import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShoppingBag, Minus, Plus, Trash, ForkKnife, CreditCard, Wallet, Clock, CheckCircle, Storefront, ArrowLeft, Info } from '@phosphor-icons/react'
import { DatabaseService } from '@/services/DatabaseService'
import type { Dish, Category } from '@/services/types'

type RestaurantInfo = NonNullable<Awaited<ReturnType<typeof DatabaseService.getTakeawayRestaurantInfo>>>

interface CartLine {
    dish: Dish
    quantity: number
    note?: string
}

// Stable idempotency key per cart lifetime. Regenerated after a successful
// submission (see submitOrder) so the next order isn't deduplicated.
function makeIdempotencyKey() {
    try {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return (crypto as any).randomUUID() as string
        }
    } catch {}
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function TakeawayMenu() {
    const { restaurantId } = useParams<{ restaurantId: string }>()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null)
    const [categories, setCategories] = useState<Category[]>([])
    const [dishes, setDishes] = useState<Dish[]>([])
    const [loading, setLoading] = useState(true)
    const [activeCategory, setActiveCategory] = useState<string | null>(null)
    const [cart, setCart] = useState<CartLine[]>([])
    const [cartOpen, setCartOpen] = useState(false)
    const [checkoutOpen, setCheckoutOpen] = useState(false)
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerEmail, setCustomerEmail] = useState('')
    const [customerNotes, setCustomerNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [paymentChoice, setPaymentChoice] = useState<'stripe' | 'pay_on_pickup'>('stripe')
    const [loadError, setLoadError] = useState<string | null>(null)
    const [idempotencyKey, setIdempotencyKey] = useState<string>(() => makeIdempotencyKey())

    useEffect(() => {
        if (!restaurantId) return
        let alive = true
        ;(async () => {
            try {
                setLoading(true)
                setLoadError(null)
                // Single RPC: restaurant + categories + dishes in one roundtrip.
                // Fewer network hops = fewer iOS Safari "Load failed" errors.
                const { restaurant: info, categories: cats, dishes: ds } =
                    await DatabaseService.getTakeawayMenu(restaurantId)
                if (!alive) return
                setRestaurant(info as RestaurantInfo | null)
                setCategories((cats || []) as Category[])
                setDishes((ds || []) as Dish[])
                if (cats && cats.length > 0) setActiveCategory(cats[0].id)
                // Default payment method based on restaurant config
                if (info?.takeaway_require_stripe) setPaymentChoice('stripe')
                else if (!info?.enable_stripe_payments || !info?.stripe_connect_enabled) setPaymentChoice('pay_on_pickup')
            } catch (e: any) {
                console.error('[TakeawayMenu] load error:', e)
                if (alive) {
                    setLoadError(e?.message || 'Impossibile caricare il menù')
                    toast.error('Errore caricamento menù')
                }
            } finally {
                if (alive) setLoading(false)
            }
        })()
        return () => { alive = false }
    }, [restaurantId])

    useEffect(() => {
        if (searchParams.get('payment') === 'cancelled') {
            toast.info('Pagamento annullato. Puoi riprovare quando vuoi.')
        }
    }, [searchParams])

    const dishesByCategory = useMemo(() => {
        const map = new Map<string, Dish[]>()
        for (const d of dishes) {
            if (d.is_available === false) continue
            const list = map.get(d.category_id) || []
            list.push(d)
            map.set(d.category_id, list)
        }
        return map
    }, [dishes])

    const total = useMemo(() => {
        const t = cart.reduce((s, c) => s + (Number(c.dish.price) || 0) * c.quantity, 0)
        return Math.round(t * 100) / 100
    }, [cart])

    const addToCart = (dish: Dish) => {
        setCart(prev => {
            const idx = prev.findIndex(c => c.dish.id === dish.id && !c.note)
            if (idx >= 0) {
                const copy = [...prev]
                copy[idx] = { ...copy[idx], quantity: Math.min(30, copy[idx].quantity + 1) }
                return copy
            }
            return [...prev, { dish, quantity: 1 }]
        })
        toast.success(`+1 ${dish.name}`, { duration: 900 })
    }
    const decrement = (idx: number) => {
        setCart(prev => {
            const c = prev[idx]
            if (!c) return prev
            if (c.quantity <= 1) return prev.filter((_, i) => i !== idx)
            const copy = [...prev]
            copy[idx] = { ...c, quantity: c.quantity - 1 }
            return copy
        })
    }
    const removeLine = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx))

    const canPayStripe = Boolean(restaurant?.enable_stripe_payments && restaurant?.stripe_connect_enabled)
    const canPayOnPickup = !restaurant?.takeaway_require_stripe
    const stripeRequiredButUnavailable = Boolean(restaurant?.takeaway_require_stripe && !canPayStripe)

    const submitOrder = async () => {
        if (!restaurantId) return
        if (cart.length === 0) return toast.error('Il carrello è vuoto')
        if (!customerName.trim()) return toast.error('Inserisci il tuo nome')
        if (!customerPhone.trim()) return toast.error('Inserisci un numero di telefono')
        if (paymentChoice === 'stripe' && !canPayStripe) return toast.error('Pagamento online non disponibile')
        if (paymentChoice === 'pay_on_pickup' && !canPayOnPickup) return toast.error('Questo ristorante richiede il pagamento online')

        setSubmitting(true)
        try {
            const result = await DatabaseService.createTakeawayOrder({
                restaurantId,
                items: cart.map(c => ({
                    dish_id: c.dish.id,
                    quantity: c.quantity,
                    note: c.note,
                })),
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                customerEmail: customerEmail.trim() || undefined,
                customerNotes: customerNotes.trim() || undefined,
                paymentMethod: paymentChoice,
                idempotencyKey,
            })

            if (result.paymentMethod === 'stripe' && result.checkoutUrl) {
                // Persist pickup code for later status check
                try { sessionStorage.setItem(`takeaway_${restaurantId}_code`, result.pickupCode) } catch {}
                window.location.href = result.checkoutUrl
                return
            }
            // Pay on pickup — reset idempotency key (this order is done)
            // and navigate to status page.
            setIdempotencyKey(makeIdempotencyKey())
            setCart([])
            navigate(`/client/takeaway/${restaurantId}/order/${result.pickupCode}?created=1`)
        } catch (e: any) {
            console.error('[TakeawayMenu] submit error:', e)
            toast.error(e?.message || 'Errore invio ordine. Controlla la connessione e riprova.')
        } finally {
            setSubmitting(false)
        }
    }

    // ---------------- Render ----------------
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-amber-400">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full" />
            </div>
        )
    }
    if (!restaurant) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-6 text-center">
                <div className="space-y-3">
                    <h2 className="text-xl">{loadError ? 'Errore di caricamento' : 'Ristorante non trovato'}</h2>
                    <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                        {loadError || 'Controlla il QR code o contatta il locale.'}
                    </p>
                    {loadError && (
                        <Button onClick={() => window.location.reload()} className="bg-amber-500 hover:bg-amber-400 text-black font-bold mt-2">
                            Riprova
                        </Button>
                    )}
                </div>
            </div>
        )
    }
    if (!restaurant.takeaway_enabled) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-6 text-center">
                <div>
                    <h2 className="text-xl mb-2">Asporto non disponibile</h2>
                    <p className="text-zinc-400 text-sm">Questo locale al momento non accetta ordini asporto online.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white" style={{ paddingBottom: 'env(safe-area-inset-bottom, 96px)' }}>
            {/* Header */}
            <header className="sticky top-0 z-30 backdrop-blur-xl bg-zinc-950/80 border-b border-white/5">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                        <Storefront size={20} weight="fill" className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-bold text-lg truncate">{restaurant.name}</h1>
                        <p className="text-xs text-amber-400/90 uppercase tracking-widest">Ordina e ritira</p>
                    </div>
                    <div className="text-right text-xs">
                        <div className="flex items-center justify-end gap-1 text-zinc-400"><Clock size={12} /> ~{restaurant.takeaway_estimated_minutes} min</div>
                    </div>
                </div>
                {/* Categories */}
                {categories.length > 0 && (
                    <div className="max-w-2xl mx-auto px-2 pb-3 overflow-x-auto no-scrollbar">
                        <div className="flex gap-2 min-w-max px-2">
                            {categories.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => {
                                        setActiveCategory(c.id)
                                        const el = document.getElementById(`cat-${c.id}`)
                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-all ${activeCategory === c.id ? 'bg-amber-500 border-amber-500 text-black font-bold' : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'}`}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            {/* Menu — visually aligned with CustomerMenu (photo + description + allergens badge) */}
            <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
                {categories.map(cat => {
                    const catDishes = dishesByCategory.get(cat.id) || []
                    if (catDishes.length === 0) return null
                    return (
                        <section key={cat.id} id={`cat-${cat.id}`}>
                            <h2 className="text-amber-400/90 font-semibold uppercase tracking-wider text-sm mb-3">{cat.name}</h2>
                            <div className="space-y-2">
                                {catDishes.map((d, index) => {
                                    const hasImage = !!d.image_url?.trim()
                                    const hasAllergens = !!d.allergens && d.allergens.length > 0
                                    return (
                                        <motion.div
                                            key={d.id}
                                            layout
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
                                            onClick={() => addToCart(d)}
                                            className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/70 border border-amber-500/10 shadow-lg hover:border-amber-500/40 transition-all duration-500 cursor-pointer group active:scale-[0.98] backdrop-blur-sm"
                                        >
                                            {hasImage && (
                                                <div className="w-[72px] h-[72px] shrink-0 relative rounded-lg overflow-hidden shadow-inner border border-white/5 bg-gradient-to-br from-zinc-900 to-zinc-950">
                                                    <img
                                                        src={d.image_url}
                                                        alt={d.name}
                                                        loading="lazy"
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                                                    />
                                                    {hasAllergens && (
                                                        <div className="absolute bottom-1 right-1 p-0.5 rounded-full shadow-sm bg-zinc-950/90 border border-amber-500/20">
                                                            <Info size={10} className="text-amber-400" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0 py-0.5">
                                                <h3 className="font-normal text-base leading-tight line-clamp-1 mb-1 tracking-wide text-white">{d.name}</h3>
                                                {d.description && (
                                                    <p className="text-xs line-clamp-2 leading-snug font-light text-zinc-400">{d.description}</p>
                                                )}
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className="font-medium text-sm tracking-wide text-amber-400">€ {Number(d.price).toFixed(2)}</span>
                                                </div>
                                            </div>

                                            <Button
                                                size="icon"
                                                className="rounded-full shrink-0 bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/40 text-amber-400 transition-all duration-300 hover:scale-110"
                                                onClick={(e) => { e.stopPropagation(); addToCart(d) }}
                                                aria-label={`Aggiungi ${d.name}`}
                                            >
                                                <Plus size={20} weight="bold" />
                                            </Button>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </section>
                    )
                })}
            </main>

            {/* Floating cart button */}
            <AnimatePresence>
                {cart.length > 0 && !cartOpen && (
                    <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="fixed bottom-4 left-0 right-0 z-40 flex justify-center px-4">
                        <button
                            onClick={() => setCartOpen(true)}
                            className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-full py-3 px-6 shadow-2xl flex items-center gap-3 max-w-md w-full justify-between"
                        >
                            <span className="flex items-center gap-2"><ShoppingBag size={20} weight="bold" /> {cart.reduce((s, c) => s + c.quantity, 0)} piatti</span>
                            <span className="flex items-center gap-2">€{total.toFixed(2)}<ForkKnife size={18} weight="bold" /></span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Cart drawer */}
            <Drawer open={cartOpen} onOpenChange={setCartOpen}>
                <DrawerContent className="bg-zinc-950 border-white/10">
                    <DrawerHeader>
                        <DrawerTitle className="text-white">Il tuo ordine</DrawerTitle>
                        <DrawerDescription className="text-zinc-400 text-xs">Ritiro in negozio · ~{restaurant.takeaway_estimated_minutes} min</DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 pb-4 max-h-[55vh] overflow-y-auto space-y-2">
                        {cart.length === 0 && <p className="text-zinc-500 text-sm text-center py-8">Carrello vuoto</p>}
                        {cart.map((line, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">{line.dish.name}</div>
                                    <div className="text-xs text-zinc-400">€{Number(line.dish.price).toFixed(2)} × {line.quantity}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button size="icon" variant="ghost" onClick={() => decrement(idx)} className="h-8 w-8 text-white"><Minus size={14} /></Button>
                                    <span className="w-6 text-center">{line.quantity}</span>
                                    <Button size="icon" variant="ghost" onClick={() => addToCart(line.dish)} className="h-8 w-8 text-white"><Plus size={14} /></Button>
                                    <Button size="icon" variant="ghost" onClick={() => removeLine(idx)} className="h-8 w-8 text-red-400"><Trash size={14} /></Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="px-4 pb-6 pt-2 border-t border-white/5">
                        <div className="flex justify-between text-lg font-bold mb-3">
                            <span>Totale</span><span className="text-amber-400">€{total.toFixed(2)}</span>
                        </div>
                        <Button disabled={cart.length === 0} onClick={() => { setCartOpen(false); setCheckoutOpen(true) }} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold h-12">
                            Procedi all'ordine
                        </Button>
                    </div>
                </DrawerContent>
            </Drawer>

            {/* Checkout dialog */}
            <Dialog open={checkoutOpen} onOpenChange={(v) => { if (!submitting) setCheckoutOpen(v) }}>
                <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><CheckCircle size={20} className="text-amber-400" /> Conferma ordine</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-zinc-400 uppercase tracking-wider">Nome *</label>
                            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} maxLength={80} placeholder="Es. Mario Rossi" className="bg-white/5 border-white/10 mt-1" />
                        </div>
                        <div>
                            <label className="text-xs text-zinc-400 uppercase tracking-wider">Telefono *</label>
                            <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} maxLength={32} placeholder="Es. +39 333 1234567" inputMode="tel" className="bg-white/5 border-white/10 mt-1" />
                        </div>
                        {paymentChoice === 'stripe' && (
                            <div>
                                <label className="text-xs text-zinc-400 uppercase tracking-wider">Email (ricevuta Stripe)</label>
                                <Input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} type="email" maxLength={120} placeholder="nome@esempio.it" className="bg-white/5 border-white/10 mt-1" />
                            </div>
                        )}
                        <div>
                            <label className="text-xs text-zinc-400 uppercase tracking-wider">Note (opzionale)</label>
                            <Textarea value={customerNotes} onChange={e => setCustomerNotes(e.target.value)} maxLength={240} rows={2} placeholder="Allergie, preferenze..." className="bg-white/5 border-white/10 mt-1" />
                        </div>

                        <div className="pt-2">
                            <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Pagamento</label>
                            <div className={`grid gap-2 ${canPayStripe && canPayOnPickup ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {canPayStripe && (
                                    <button
                                        onClick={() => setPaymentChoice('stripe')}
                                        className={`p-3 rounded-xl border transition-all text-left ${paymentChoice === 'stripe' ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                                    >
                                        <CreditCard size={20} className="text-amber-400 mb-1" />
                                        <div className="font-semibold text-sm">Carta / Apple Pay</div>
                                        <div className="text-xs text-zinc-400">Pagamento online sicuro</div>
                                    </button>
                                )}
                                {canPayOnPickup && (
                                    <button
                                        onClick={() => setPaymentChoice('pay_on_pickup')}
                                        className={`p-3 rounded-xl border transition-all text-left ${paymentChoice === 'pay_on_pickup' ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                                    >
                                        <Wallet size={20} className="text-amber-400 mb-1" />
                                        <div className="font-semibold text-sm">Paga al ritiro</div>
                                        <div className="text-xs text-zinc-400">Contanti o POS</div>
                                    </button>
                                )}
                            </div>
                            {stripeRequiredButUnavailable && (
                                <p className="text-xs text-red-300 mt-3 bg-red-500/10 border border-red-500/25 rounded-lg p-2">
                                    Questo locale richiede pagamento online, ma Stripe non è ancora configurato. Avvisa lo staff.
                                </p>
                            )}
                            {restaurant?.takeaway_pickup_notice && (
                                <p className="text-xs text-amber-300/80 mt-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
                                    {restaurant.takeaway_pickup_notice}
                                </p>
                            )}
                        </div>

                        <div className="flex justify-between text-lg font-bold pt-3 border-t border-white/5">
                            <span>Totale</span><span className="text-amber-400">€{total.toFixed(2)}</span>
                        </div>

                        <Button
                            onClick={submitOrder}
                            disabled={submitting || cart.length === 0 || stripeRequiredButUnavailable}
                            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold h-12"
                        >
                            {submitting ? 'Invio...' : stripeRequiredButUnavailable ? 'Pagamento online non disponibile' : paymentChoice === 'stripe' ? `Paga €${total.toFixed(2)}` : 'Invia ordine'}
                        </Button>
                        <button onClick={() => setCheckoutOpen(false)} className="text-sm text-zinc-400 hover:text-white w-full flex items-center justify-center gap-1">
                            <ArrowLeft size={14} /> Torna al carrello
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
