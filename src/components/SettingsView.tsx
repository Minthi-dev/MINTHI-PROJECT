import { motion } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    Storefront,
    Users,
    Coins,
    CalendarCheck,
    SpeakerHigh,
    CreditCard,
    Clock,
    Info,
    CheckCircle,
    Gear,
    Eye,
    EyeSlash,
    ArrowSquareOut,
    Receipt,
    Buildings,
    Warning,
    WarningCircle,
    ArrowClockwise,
    Sparkle,
    Printer,
    Package
} from '@phosphor-icons/react'
import { SoundType } from '../utils/SoundManager'
import WeeklyScheduleEditor from './WeeklyScheduleEditor'
import WeeklyServiceHoursEditor from './WeeklyServiceHoursEditor'
import { DatabaseService } from '@/services/DatabaseService'
import { supabase } from '@/lib/supabase'
import type { WeeklyCopertoSchedule, WeeklyAyceSchedule, RestaurantStaff, WeeklyServiceSchedule, SubscriptionPayment } from '@/services/types'
import { createDefaultCopertoSchedule, createDefaultAyceSchedule } from '@/utils/pricingUtils'
import { useThermalPrinter } from '@/hooks/useThermalPrinter'
import { toast } from 'sonner'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import { ConnectComponentsProvider, ConnectAccountOnboarding } from '@stripe/react-connect-js'
import { Save, UserPlus, Pencil, Trash as TrashIcon, UserMinus } from 'lucide-react'

interface SettingsViewProps {
    restaurantName: string
    setRestaurantName: (name: string) => void
    restaurantNameDirty: boolean
    saveRestaurantName: () => void

    soundEnabled: boolean
    setSoundEnabled: (enabled: boolean) => void
    selectedSound: SoundType
    setSelectedSound: (sound: SoundType) => void

    waiterModeEnabled: boolean
    setWaiterModeEnabled: (enabled: boolean) => void
    allowWaiterPayments: boolean
    setAllowWaiterPayments: (enabled: boolean) => void
    waiterPassword: string
    setWaiterPassword: (password: string) => void
    saveWaiterPassword: (password: string) => void

    ayceEnabled: boolean
    setAyceEnabled: (enabled: boolean) => void
    aycePrice: number | string
    setAycePrice: (price: number | string) => void
    ayceMaxOrders: number | string
    setAyceMaxOrders: (orders: number | string) => void

    copertoEnabled: boolean
    setCopertoEnabled: (enabled: boolean) => void
    copertoPrice: number | string
    setCopertoPrice: (price: number | string) => void

    reservationDuration: number
    setReservationDuration: (minutes: number) => void

    openingTime: string
    setOpeningTime: (time: string) => void
    closingTime: string
    setClosingTime: (time: string) => void

    lunchTimeStart: string
    setLunchTimeStart: (time: string) => void
    dinnerTimeStart: string
    setDinnerTimeStart: (time: string) => void

    courseSplittingEnabled: boolean
    setCourseSplittingEnabled: (enabled: boolean) => void
    updateCourseSplitting: (enabled: boolean) => void
    // Weekly schedules
    weeklyCoperto: WeeklyCopertoSchedule | undefined
    setWeeklyCoperto: (schedule: WeeklyCopertoSchedule) => void
    weeklyAyce: WeeklyAyceSchedule | undefined
    setWeeklyAyce: (schedule: WeeklyAyceSchedule) => void
    weeklyServiceHours: WeeklyServiceSchedule | undefined
    setWeeklyServiceHours: (schedule: WeeklyServiceSchedule) => void

    // Reservation Settings
    enableReservationRoomSelection: boolean
    setEnableReservationRoomSelection: (enabled: boolean) => void
    enablePublicReservations: boolean
    setEnablePublicReservations: (enabled: boolean) => void

    viewOnlyMenuEnabled: boolean
    setViewOnlyMenuEnabled: (enabled: boolean) => void

    showCookingTimes: boolean
    setShowCookingTimes: (enabled: boolean) => void

    courseSuggestionsEnabled: boolean
    setCourseSuggestionsEnabled: (enabled: boolean) => void
    updateCourseSuggestions: (enabled: boolean) => void

    restaurantId: string
    onRestartTour?: () => void
    onRestartSetup?: () => void
}

