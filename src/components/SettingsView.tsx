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
    Palette,
    Eye,
    EyeSlash
} from '@phosphor-icons/react'
import { SoundType } from '../utils/SoundManager'
import { STYLE_PRESETS, COLOR_OPTIONS } from '../utils/menuTheme'
import WeeklyScheduleEditor from './WeeklyScheduleEditor'
import WeeklyServiceHoursEditor from './WeeklyServiceHoursEditor'
import { DatabaseService } from '@/services/DatabaseService'
import type { WeeklyCopertoSchedule, WeeklyAyceSchedule, RestaurantStaff, WeeklyServiceSchedule } from '@/services/types'
import { createDefaultCopertoSchedule, createDefaultAyceSchedule } from '@/utils/pricingUtils'
import { toast } from 'sonner'
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

    menuStyle: string
    setMenuStyle: (style: string) => void
    menuPrimaryColor: string
    setMenuPrimaryColor: (color: string) => void
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
    menuStyle,
    setMenuStyle,
    menuPrimaryColor,
    setMenuPrimaryColor,
    restaurantId
}: SettingsViewProps) {

    const [staffList, setStaffList] = useState<RestaurantStaff[]>([])
    const [isStaffLoading, setIsStaffLoading] = useState(false)
    const [showStaffDialog, setShowStaffDialog] = useState(false)
    const [editingStaff, setEditingStaff] = useState<RestaurantStaff | null>(null)
    const [staffForm, setStaffForm] = useState({ name: '', username: '', password: '', is_active: true })

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

    useEffect(() => {
        loadStaff()
    }, [restaurantId])

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
                username: `${restaurantName.toLowerCase().replace(/\\s+/g, '-')}.${staffForm.username.toLowerCase().replace(/\\s+/g, '')}`,
                is_active: staffForm.is_active,
                role: 'WAITER'
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
                        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Storefront className="text-amber-500" />
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
                        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <SpeakerHigh className="text-amber-500" />
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
                            <div className="col-span-full p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-bold flex items-center gap-2">
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
                            <div className="col-span-full p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-bold flex items-center gap-2">
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

                            {/* Personalizzazione Tema Menu */}
                            <div className="col-span-full p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        <Palette className="text-amber-500" />
                                        Personalizzazione Menu Cliente
                                    </h3>
                                </div>

                                <div className="space-y-8">
                                    {/* Style Selection */}
                                    <div className="space-y-4">
                                        <Label className="text-base font-semibold">Stile Interfaccia</Label>
                                        <p className="text-sm text-zinc-400">Scegli il design generale del menu visualizzato dai clienti.</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {STYLE_PRESETS.map((preset) => (
                                                <div
                                                    key={preset.key}
                                                    onClick={() => setMenuStyle(preset.key)}
                                                    className={`cursor-pointer p-4 rounded-xl border transition-all ${menuStyle === preset.key ? 'bg-amber-500/10 border-amber-500/50' : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/20'}`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`font-semibold ${menuStyle === preset.key ? 'text-amber-400' : 'text-zinc-200'}`}>{preset.label}</span>
                                                        {menuStyle === preset.key && <CheckCircle className="text-amber-500" weight="fill" />}
                                                    </div>
                                                    <p className="text-xs text-zinc-400">{preset.description}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Color Selection */}
                                    <div className="space-y-4">
                                        <Label className="text-base font-semibold">Colore Principale</Label>
                                        <p className="text-sm text-zinc-400">Seleziona il colore principale per bottoni, icone e accenti.</p>
                                        <div className="flex flex-wrap gap-4">
                                            {COLOR_OPTIONS.map((color) => (
                                                <div
                                                    key={color.hex}
                                                    onClick={() => setMenuPrimaryColor(color.hex)}
                                                    className={`cursor-pointer group flex flex-col items-center gap-2 transition-all p-2 rounded-xl ${menuPrimaryColor === color.hex ? 'bg-white/5 shadow-sm' : 'hover:bg-white/5'}`}
                                                >
                                                    <div
                                                        className={`w-12 h-12 rounded-full ring-2 ring-offset-2 ring-offset-zinc-950 transition-all ${menuPrimaryColor === color.hex ? 'ring-amber-500 scale-110' : 'ring-transparent scale-100 group-hover:scale-110 group-hover:ring-white/20'}`}
                                                        style={{ backgroundColor: color.hex, backgroundImage: `linear-gradient(135deg, ${color.lightHex} 0%, ${color.hex} 50%, ${color.darkHex} 100%)` }}
                                                    />
                                                    <span className={`text-xs font-medium ${menuPrimaryColor === color.hex ? 'text-amber-400' : 'text-zinc-400'}`}>{color.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
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
                        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-zinc-500/10 rounded-xl text-zinc-100">
                                        <Users size={24} weight="duotone" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold">Gestione Staff (Camerieri)</h3>
                                        <p className="text-zinc-400 text-sm">Crea e gestisci le credenziali dei camerieri</p>
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
                            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm shadow-xl flex flex-col justify-center">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/15 text-amber-500 border border-amber-500/20 shadow-inner">
                                        <Clock size={20} weight="duotone" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">Turnazione Tavoli</h3>
                                        <p className="text-xs text-zinc-500">Durata standard prenotazione</p>
                                    </div>
                                </div>
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
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* QR Code & Prenotazioni Pubbliche */}
                            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm shadow-xl flex flex-col justify-center">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/15 text-amber-500 border border-amber-500/20 shadow-inner">
                                        <Storefront size={20} weight="duotone" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">Prenotazioni via QR</h3>
                                        <p className="text-xs text-zinc-500">Configura l'accesso pubblico</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1 pr-4">
                                            <Label className="text-base font-semibold text-zinc-200 leading-none">Abilita Prenotazioni da QR</Label>
                                            <p className="text-xs text-zinc-400">Se disattivato, il QR mostrerà un avviso di servizio sospeso.</p>
                                        </div>
                                        <Switch
                                            checked={enablePublicReservations}
                                            onCheckedChange={setEnablePublicReservations}
                                            className="data-[state=checked]:bg-amber-500 scale-110 shrink-0"
                                        />
                                    </div>
                                    <Separator className="bg-white/5" />
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1 pr-4">
                                            <Label className="text-base font-semibold text-zinc-200 leading-none">Consenti Scelta Sala</Label>
                                            <p className="text-xs text-zinc-400">Permetti ai clienti di indicare preferenze sulla zona.</p>
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
            </Tabs >
        </div >
    )
}
