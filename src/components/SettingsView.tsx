import { motion } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    ArrowClockwise
} from '@phosphor-icons/react'
import { SoundType } from '../utils/SoundManager'
import WeeklyScheduleEditor from './WeeklyScheduleEditor'
import WeeklyServiceHoursEditor from './WeeklyServiceHoursEditor'
import { DatabaseService } from '@/services/DatabaseService'
import { supabase } from '@/lib/supabase'
import type { WeeklyCopertoSchedule, WeeklyAyceSchedule, RestaurantStaff, WeeklyServiceSchedule, SubscriptionPayment } from '@/services/types'
import { createDefaultCopertoSchedule, createDefaultAyceSchedule } from '@/utils/pricingUtils'
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

    restaurantId: string
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
    restaurantId
}: SettingsViewProps) {

    const [stripePaymentsEnabled, setStripePaymentsEnabled] = useState(false)
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
                .select('enable_stripe_payments, stripe_subscription_id, stripe_connect_account_id, stripe_connect_enabled, subscription_status, subscription_cancel_at, vat_number, billing_name')
                .eq('id', restaurantId)
                .single()
            if (data) {
                setStripePaymentsEnabled(data.enable_stripe_payments || false)
                setSubscriptionInfo(data)
                setVatNumber(data.vat_number || '')
                setBillingName(data.billing_name || '')
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
    const nextPaymentDate = (() => {
        const paid = subscriptionPayments.filter(p => p.status === 'paid' && p.period_end)
        if (!paid.length) return null
        const last = paid[0] // già ordinato per created_at desc
        if (!last.period_end) return null
        return new Date(last.period_end)
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
        <div className="space-y-8 pb-24 text-zinc-100">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4 pb-4 border-b border-white/10"
            >
                <div>
                    <h2 className="text-2xl font-light text-white tracking-tight">Gestione <span className="font-bold text-amber-500">Impostazioni</span></h2>
                    <p className="text-sm text-zinc-400 mt-1 uppercase tracking-wider font-medium">
                        Configura ogni aspetto del tuo ristorante
                    </p>
                </div>
            </motion.div>

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="w-full justify-start h-auto bg-transparent border-b border-white/10 p-0 pb-0 mb-8 gap-6 overflow-x-auto [overflow:visible]">
                    <TabsTrigger
                        value="general"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent px-2 py-3 text-zinc-400 data-[state=active]:text-amber-400 transition-all font-medium gap-2 focus-visible:outline-none focus-visible:ring-0"
                    >
                        <Storefront size={20} />
                        Generale
                    </TabsTrigger>
                    <TabsTrigger
                        value="costs"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent px-2 py-3 text-zinc-400 data-[state=active]:text-amber-400 transition-all font-medium gap-2 focus-visible:outline-none focus-visible:ring-0"
                    >
                        <Coins size={20} />
                        Costi & Menu
                    </TabsTrigger>
                    <TabsTrigger
                        value="staff"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent px-2 py-3 text-zinc-400 data-[state=active]:text-amber-400 transition-all font-medium gap-2 focus-visible:outline-none focus-visible:ring-0"
                    >
                        <Users size={20} />
                        Staff
                    </TabsTrigger>
                    <TabsTrigger
                        value="reservations"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent px-2 py-3 text-zinc-400 data-[state=active]:text-amber-400 transition-all font-medium gap-2 focus-visible:outline-none focus-visible:ring-0"
                    >
                        <CalendarCheck size={20} />
                        Prenotazioni
                    </TabsTrigger>
                    <TabsTrigger
                        value="subscription"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-2 py-3 text-zinc-400 data-[state=active]:text-emerald-400 transition-all font-medium gap-2 focus-visible:outline-none focus-visible:ring-0"
                    >
                        <CreditCard size={20} />
                        Abbonamento & Pagamenti
                    </TabsTrigger>
                </TabsList>

                {/* 1. SEZIONE GENERALE */}
                <TabsContent value="general">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="grid gap-6"
                    >
                        {/* Nome Ristorante */}
                        <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                <Storefront className="text-amber-500 w-8 h-8" weight="duotone" />
                                Profilo Attività
                            </h3>
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
                        <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                <SpeakerHigh className="text-amber-500 w-8 h-8" weight="duotone" />
                                Notifiche Sonore
                            </h3>
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
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
                        <div className="grid gap-6">
                            {/* All You Can Eat - Weekly Schedule */}
                            <div className="relative p-6 rounded-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 border border-white/5 overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                    <ForkKnife size={120} weight="fill" />
                                </div>
                                <div className="relative z-10">
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
                            <div className="relative p-6 rounded-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 border border-white/5 overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                    <Coins size={120} weight="fill" />
                                </div>
                                <div className="relative z-10">
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
                            <div className="col-span-full p-6 sm:p-8 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-bold flex items-center gap-3">
                                            <ForkKnife className="text-amber-500 w-8 h-8" weight="duotone" />
                                            Suddivisione in Portate
                                        </h3>
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

                            {/* Menu Solo Visualizzazione */}
                            <div className="col-span-full p-6 sm:p-8 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-bold flex items-center gap-3">
                                            <Eye className="text-amber-500 w-8 h-8" weight="duotone" />
                                            Menu Solo Visualizzazione
                                        </h3>
                                        <p className="text-sm text-zinc-400 max-w-prose">
                                            Se attivo, i clienti potranno visualizzare il menù senza la possibilità di ordinare. I QR code mostreranno "Scansiona per visualizzare il menù".
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
                            <div className="col-span-full p-6 sm:p-8 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-bold flex items-center gap-3">
                                            <Clock className="text-amber-500 w-8 h-8" weight="duotone" />
                                            Tempo Medio di Cottura
                                        </h3>
                                        <p className="text-sm text-zinc-400 max-w-prose">
                                            Se attivo, mostra il tempo medio di preparazione sotto ogni piatto nel menù cliente e nella dashboard cameriere. Calcolato sugli ultimi 2 mesi (minimo 3 ordini).
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
                        <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                                        <Users size={32} weight="duotone" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white">Gestione Staff <span className="text-amber-500">(Camerieri)</span></h3>
                                        <p className="text-zinc-400 text-sm mt-1">Crea e gestisci le credenziali dei camerieri</p>
                                    </div>
                                </div>
                                <Switch
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

                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Key size={20} className="text-amber-500" />
                                            <h4 className="text-xl font-bold text-zinc-200">Credenziali Camerieri</h4>
                                        </div>
                                        <Button
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
                            <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm shadow-xl flex flex-col justify-center">
                                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                    <Clock className="text-amber-500 w-8 h-8" weight="duotone" />
                                    Turnazione Tavoli
                                </h3>
                                <p className="text-sm text-zinc-400 mb-6">Durata standard prenotazione</p>
                                <Select
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
                            <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm shadow-xl flex flex-col justify-center">
                                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                    <Storefront className="text-amber-500 w-8 h-8" weight="duotone" />
                                    Prenotazioni via QR
                                </h3>
                                <p className="text-sm text-zinc-400 mb-6">Configura l'accesso pubblico per le prenotazioni via QR Code dei clienti.</p>

                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1 block pr-4">
                                            <Label className="text-base font-semibold text-zinc-200 leading-none block">Abilita Prenotazioni da QR</Label>
                                            <p className="text-xs text-zinc-400 hidden sm:block">Se disattivato, il QR mostrerà un avviso di servizio sospeso al momento.</p>
                                        </div>
                                        <Switch
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

                        {/* Bottom row: Orari di Servizio (Full Width) */}
                        <div className="relative pt-6 sm:pt-8 w-full max-w-4xl mx-auto overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.03] transition-opacity duration-500 group-hover:opacity-5 pointer-events-none">
                                <Clock size={200} weight="fill" />
                            </div>
                            <div className="relative z-10 w-full">
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
                    </motion.div>
                </TabsContent>

                {/* 5. SEZIONE ABBONAMENTO STRIPE E PAGAMENTI CLIENTI */}
                <TabsContent value="subscription">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-6"
                    >
                        {/* 1. Pagamenti Online — Toggle + Connect */}
                        <div className="rounded-2xl bg-zinc-900/50 border border-white/5 overflow-hidden">
                            <div className="p-6 sm:p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                                            <CreditCard weight="duotone" size={32} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-bold text-white">Pagamenti al Tavolo</h3>
                                            <p className="text-sm text-zinc-400 mt-1">I clienti pagano direttamente dal menu digitale con carta</p>
                                        </div>
                                    </div>
                                    <Switch
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
                                        className="data-[state=checked]:bg-amber-500"
                                    />
                                </div>

                                {stripePaymentsEnabled && (
                                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                                        <div className="flex items-center gap-3 p-4 bg-violet-500/5 rounded-xl border border-violet-500/10">
                                            <Button
                                                variant="outline"
                                                onClick={() => setShowStripeGuide(true)}
                                                className="w-full h-12 text-base rounded-xl gap-2 border-violet-500/30 text-violet-300 hover:bg-violet-500/10 hover:text-white"
                                            >
                                                📖 Come funziona il pagamento con Stripe?
                                            </Button>
                                        </div>

                                        {/* Connect Status */}
                                        <div className={`flex items-center justify-between p-4 rounded-xl border ${subscriptionInfo?.stripe_connect_enabled
                                            ? 'bg-emerald-500/5 border-emerald-500/10'
                                            : subscriptionInfo?.stripe_connect_account_id
                                                ? 'bg-amber-500/5 border-amber-500/10'
                                                : 'bg-zinc-800/50 border-white/5'
                                            }`}>
                                            <div className="flex items-center gap-3">
                                                {subscriptionInfo?.stripe_connect_enabled ? (
                                                    <CheckCircle weight="fill" size={24} className="text-emerald-400" />
                                                ) : subscriptionInfo?.stripe_connect_account_id ? (
                                                    <Warning weight="fill" size={24} className="text-amber-400" />
                                                ) : (
                                                    <Buildings size={24} className="text-zinc-500" />
                                                )}
                                                <div>
                                                    <p className="text-base font-semibold text-white">
                                                        {subscriptionInfo?.stripe_connect_enabled
                                                            ? 'Account collegato'
                                                            : subscriptionInfo?.stripe_connect_account_id
                                                                ? 'Configurazione incompleta'
                                                                : 'Account non collegato'}
                                                    </p>
                                                    <p className="text-sm text-zinc-500 mt-0.5">
                                                        {subscriptionInfo?.stripe_connect_enabled
                                                            ? 'I pagamenti arrivano direttamente sul tuo conto'
                                                            : 'Collega il tuo account Stripe per ricevere pagamenti'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <Button
                                                    onClick={handleConnectOnboarding}
                                                    disabled={loadingConnectOnboarding}
                                                    variant={subscriptionInfo?.stripe_connect_enabled ? 'outline' : 'default'}
                                                    className={`h-11 px-5 text-sm rounded-xl gap-2 ${!subscriptionInfo?.stripe_connect_enabled ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-[0_0_15px_-3px_rgba(139,92,246,0.4)]' : 'border-violet-500/30 text-violet-300 hover:bg-violet-500/10'}`}
                                                >
                                                    {loadingConnectOnboarding ? (
                                                        <ArrowClockwise className="animate-spin" size={18} />
                                                    ) : (
                                                        <Gear size={18} />
                                                    )}
                                                    {subscriptionInfo?.stripe_connect_enabled ? 'Apri Dashboard Stripe ↗' : subscriptionInfo?.stripe_connect_account_id ? 'Completa Configurazione ↗' : 'Collega Account Stripe ↗'}
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Payout info when connected */}
                                        {subscriptionInfo?.stripe_connect_enabled && (
                                            <div className="mt-3 space-y-3">
                                                <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10">
                                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                                        💰 I clienti pagano con carta → i soldi arrivano sul <span className="text-white font-medium">tuo conto bancario</span> automaticamente. Apri la <span className="text-violet-400">Dashboard Stripe</span> per gestire pagamenti, fatture e commissioni.
                                                    </p>
                                                </div>

                                                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                                    <p className="text-sm text-zinc-500 leading-relaxed">
                                                        ⚠️ Il pagamento digitale <span className="text-zinc-300">non sostituisce</span> lo scontrino fiscale. Consulta la <button onClick={() => setShowStripeGuide(true)} className="text-amber-400 underline underline-offset-2 hover:text-amber-300">Guida Pagamenti</button> per tutti i dettagli fiscali.
                                                    </p>
                                                </div>
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
                        </div>

                        {/* 2. Abbonamento */}
                        {subscriptionInfo?.stripe_subscription_id ? (
                            <div className="space-y-6">
                                {/* Active Subscription Card */}
                                <div className={`rounded-2xl border overflow-hidden ${subscriptionInfo.subscription_status === 'past_due'
                                    ? 'bg-zinc-900/50 border-red-500/20'
                                    : subscriptionInfo.subscription_status === 'canceled'
                                        ? 'bg-zinc-900/50 border-white/5'
                                        : 'bg-zinc-900/50 border-emerald-500/10'
                                    }`}>
                                    <div className="p-6 sm:p-8">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-3 rounded-xl flex items-center justify-center ${subscriptionInfo.subscription_status === 'past_due' ? 'bg-red-500/10'
                                                    : subscriptionInfo.subscription_status === 'canceled' ? 'bg-zinc-800'
                                                        : 'bg-emerald-500/10'
                                                    }`}>
                                                    <CreditCard className={`${subscriptionInfo.subscription_status === 'past_due' ? 'text-red-400'
                                                        : subscriptionInfo.subscription_status === 'canceled' ? 'text-zinc-400'
                                                            : 'text-emerald-400'
                                                        }`} weight="duotone" size={28} />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold text-white">Abbonamento MINTHI</h3>
                                                    <p className="text-sm text-zinc-500 mt-0.5">Piano mensile</p>
                                                </div>
                                            </div>
                                            {/* Status */}
                                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${subscriptionInfo.subscription_status === 'active'
                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                : subscriptionInfo.subscription_status === 'past_due'
                                                    ? 'bg-red-500/10 text-red-400'
                                                    : 'bg-zinc-800 text-zinc-400'
                                                }`}>
                                                {subscriptionInfo.subscription_status === 'active' && <><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Attivo</>}
                                                {subscriptionInfo.subscription_status === 'past_due' && <><WarningCircle weight="fill" size={16} />Pagamento fallito</>}
                                                {subscriptionInfo.subscription_status === 'canceled' && 'Annullato'}
                                                {!subscriptionInfo.subscription_status && 'Attivo'}
                                            </span>
                                        </div>

                                        {/* Past due warning */}
                                        {subscriptionInfo.subscription_status === 'past_due' && (
                                            <div className="flex items-start gap-3 p-4 bg-red-500/5 rounded-xl border border-red-500/10 mb-5">
                                                <WarningCircle weight="fill" size={20} className="text-red-400 mt-0.5 shrink-0" />
                                                <p className="text-sm text-zinc-400 leading-relaxed">
                                                    <span className="text-red-400 font-medium">Pagamento non riuscito.</span> Aggiorna il metodo di pagamento per evitare la sospensione del servizio.
                                                </p>
                                            </div>
                                        )}

                                        {/* Cancel at period end notice */}
                                        {subscriptionInfo.subscription_cancel_at && subscriptionInfo.subscription_status !== 'canceled' && (
                                            <div className="flex items-center gap-3 p-4 bg-amber-500/5 rounded-xl border border-amber-500/10 mb-5">
                                                <WarningCircle size={20} className="text-amber-400 shrink-0" />
                                                <div>
                                                    <p className="text-sm text-white font-medium">Abbonamento disdetto</p>
                                                    <p className="text-sm text-zinc-400 mt-0.5">
                                                        Potrai continuare ad usufruire di tutti i servizi fino al <span className="text-white font-medium">{new Date(subscriptionInfo.subscription_cancel_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Fully canceled notice */}
                                        {subscriptionInfo.subscription_status === 'canceled' && (
                                            <div className="flex items-center gap-3 p-4 bg-red-500/5 rounded-xl border border-red-500/10 mb-5">
                                                <WarningCircle size={20} className="text-red-400 shrink-0" />
                                                <div>
                                                    <p className="text-sm text-white font-medium">Abbonamento annullato</p>
                                                    <p className="text-sm text-zinc-400 mt-0.5">
                                                        {subscriptionInfo.subscription_cancel_at
                                                            ? <>I servizi sono rimasti attivi fino al <span className="text-white font-medium">{new Date(subscriptionInfo.subscription_cancel_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>. Riattiva l'abbonamento per continuare.</>
                                                            : <>L'abbonamento è stato annullato. Riattiva per continuare ad usufruire dei servizi.</>
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Active discount */}
                                        {activeDiscount && activeDiscount.is_active && (
                                            <div className="flex items-center gap-3 p-4 bg-amber-500/5 rounded-xl border border-amber-500/10 mb-5">
                                                <Receipt size={20} className="text-amber-400 shrink-0" />
                                                <div className="flex-1">
                                                    <p className="text-sm text-white font-medium">
                                                        Sconto attivo: {activeDiscount.discount_percent}%
                                                        {activeDiscount.discount_duration === 'forever' ? ' per sempre'
                                                            : activeDiscount.discount_duration === 'once' ? ' per 1 mese'
                                                                : ` per ${activeDiscount.discount_duration_months || activeDiscount.discount_duration} mesi`}
                                                    </p>
                                                    {priceAmount > 0 && (
                                                        <p className="text-xs text-zinc-500 mt-0.5">
                                                            Prossimo addebito scontato: <span className="text-amber-400">€{(priceAmount * (1 - activeDiscount.discount_percent / 100)).toFixed(2)}/mese</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Next billing — only when truly active and not cancelling */}
                                        {nextPaymentDate && subscriptionInfo.subscription_status === 'active' && !subscriptionInfo.subscription_cancel_at && (
                                            <div className="flex items-center gap-3 p-4 bg-black/20 rounded-xl mb-5">
                                                <Clock size={20} className="text-zinc-500 shrink-0" />
                                                <p className="text-sm text-zinc-400">
                                                    Prossimo addebito: <span className="text-white font-medium">{nextPaymentDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                                </p>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-3">
                                            <Button
                                                onClick={handleOpenBillingPortal}
                                                disabled={loadingBillingPortal}
                                                className="flex-1 h-11 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-xl gap-2"
                                            >
                                                {loadingBillingPortal ? (
                                                    <ArrowClockwise className="animate-spin" size={18} />
                                                ) : (
                                                    <ArrowSquareOut size={18} />
                                                )}
                                                Gestisci Abbonamento
                                            </Button>
                                            <Button
                                                onClick={handleOpenBillingPortal}
                                                disabled={loadingBillingPortal}
                                                variant="outline"
                                                className="h-11 text-sm border-white/10 text-zinc-400 hover:text-white rounded-xl gap-2 px-5"
                                            >
                                                <Receipt size={18} />
                                                Fatture
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        ) : (
                            /* No subscription */
                            <div className="rounded-2xl bg-zinc-900/50 border border-white/5 overflow-hidden">
                                <div className="p-6 sm:p-8 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
                                        <CreditCard className="text-emerald-500" weight="bold" size={32} />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">Abbonamento MINTHI</h3>
                                    <p className="text-base text-zinc-500 mb-6">Sblocca tutte le funzionalità del gestionale</p>

                                    <div className="bg-black/30 rounded-xl p-6 mb-6 text-left">
                                        <div className="flex items-baseline gap-1 mb-5">
                                            <span className="text-3xl font-bold text-white">€49</span>
                                            <span className="text-zinc-500 text-base">/mese</span>
                                        </div>
                                        <div className="space-y-3">
                                            {['Ordini e tavoli illimitati', 'Menu digitale QR code', 'Supporto prioritario', 'Statistiche avanzate'].map((f, i) => (
                                                <div key={i} className="flex items-center gap-3 text-base text-zinc-300">
                                                    <CheckCircle className="text-emerald-500 shrink-0" weight="fill" size={20} />
                                                    {f}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <Button
                                        className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base rounded-xl shadow-[0_0_20px_-3px_rgba(16,185,129,0.4)]"
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
                                    <p className="text-xs text-zinc-600 mt-3">Pagamenti sicuri gestiti da Stripe</p>
                                </div>
                            </div>
                        )}

                    </motion.div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