export function SettingsView({
    restaurantName,
    setRestaurantName,
    restaurantNameDirty,
    saveRestaurantName,
    soundEnabled,
    setSoundEnabled,
    selectedSound,
    setSelectedSound,
    waiterModeEnabled,
    setWaiterModeEnabled,
    allowWaiterPayments,
    setAllowWaiterPayments,
    waiterPassword,
    setWaiterPassword,
    saveWaiterPassword,
    enableReservationRoomSelection,
    setEnableReservationRoomSelection,
    enablePublicReservations,
    setEnablePublicReservations,
    ayceEnabled,
    setAyceEnabled,
    aycePrice,
    setAycePrice,
    ayceMaxOrders,
    setAyceMaxOrders,
    copertoEnabled,
    setCopertoEnabled,
    copertoPrice,
    setCopertoPrice,
    reservationDuration,
    setReservationDuration,
    openingTime,
    setOpeningTime,
    closingTime,
    setClosingTime,
    lunchTimeStart, setLunchTimeStart,
    dinnerTimeStart, setDinnerTimeStart,
    courseSplittingEnabled,
    setCourseSplittingEnabled,
    updateCourseSplitting,
    weeklyCoperto,
    setWeeklyCoperto,
    weeklyAyce,
    setWeeklyAyce,
    weeklyServiceHours,
    setWeeklyServiceHours,
    viewOnlyMenuEnabled,
    setViewOnlyMenuEnabled,
    showCookingTimes,
    setShowCookingTimes,
    courseSuggestionsEnabled,
    setCourseSuggestionsEnabled,
    updateCourseSuggestions,
    restaurantId,
    onRestartTour,
    onRestartSetup
}: SettingsViewProps) {

    const printer = useThermalPrinter()
    const [stripePaymentsEnabled, setStripePaymentsEnabled] = useState(false)
    const [autoDeliverReady, setAutoDeliverReady] = useState(false)
    const [takeawayEnabled, setTakeawayEnabled] = useState(false)
    const [dineInEnabled, setDineInEnabled] = useState(true)
    const [takeawayRequireStripe, setTakeawayRequireStripe] = useState(false)
    const [takeawayPickupNotice, setTakeawayPickupNotice] = useState('')
    const [takeawayAutoPrint, setTakeawayAutoPrint] = useState(false)
    const [takeawayAutoPickupEnabled, setTakeawayAutoPickupEnabled] = useState(false)
    const [takeawayMaxOrdersPerHour, setTakeawayMaxOrdersPerHour] = useState<number | ''>('')
    const [savingTakeaway, setSavingTakeaway] = useState(false)
    const [staffList, setStaffList] = useState<RestaurantStaff[]>([])
    const [isStaffLoading, setIsStaffLoading] = useState(false)
    const [showStaffDialog, setShowStaffDialog] = useState(false)
    const [editingStaff, setEditingStaff] = useState<RestaurantStaff | null>(null)
    const [staffForm, setStaffForm] = useState({ name: '', username: '', password: '', is_active: true })

    // Payment & Subscription state
    const [subscriptionPayments, setSubscriptionPayments] = useState<SubscriptionPayment[]>([])
    const [subscriptionInfo, setSubscriptionInfo] = useState<{
        stripe_subscription_id?: string | null
        stripe_connect_account_id?: string | null
        stripe_connect_enabled?: boolean
        subscription_status?: string | null
        subscription_cancel_at?: string | null
        vat_number?: string | null
        billing_name?: string | null
    } | null>(null)
    const [vatNumber, setVatNumber] = useState('')
    const [billingName, setBillingName] = useState('')
    const [savingPaymentInfo, setSavingPaymentInfo] = useState(false)
    const [loadingBillingPortal, setLoadingBillingPortal] = useState(false)
    const [loadingConnectOnboarding, setLoadingConnectOnboarding] = useState(false)
    const [activeDiscount, setActiveDiscount] = useState<any>(null)
    const [priceAmount, setPriceAmount] = useState<number>(0)
    const [openInfo, setOpenInfo] = useState<string | null>(null)
    const stripeReadyForTakeaway = Boolean(stripePaymentsEnabled && subscriptionInfo?.stripe_connect_enabled)

    const InfoTip = ({ id, text }: { id: string; text: string }) => (
        <>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpenInfo(openInfo === id ? null : id) }}
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-all ${openInfo === id ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10'}`}
                title="Info"
            >
                <Info size={14} weight="bold" />
            </button>
            {openInfo === id && (
                <div className="mt-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15 text-sm text-amber-200/80 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                    {text}
                </div>
            )}
        </>
    )

    const loadStaff = async () => {
        if (!restaurantId) return;
        setIsStaffLoading(true)
        try {
            const data = await DatabaseService.getStaff(restaurantId)
            setStaffList(data || [])
        } catch (error) {
            toast.error("Errore nel caricamento dello staff")
        } finally {
            setIsStaffLoading(false)
        }
    }

    const loadPaymentData = async () => {
        if (!restaurantId) return
        try {
            const { data } = await supabase
                .from('restaurants')
                .select('enable_stripe_payments, stripe_subscription_id, stripe_connect_account_id, stripe_connect_enabled, subscription_status, subscription_cancel_at, vat_number, billing_name, auto_deliver_ready_dishes, takeaway_enabled, dine_in_enabled, takeaway_require_stripe, takeaway_pickup_notice, takeaway_auto_print, takeaway_auto_pickup_enabled, takeaway_max_orders_per_hour')
                .eq('id', restaurantId)
                .single()
            if (data) {
                setStripePaymentsEnabled(data.enable_stripe_payments || false)
                setAutoDeliverReady(data.auto_deliver_ready_dishes ?? false)
                setSubscriptionInfo(data)
                setVatNumber(data.vat_number || '')
                setBillingName(data.billing_name || '')
                setTakeawayEnabled((data as any).takeaway_enabled ?? false)
                setDineInEnabled((data as any).dine_in_enabled ?? true)
                setTakeawayRequireStripe((data as any).takeaway_require_stripe ?? false)
                setTakeawayPickupNotice((data as any).takeaway_pickup_notice || '')
                setTakeawayAutoPrint((data as any).takeaway_auto_print ?? false)
                setTakeawayAutoPickupEnabled((data as any).takeaway_auto_pickup_enabled ?? false)
                setTakeawayMaxOrdersPerHour((data as any).takeaway_max_orders_per_hour ?? '')

                // If account exists but is not marked as enabled, check with Stripe API directly once
                if (data.stripe_connect_account_id && !data.stripe_connect_enabled) {
                    DatabaseService.refreshStripeConnectStatus(restaurantId)
                        .then(res => {
                            if (res && res.enabled) {
                                setSubscriptionInfo(prev => prev ? { ...prev, stripe_connect_enabled: true } : prev)
                            }
                        })
                        .catch(() => { })
                }
            }
        } catch (e) { /* ignore */ }

        try {
            const payments = await DatabaseService.getSubscriptionPayments(restaurantId)
            setSubscriptionPayments(payments || [])
        } catch (e) { /* ignore */ }

        try {
            const discounts = await DatabaseService.getRestaurantDiscounts(restaurantId)
            const active = discounts.find((d: any) => d.is_active)
            setActiveDiscount(active || null)
        } catch (e) { /* ignore */ }

        try {
            const amountStr = await DatabaseService.getAppConfig('stripe_price_amount')
            if (amountStr && parseFloat(amountStr) > 0) setPriceAmount(parseFloat(amountStr))
        } catch (e) { /* ignore */ }
    }

    useEffect(() => {
        loadStaff()
        loadPaymentData()
    }, [restaurantId])

    const handleOpenBillingPortal = async () => {
        setLoadingBillingPortal(true)
        try {
            const { url } = await DatabaseService.createBillingPortalSession(restaurantId)
            window.location.href = url
        } catch (e: any) {
            toast.error('Errore: ' + e.message)
        } finally {
            setLoadingBillingPortal(false)
        }
    }


    const [stripeConnectInstance, setStripeConnectInstance] = useState<any>(null)
    const [showOnboardingEmbed, setShowOnboardingEmbed] = useState(false)
    const [showStripeGuide, setShowStripeGuide] = useState(false)

    const handleConnectOnboarding = async () => {
        // If it's already an account but NOT enabled, first try to manual refresh.
        // It's possible the user completed the flow and the webhook hasn't arrived.
        if (subscriptionInfo?.stripe_connect_account_id && !subscriptionInfo?.stripe_connect_enabled) {
            setLoadingConnectOnboarding(true)
            try {
                const res = await DatabaseService.refreshStripeConnectStatus(restaurantId)
                if (res && res.enabled) {
                    setSubscriptionInfo(prev => prev ? { ...prev, stripe_connect_enabled: true } : prev)
                    toast.success('Verifica account completata con successo!')
                    return
                }
            } catch (e) { /* fallback to opening the link */ } finally {
                setLoadingConnectOnboarding(false)
            }
        }

        setLoadingConnectOnboarding(true)
        try {
            const result = await DatabaseService.createStripeConnectOnboarding(restaurantId, window.location.href)
            if (result.url) {
                window.open(result.url, '_blank')
                toast.success(subscriptionInfo?.stripe_connect_enabled
                    ? 'Dashboard Stripe aperta in una nuova scheda!'
                    : 'Pagina di configurazione Stripe aperta in una nuova scheda!')
            } else {
                toast.error('Impossibile generare il link Stripe')
            }
        } catch (e: any) {
            const msg = e.message || 'Errore sconosciuto'
            console.error('Stripe Connect error:', msg)
            toast.error('Errore collegamento Stripe: ' + msg)
        } finally {
            setLoadingConnectOnboarding(false)
        }
    }

    const saveTakeawaySettings = async (patch: Partial<{
        takeaway_enabled: boolean
        dine_in_enabled: boolean
        takeaway_require_stripe: boolean
        takeaway_pickup_notice: string
        takeaway_auto_print: boolean
        takeaway_auto_pickup_enabled: boolean
        takeaway_max_orders_per_hour: number | null
    }>): Promise<boolean> => {
        if (patch.takeaway_require_stripe === true && !stripeReadyForTakeaway) {
            setTakeawayRequireStripe(false)
            toast.error('Prima attiva i pagamenti online e completa Stripe Connect.')
            return false
        }
        setSavingTakeaway(true)
        try {
            await DatabaseService.updateRestaurant({ id: restaurantId, ...patch })
            toast.success('Impostazioni asporto aggiornate')
            return true
        } catch (e: any) {
            toast.error('Errore: ' + (e?.message || 'Impossibile salvare'))
            return false
        } finally {
            setSavingTakeaway(false)
        }
    }

    const handleSavePaymentInfo = async () => {
        setSavingPaymentInfo(true)
        try {
            await DatabaseService.updateRestaurantPaymentInfo(restaurantId, {
                vat_number: vatNumber.trim() || undefined,
                billing_name: billingName.trim() || undefined,
            })
            toast.success('Dati fiscali salvati!')
            await loadPaymentData()
        } catch (e: any) {
            toast.error('Errore: ' + e.message)
        } finally {
            setSavingPaymentInfo(false)
        }
    }

    // Calcola data prossimo pagamento dal periodo dell'ultima fattura pagata
    // Se non ci sono pagamenti (trial attivo), mostra il 1° del prossimo mese
    const nextPaymentDate = (() => {
        const paid = subscriptionPayments.filter(p => p.status === 'paid' && p.period_end)
        if (paid.length) {
            const last = paid[0] // già ordinato per created_at desc
            if (last.period_end) return new Date(last.period_end)
        }
        // Nessun pagamento ancora — trial attivo, primo addebito il 1° del prossimo mese
        if (subscriptionInfo?.stripe_subscription_id) {
            const now = new Date()
            return new Date(Date.UTC(
                now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
                now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1,
                1
            ))
        }
        return null
    })()

    const handleSaveStaff = async () => {
        if (!staffForm.name || !staffForm.username) {
            toast.error("Compila nome e username!")
            return
        }
        if (!editingStaff && !staffForm.password) {
            toast.error("Inserisci una password protetta")
            return
        }

        try {
            const payload: any = {
                restaurant_id: restaurantId,
                name: staffForm.name,
                username: `${restaurantName.toLowerCase().replace(/\s+/g, '-')}.${staffForm.username.toLowerCase().replace(/\s+/g, '')}`,
                is_active: staffForm.is_active,
                role: 'STAFF'
            }
            if (staffForm.password) {
                payload.password = staffForm.password
            }

            if (editingStaff) {
                await DatabaseService.updateStaff(editingStaff.id, payload)
                toast.success("Cameriere aggiornato con successo")
            } else {
                await DatabaseService.createStaff(payload)
                toast.success("Cameriere aggiunto!")
            }
            setShowStaffDialog(false)
            loadStaff()
        } catch (err: any) {
            console.error(err)
            toast.error("Errore durante il salvataggio o username già esistente")
        }
    }

    const handleDeleteStaff = async (id: string) => {
        if (confirm("Sei sicuro di voler rimuovere questo cameriere?")) {
            try {
                await DatabaseService.deleteStaff(id)
                toast.success("Cameriere rimosso")
                loadStaff()
            } catch (err) {
                toast.error("Impossibile eliminare")
            }
        }
    }

    const handleToggleStaffActive = async (staff: RestaurantStaff) => {
        try {
            await DatabaseService.updateStaff(staff.id, { is_active: !staff.is_active })
            toast.success(staff.is_active ? "Cameriere disattivato" : "Cameriere riattivato")
            loadStaff()
        } catch (err) {
            toast.error("Inpossibile aggiornare stato")
        }
    }

    const containerVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
        exit: { opacity: 0, y: -10, transition: { duration: 0.2 } }
    }

    return (
        <div className="pb-24 text-zinc-100">
            {/* Minimal header — matches the restaurant-name pattern used throughout the app */}
            <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 mb-8"
            >
                <Gear size={16} weight="fill" className="text-amber-500" />
                <h2 data-tour="settings-header" className="text-sm font-medium text-zinc-200 tracking-wide">
                    Impostazioni
                </h2>
                <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-600 font-bold ml-auto hidden sm:inline">
                    Configurazione locale
                </span>
            </motion.div>

            <Tabs defaultValue="general" className="w-full">
                {/* Flat tab bar — underline accent on active, no boxes. Mirrors the sidebar aesthetic horizontally. */}
                <TabsList className="w-full h-auto bg-transparent border-b border-white/[0.05] rounded-none p-0 mb-8 gap-6 overflow-x-auto no-scrollbar justify-start flex-nowrap">
                    {[
                        { value: 'general', icon: Storefront, label: 'Generale', color: 'amber' },
                        { value: 'costs', icon: Coins, label: 'Costi & Menu', color: 'amber' },
                        { value: 'staff', icon: Users, label: 'Staff', color: 'amber' },
                        { value: 'reservations', icon: CalendarCheck, label: 'Prenotazioni', color: 'amber' },
                        // Asporto entry — shown always so owner can toggle it on; header here doubles as the enable row.
                        { value: 'takeaway', icon: Package, label: 'Asporto', color: 'amber' },
                        { value: 'subscription', icon: CreditCard, label: 'Abbonamento', color: 'emerald' },
                        { value: 'printer', icon: Printer, label: 'Stampante', color: 'amber' },
                    ].map(({ value, icon: Icon, label, color }) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            data-settings-tab={value}
                            className={`group relative shrink-0 rounded-none px-0 py-3 -mb-px text-sm tracking-wide text-zinc-500 hover:text-zinc-200 transition-colors gap-2 font-semibold bg-transparent shadow-none focus-visible:outline-none focus-visible:ring-0 data-[state=active]:bg-transparent ${color === 'emerald'
                                ? 'data-[state=active]:text-emerald-400'
                                : 'data-[state=active]:text-amber-400'
                                }`}
                        >
                            <Icon size={16} weight="fill" className="opacity-60 group-data-[state=active]:opacity-100" />
                            <span className="whitespace-nowrap">{label}</span>
                            {/* underline accent — appears only on active */}
                            <span className={`absolute bottom-0 left-0 right-0 h-[2px] rounded-full opacity-0 group-data-[state=active]:opacity-100 transition-opacity ${color === 'emerald'
                                ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]'
                                : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                                }`} />
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* 1. SEZIONE GENERALE — Apple-style grouped list */}
                <TabsContent value="general">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-10 max-w-3xl"
                    >
                        {/* Profilo Attività */}
                        <section>
                            <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                                Profilo Attività
                                <InfoTip id="profilo" text="Il nome del ristorante viene mostrato ai clienti nel menù digitale QR, nelle ricevute e nella pagina di prenotazione online." />
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="px-4 py-4">
                                    <Label className="text-[13px] text-zinc-400 mb-2 block">Nome del ristorante</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={restaurantName}
                                            onChange={(e) => setRestaurantName(e.target.value)}
                                            className="bg-black/20 border-white/10 h-10 text-sm focus-visible:ring-amber-500/40"
                                            placeholder="Es. Ristorante Da Mario"
                                        />
                                        {restaurantNameDirty && (
                                            <Button
                                                onClick={saveRestaurantName}
                                                className="h-10 px-4 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium shrink-0"
                                            >
                                                Salva
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <p className="text-[13px] text-zinc-500 mt-2 px-1 leading-relaxed">
                                Appare sui menu digitali, sulle ricevute e nella pagina di prenotazione.
                            </p>
                        </section>

                        {/* Notifiche Sonore */}
                        <section>
                            <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                                Notifiche Sonore
                                <InfoTip id="suoni" text="Quando un cliente invia un ordine dal menù QR, il browser riproduce un suono di notifica. Tieni il volume del dispositivo attivo. Il suono funziona solo se la pagina è aperta e il browser ha il permesso audio." />
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                <div data-tour="settings-sound-toggle" className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-semibold text-white">Suono per le nuove comande</p>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Riproduce un avviso sonoro quando arriva un nuovo ordine. Tieni il volume alto in cucina.</p>
                                    </div>
                                    <Switch
                                        checked={soundEnabled}
                                        onCheckedChange={setSoundEnabled}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>
                                {soundEnabled && (
                                    <div className="flex items-center justify-between gap-4 px-5 py-4 animate-in slide-in-from-top-2">
                                        <div className="min-w-0">
                                            <p className="text-[15px] font-semibold text-white">Suono da riprodurre</p>
                                            <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Scegli il tono e premi l'icona per ascoltarlo.</p>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <Select value={selectedSound} onValueChange={(val) => setSelectedSound(val as SoundType)}>
                                                <SelectTrigger className="h-9 w-[180px] bg-black/20 border-white/10 text-sm">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                                                    <SelectItem value="classic">Classico (Campanello)</SelectItem>
                                                    <SelectItem value="chime">Moderno (Chime)</SelectItem>
                                                    <SelectItem value="soft">Sottile (Delicato)</SelectItem>
                                                    <SelectItem value="kitchen-bell">Cucina (Forte)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9 border-white/10 bg-black/20 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30"
                                                onClick={async () => {
                                                    const { soundManager } = await import('../utils/SoundManager')
                                                    soundManager.play(selectedSound)
                                                }}
                                            >
                                                <SpeakerHigh size={15} weight="duotone" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Guida & Setup */}
                        {(onRestartTour || onRestartSetup) && (
                            <section>
                                <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                    Guida & Setup
                                </h3>
                                <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                    {onRestartTour && (
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Guida interattiva</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Naviga un sito demo con dati di esempio e scopri tutte le funzioni.</p>
                                            </div>
                                            <Button
                                                data-tour="settings-demo-btn"
                                                onClick={onRestartTour}
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-3 text-xs border-white/10 text-zinc-200 hover:bg-white/[0.04] hover:text-white shrink-0"
                                            >
                                                <Sparkle size={12} weight="fill" className="mr-1.5 text-amber-400" />
                                                Avvia Demo
                                            </Button>
                                        </div>
                                    )}
                                    {onRestartSetup && (
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Configurazione guidata</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Segui i passaggi per configurare categorie, piatti, tavoli e impostazioni.</p>
                                            </div>
                                            <Button
                                                onClick={onRestartSetup}
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-3 text-xs border-white/10 text-zinc-200 hover:bg-white/[0.04] hover:text-white shrink-0"
                                            >
                                                Avvia
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* Assistenza */}
                        <section>
                            <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                Assistenza
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-semibold text-white">Hai bisogno di aiuto?</p>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Il nostro supporto è a disposizione.</p>
                                    </div>
                                    <a
                                        href="tel:+393517570155"
                                        className="h-8 px-3 inline-flex items-center rounded-md text-xs font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 shrink-0 transition-colors"
                                    >
                                        +39 351 757 0155
                                    </a>
                                </div>
                            </div>
                        </section>

                    </motion.div>
                </TabsContent>

                {/* 2. SEZIONE COSTI & MENU — Apple-style grouped list */}
                <TabsContent value="costs">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-10 max-w-3xl"
                    >
                        {/* All You Can Eat */}
                        <section data-tour="settings-ayce">
                            <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                                All You Can Eat
                                <InfoTip id="ayce" text="L'All You Can Eat attiva una modalità a prezzo fisso: il cliente paga un importo unico e può ordinare liberamente dal menù. Puoi impostare un limite massimo di piatti per persona. Supporta programmazione settimanale con prezzi diversi per ogni giorno della settimana." />
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="px-4 py-4">
                                    <WeeklyScheduleEditor
                                        type="ayce"
                                        schedule={weeklyAyce || {
                                            enabled: ayceEnabled,
                                            defaultPrice: Number(aycePrice) || 0,
                                            defaultMaxOrders: Number(ayceMaxOrders) || 0,
                                            useWeeklySchedule: false,
                                            schedule: {}
                                        }}
                                        onChange={(schedule) => {
                                            setWeeklyAyce(schedule as any)
                                            setAyceEnabled(schedule.enabled)
                                            setAycePrice(schedule.defaultPrice)
                                        }}
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Coperto */}
                        <section data-tour="settings-coperto">
                            <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                                Coperto
                                <InfoTip id="coperto" text="Il Coperto è un costo aggiuntivo applicato automaticamente per ogni persona al tavolo. Viene aggiunto al conto finale. Supporta programmazione settimanale con prezzi diversi per giorno." />
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="px-4 py-4">
                                    <WeeklyScheduleEditor
                                        type="coperto"
                                        schedule={weeklyCoperto || {
                                            enabled: copertoEnabled,
                                            defaultPrice: Number(copertoPrice) || 0,
                                            useWeeklySchedule: false,
                                            schedule: {}
                                        }}
                                        onChange={(schedule) => {
                                            setWeeklyCoperto(schedule as any)
                                            if (setCopertoEnabled) setCopertoEnabled(schedule.enabled)
                                            if (setCopertoPrice) setCopertoPrice(schedule.defaultPrice)
                                        }}
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Opzioni Menu */}
                        <section>
                            <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                Opzioni Menu
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                {/* Suddivisione in Portate */}
                                <div data-tour="settings-course-split" className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[15px] font-semibold text-white">Suddivisione in portate</p>
                                            <InfoTip id="portate" text="Quando attiva, il cliente sceglie per ogni piatto in quale portata vuole riceverlo (Primo, Secondo, ecc.). La cucina riceve gli ordini raggruppati per portata. In modalità cameriere, il cameriere assegna la portata al momento dell'ordine." />
                                        </div>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Il cliente sceglie l'ordine di uscita (Antipasti, Primi, Secondi).</p>
                                    </div>
                                    <Switch
                                        checked={courseSplittingEnabled}
                                        onCheckedChange={(val) => {
                                            setCourseSplittingEnabled(val)
                                            updateCourseSplitting(val)
                                        }}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>

                                {/* Suggerimenti Portate Successive */}
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[15px] font-semibold text-white">Suggerimenti portate</p>
                                            <InfoTip id="suggestions" text="Dopo che il cliente aggiunge un piatto al carrello, il sistema suggerisce automaticamente le categorie successive (es. se ordina un Primo, propone Secondi, Contorni, Dolci, Bevande). L'ordine segue quello delle categorie in Gestione Menu. Se la divisione in portate è attiva, il piatto suggerito verrà inserito automaticamente nella portata successiva." />
                                        </div>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Propone le portate successive dopo ogni ordine.</p>
                                    </div>
                                    <Switch
                                        checked={courseSuggestionsEnabled}
                                        onCheckedChange={(val) => {
                                            setCourseSuggestionsEnabled(val)
                                            updateCourseSuggestions(val)
                                        }}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>

                                {/* Menu Solo Visualizzazione */}
                                <div data-tour="settings-viewonly" className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[15px] font-semibold text-white">Menu solo visualizzazione</p>
                                            <InfoTip id="viewonly" text="Utile se vuoi usare Minthi solo come menù digitale senza gestione ordini. I clienti scansionano il QR e vedono piatti e prezzi, ma non possono ordinare. I QR code mostreranno 'Scansiona per visualizzare il menù' invece di 'Scansiona per ordinare'." />
                                        </div>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">I clienti visualizzano il menù senza poter ordinare.</p>
                                    </div>
                                    <Switch
                                        checked={viewOnlyMenuEnabled}
                                        onCheckedChange={setViewOnlyMenuEnabled}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>

                                {/* Tempo Medio di Cottura */}
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[15px] font-semibold text-white">Tempo medio di cottura</p>
                                            <InfoTip id="cooktime" text="Minthi calcola automaticamente il tempo medio di preparazione di ogni piatto basandosi sugli ordini degli ultimi 2 mesi (servono almeno 3 ordini per piatto). Il tempo viene mostrato sotto il nome del piatto nel menù cliente e nella dashboard cameriere." />
                                        </div>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Mostra il tempo medio di preparazione sotto ogni piatto.</p>
                                    </div>
                                    <Switch
                                        checked={showCookingTimes}
                                        onCheckedChange={setShowCookingTimes}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>
                            </div>
                        </section>
                    </motion.div>
                </TabsContent>

                {/* 3. SEZIONE STAFF — Apple-style grouped list */}
                <TabsContent value="staff">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-10 max-w-3xl"
                    >
                        {/* Modalità Cameriere */}
                        <section>
                            <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                                Modalità Cameriere
                                <InfoTip id="staff" text="Crea un account per ogni cameriere. Il cameriere accede dalla pagina di login con le sue credenziali e vede solo i tavoli a lui assegnati, gli ordini in arrivo e può segnare i piatti come serviti. Assegna i tavoli ai camerieri dalla sezione Tavoli nella dashboard." />
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-semibold text-white">Abilita gestione camerieri</p>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Crea credenziali dedicate e assegna tavoli al personale di sala.</p>
                                    </div>
                                    <Switch
                                        data-tour="settings-waiter-toggle"
                                        checked={waiterModeEnabled}
                                        onCheckedChange={setWaiterModeEnabled}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>

                                {waiterModeEnabled && (
                                    <>
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Permessi di pagamento</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">I camerieri possono segnare i tavoli come pagati dalla loro dashboard.</p>
                                            </div>
                                            <Switch
                                                checked={allowWaiterPayments}
                                                onCheckedChange={setAllowWaiterPayments}
                                                className="data-[state=checked]:bg-amber-500 shrink-0"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Salta passaggio cameriere</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Quando la cucina segna un piatto pronto, risulta automaticamente servito al tavolo. Utile in locali piccoli senza camerieri dedicati.</p>
                                            </div>
                                            <Switch
                                                checked={autoDeliverReady}
                                                onCheckedChange={async (checked) => {
                                                    try {
                                                        await DatabaseService.updateRestaurant({ id: restaurantId, auto_deliver_ready_dishes: checked })
                                                        setAutoDeliverReady(checked)
                                                    } catch (e) {
                                                        console.error('Error updating auto_deliver_ready_dishes:', e)
                                                    }
                                                }}
                                                className="data-[state=checked]:bg-amber-500 shrink-0"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>

                        {/* Credenziali Camerieri */}
                        {waiterModeEnabled && (
                            <section>
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <h3 className="text-[15px] font-bold text-white tracking-wide uppercase">
                                        Credenziali Camerieri
                                    </h3>
                                    <Button
                                        data-tour="settings-add-staff"
                                        onClick={() => {
                                            setEditingStaff(null)
                                            setStaffForm({ name: '', username: '', password: '', is_active: true })
                                            setShowStaffDialog(true)
                                        }}
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs border-white/10 text-zinc-200 hover:bg-white/[0.04] hover:text-white gap-1.5"
                                    >
                                        <UserPlus size={13} /> Aggiungi
                                    </Button>
                                </div>

                                <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                    {isStaffLoading ? (
                                        <p className="text-zinc-500 text-sm px-4 py-6 text-center">Caricamento in corso...</p>
                                    ) : staffList.length === 0 ? (
                                        <div className="text-center px-4 py-10">
                                            <UserMinus className="mx-auto h-10 w-10 text-zinc-600 mb-3" />
                                            <p className="text-sm text-zinc-400">Nessun cameriere configurato</p>
                                            <p className="text-[13px] text-zinc-500 mt-1">Clicca "Aggiungi" per creare il primo account.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-white/[0.05]">
                                            {staffList.map(staff => (
                                                <div key={staff.id} className={`flex items-center gap-3 px-4 py-3 ${!staff.is_active ? 'opacity-50' : ''}`}>
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${staff.is_active ? 'bg-amber-500/15 text-amber-300' : 'bg-zinc-800 text-zinc-500'}`}>
                                                        {staff.name.substring(0, 1).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-zinc-100 truncate">{staff.name}</p>
                                                        <p className="text-[13px] font-mono text-zinc-500 mt-0.5 truncate">{staff.username}</p>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0">
                                                        <button
                                                            title={staff.is_active ? 'Disattiva accesso' : 'Riattiva accesso'}
                                                            className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${staff.is_active
                                                                ? 'text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/10'
                                                                : 'text-red-400/60 hover:text-red-300 hover:bg-red-500/10'
                                                                }`}
                                                            onClick={() => handleToggleStaffActive(staff)}
                                                        >
                                                            {staff.is_active ? <Eye size={14} weight="duotone" /> : <EyeSlash size={14} weight="duotone" />}
                                                        </button>
                                                        <button
                                                            className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                                                            onClick={() => {
                                                                setEditingStaff(staff)
                                                                const baseUsername = staff.username.split('.')[1] || staff.username
                                                                setStaffForm({ name: staff.name, username: baseUsername, password: '', is_active: staff.is_active })
                                                                setShowStaffDialog(true)
                                                            }}
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button
                                                            className="w-8 h-8 rounded-md flex items-center justify-center text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                            onClick={() => handleDeleteStaff(staff.id)}
                                                        >
                                                            <TrashIcon size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* Modale Aggiunta/Modifica Cameriere */}
                        <Dialog open={showStaffDialog} onOpenChange={setShowStaffDialog}>
                            <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-white/10 text-white">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-bold text-amber-500">{editingStaff ? 'Modifica Cameriere' : 'Nuovo Cameriere'}</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-5 py-4">
                                    <div className="space-y-2">
                                        <Label className="text-base">Nome di Battesimo</Label>
                                        <Input
                                            placeholder="Es. Mario"
                                            value={staffForm.name}
                                            onChange={(e) => setStaffForm(prev => ({ ...prev, name: e.target.value }))}
                                            className="bg-black border-white/10 h-12 text-base"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-base">Username</Label>
                                        <div className="flex rounded-md overflow-hidden ring-1 ring-white/10 focus-within:ring-amber-500">
                                            <span className="bg-zinc-900 border-r border-white/10 px-3 flex items-center text-base text-zinc-400 font-mono">
                                                {restaurantName.toLowerCase().replace(/\s+/g, '-') + '.'}
                                            </span>
                                            <Input
                                                placeholder="mario"
                                                value={staffForm.username}
                                                onChange={(e) => setStaffForm(prev => ({ ...prev, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }))}
                                                className="bg-black border-0 rounded-none focus-visible:ring-0 h-12 text-base font-mono"
                                            />
                                        </div>
                                        <p className="text-sm text-zinc-500">Sarà usato per il login.</p>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-base">Password {editingStaff && <span className="text-zinc-500 font-normal">(lascia vuoto per non cambiare)</span>}</Label>
                                        <Input
                                            type="text"
                                            placeholder="Inserisci password complessa"
                                            value={staffForm.password}
                                            onChange={(e) => setStaffForm(prev => ({ ...prev, password: e.target.value }))}
                                            className="bg-black border-white/10 h-12 text-base"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4 bg-black/20 p-4 rounded-lg border border-white/5 mt-2">
                                        <Switch
                                            checked={staffForm.is_active}
                                            onCheckedChange={(val) => setStaffForm(prev => ({ ...prev, is_active: val }))}
                                            id="active-switch"
                                            className="scale-125"
                                        />
                                        <Label htmlFor="active-switch" className="cursor-pointer text-base">Cameriere Attivo</Label>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 mt-6">
                                    <Button variant="ghost" className="text-base py-6 px-6" onClick={() => setShowStaffDialog(false)}>Annulla</Button>
                                    <Button onClick={handleSaveStaff} className="bg-amber-600 hover:bg-amber-700 text-white text-base py-6 px-6">
                                        <Save size={20} className="mr-2" /> Salva Credenziali
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>

                    </motion.div>
                </TabsContent>

                {/* 4. SEZIONE PRENOTAZIONI — Apple-style grouped list */}
                <TabsContent value="reservations">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-10 max-w-3xl"
                    >
                        {/* Turnazione Tavoli */}
                        <section>
                            <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                                Turnazione Tavoli
                                <InfoTip id="turnazione" text="La durata della prenotazione determina per quanto tempo un tavolo resta occupato nel calendario prenotazioni. Dopo questo periodo il tavolo torna disponibile per nuove prenotazioni. Es. con 2 ore, una prenotazione alle 20:00 libera il tavolo alle 22:00." />
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-semibold text-white">Durata standard prenotazione</p>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Quanto tempo il tavolo resta occupato nel calendario.</p>
                                    </div>
                                    <Select
                                        data-tour="settings-turnover"
                                        value={reservationDuration.toString()}
                                        onValueChange={(val) => setReservationDuration(parseInt(val))}
                                    >
                                        <SelectTrigger className="h-9 w-[170px] bg-black/20 border-white/10 text-sm shrink-0">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                                            <SelectItem value="60">1 Ora</SelectItem>
                                            <SelectItem value="90">1 h 30 min</SelectItem>
                                            <SelectItem value="120">2 Ore (Standard)</SelectItem>
                                            <SelectItem value="150">2 h 30 min</SelectItem>
                                            <SelectItem value="180">3 Ore</SelectItem>
                                            <SelectItem value="240">4 Ore</SelectItem>
                                            <SelectItem value="9999">Fino a fine servizio</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </section>

                        {/* Prenotazioni Pubbliche via QR */}
                        <section>
                            <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                                Prenotazioni Pubbliche
                                <InfoTip id="qr-prenotazioni" text="I clienti possono prenotare scannerizzando un QR code dedicato (diverso da quello dei tavoli). Scelgono data, ora, numero persone e sala. Le prenotazioni appaiono nel calendario nella sezione Prenotazioni. Puoi disattivare temporaneamente se il ristorante è pieno." />
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-semibold text-white">Abilita prenotazioni da QR</p>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">I clienti prenotano da QR dedicato. Se disattivato, il QR mostra un avviso.</p>
                                    </div>
                                    <Switch
                                        data-tour="settings-public-booking"
                                        checked={enablePublicReservations}
                                        onCheckedChange={setEnablePublicReservations}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <p className={`text-sm font-medium ${enablePublicReservations ? 'text-zinc-100' : 'text-zinc-500'}`}>Consenti scelta sala</p>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Il cliente può indicare preferenze sulla zona (es. Terrazza, Interno).</p>
                                    </div>
                                    <Switch
                                        disabled={!enablePublicReservations}
                                        checked={enableReservationRoomSelection && enablePublicReservations}
                                        onCheckedChange={setEnableReservationRoomSelection}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Orari di Servizio */}
                        <section>
                            <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                Orari di Servizio
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="px-4 py-4">
                                    <WeeklyServiceHoursEditor
                                        schedule={weeklyServiceHours || {
                                            enabled: true,
                                            useWeeklySchedule: false,
                                            schedule: {}
                                        }}
                                        onChange={(schedule) => setWeeklyServiceHours(schedule)}
                                        defaultLunchStart={lunchTimeStart}
                                        defaultDinnerStart={dinnerTimeStart}
                                    />
                                </div>
                            </div>
                        </section>
                    </motion.div>
                </TabsContent>

                {/* SEZIONE ASPORTO — Apple-style grouped list */}
                <TabsContent value="takeaway">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-10 max-w-3xl"
                    >
                        {/* Servizio Asporto — toggle principale */}
                        <section>
                            <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                Servizio Asporto
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[15px] font-semibold text-white">Abilita asporto</p>
                                            {takeawayEnabled && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                                                    <span className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                                    Attivo
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">
                                            {takeawayEnabled
                                                ? 'I clienti ordinano dal QR pubblico e ritirano al bancone.'
                                                : 'Attiva per permettere ordini da asporto con QR code e numeri di ritiro.'}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={takeawayEnabled}
                                        disabled={savingTakeaway}
                                        onCheckedChange={async (v) => {
                                            const previous = takeawayEnabled
                                            setTakeawayEnabled(v)
                                            const ok = await saveTakeawaySettings({ takeaway_enabled: v })
                                            if (!ok) setTakeawayEnabled(previous)
                                        }}
                                        className="data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                </div>
                            </div>
                            {!takeawayEnabled && (
                                <p className="text-[13px] text-zinc-500 mt-2 px-1 leading-relaxed">
                                    Attiva l'asporto per sbloccare menu pubblico, numeri di ritiro, display sala d'attesa e pannello cassa asporto.
                                </p>
                            )}
                        </section>

                        {/* Configurazioni visibili solo quando attivo */}
                        {takeawayEnabled && (
                            <>
                                {/* Modalità servizio */}
                                <section>
                                    <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                        Modalità servizio
                                    </h3>
                                    <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Servizio al tavolo</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Permetti ai clienti di ordinare al tavolo tramite QR. Disattiva se gestisci solo asporto.</p>
                                            </div>
                                            <Switch
                                                checked={dineInEnabled}
                                                disabled={savingTakeaway}
                                                onCheckedChange={async (v) => {
                                                    const previous = dineInEnabled
                                                    setDineInEnabled(v)
                                                    const ok = await saveTakeawaySettings({ dine_in_enabled: v })
                                                    if (!ok) setDineInEnabled(previous)
                                                }}
                                                className="data-[state=checked]:bg-amber-500 shrink-0"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Pagamento anticipato obbligatorio</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Il cliente deve pagare con carta prima che l'ordine entri in cucina. Niente "paga al ritiro".</p>
                                            </div>
                                            <Switch
                                                checked={takeawayRequireStripe}
                                                disabled={savingTakeaway || (!stripeReadyForTakeaway && !takeawayRequireStripe)}
                                                onCheckedChange={async (v) => {
                                                    const previous = takeawayRequireStripe
                                                    setTakeawayRequireStripe(v)
                                                    const ok = await saveTakeawaySettings({ takeaway_require_stripe: v })
                                                    if (!ok) setTakeawayRequireStripe(previous)
                                                }}
                                                className="data-[state=checked]:bg-amber-500 shrink-0"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Stampa automatica comande</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">
                                                    Stampa la comanda asporto in cucina appena arriva. Richiede stampante collegata.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={takeawayAutoPrint}
                                                disabled={savingTakeaway}
                                                onCheckedChange={async (v) => {
                                                    const previous = takeawayAutoPrint
                                                    setTakeawayAutoPrint(v)
                                                    const ok = await saveTakeawaySettings({ takeaway_auto_print: v })
                                                    if (!ok) setTakeawayAutoPrint(previous)
                                                }}
                                                className="data-[state=checked]:bg-amber-500 shrink-0"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Chiusura automatica ordini pronti</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">
                                                    Gli ordini già pagati si chiudono da soli 2 minuti dopo "Segna pronto". Salta il passaggio "Consegna ora".
                                                </p>
                                            </div>
                                            <Switch
                                                checked={takeawayAutoPickupEnabled}
                                                disabled={savingTakeaway}
                                                onCheckedChange={async (v) => {
                                                    const previous = takeawayAutoPickupEnabled
                                                    setTakeawayAutoPickupEnabled(v)
                                                    const ok = await saveTakeawaySettings({ takeaway_auto_pickup_enabled: v })
                                                    if (!ok) setTakeawayAutoPickupEnabled(previous)
                                                }}
                                                className="data-[state=checked]:bg-amber-500 shrink-0"
                                            />
                                        </div>
                                        <div className="px-5 py-4">
                                            <div className="mb-2">
                                                <p className="text-[15px] font-semibold text-white">Tetto massimo ordini all'ora</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">
                                                    Quando viene raggiunto, il menù pubblico mostra "ordini sospesi" e ripristina automaticamente l'ora successiva. Lascia vuoto per nessun limite.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={500}
                                                    value={takeawayMaxOrdersPerHour}
                                                    onChange={e => {
                                                        const value = e.target.value
                                                        if (!value) return setTakeawayMaxOrdersPerHour('')
                                                        setTakeawayMaxOrdersPerHour(Math.max(1, Math.min(500, Number(value) || 1)))
                                                    }}
                                                    onBlur={() => saveTakeawaySettings({
                                                        takeaway_max_orders_per_hour: takeawayMaxOrdersPerHour === '' ? null : Number(takeawayMaxOrdersPerHour)
                                                    })}
                                                    placeholder="Nessun limite"
                                                    className="bg-black/20 border-white/10 h-9 w-40 text-sm"
                                                />
                                                <span className="text-[13px] text-zinc-500">ordini/ora</span>
                                            </div>
                                        </div>
                                    </div>
                                    {!stripeReadyForTakeaway && (
                                        <div className="mt-3 flex items-start gap-2.5 px-1">
                                            <WarningCircle size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
                                            <p className="text-[12px] text-amber-300/90 leading-relaxed">
                                                Per rendere il pagamento anticipato obbligatorio devi prima attivare i pagamenti online e completare Stripe Connect nella sezione <strong className="text-amber-200">Abbonamento e pagamenti</strong>.
                                            </p>
                                        </div>
                                    )}
                                </section>

                                {/* Tempi & avvisi */}
                                <section>
                                    <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                        Tempi & avvisi
                                    </h3>
                                    <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                        <div className="flex items-start justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Stima tempi di preparazione</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">
                                                    Calcolata in automatico dai tempi reali degli ordini asporto recenti. Più ordini fai, più la stima diventa precisa.
                                                </p>
                                            </div>
                                            <div className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-200">
                                                Auto
                                            </div>
                                        </div>
                                        <div className="px-5 py-4">
                                            <div className="mb-2">
                                                <p className="text-[15px] font-semibold text-white">Istruzioni per il ritiro</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Mostrate al cliente dopo la conferma. Esempio: dove ritirare, orario apertura, contatti.</p>
                                            </div>
                                            <Input
                                                value={takeawayPickupNotice}
                                                maxLength={200}
                                                onChange={e => setTakeawayPickupNotice(e.target.value)}
                                                onBlur={() => saveTakeawaySettings({ takeaway_pickup_notice: takeawayPickupNotice })}
                                                placeholder="Es. Ingresso posteriore · Suonare il campanello"
                                                className="bg-black/20 border-white/10 h-9 text-sm"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </>
                        )}
                    </motion.div>
                </TabsContent>

                {/* 5. SEZIONE ABBONAMENTO STRIPE E PAGAMENTI CLIENTI — Apple-style */}
                <TabsContent value="subscription">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-10 max-w-3xl"
                    >
                        {/* Pagamenti al tavolo */}
                        <section>
                            <h3 className="text-[15px] font-bold text-white mb-3 px-1 tracking-wide uppercase flex items-center gap-2">
                                Pagamenti al Tavolo
                                <InfoTip id="pagamenti" text="Attivando i pagamenti, i clienti possono pagare il conto con carta direttamente dal menù QR. Devi collegare un account Stripe per ricevere i pagamenti sul tuo conto bancario. I soldi arrivano automaticamente. Ricordati di emettere lo scontrino fiscale separatamente." />
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                <div className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[15px] font-semibold text-white">Accetta pagamenti online</p>
                                            {stripePaymentsEnabled && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-violet-300 font-medium">
                                                    <span className="w-1 h-1 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                                                    Attivo
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">I clienti pagano dal menu QR — i soldi arrivano sul tuo conto Stripe.</p>
                                    </div>
                                    <Switch
                                        data-tour="settings-stripe-toggle"
                                        checked={stripePaymentsEnabled}
                                        onCheckedChange={async (checked) => {
                                            try {
                                                await DatabaseService.toggleStripePayments(restaurantId, checked)
                                                setStripePaymentsEnabled(checked)
                                                toast.success(checked ? 'Pagamenti online attivati' : 'Pagamenti online disattivati')
                                            } catch (e: any) {
                                                toast.error('Errore: ' + e.message)
                                            }
                                        }}
                                        className="data-[state=checked]:bg-violet-500 shrink-0"
                                    />
                                </div>

                                {stripePaymentsEnabled && (
                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                {subscriptionInfo?.stripe_connect_enabled ? (
                                                    <CheckCircle weight="fill" size={13} className="text-emerald-400 shrink-0" />
                                                ) : subscriptionInfo?.stripe_connect_account_id ? (
                                                    <Warning weight="fill" size={13} className="text-amber-400 shrink-0" />
                                                ) : (
                                                    <Buildings size={13} className="text-zinc-500 shrink-0" />
                                                )}
                                                <p className="text-[15px] font-semibold text-white">
                                                    Account Stripe Connect
                                                </p>
                                            </div>
                                            <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">
                                                {subscriptionInfo?.stripe_connect_enabled
                                                    ? 'Collegato · i pagamenti arrivano sul tuo conto.'
                                                    : subscriptionInfo?.stripe_connect_account_id
                                                        ? 'Stripe sta verificando i tuoi dati aziendali.'
                                                        : 'Collega il tuo account per ricevere pagamenti.'}
                                            </p>
                                        </div>
                                        <Button
                                            onClick={handleConnectOnboarding}
                                            disabled={loadingConnectOnboarding}
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 h-8 px-3 text-xs border-white/10 text-zinc-200 hover:bg-white/[0.04] hover:text-white gap-1.5"
                                        >
                                            {loadingConnectOnboarding ? (
                                                <ArrowClockwise className="animate-spin" size={12} />
                                            ) : (
                                                <ArrowSquareOut size={12} />
                                            )}
                                            {subscriptionInfo?.stripe_connect_enabled ? 'Dashboard' : subscriptionInfo?.stripe_connect_account_id ? 'Stato' : 'Collega'}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {stripePaymentsEnabled && (
                                <div className="mt-3 px-1 space-y-1.5">
                                    <button
                                        onClick={() => setShowStripeGuide(true)}
                                        className="inline-flex items-center gap-1.5 text-[12px] text-violet-300 hover:text-violet-200 transition-colors"
                                    >
                                        <Info size={12} weight="fill" />
                                        <span className="underline underline-offset-4 decoration-violet-500/40 hover:decoration-violet-400">Come funziona il pagamento con Stripe</span>
                                    </button>
                                    {subscriptionInfo?.stripe_connect_enabled && (
                                        <p className="text-[12px] text-amber-300/80 leading-relaxed">
                                            ⚠ Il pagamento digitale non sostituisce lo scontrino fiscale.
                                        </p>
                                    )}
                                </div>
                            )}

                                        {/* Stripe Payment Guide Dialog */}
                                        <Dialog open={showStripeGuide} onOpenChange={setShowStripeGuide}>
                                            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-zinc-950 border-zinc-800">
                                                <DialogHeader>
                                                    <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                                                        📖 Guida Completa — Pagamenti Stripe
                                                    </DialogTitle>
                                                </DialogHeader>
                                                <div className="space-y-5 pt-2">

                                                    {/* Step 1 */}
                                                    <div className="space-y-2">
                                                        <h3 className="text-violet-400 font-bold flex items-center gap-2">
                                                            <span className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold">1</span>
                                                            Collegamento Account Stripe
                                                        </h3>
                                                        <div className="pl-8 space-y-1.5 text-zinc-400 text-[15px] leading-relaxed">
                                                            <p>• Clicca <span className="text-white font-medium">"Collega Account Stripe ↗"</span> nelle impostazioni pagamenti</p>
                                                            <p>• Si apre una pagina Stripe in una nuova scheda</p>
                                                            <p>• Compila: dati aziendali, partita IVA, IBAN del conto corrente, documento d'identità</p>
                                                            <p>• Stripe verifica i dati (può richiedere qualche ora)</p>
                                                            <p>• Quando tutto è verificato, lo stato diventa <span className="text-emerald-400 font-medium">"Account collegato"</span></p>
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-zinc-800" />

                                                    {/* Step 2 */}
                                                    <div className="space-y-2">
                                                        <h3 className="text-violet-400 font-bold flex items-center gap-2">
                                                            <span className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold">2</span>
                                                            Come paga il cliente
                                                        </h3>
                                                        <div className="pl-8 space-y-1.5 text-zinc-400 text-[15px] leading-relaxed">
                                                            <p>• Il cliente apre il menù dal QR Code del tavolo</p>
                                                            <p>• Ordina i piatti e quando è pronto, clicca <span className="text-white font-medium">"Paga Online"</span> nel tab "I miei ordini"</p>
                                                            <p>• Sceglie la modalità: <span className="text-white">totale</span>, <span className="text-white">diviso alla romana</span> o <span className="text-white">per piatto</span></p>
                                                            <p>• Inserisce i dati della carta nella pagina sicura di Stripe</p>
                                                            <p>• Conferma il pagamento → vede la schermata <span className="text-emerald-400">"Pagamento completato!"</span></p>
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-zinc-800" />

                                                    {/* Step 3 */}
                                                    <div className="space-y-2">
                                                        <h3 className="text-violet-400 font-bold flex items-center gap-2">
                                                            <span className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold">3</span>
                                                            Notifica al ristorante
                                                        </h3>
                                                        <div className="pl-8 space-y-1.5 text-zinc-400 text-[15px] leading-relaxed">
                                                            <p>• In <span className="text-white font-medium">Gestione Tavoli</span> il tavolo diventa <span className="text-purple-400 font-medium">viola pulsante</span> con badge "💳 Pagato Online"</p>
                                                            <p>• Appare un toast: <span className="text-white">"💳 Tavolo X ha pagato online! €XX.XX"</span></p>
                                                            <p>• Il ristoratore <span className="text-white font-medium">emette lo scontrino fiscale</span> dal proprio registratore di cassa</p>
                                                            <p>• Poi clicca <span className="text-emerald-400 font-medium">"Conferma Scontrino"</span> per registrare l'avvenuta emissione</p>
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-zinc-800" />

                                                    {/* Step 4 */}
                                                    <div className="space-y-2">
                                                        <h3 className="text-violet-400 font-bold flex items-center gap-2">
                                                            <span className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold">4</span>
                                                            Storico pagamenti
                                                        </h3>
                                                        <div className="pl-8 space-y-1.5 text-zinc-400 text-[15px] leading-relaxed">
                                                            <p>• In <span className="text-white font-medium">Gestione Tavoli → Storico</span> trovi tutti i tavoli passati</p>
                                                            <p>• Filtri disponibili: <span className="text-amber-400">🔴 Scontrino da fare</span> / <span className="text-emerald-400">✅ Scontrino fatto</span></p>
                                                            <p>• I tavoli pagati con Stripe senza scontrino confermato sono evidenziati in <span className="text-amber-400">ambra</span></p>
                                                            <p>• Puoi confermare lo scontrino anche dallo storico</p>
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-zinc-800" />

                                                    {/* Step 5 */}
                                                    <div className="space-y-2">
                                                        <h3 className="text-violet-400 font-bold flex items-center gap-2">
                                                            <span className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold">5</span>
                                                            Dashboard Stripe
                                                        </h3>
                                                        <div className="pl-8 space-y-1.5 text-zinc-400 text-[16px] leading-relaxed">
                                                            <p>• Clicca <span className="text-white font-medium">"Apri Dashboard Stripe ↗"</span> per accedere al tuo pannello</p>
                                                            <p>• Lì trovi: <span className="text-white">saldo</span>, <span className="text-white">elenco transazioni</span>, <span className="text-white">fatture delle commissioni</span>, <span className="text-white">payout (bonifici ricevuti)</span></p>
                                                            <p>• Puoi configurare la frequenza dei bonifici dalla Dashboard Stripe</p>
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-zinc-800" />

                                                    {/* Step 6 */}
                                                    <div className="space-y-2">
                                                        <h3 className="text-amber-400 font-bold flex items-center gap-2">
                                                            <span className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold">6</span>
                                                            Obbligo fiscale — Agenzia delle Entrate
                                                        </h3>
                                                        <div className="pl-8 space-y-1.5 text-zinc-400 text-[15px] leading-relaxed">
                                                            <p className="text-amber-400/80 font-medium">⚠️ Il pagamento Stripe NON sostituisce lo scontrino fiscale!</p>
                                                            <p>Il ristoratore è obbligato a emettere regolare <span className="text-white font-medium">scontrino fiscale</span> o <span className="text-white font-medium">fattura</span> per ogni transazione, anche se il cliente ha pagato con carta online.</p>
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-zinc-800" />

                                                    {/* Step 7 */}
                                                    <div className="space-y-2">
                                                        <h3 className="text-amber-400 font-bold flex items-center gap-2">
                                                            <span className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold">7</span>
                                                            Collegamento Stripe → Registratore Telematico (AdE)
                                                        </h3>
                                                        <div className="pl-8 space-y-1.5 text-zinc-400 text-[15px] leading-relaxed">
                                                            <p>Dal <span className="text-white font-medium">1° gennaio 2026</span> è obbligatorio collegare ogni strumento di pagamento elettronico al tuo Registratore Telematico (RT) sul portale dell'Agenzia delle Entrate.</p>
                                                            <p className="text-zinc-300 font-semibold mt-2">Come fare:</p>
                                                            <p>1. Accedi al portale <span className="text-white">Fatture e Corrispettivi</span> dell'AdE con <span className="text-white">SPID</span> o <span className="text-white">CIE</span></p>
                                                            <p>2. Vai in <span className="text-white">Registratori Telematici → Gestione strumenti di pagamento elettronico</span></p>
                                                            <p>3. Trova la <span className="text-white">matricola del tuo RT</span> (è scritta sull'adesivo del registratore di cassa o nel libretto)</p>
                                                            <p>4. Abbina la matricola RT allo strumento di pagamento Stripe (Stripe ha già comunicato i suoi dati all'AdE come fornitore di servizi di pagamento)</p>
                                                            <p>5. <span className="text-white">Conferma l'associazione</span> — fatto!</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 p-4 rounded-xl bg-violet-500/5 border border-violet-500/15">
                                                        <p className="text-sm text-zinc-500 leading-relaxed">
                                                            💡 <span className="text-violet-400 font-medium">Hai dubbi?</span> Contatta il tuo commercialista per gli aspetti fiscali specifici della tua attività. MINTHI gestisce la parte tecnologica, la responsabilità fiscale resta del ristoratore.
                                                        </p>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                        </section>

                        {/* Abbonamento MINTHI */}
                        <section data-tour="settings-subscription">
                            <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                Abbonamento MINTHI
                            </h3>
                            {subscriptionInfo?.stripe_subscription_id ? (
                                <>
                                    <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                        {/* Stato + piano */}
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-[15px] font-semibold text-white">Stato abbonamento</p>
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${['active','trialing'].includes(subscriptionInfo.subscription_status || '') && !subscriptionInfo.subscription_cancel_at
                                                        ? 'text-emerald-400'
                                                        : ['active','trialing'].includes(subscriptionInfo.subscription_status || '') && subscriptionInfo.subscription_cancel_at
                                                            ? 'text-amber-400'
                                                            : subscriptionInfo.subscription_status === 'past_due'
                                                                ? 'text-red-400'
                                                                : 'text-zinc-500'
                                                        }`}>
                                                        {['active','trialing'].includes(subscriptionInfo.subscription_status || '') && !subscriptionInfo.subscription_cancel_at && <><span className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" />Attivo</>}
                                                        {['active','trialing'].includes(subscriptionInfo.subscription_status || '') && subscriptionInfo.subscription_cancel_at && <><span className="w-1 h-1 rounded-full bg-amber-400" />In cancellazione</>}
                                                        {subscriptionInfo.subscription_status === 'past_due' && <><span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />Pagamento fallito</>}
                                                        {subscriptionInfo.subscription_status === 'canceled' && <><span className="w-1 h-1 rounded-full bg-zinc-500" />Annullato</>}
                                                        {!subscriptionInfo.subscription_status && <><span className="w-1 h-1 rounded-full bg-emerald-500" />Attivo</>}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Piano mensile MINTHI</p>
                                            </div>
                                        </div>

                                        {/* Prossimo addebito */}
                                        {nextPaymentDate && ['active','trialing'].includes(subscriptionInfo.subscription_status || '') && !subscriptionInfo.subscription_cancel_at && (
                                            <div className="flex items-center justify-between gap-4 px-5 py-4">
                                                <div className="min-w-0">
                                                    <p className="text-[15px] font-semibold text-white">Prossimo addebito</p>
                                                    <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">{nextPaymentDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                                </div>
                                                {activeDiscount && activeDiscount.is_active && priceAmount > 0 && (
                                                    <p className="text-sm text-amber-300 shrink-0">€{(priceAmount * (1 - activeDiscount.discount_percent / 100)).toFixed(2)}</p>
                                                )}
                                            </div>
                                        )}

                                        {/* Sconto attivo */}
                                        {activeDiscount && activeDiscount.is_active && (
                                            <div className="flex items-center justify-between gap-4 px-5 py-4">
                                                <div className="min-w-0">
                                                    <p className="text-[15px] font-semibold text-white">Sconto attivo</p>
                                                    <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">
                                                        {activeDiscount.discount_percent}%
                                                        {activeDiscount.discount_duration === 'forever' ? ' per sempre'
                                                            : activeDiscount.discount_duration === 'once' ? ' per 1 mese'
                                                                : ` per ${activeDiscount.discount_duration_months || activeDiscount.discount_duration} mesi`}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Notifiche stato */}
                                    {subscriptionInfo.subscription_status === 'past_due' && (
                                        <div className="mt-3 flex items-start gap-2.5 px-1">
                                            <WarningCircle weight="fill" size={14} className="text-red-400 shrink-0 mt-0.5" />
                                            <p className="text-[12px] text-zinc-400 leading-relaxed">
                                                <span className="text-red-300 font-medium">Pagamento non riuscito.</span> Aggiorna il metodo di pagamento per evitare la sospensione.
                                            </p>
                                        </div>
                                    )}
                                    {(subscriptionInfo.subscription_cancel_at && subscriptionInfo.subscription_status !== 'canceled') && (
                                        <div className="mt-3 flex items-start gap-2.5 px-1">
                                            <WarningCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                                            <p className="text-[12px] text-zinc-400 leading-relaxed">
                                                Servizi attivi fino al <span className="text-zinc-300">{new Date(subscriptionInfo.subscription_cancel_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                            </p>
                                        </div>
                                    )}
                                    {subscriptionInfo.subscription_status === 'canceled' && (
                                        <div className="mt-3 flex items-start gap-2.5 px-1">
                                            <WarningCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                            <p className="text-[12px] text-zinc-400 leading-relaxed">
                                                {subscriptionInfo.subscription_cancel_at
                                                    ? <>Servizi attivi fino al <span className="text-zinc-300">{new Date(subscriptionInfo.subscription_cancel_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>. Riattiva per continuare.</>
                                                    : <>Riattiva per continuare ad usufruire dei servizi.</>
                                                }
                                            </p>
                                        </div>
                                    )}

                                    {/* Azioni */}
                                    <div className="flex gap-2 mt-4 px-1">
                                        <Button
                                            onClick={handleOpenBillingPortal}
                                            disabled={loadingBillingPortal}
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-4 text-xs border-white/10 text-zinc-200 hover:bg-white/[0.04] hover:text-white gap-2"
                                        >
                                            {loadingBillingPortal ? (
                                                <ArrowClockwise className="animate-spin" size={13} />
                                            ) : (
                                                <ArrowSquareOut size={13} />
                                            )}
                                            Gestisci Abbonamento
                                        </Button>
                                        <Button
                                            onClick={handleOpenBillingPortal}
                                            disabled={loadingBillingPortal}
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 px-4 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] gap-2"
                                        >
                                            <Receipt size={13} />
                                            Fatture
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                    <div className="px-4 py-8 text-center max-w-md mx-auto">
                                        <CreditCard className="text-emerald-400 mx-auto mb-4" weight="fill" size={26} />
                                        <p className="text-sm font-medium text-zinc-100 mb-1">Sblocca tutte le funzionalità</p>
                                        <p className="text-[13px] text-zinc-400 mb-5">Abbonamento mensile completo</p>

                                        <div className="flex items-baseline justify-center gap-1 mb-5">
                                            <span className="text-4xl font-light text-white tracking-tight">€49</span>
                                            <span className="text-zinc-500 text-sm">/mese</span>
                                        </div>

                                        <ul className="space-y-2 mb-6 text-left max-w-xs mx-auto">
                                            {['Ordini e tavoli illimitati', 'Menu digitale QR code', 'Supporto prioritario', 'Statistiche avanzate'].map((f, i) => (
                                                <li key={i} className="flex items-center gap-2 text-[13px] text-zinc-300">
                                                    <CheckCircle className="text-emerald-400 shrink-0" weight="fill" size={13} />
                                                    {f}
                                                </li>
                                            ))}
                                        </ul>

                                        <Button
                                            className="h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md shadow-[0_0_20px_-4px_rgba(16,185,129,0.5)]"
                                            onClick={async () => {
                                                try {
                                                    const { data: restaurantData } = await supabase
                                                        .from('restaurants')
                                                        .select('stripe_price_id')
                                                        .eq('id', restaurantId)
                                                        .single();

                                                    let priceId = restaurantData?.stripe_price_id;
                                                    if (!priceId) {
                                                        priceId = await DatabaseService.getAppConfig('stripe_price_id');
                                                    }
                                                    if (!priceId) {
                                                        toast.error("L'amministratore non ha ancora configurato il Price ID di Stripe. Contatta il supporto.");
                                                        return;
                                                    }

                                                    toast.loading("Generazione del link di pagamento...", { id: "stripe-checkout" });
                                                    const { url } = await DatabaseService.createStripeSubscriptionCheckout(restaurantId, priceId);
                                                    window.location.href = url;
                                                } catch (e: any) {
                                                    console.error(e);
                                                    toast.error("Errore: " + e.message, { id: "stripe-checkout" });
                                                }
                                            }}
                                        >
                                            Attiva Abbonamento
                                        </Button>
                                        <p className="text-[11px] text-emerald-400/80 mt-3 font-medium">Prova gratuita fino al 1° del prossimo mese</p>
                                        <p className="text-[11px] text-zinc-600 mt-1">Pagamenti sicuri gestiti da Stripe</p>
                                    </div>
                                </div>
                            )}
                        </section>
                    </motion.div>
                </TabsContent>

                {/* 6. STAMPANTE CUCINA — Apple-style grouped list */}
                <TabsContent value="printer">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="space-y-10 max-w-3xl"
                    >
                        {/* Tipo di connessione */}
                        <section>
                            <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                Tipo di connessione
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="grid grid-cols-2 divide-x divide-white/[0.05]">
                                    {[
                                        { id: 'usb', icon: Printer, label: 'USB', desc: 'Cavo diretto al PC' },
                                        { id: 'network', icon: ArrowClockwise, label: 'WiFi / LAN', desc: 'Rete locale' },
                                    ].map(({ id, icon: Icon, label, desc }) => {
                                        const active = printer.settings.mode === id;
                                        return (
                                            <button
                                                key={id}
                                                onClick={() => printer.updateSettings({ mode: id as 'usb' | 'network' })}
                                                className={`relative flex items-center gap-3 px-4 py-4 transition-colors ${active
                                                    ? 'bg-amber-500/[0.06]'
                                                    : 'hover:bg-white/[0.02]'
                                                    }`}
                                            >
                                                <Icon size={18} weight={active ? 'fill' : 'regular'} className={active ? 'text-amber-400' : 'text-zinc-500'} />
                                                <div className="text-left min-w-0">
                                                    <p className={`text-sm font-medium ${active ? 'text-amber-200' : 'text-zinc-200'}`}>{label}</p>
                                                    <p className="text-[13px] text-zinc-500 mt-0.5">{desc}</p>
                                                </div>
                                                {active && (
                                                    <CheckCircle size={14} weight="fill" className="ml-auto text-amber-400 shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Network: relay URL */}
                                {printer.settings.mode === 'network' && (
                                    <div className="border-t border-white/[0.05] px-5 py-4">
                                        <div className="mb-2">
                                            <p className="text-[15px] font-semibold text-white">Indirizzo del relay</p>
                                            <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">L'app del relay deve essere avviata sul PC dove è collegata la stampante. Lascia il valore predefinito se relay e dashboard girano sullo stesso PC.</p>
                                        </div>
                                        <Input
                                            value={printer.settings.networkRelayUrl}
                                            onChange={(e) => printer.updateSettings({ networkRelayUrl: e.target.value })}
                                            placeholder="ws://localhost:8765"
                                            className="bg-black/20 border-white/10 h-9 font-mono text-sm"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Browser support warning */}
                            {printer.settings.mode === 'usb' && !printer.isSupported && (
                                <div className="mt-3 flex items-start gap-2.5 px-1">
                                    <WarningCircle size={14} weight="fill" className="text-red-400 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-medium text-red-300">Browser non compatibile</p>
                                        <p className="text-[12px] text-zinc-500 mt-0.5 leading-relaxed">
                                            Usa Google Chrome o Microsoft Edge per collegare la stampante USB. Safari e Firefox non supportano WebUSB.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Protocollo stampante */}
                        <section>
                            <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                Protocollo
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="grid grid-cols-2 divide-x divide-white/[0.05]">
                                    {[
                                        { id: 'escpos', label: 'ESC/POS', desc: 'Epson e compatibili' },
                                        { id: 'custom', label: 'CUSTOM', desc: 'Stampanti Custom' },
                                    ].map(({ id, label, desc }) => {
                                        const active = printer.settings.protocol === id;
                                        return (
                                            <button
                                                key={id}
                                                onClick={() => printer.updateSettings({ protocol: id as 'escpos' | 'custom' })}
                                                className={`relative flex items-center gap-3 px-4 py-4 transition-colors ${active
                                                    ? 'bg-amber-500/[0.06]'
                                                    : 'hover:bg-white/[0.02]'
                                                    }`}
                                            >
                                                <Printer size={18} weight={active ? 'fill' : 'regular'} className={active ? 'text-amber-400' : 'text-zinc-500'} />
                                                <div className="text-left min-w-0">
                                                    <p className={`text-sm font-medium ${active ? 'text-amber-200' : 'text-zinc-200'}`}>{label}</p>
                                                    <p className="text-[13px] text-zinc-500 mt-0.5">{desc}</p>
                                                </div>
                                                {active && (
                                                    <CheckCircle size={14} weight="fill" className="ml-auto text-amber-400 shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>

                        {/* Stato connessione */}
                        {printer.isSupported && (
                            <section>
                                <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                    Stato
                                </h3>
                                <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${printer.connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-600'}`} />
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">
                                                    {printer.connected ? 'Stampante collegata' : 'Nessuna stampante'}
                                                </p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">
                                                    {printer.connected
                                                        ? 'Pronta a ricevere comande.'
                                                        : printer.settings.mode === 'network'
                                                            ? 'Apri l\'app del relay sul PC della cucina, poi premi Connetti.'
                                                            : 'Collega la stampante con il cavo USB e premi Collega.'
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        {printer.connected ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => printer.disconnect()}
                                                className="shrink-0 h-8 px-3 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                            >
                                                Scollega
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                onClick={async () => {
                                                    const ok = await printer.connect()
                                                    if (ok) toast.success('Stampante collegata!')
                                                    else toast.error('Collegamento fallito — verifica che il relay sia attivo')
                                                }}
                                                className="shrink-0 h-8 px-4 text-xs bg-amber-500 hover:bg-amber-600 text-black font-medium"
                                            >
                                                {printer.settings.mode === 'network' ? 'Connetti Relay' : 'Collega'}
                                            </Button>
                                        )}
                                    </div>

                                    {printer.connected && (
                                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">Stampa di prova</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">Verifica che la stampante funzioni correttamente.</p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={async () => {
                                                    try {
                                                        await printer.printTestPage()
                                                        toast.success('Stampa di prova inviata!')
                                                    } catch (e: any) {
                                                        toast.error(e.message || 'Errore stampa')
                                                    }
                                                }}
                                                className="shrink-0 h-8 px-3 text-xs border-white/10 text-zinc-200 hover:bg-white/[0.04] hover:text-white gap-1.5"
                                            >
                                                <Printer size={13} />
                                                Prova
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* Preferenze */}
                        {printer.isSupported && (
                            <section>
                                <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                    Preferenze di stampa
                                </h3>
                                <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden divide-y divide-white/10">
                                    {[
                                        { key: 'autoPrint', label: 'Stampa automatica', desc: 'Ogni nuova comanda viene stampata appena arriva, senza intervento manuale.' },
                                        { key: 'autoCut', label: 'Taglio automatico', desc: 'La stampante taglia il foglio alla fine di ogni comanda.' },
                                        { key: 'courseSeparate', label: 'Foglio separato per portata', desc: 'Antipasti, primi e secondi escono su scontrini distinti.' },
                                    ].map(({ key, label, desc }) => (
                                        <div key={key} className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-semibold text-white">{label}</p>
                                                <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">{desc}</p>
                                            </div>
                                            <Switch
                                                checked={(printer.settings as any)[key]}
                                                onCheckedChange={(checked) => printer.updateSettings({ [key]: checked } as any)}
                                                className="data-[state=checked]:bg-amber-500 shrink-0"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Istruzioni */}
                        <section>
                            <h3 className="text-[15px] font-bold text-zinc-200 mb-3 px-1 tracking-wide uppercase">
                                Come installare {printer.settings.mode === 'usb' ? '(USB)' : '(WiFi / LAN)'}
                            </h3>
                            <div className="rounded-xl bg-zinc-900/60 border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
                                <div className="px-4 py-4">
                                    {printer.settings.mode === 'usb' ? (
                                        <>
                                            <ol className="text-[13px] text-zinc-300 space-y-2 list-decimal list-inside leading-relaxed">
                                                <li>Collega la stampante termica al PC/tablet via cavo USB</li>
                                                <li>Clicca "Collega" qui sopra</li>
                                                <li>Seleziona la stampante dalla finestra del browser</li>
                                                <li>Fai una stampa di prova per verificare</li>
                                            </ol>
                                            <p className="text-[12px] text-zinc-500 mt-3">
                                                Compatibile con stampanti termiche ESC/POS e CUSTOM. Richiede Chrome o Edge.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <ol className="text-[13px] text-zinc-300 space-y-2 list-decimal list-inside leading-relaxed">
                                                <li>Collega la stampante alla rete WiFi o via cavo LAN</li>
                                                <li>Segna l'IP della stampante (es. 192.168.1.50)</li>
                                                <li>Sul PC collegato alla stessa rete, installa Node.js da nodejs.org</li>
                                                <li>Scarica <code className="text-amber-300 bg-white/[0.04] px-1.5 py-0.5 rounded text-[11px]">printer-relay.js</code> nella cartella del progetto</li>
                                                <li>Terminale: <code className="text-amber-300 bg-white/[0.04] px-1.5 py-0.5 rounded text-[11px]">npm install ws && node printer-relay.js 192.168.1.50</code></li>
                                                <li>Lascia aperto, poi clicca "Connetti Relay" qui sopra</li>
                                                <li>Fai una stampa di prova</li>
                                            </ol>
                                            <p className="text-[12px] text-zinc-500 mt-3">
                                                Il relay va fatto girare sul PC della cassa. Compatibile con stampanti di rete ESC/POS e CUSTOM su porta 9100.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </section>
                    </motion.div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
