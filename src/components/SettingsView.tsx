import { motion } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
    Storefront,
    Users,
    Coins,
    CalendarCheck,
    SpeakerHigh,
    CreditCard,
    Clock,
    ForkKnife,
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
    Package,
    QrCode,
    Copy
} from '@phosphor-icons/react'
import { SoundType } from '../utils/SoundManager'
import WeeklyScheduleEditor from './WeeklyScheduleEditor'
import WeeklyServiceHoursEditor from './WeeklyServiceHoursEditor'
import TakeawayQRPosterButton from './takeaway/TakeawayQRPosterButton'
import QRCodeGenerator from './QRCodeGenerator'
import { DatabaseService } from '@/services/DatabaseService'
import { supabase } from '@/lib/supabase'
import type { WeeklyCopertoSchedule, WeeklyAyceSchedule, RestaurantStaff, WeeklyServiceSchedule, SubscriptionPayment } from '@/services/types'
import { createDefaultCopertoSchedule, createDefaultAyceSchedule } from '@/utils/pricingUtils'
import { useThermalPrinter } from '@/hooks/useThermalPrinter'
import { toast } from 'sonner'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import { ConnectComponentsProvider, ConnectAccountOnboarding } from '@stripe/react-connect-js'
import { Save, UserPlus, Pencil, Trash as TrashIcon, UserMinus, Key } from 'lucide-react'

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
    const [takeawayEstimatedMinutes, setTakeawayEstimatedMinutes] = useState(20)
    const [takeawayPickupNotice, setTakeawayPickupNotice] = useState('')
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
                .select('enable_stripe_payments, stripe_subscription_id, stripe_connect_account_id, stripe_connect_enabled, subscription_status, subscription_cancel_at, vat_number, billing_name, auto_deliver_ready_dishes, takeaway_enabled, dine_in_enabled, takeaway_require_stripe, takeaway_estimated_minutes, takeaway_pickup_notice')
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
                setTakeawayEstimatedMinutes((data as any).takeaway_estimated_minutes ?? 20)
                setTakeawayPickupNotice((data as any).takeaway_pickup_notice || '')

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
        takeaway_estimated_minutes: number
        takeaway_pickup_notice: string
    }>) => {
        setSavingTakeaway(true)
        try {
            await DatabaseService.updateRestaurant({ id: restaurantId, ...patch })
            toast.success('Impostazioni asporto aggiornate')
        } catch (e: any) {
            toast.error('Errore: ' + (e?.message || 'Impossibile salvare'))
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
                            className={`group relative shrink-0 rounded-none px-0 py-3 -mb-px text-[13px] tracking-wide text-zinc-500 hover:text-zinc-200 transition-colors gap-2 font-medium bg-transparent shadow-none focus-visible:outline-none focus-visible:ring-0 data-[state=active]:bg-transparent ${color === 'emerald'
                                ? 'data-[state=active]:text-emerald-400'
                                : 'data-[state=active]:text-amber-400'
                                }`}
                        >
                            <Icon size={14} weight="fill" className="opacity-60 group-data-[state=active]:opacity-100" />
                            <span className="whitespace-nowrap">{label}</span>
                            {/* underline accent — appears only on active */}
                            <span className={`absolute bottom-0 left-0 right-0 h-[2px] rounded-full opacity-0 group-data-[state=active]:opacity-100 transition-opacity ${color === 'emerald'
                                ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]'
                                : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                                }`} />
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* 1. SEZIONE GENERALE */}
                <TabsContent value="general">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="divide-y divide-white/[0.04]"
                    >
                        {/* Guida Interattiva — flat inline row, matches app aesthetic */}
                        {onRestartTour && (
                            <div className="py-7 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <Sparkle className="text-amber-500 w-4 h-4 mt-0.5" weight="fill" />
                                    <div>
                                        <div className="text-sm font-medium text-zinc-100">Guida Interattiva</div>
                                        <p className="text-xs text-zinc-500 mt-1 max-w-md">Naviga un sito demo con dati di esempio e scopri tutte le funzioni di Minthi.</p>
                                    </div>
                                </div>
                                <Button
                                    data-tour="settings-demo-btn"
                                    onClick={onRestartTour}
                                    variant="ghost"
                                    className="h-9 px-4 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 text-amber-400 hover:text-amber-300 border border-amber-500/20 text-[13px] font-medium tracking-wide shrink-0 self-start sm:self-auto"
                                >
                                    <Sparkle size={13} weight="fill" className="mr-1.5" />
                                    Avvia Demo
                                </Button>
                            </div>
                        )}

                        {/* Nome Ristorante */}
                        <div className="py-7 border-b border-white/[0.05]">
                            <div className="flex items-center gap-2 mb-4">
                                <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                    <Storefront className="text-amber-500 w-3 h-3" weight="fill" />
                                    Profilo Attività
                                </h3>
                                <InfoTip id="profilo" text="Il nome del ristorante viene mostrato ai clienti nel menù digitale QR, nelle ricevute e nella pagina di prenotazione online." />
                            </div>
                            <div className="grid gap-4 max-w-xl">
                                <div className="space-y-2">
                                    <Label className="text-zinc-400">Nome del Ristorante</Label>
                                    <div className="flex gap-3">
                                        <Input
                                            value={restaurantName}
                                            onChange={(e) => setRestaurantName(e.target.value)}
                                            className="bg-black/20 border-white/10 h-12 text-lg focus:ring-amber-500/50"
                                            placeholder="Es. Ristorante Da Mario"
                                        />
                                        {restaurantNameDirty && (
                                            <Button
                                                onClick={saveRestaurantName}
                                                className="h-12 px-6 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-[0_0_15px_-3px_rgba(245,158,11,0.4)]"
                                            >
                                                Salva
                                            </Button>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500">Questo nome apparirà sui menu digitali e sulle ricevute.</p>
                                </div>
                            </div>
                        </div>



                        {/* Suoni */}
                        <div className="py-7 border-b border-white/[0.05]">
                            <div className="flex items-center gap-2 mb-4">
                                <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                    <SpeakerHigh className="text-amber-500 w-3 h-3" weight="fill" />
                                    Notifiche Sonore
                                </h3>
                                <InfoTip id="suoni" text="Quando un cliente invia un ordine dal menù QR, il browser riproduce un suono di notifica. Tieni il volume del dispositivo attivo. Il suono funziona solo se la pagina è aperta e il browser ha il permesso audio." />
                            </div>
                            <div className="flex flex-col gap-6">
                                <div data-tour="settings-sound-toggle" className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="space-y-1">
                                        <Label className="text-base font-semibold">Suono Nuovi Ordini</Label>
                                        <p className="text-sm text-zinc-400">Riproduci un effetto sonoro quando arriva una comanda in cucina.</p>
                                    </div>
                                    <Switch
                                        checked={soundEnabled}
                                        onCheckedChange={setSoundEnabled}
                                        className="data-[state=checked]:bg-amber-500"
                                    />
                                </div>

                                {soundEnabled && (
                                    <div className="space-y-3 max-w-md animate-in slide-in-from-top-2">
                                        <Label className="text-zinc-400">Tono di notifica</Label>
                                        <div className="flex gap-2">
                                            <Select value={selectedSound} onValueChange={(val) => setSelectedSound(val as SoundType)}>
                                                <SelectTrigger className="h-12 bg-black/20 border-white/10 flex-1">
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
                                                className="h-12 w-12 border-white/10 bg-black/20 hover:bg-amber-500/20 hover:text-amber-500 hover:border-amber-500/50 transition-all"
                                                onClick={async () => {
                                                    const { soundManager } = await import('../utils/SoundManager')
                                                    // Ensure audio context is unlocked on user interaction
                                                    soundManager.play(selectedSound)
                                                }}
                                            >
                                                <SpeakerHigh size={20} weight="duotone" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Configurazione Guidata */}
                        {onRestartSetup && (
                            <div className="py-7 border-b border-white/[0.05]">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-base font-semibold text-white">Configurazione Guidata</h3>
                                        <p className="text-zinc-400 text-sm mt-0.5">Segui i passaggi per configurare categorie, piatti, tavoli e impostazioni.</p>
                                    </div>
                                    <Button
                                        onClick={onRestartSetup}
                                        variant="outline"
                                        className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 shrink-0"
                                    >
                                        Avvia Configurazione
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Assistenza */}
                        <div className="py-7 border-b border-white/[0.05]">
                            <h3 className="text-base font-semibold text-white mb-1">Assistenza</h3>
                            <p className="text-zinc-400 text-sm mb-3">Hai bisogno di aiuto?</p>
                            <p className="text-sm text-zinc-300">
                                Contattaci al{' '}
                                <a href="tel:+393517570155" className="text-amber-400 font-medium hover:text-amber-300 transition-colors">
                                    +39 351 757 0155
                                </a>
                            </p>
                        </div>

                    </motion.div>
                </TabsContent>

                {/* 2. SEZIONE COSTI & MENU */}
                <TabsContent value="costs">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-6"
                    >
                        <div className="divide-y divide-white/[0.04]">
                            {/* All You Can Eat - Weekly Schedule */}
                            <div data-tour="settings-ayce" className="relative p-6 rounded-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 border border-white/5 overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                    <ForkKnife size={120} weight="fill" />
                                </div>
                                <div className="relative z-10">
                                    <div className="mb-3">
                                        <InfoTip id="ayce" text="L'All You Can Eat attiva una modalità a prezzo fisso: il cliente paga un importo unico e può ordinare liberamente dal menù. Puoi impostare un limite massimo di piatti per persona. Supporta programmazione settimanale con prezzi diversi per ogni giorno della settimana." />
                                    </div>
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
                                            // Also sync legacy state for backwards compatibility
                                            setAyceEnabled(schedule.enabled)
                                            setAycePrice(schedule.defaultPrice)
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Coperto - Weekly Schedule */}
                            <div data-tour="settings-coperto" className="relative p-6 rounded-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 border border-white/5 overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                    <Coins size={120} weight="fill" />
                                </div>
                                <div className="relative z-10">
                                    <div className="mb-3">
                                        <InfoTip id="coperto" text="Il Coperto è un costo aggiuntivo applicato automaticamente per ogni persona al tavolo. Viene aggiunto al conto finale. Supporta programmazione settimanale con prezzi diversi per giorno." />
                                    </div>
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
                                            // Sync global coperto status as fallback/legacy support
                                            if (setCopertoEnabled) setCopertoEnabled(schedule.enabled)
                                            if (setCopertoPrice) setCopertoPrice(schedule.defaultPrice)
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Configurazione Portate */}
                            <div data-tour="settings-course-split" className="col-span-full py-7 border-b border-white/[0.05]">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                                <ForkKnife className="text-amber-500 w-3 h-3" weight="fill" />
                                                Suddivisione in Portate
                                            </h3>
                                            <InfoTip id="portate" text="Quando attiva, il cliente sceglie per ogni piatto in quale portata vuole riceverlo (Primo, Secondo, ecc.). La cucina riceve gli ordini raggruppati per portata. In modalità cameriere, il cameriere assegna la portata al momento dell'ordine." />
                                        </div>
                                        <p className="text-sm text-zinc-400 max-w-prose">
                                            Se attivo, i clienti potranno scegliere l'ordine di uscita (Antipasti, Primi, Secondi) direttamente dal menu digitale.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={courseSplittingEnabled}
                                        onCheckedChange={(val) => {
                                            setCourseSplittingEnabled(val)
                                            updateCourseSplitting(val)
                                        }}
                                        className="data-[state=checked]:bg-amber-500"
                                    />
                                </div>
                            </div>

                            {/* Suggerimenti Portate Successive */}
                            <div className="col-span-full py-7 border-b border-white/[0.05]">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                                <Sparkle className="text-amber-500 w-3 h-3" weight="fill" />
                                                Suggerimenti Portate
                                            </h3>
                                            <InfoTip id="suggestions" text="Dopo che il cliente aggiunge un piatto al carrello, il sistema suggerisce automaticamente le categorie successive (es. se ordina un Primo, propone Secondi, Contorni, Dolci, Bevande). L'ordine segue quello delle categorie in Gestione Menu. Se la divisione in portate è attiva, il piatto suggerito verrà inserito automaticamente nella portata successiva." />
                                        </div>
                                        <p className="text-sm text-zinc-400 max-w-prose">
                                            Propone al cliente le portate successive dopo ogni ordine, seguendo l'ordine delle categorie.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={courseSuggestionsEnabled}
                                        onCheckedChange={(val) => {
                                            setCourseSuggestionsEnabled(val)
                                            updateCourseSuggestions(val)
                                        }}
                                        className="data-[state=checked]:bg-amber-500"
                                    />
                                </div>
                            </div>

                            {/* Menu Solo Visualizzazione */}
                            <div data-tour="settings-viewonly" className="col-span-full py-7 border-b border-white/[0.05]">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                                <Eye className="text-amber-500 w-3 h-3" weight="fill" />
                                                Menu Solo Visualizzazione
                                            </h3>
                                            <InfoTip id="viewonly" text="Utile se vuoi usare Minthi solo come menù digitale senza gestione ordini. I clienti scansionano il QR e vedono piatti e prezzi, ma non possono ordinare. I QR code mostreranno 'Scansiona per visualizzare il menù' invece di 'Scansiona per ordinare'." />
                                        </div>
                                        <p className="text-sm text-zinc-400 max-w-prose">
                                            Se attivo, i clienti potranno visualizzare il menù senza la possibilità di ordinare.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={viewOnlyMenuEnabled}
                                        onCheckedChange={setViewOnlyMenuEnabled}
                                        className="data-[state=checked]:bg-amber-500"
                                    />
                                </div>
                            </div>

                            {/* Tempo Medio di Cottura */}
                            <div className="col-span-full py-7 border-b border-white/[0.05]">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                                <Clock className="text-amber-500 w-3 h-3" weight="fill" />
                                                Tempo Medio di Cottura
                                            </h3>
                                            <InfoTip id="cooktime" text="Minthi calcola automaticamente il tempo medio di preparazione di ogni piatto basandosi sugli ordini degli ultimi 2 mesi (servono almeno 3 ordini per piatto). Il tempo viene mostrato sotto il nome del piatto nel menù cliente e nella dashboard cameriere." />
                                        </div>
                                        <p className="text-sm text-zinc-400 max-w-prose">
                                            Se attivo, mostra il tempo medio di preparazione sotto ogni piatto nel menù cliente e nella dashboard cameriere.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={showCookingTimes}
                                        onCheckedChange={setShowCookingTimes}
                                        className="data-[state=checked]:bg-amber-500"
                                    />
                                </div>
                            </div>

                        </div>
                    </motion.div>
                </TabsContent>

                {/* 3. SEZIONE STAFF */}
                <TabsContent value="staff">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-6"
                    >
                        <div className="py-7 border-b border-white/[0.05]">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                                        <Users size={32} weight="duotone" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-2xl font-bold text-white">Gestione Staff <span className="text-amber-500">(Camerieri)</span></h3>
                                            <InfoTip id="staff" text="Crea un account per ogni cameriere. Il cameriere accede dalla pagina di login con le sue credenziali e vede solo i tavoli a lui assegnati, gli ordini in arrivo e può segnare i piatti come serviti. Assegna i tavoli ai camerieri dalla sezione Tavoli nella dashboard." />
                                        </div>
                                        <p className="text-zinc-400 text-sm mt-1">Crea e gestisci le credenziali dei camerieri</p>
                                    </div>
                                </div>
                                <Switch
                                    data-tour="settings-waiter-toggle"
                                    checked={waiterModeEnabled}
                                    onCheckedChange={setWaiterModeEnabled}
                                    className="data-[state=checked]:bg-amber-500"
                                />
                            </div>

                            {waiterModeEnabled && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-top-4">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div>
                                            <Label className="text-base text-amber-100">Permessi di Pagamento</Label>
                                            <p className="text-sm text-amber-300/60">Consenti ai camerieri di segnare i tavoli come pagati dalla loro dashboard</p>
                                        </div>
                                        <Switch
                                            checked={allowWaiterPayments}
                                            onCheckedChange={setAllowWaiterPayments}
                                            className="data-[state=checked]:bg-amber-500"
                                        />
                                    </div>
                                    <Separator className="bg-white/5" />

                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div>
                                            <Label className="text-base text-amber-100">Consegna Automatica Piatti Pronti</Label>
                                            <p className="text-sm text-amber-300/60">Quando un piatto è segnato come pronto in cucina, viene automaticamente considerato consegnato. I camerieri non ricevono la notifica.</p>
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
                                            className="data-[state=checked]:bg-amber-500"
                                        />
                                    </div>
                                    <Separator className="bg-white/5" />

                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Key size={20} className="text-amber-500" />
                                            <h4 className="text-xl font-bold text-zinc-200">Credenziali Camerieri</h4>
                                        </div>
                                        <Button
                                            data-tour="settings-add-staff"
                                            onClick={() => {
                                                setEditingStaff(null)
                                                setStaffForm({ name: '', username: '', password: '', is_active: true })
                                                setShowStaffDialog(true)
                                            }}
                                            size="lg"
                                            className="bg-amber-600 hover:bg-amber-700 text-white gap-2 h-10 text-sm px-4"
                                        >
                                            <UserPlus size={16} /> Aggiungi
                                        </Button>
                                    </div>

                                    {isStaffLoading ? (
                                        <p className="text-zinc-500 text-sm py-4">Caricamento in corso...</p>
                                    ) : staffList.length === 0 ? (
                                        <div className="text-center py-10 bg-black/20 rounded-xl border border-white/5 border-dashed">
                                            <UserMinus className="mx-auto h-12 w-12 text-zinc-600 mb-4" />
                                            <p className="text-zinc-400 text-lg">Nessun cameriere configurato.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {staffList.map(staff => (
                                                <div key={staff.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${staff.is_active ? 'bg-black/20 border-white/8' : 'bg-black/40 border-red-500/20 opacity-60'}`}>
                                                    {/* Avatar */}
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${staff.is_active ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700 text-zinc-400'}`}>
                                                        {staff.name.substring(0, 1).toUpperCase()}
                                                    </div>
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0 ml-1">
                                                        <p className="text-base font-semibold text-white leading-tight truncate">{staff.name}</p>
                                                        <p className="text-sm font-mono text-amber-400/70 mt-0.5 truncate">{staff.username}</p>
                                                    </div>
                                                    {/* Actions */}
                                                    <div className="flex gap-2 shrink-0">
                                                        {/* Eye toggle */}
                                                        <button
                                                            title={staff.is_active ? 'Disattiva accesso' : 'Riattiva accesso'}
                                                            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${staff.is_active
                                                                ? 'text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/10'
                                                                : 'text-red-400/60 hover:text-red-300 hover:bg-red-500/10'
                                                                }`}
                                                            onClick={() => handleToggleStaffActive(staff)}
                                                        >
                                                            {staff.is_active ? <Eye size={14} weight="duotone" /> : <EyeSlash size={14} weight="duotone" />}
                                                        </button>
                                                        <button
                                                            className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
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
                                                            className="w-7 h-7 rounded-md flex items-center justify-center text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
                            )}
                        </div>

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

                {/* 4. SEZIONE PRENOTAZIONI */}
                <TabsContent value="reservations">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-6"
                    >
                        {/* Top row: Turnazione and QR Code */}
                        <div className="grid md:grid-cols-2 gap-6 items-stretch">
                            {/* Turnazione Tavoli */}
                            <div className="py-7 border-b border-white/[0.05] shadow-xl flex flex-col justify-center">
                                <div className="flex items-center gap-2 mb-4">
                                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                        <Clock className="text-amber-500 w-3 h-3" weight="fill" />
                                        Turnazione Tavoli
                                    </h3>
                                    <InfoTip id="turnazione" text="La durata della prenotazione determina per quanto tempo un tavolo resta occupato nel calendario prenotazioni. Dopo questo periodo il tavolo torna disponibile per nuove prenotazioni. Es. con 2 ore, una prenotazione alle 20:00 libera il tavolo alle 22:00." />
                                </div>
                                <p className="text-sm text-zinc-400 mb-6">Durata standard prenotazione</p>
                                <Select
                                    data-tour="settings-turnover"
                                    value={reservationDuration.toString()}
                                    onValueChange={(val) => setReservationDuration(parseInt(val))}
                                >
                                    <SelectTrigger className="h-12 w-full bg-black/40 border-white/10 text-base shadow-sm hover:border-amber-500/50 transition-colors">
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

                            {/* QR Code & Prenotazioni Pubbliche */}
                            <div className="py-7 border-b border-white/[0.05] shadow-xl flex flex-col justify-center">
                                <div className="flex items-center gap-2 mb-4">
                                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                        <Storefront className="text-amber-500 w-3 h-3" weight="fill" />
                                        Prenotazioni via QR
                                    </h3>
                                    <InfoTip id="qr-prenotazioni" text="I clienti possono prenotare scannerizzando un QR code dedicato (diverso da quello dei tavoli). Scelgono data, ora, numero persone e sala. Le prenotazioni appaiono nel calendario nella sezione Prenotazioni. Puoi disattivare temporaneamente se il ristorante è pieno." />
                                </div>
                                <p className="text-sm text-zinc-400 mb-6">Configura l'accesso pubblico per le prenotazioni via QR Code dei clienti.</p>

                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1 block pr-4">
                                            <Label className="text-base font-semibold text-zinc-200 leading-none block">Abilita Prenotazioni da QR</Label>
                                            <p className="text-xs text-zinc-400 hidden sm:block">Se disattivato, il QR mostrerà un avviso di servizio sospeso al momento.</p>
                                        </div>
                                        <Switch
                                            data-tour="settings-public-booking"
                                            checked={enablePublicReservations}
                                            onCheckedChange={setEnablePublicReservations}
                                            className="data-[state=checked]:bg-amber-500 scale-110 shrink-0"
                                        />
                                    </div>
                                    <Separator className="bg-white/5" />
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1 block pr-4">
                                            <Label className="text-base font-semibold text-zinc-200 leading-none block">Consenti Scelta Sala</Label>
                                            <p className="text-xs text-zinc-400 hidden sm:block">Permetti ai clienti di indicare preferenze sulla zona (es. Terrazza o Interno).</p>
                                        </div>
                                        <Switch
                                            disabled={!enablePublicReservations}
                                            checked={enableReservationRoomSelection && enablePublicReservations}
                                            onCheckedChange={setEnableReservationRoomSelection}
                                            className="data-[state=checked]:bg-amber-500 scale-110 shrink-0"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Orari di Servizio */}
                        <div className="w-full max-w-4xl mx-auto pt-4">
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
                    </motion.div>
                </TabsContent>

                {/* SEZIONE ASPORTO */}
                <TabsContent value="takeaway">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="divide-y divide-white/[0.04]"
                    >
                        {/* Toggle principale — flat inline row, no rectangle */}
                        <div className="py-7 flex items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <Package size={16} weight="fill" className={`mt-0.5 ${takeawayEnabled ? 'text-amber-500' : 'text-zinc-600'}`} />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-zinc-100">Servizio Asporto</span>
                                        {takeawayEnabled && (
                                            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-emerald-400 font-bold">
                                                <span className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                                Attivo
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-1 max-w-md">
                                        {takeawayEnabled
                                            ? 'I clienti ordinano dal QR pubblico e ritirano al bancone.'
                                            : 'Attiva per permettere ordini da asporto con QR code e numeri di ritiro.'}
                                    </p>
                                </div>
                            </div>
                            <Switch
                                checked={takeawayEnabled}
                                disabled={savingTakeaway}
                                onCheckedChange={(v) => { setTakeawayEnabled(v); saveTakeawaySettings({ takeaway_enabled: v }) }}
                                className="data-[state=checked]:bg-amber-500 shrink-0"
                            />
                        </div>

                        {/* Empty state quando disabilitato — inline minimal */}
                        {!takeawayEnabled && (
                            <div className="py-12 text-center">
                                <QrCode size={22} className="text-zinc-600 mx-auto mb-3" />
                                <p className="text-[13px] text-zinc-500 max-w-md mx-auto">
                                    Attiva l'interruttore sopra per mostrare menu pubblico, numeri di ritiro, display sala d'attesa e pannello cassa asporto.
                                </p>
                            </div>
                        )}

                        {/* Configurazioni visibili solo quando attivo */}
                        {takeawayEnabled && (
                            <>
                                {/* Modalità servizio — flat rows */}
                                <div className="py-7">
                                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2 mb-5">
                                        <Gear className="text-amber-500 w-3 h-3" weight="fill" />
                                        Modalità servizio
                                    </h3>
                                    <div className="divide-y divide-white/[0.04]">
                                        <div className="flex items-start justify-between gap-4 py-3.5">
                                            <div className="min-w-0">
                                                <Label className="text-sm font-medium text-zinc-200 block">Servizio ai tavoli</Label>
                                                <p className="text-xs text-zinc-500 mt-1">Disattiva se fai solo asporto.</p>
                                            </div>
                                            <Switch
                                                checked={dineInEnabled}
                                                disabled={savingTakeaway}
                                                onCheckedChange={(v) => { setDineInEnabled(v); saveTakeawaySettings({ dine_in_enabled: v }) }}
                                                className="data-[state=checked]:bg-amber-500 shrink-0 mt-0.5"
                                            />
                                        </div>
                                        <div className="flex items-start justify-between gap-4 py-3.5">
                                            <div className="min-w-0">
                                                <Label className="text-sm font-medium text-zinc-200 block">Pagamento online obbligatorio</Label>
                                                <p className="text-xs text-zinc-500 mt-1">Il cliente paga con carta prima di stampare l'ordine in cucina.</p>
                                            </div>
                                            <Switch
                                                checked={takeawayRequireStripe}
                                                disabled={savingTakeaway}
                                                onCheckedChange={(v) => { setTakeawayRequireStripe(v); saveTakeawaySettings({ takeaway_require_stripe: v }) }}
                                                className="data-[state=checked]:bg-amber-500 shrink-0 mt-0.5"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Tempi & avvisi — flat rows */}
                                <div className="py-7 border-t border-white/[0.05]">
                                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2 mb-5">
                                        <Clock className="text-amber-500 w-3 h-3" weight="fill" />
                                        Tempi & avvisi
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Tempo preparazione</Label>
                                            <div className="flex items-center gap-3">
                                                <Input
                                                    type="number"
                                                    min={5}
                                                    max={120}
                                                    value={takeawayEstimatedMinutes}
                                                    onChange={e => setTakeawayEstimatedMinutes(Math.max(5, Math.min(120, Number(e.target.value) || 20)))}
                                                    onBlur={() => saveTakeawaySettings({ takeaway_estimated_minutes: takeawayEstimatedMinutes })}
                                                    className="bg-transparent border-0 border-b border-white/10 rounded-none h-9 w-20 text-center font-semibold focus-visible:ring-0 focus-visible:border-amber-500 px-0"
                                                />
                                                <span className="text-xs text-zinc-500">minuti · mostrato al cliente</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Nota per il ritiro</Label>
                                            <Input
                                                value={takeawayPickupNotice}
                                                maxLength={200}
                                                onChange={e => setTakeawayPickupNotice(e.target.value)}
                                                onBlur={() => saveTakeawaySettings({ takeaway_pickup_notice: takeawayPickupNotice })}
                                                placeholder="Es. Ingresso posteriore · Suonare il campanello"
                                                className="bg-transparent border-0 border-b border-white/10 rounded-none h-9 px-0 focus-visible:ring-0 focus-visible:border-amber-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* QR & Link pubblici — flat layout, no card */}
                                {restaurantId && (
                                    <div className="py-7 border-t border-white/[0.05]">
                                        <div className="flex items-center gap-2 mb-5">
                                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2">
                                                <QrCode className="text-amber-500 w-3 h-3" weight="fill" />
                                                QR & Link pubblici
                                            </h3>
                                            <div className="ml-auto">
                                                <TakeawayQRPosterButton
                                                    restaurantId={restaurantId}
                                                    restaurantName={restaurantName}
                                                    size="sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-6 items-start">
                                            <div className="bg-white p-3 rounded-lg self-start">
                                                <QRCodeGenerator value={`${window.location.origin}/client/takeaway/${restaurantId}`} size={120} />
                                            </div>
                                            <div className="divide-y divide-white/[0.04]">
                                                {[
                                                    { label: 'Menu asporto', url: `${window.location.origin}/client/takeaway/${restaurantId}`, dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]' },
                                                    { label: "Display sala d'attesa", url: `${window.location.origin}/display/${restaurantId}`, dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' },
                                                ].map(link => (
                                                    <div key={link.label} className="py-3 first:pt-0 flex items-center gap-3 min-w-0">
                                                        <span className={`w-1 h-1 rounded-full shrink-0 ${link.dot}`} />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1">{link.label}</div>
                                                            <code className="text-[11px] text-zinc-300 font-mono break-all">{link.url}</code>
                                                        </div>
                                                        <button
                                                            onClick={() => { navigator.clipboard.writeText(link.url).then(() => toast.success('Link copiato')).catch(() => toast.error('Copia non riuscita')) }}
                                                            className="shrink-0 p-2 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.04] transition-colors"
                                                            title="Copia"
                                                        >
                                                            <Copy size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                                                            className="shrink-0 p-2 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.04] transition-colors"
                                                            title="Apri"
                                                        >
                                                            <ArrowSquareOut size={13} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <p className="text-[11px] text-zinc-500 pt-3">
                                                    Stampa il PDF dal bottone in alto — QR gigante leggibile da lontano, ideale per vetrina o bancone.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {takeawayRequireStripe && !subscriptionInfo?.stripe_connect_enabled && (
                                    <div className="py-4 flex items-start gap-3 border-t border-amber-500/20">
                                        <WarningCircle size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
                                        <div className="text-xs text-amber-300/90 leading-relaxed">
                                            Hai richiesto il pagamento obbligatorio, ma Stripe Connect non è ancora attivo. Vai in <strong className="text-amber-200">Abbonamento</strong> per completare l'onboarding.
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </motion.div>
                </TabsContent>

                {/* 5. SEZIONE ABBONAMENTO STRIPE E PAGAMENTI CLIENTI */}
                <TabsContent value="subscription">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="divide-y divide-white/[0.04]"
                    >
                        {/* Pagamenti al tavolo — flat, no gradient hero */}
                        <div className="py-7">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0">
                                    <CreditCard weight="fill" size={16} className={`mt-0.5 ${stripePaymentsEnabled ? 'text-violet-400' : 'text-zinc-600'}`} />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-zinc-100">Pagamenti al Tavolo</span>
                                            {stripePaymentsEnabled && (
                                                <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-violet-300 font-bold">
                                                    <span className="w-1 h-1 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                                                    Attivo
                                                </span>
                                            )}
                                            <InfoTip id="pagamenti" text="Attivando i pagamenti, i clienti possono pagare il conto con carta direttamente dal menù QR. Devi collegare un account Stripe per ricevere i pagamenti sul tuo conto bancario. I soldi arrivano automaticamente. Ricordati di emettere lo scontrino fiscale separatamente." />
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-1 max-w-md">I clienti pagano con carta dal menu QR — i soldi arrivano sul tuo conto Stripe.</p>
                                    </div>
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
                                <div className="mt-6 pt-6 border-t border-white/[0.04] space-y-5 animate-in slide-in-from-top-2 duration-200">
                                    {/* Guida link — inline, ghost button */}
                                    <button
                                        onClick={() => setShowStripeGuide(true)}
                                        className="inline-flex items-center gap-2 text-xs text-violet-300 hover:text-violet-200 transition-colors"
                                    >
                                        <Info size={14} weight="fill" />
                                        <span className="underline underline-offset-4 decoration-violet-500/40 hover:decoration-violet-400">Come funziona il pagamento con Stripe</span>
                                    </button>

                                    {/* Connect status — flat inline row */}
                                    <div className="flex items-center justify-between gap-4 py-2">
                                        <div className="flex items-start gap-3 min-w-0">
                                            {subscriptionInfo?.stripe_connect_enabled ? (
                                                <CheckCircle weight="fill" size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                            ) : subscriptionInfo?.stripe_connect_account_id ? (
                                                <Warning weight="fill" size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                            ) : (
                                                <Buildings size={14} className="text-zinc-600 mt-0.5 shrink-0" />
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Account Stripe Connect</p>
                                                <p className="text-sm font-medium text-zinc-200 mt-1">
                                                    {subscriptionInfo?.stripe_connect_enabled
                                                        ? 'Collegato'
                                                        : subscriptionInfo?.stripe_connect_account_id
                                                            ? 'Verifica in corso'
                                                            : 'Non collegato'}
                                                </p>
                                                <p className="text-xs text-zinc-500 mt-0.5">
                                                    {subscriptionInfo?.stripe_connect_enabled
                                                        ? 'I pagamenti arrivano direttamente sul tuo conto.'
                                                        : subscriptionInfo?.stripe_connect_account_id
                                                            ? 'Stripe sta verificando i tuoi dati aziendali.'
                                                            : 'Collega il tuo account Stripe per ricevere pagamenti.'}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={handleConnectOnboarding}
                                            disabled={loadingConnectOnboarding}
                                            variant="ghost"
                                            size="sm"
                                            className="shrink-0 h-8 px-3 text-xs text-violet-300 hover:text-violet-200 hover:bg-violet-500/10 gap-1.5"
                                        >
                                            {loadingConnectOnboarding ? (
                                                <ArrowClockwise className="animate-spin" size={12} />
                                            ) : (
                                                <ArrowSquareOut size={12} />
                                            )}
                                            {subscriptionInfo?.stripe_connect_enabled ? 'Dashboard' : subscriptionInfo?.stripe_connect_account_id ? 'Stato' : 'Collega'}
                                        </Button>
                                    </div>

                                    {/* Info rows — inline, subtle */}
                                    {subscriptionInfo?.stripe_connect_enabled && (
                                        <div className="space-y-2 pt-2 border-t border-white/[0.04]">
                                            <p className="text-xs text-zinc-500 leading-relaxed">
                                                <span className="text-zinc-300">I soldi arrivano sul tuo conto bancario automaticamente.</span> Apri la Dashboard Stripe per gestire pagamenti, fatture e commissioni.
                                            </p>
                                            <p className="text-xs text-zinc-500 leading-relaxed">
                                                <span className="text-amber-300/90">⚠ Il pagamento digitale non sostituisce lo scontrino fiscale.</span> <button onClick={() => setShowStripeGuide(true)} className="text-amber-300 underline underline-offset-4 hover:text-amber-200">Guida</button>
                                            </p>
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

                                </div>
                            )}
                        </div>

                        {/* 2. Abbonamento — flat section */}
                        {subscriptionInfo?.stripe_subscription_id ? (
                            <div data-tour="settings-subscription" className="py-7">
                                {/* Header row */}
                                <div className="flex items-start justify-between gap-4 mb-5">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <CreditCard weight="fill" size={16} className={`mt-0.5 shrink-0 ${subscriptionInfo.subscription_status === 'past_due' ? 'text-red-400' : subscriptionInfo.subscription_status === 'canceled' ? 'text-zinc-500' : 'text-emerald-400'}`} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium text-zinc-100">Abbonamento MINTHI</span>
                                                {/* Status chip — minimal, dot + label */}
                                                <span className={`inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-bold ${['active','trialing'].includes(subscriptionInfo.subscription_status || '') && !subscriptionInfo.subscription_cancel_at
                                                    ? 'text-emerald-400'
                                                    : ['active','trialing'].includes(subscriptionInfo.subscription_status || '') && subscriptionInfo.subscription_cancel_at
                                                        ? 'text-amber-400'
                                                        : subscriptionInfo.subscription_status === 'past_due'
                                                            ? 'text-red-400'
                                                            : 'text-zinc-500'
                                                    }`}>
                                                    {['active','trialing'].includes(subscriptionInfo.subscription_status || '') && !subscriptionInfo.subscription_cancel_at && <><span className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" />Attivo</>}
                                                    {['active','trialing'].includes(subscriptionInfo.subscription_status || '') && subscriptionInfo.subscription_cancel_at && <><span className="w-1 h-1 rounded-full bg-amber-400" />Annullato</>}
                                                    {subscriptionInfo.subscription_status === 'past_due' && <><span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />Pagamento fallito</>}
                                                    {subscriptionInfo.subscription_status === 'canceled' && <><span className="w-1 h-1 rounded-full bg-zinc-500" />Annullato</>}
                                                    {!subscriptionInfo.subscription_status && <><span className="w-1 h-1 rounded-full bg-emerald-500" />Attivo</>}
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-1">Piano mensile</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Inline notices — flat, subtle, no boxes */}
                                <div className="divide-y divide-white/[0.04]">
                                    {subscriptionInfo.subscription_status === 'past_due' && (
                                        <div className="py-3 flex items-start gap-3">
                                            <WarningCircle weight="fill" size={14} className="text-red-400 mt-0.5 shrink-0" />
                                            <p className="text-xs text-zinc-400 leading-relaxed">
                                                <span className="text-red-300 font-medium">Pagamento non riuscito.</span> Aggiorna il metodo di pagamento per evitare la sospensione del servizio.
                                            </p>
                                        </div>
                                    )}

                                    {subscriptionInfo.subscription_cancel_at && subscriptionInfo.subscription_status !== 'canceled' && (
                                        <div className="py-3 flex items-start gap-3">
                                            <WarningCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-zinc-300 font-medium">Abbonamento annullato</p>
                                                <p className="text-xs text-zinc-500 mt-0.5">
                                                    Servizi attivi fino al <span className="text-zinc-300">{new Date(subscriptionInfo.subscription_cancel_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {subscriptionInfo.subscription_status === 'canceled' && (
                                        <div className="py-3 flex items-start gap-3">
                                            <WarningCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-zinc-300 font-medium">Abbonamento annullato</p>
                                                <p className="text-xs text-zinc-500 mt-0.5">
                                                    {subscriptionInfo.subscription_cancel_at
                                                        ? <>Servizi attivi fino al <span className="text-zinc-300">{new Date(subscriptionInfo.subscription_cancel_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>. Riattiva per continuare.</>
                                                        : <>Riattiva per continuare ad usufruire dei servizi.</>
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {activeDiscount && activeDiscount.is_active && (
                                        <div className="py-3 flex items-start gap-3">
                                            <Receipt size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-zinc-300 font-medium">
                                                    Sconto attivo: {activeDiscount.discount_percent}%
                                                    {activeDiscount.discount_duration === 'forever' ? ' per sempre'
                                                        : activeDiscount.discount_duration === 'once' ? ' per 1 mese'
                                                            : ` per ${activeDiscount.discount_duration_months || activeDiscount.discount_duration} mesi`}
                                                </p>
                                                {priceAmount > 0 && !subscriptionInfo.subscription_cancel_at && (
                                                    <p className="text-xs text-zinc-500 mt-0.5">
                                                        Prossimo addebito: <span className="text-amber-300">€{(priceAmount * (1 - activeDiscount.discount_percent / 100)).toFixed(2)}/mese</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {nextPaymentDate && ['active','trialing'].includes(subscriptionInfo.subscription_status || '') && !subscriptionInfo.subscription_cancel_at && (
                                        <div className="py-3 flex items-center gap-3">
                                            <Clock size={14} className="text-zinc-500 shrink-0" />
                                            <p className="text-xs text-zinc-400">
                                                Prossimo addebito <span className="text-zinc-200 font-medium">{nextPaymentDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Actions — minimal ghost buttons */}
                                <div className="flex gap-2 mt-5">
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
                            </div>
                        ) : (
                            /* No subscription — flat centered pitch, no boxes */
                            <div data-tour="settings-subscription" className="py-10 text-center max-w-md mx-auto">
                                <CreditCard className="text-emerald-400 mx-auto mb-5" weight="fill" size={28} />
                                <h3 className="text-sm font-medium text-zinc-100 tracking-wide mb-1">Abbonamento MINTHI</h3>
                                <p className="text-xs text-zinc-500 mb-6">Sblocca tutte le funzionalità del gestionale</p>

                                <div className="flex items-baseline justify-center gap-1 mb-6">
                                    <span className="text-4xl font-light text-white tracking-tight">€49</span>
                                    <span className="text-zinc-500 text-sm">/mese</span>
                                </div>

                                <ul className="space-y-2.5 mb-8 text-left max-w-xs mx-auto">
                                    {['Ordini e tavoli illimitati', 'Menu digitale QR code', 'Supporto prioritario', 'Statistiche avanzate'].map((f, i) => (
                                        <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-300">
                                            <CheckCircle className="text-emerald-400 shrink-0" weight="fill" size={14} />
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
                        )}

                    </motion.div>
                </TabsContent>

                {/* 6. STAMPANTE CUCINA — flat sections, no Card */}
                <TabsContent value="printer">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="divide-y divide-white/[0.04]"
                    >
                        {/* Tipo di connessione — flat 2-col selector */}
                        <div className="py-7">
                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2 mb-5">
                                <Printer className="text-amber-500 w-3 h-3" weight="fill" />
                                Tipo di connessione
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'usb', icon: Printer, label: 'USB', desc: 'Cavo diretto al PC' },
                                    { id: 'network', icon: ArrowClockwise, label: 'WiFi / LAN', desc: 'Rete locale' },
                                ].map(({ id, icon: Icon, label, desc }) => {
                                    const active = printer.settings.mode === id;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => printer.updateSettings({ mode: id as 'usb' | 'network' })}
                                            className={`group relative flex items-center gap-3 p-4 rounded-md transition-all ${active
                                                ? 'bg-amber-500/[0.06] text-amber-300'
                                                : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200'
                                                }`}
                                        >
                                            {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />}
                                            <Icon size={16} weight={active ? 'fill' : 'regular'} className={active ? 'text-amber-400' : 'text-zinc-500'} />
                                            <div className="text-left min-w-0">
                                                <p className="text-sm font-medium">{label}</p>
                                                <p className="text-[11px] text-zinc-500">{desc}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Network: relay URL */}
                            {printer.settings.mode === 'network' && (
                                <div className="mt-5 space-y-2">
                                    <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">URL Relay</Label>
                                    <Input
                                        value={printer.settings.networkRelayUrl}
                                        onChange={(e) => printer.updateSettings({ networkRelayUrl: e.target.value })}
                                        placeholder="ws://localhost:8765"
                                        className="bg-transparent border-0 border-b border-white/10 rounded-none h-9 px-0 font-mono text-sm focus-visible:ring-0 focus-visible:border-amber-500"
                                    />
                                    <p className="text-[11px] text-zinc-500">Lascia il default se il relay gira sullo stesso PC.</p>
                                </div>
                            )}

                            {/* Browser support check (USB only) */}
                            {printer.settings.mode === 'usb' && !printer.isSupported && (
                                <div className="mt-5 flex items-start gap-3">
                                    <WarningCircle size={14} weight="fill" className="text-red-400 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-red-300">Browser non compatibile</p>
                                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                                            Usa Google Chrome o Microsoft Edge per collegare la stampante USB. Safari e Firefox non supportano WebUSB.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Stato connessione — flat row */}
                        {printer.isSupported && (
                            <div className="py-7">
                                <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4">
                                    Stato
                                </h3>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${printer.connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-600'}`} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-zinc-100">
                                                {printer.connected ? 'Stampante collegata' : 'Nessuna stampante'}
                                            </p>
                                            <p className="text-[11px] text-zinc-500 mt-0.5">
                                                {printer.connected
                                                    ? 'Pronta per stampare'
                                                    : printer.settings.mode === 'network'
                                                        ? 'Avvia il relay sul PC della cucina, poi clicca Connetti'
                                                        : 'Collega la stampante via cavo USB al PC'
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
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                            try {
                                                await printer.printTestPage()
                                                toast.success('Stampa di prova inviata!')
                                            } catch (e: any) {
                                                toast.error(e.message || 'Errore stampa')
                                            }
                                        }}
                                        className="mt-3 h-8 px-3 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] gap-2"
                                    >
                                        <Printer size={13} />
                                        Stampa di prova
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* Preferenze — flat rows */}
                        {printer.isSupported && (
                            <div className="py-7">
                                <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4">
                                    Preferenze di stampa
                                </h3>
                                <div className="divide-y divide-white/[0.04]">
                                    {[
                                        { key: 'autoPrint', label: 'Stampa automatica', desc: 'Le nuove comande vengono stampate automaticamente' },
                                        { key: 'autoCut', label: 'Taglio automatico', desc: 'Taglia la carta dopo ogni comanda' },
                                        { key: 'courseSeparate', label: 'Scontrino separato per portata', desc: 'Ogni portata su un foglio diverso' },
                                    ].map(({ key, label, desc }) => (
                                        <div key={key} className="flex items-start justify-between gap-4 py-3.5">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-zinc-200">{label}</p>
                                                <p className="text-xs text-zinc-500 mt-1">{desc}</p>
                                            </div>
                                            <Switch
                                                checked={(printer.settings as any)[key]}
                                                onCheckedChange={(checked) => printer.updateSettings({ [key]: checked } as any)}
                                                className="data-[state=checked]:bg-amber-500 shrink-0 mt-0.5"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Istruzioni — flat text block */}
                        <div className="py-7">
                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-2 mb-4">
                                <Info className="text-amber-500 w-3 h-3" weight="fill" />
                                Come installare {printer.settings.mode === 'usb' ? '(USB)' : '(WiFi / LAN)'}
                            </h3>
                            {printer.settings.mode === 'usb' ? (
                                <>
                                    <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                                        <li>Collega la stampante termica al PC/tablet via cavo USB</li>
                                        <li>Clicca "Collega" qui sopra</li>
                                        <li>Seleziona la stampante dalla finestra del browser</li>
                                        <li>Fai una stampa di prova per verificare</li>
                                    </ol>
                                    <p className="text-[11px] text-zinc-500 mt-3">
                                        Compatibile con Epson, Star, MUNBYN e tutte le stampanti termiche ESC/POS. Richiede Chrome o Edge.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                                        <li>Collega la stampante alla rete WiFi o via cavo LAN</li>
                                        <li>Segna l'IP della stampante (es. 192.168.1.50)</li>
                                        <li>Sul PC collegato alla stessa rete, installa Node.js da nodejs.org</li>
                                        <li>Scarica <code className="text-amber-300 bg-white/[0.04] px-1 rounded text-[10px]">printer-relay.js</code> nella cartella del progetto</li>
                                        <li>Terminale: <code className="text-amber-300 bg-white/[0.04] px-1 rounded text-[10px]">npm install ws && node printer-relay.js 192.168.1.50</code></li>
                                        <li>Lascia aperto, poi clicca "Connetti Relay" qui sopra</li>
                                        <li>Fai una stampa di prova</li>
                                    </ol>
                                    <p className="text-[11px] text-zinc-500 mt-3">
                                        Il relay va fatto girare sul PC della cassa. Compatibile con Epson TM-T20III, Star, MUNBYN e altre stampanti di rete.
                                    </p>
                                </>
                            )}
                        </div>
                    </motion.div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
