import React, { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
    CalendarCheck, Users, Clock, ForkKnife, Info, MapPin, Phone,
    CaretLeft, CaretRight, CheckCircle, WarningCircle, X, Storefront,
    InstagramLogo, FacebookLogo, WhatsappLogo, EnvelopeSimple, Sparkle
} from "@phosphor-icons/react"
import { format, addDays, isSameDay } from "date-fns"
import { it } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input" // Input kept for name/phone, not email
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import type { Restaurant, Dish, Category, Room } from "@/services/types"

// --- TYPES ---
interface TimeSlot {
    time: string
    available: boolean
}

interface BookingFormData {
    name: string
    phone: string
    notes: string
    guests: number
    date: Date | null
    time: string | null
    roomId: string | null
}

const PublicReservationPage = () => {
    const { restaurantId } = useParams<{ restaurantId: string }>()
    const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Form State
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [formData, setFormData] = useState<BookingFormData>({
        name: "",
        phone: "",
        notes: "",
        guests: 2,
        date: new Date(),
        time: null,
        roomId: null
    })

    // Data State
    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([])
    const [menuPreviewOpen, setMenuPreviewOpen] = useState(false)
    const [categories, setCategories] = useState<Category[]>([])

    const [dishes, setDishes] = useState<Dish[]>([])
    const [rooms, setRooms] = useState<Room[]>([])

    // --- INIT ---
    useEffect(() => {
        const fetchData = async () => {
            if (!restaurantId) return

            try {
                setLoading(true)
                // 1. Fetch Restaurant
                const { data: rest, error: restError } = await supabase
                    .from("restaurants")
                    .select("*")
                    .eq("id", restaurantId)
                    .single()

                if (restError) throw restError
                setRestaurant(rest)

                // 2. Fetch Menu for Preview (Categories & Dishes)
                const { data: cats } = await supabase
                    .from("categories")
                    .select("*")
                    .eq("restaurant_id", restaurantId)
                    .order("order", { ascending: true })

                const { data: d } = await supabase
                    .from("dishes")
                    .select("*")
                    .eq("restaurant_id", restaurantId)
                    .eq("is_active", true)

                if (cats) setCategories(cats)

                if (d) setDishes(d)

                // 3. Fetch Rooms if enabled
                if (rest.enable_reservation_room_selection) {
                    const { data: r } = await supabase
                        .from('rooms')
                        .select('id, restaurant_id, name, is_active, "order"')
                        .eq('restaurant_id', restaurantId)
                    if (r) setRooms(r)
                    // 4. Fetch Tables to calculate capacity
                    const { data: t } = await supabase
                        .from('tables')
                        .select('id, number, restaurant_id, seats, room_id, is_active')
                        .eq('restaurant_id', restaurantId)

                    if (t) {
                        // We don't need to store tables in state here as they are fetched in the slots effect
                    }

                } // End if room selection
            } catch (err: any) {
                console.error("Error fetching reservation page:", err)
                setError("Impossibile caricare la pagina del ristorante.")
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [restaurantId])

    // --- LOGIC: GENERATE SLOTS ---
    useEffect(() => {
        const fetchOccupancyAndGenerateSlots = async () => {
            if (!restaurant || !formData.date || !restaurantId) return

            try {
                const dateStr = format(formData.date, 'yyyy-MM-dd')

                // 1. Fetch all bookings for this day
                const { data: dayBookings } = await supabase
                    .from('bookings')
                    .select('date_time, guests, status')
                    .eq('restaurant_id', restaurantId)
                    .neq('status', 'CANCELLED')
                    .gte('date_time', `${dateStr}T00:00:00`)
                    .lte('date_time', `${dateStr}T23:59:59`)

                // 2. Calculate Total Capacity
                // If the user has tables, sum of seats. Otherwise use a fallback.
                const { data: tables } = await supabase
                    .from('tables')
                    .select('id, seats, is_active')
                    .eq('restaurant_id', restaurantId)

                const activeTables = tables?.filter(t => t.is_active !== false) || []
                const totalCapacity = activeTables.length > 0
                    ? activeTables.reduce((sum, t) => sum + (t.seats || 4), 0)
                    : 50

                // If reservation_duration is 9999 (infinite/until end of service), use 240 for slot calculation on public page
                const rawDuration = restaurant.reservation_duration || 120
                const reservationDuration = rawDuration >= 9999 ? 240 : rawDuration

                const checkAvailable = (slotTime: string) => {
                    const [sH, sM] = slotTime.split(':').map(Number)
                    const slotMinutes = sH * 60 + sM
                    const slotEndMinutes = slotMinutes + reservationDuration

                    const capableTables = activeTables.filter(t => (t.seats || 4) >= formData.guests)
                    if (capableTables.length === 0) return false

                    return capableTables.some(table => {
                        const tableBookings = (dayBookings as any[])?.filter(b => b.table_id === table.id) || []
                        const hasConflict = tableBookings.some(b => {
                            const bTime = new Date(b.date_time)
                            const bStartMinutes = bTime.getHours() * 60 + bTime.getMinutes()
                            const bEndMinutes = bStartMinutes + reservationDuration
                            return (slotMinutes < bEndMinutes && slotEndMinutes > bStartMinutes)
                        })
                        return !hasConflict
                    })
                }

                const generateSlots = () => {
                    const slots: TimeSlot[] = []

                    // Read service hours from restaurant settings
                    const schedule = restaurant.weekly_service_hours as any
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
                    const selectedDay = formData.date ? days[formData.date.getDay()] : null

                    let lunchEnabled = true
                    let dinnerEnabled = true
                    let startLunchH = 12, endLunchH = 15
                    let startDinnerH = 19, endDinnerH = 23
                    let startLunchM = 0, endLunchM = 0
                    let startDinnerM = 0, endDinnerM = 0

                    if (schedule?.useWeeklySchedule && selectedDay && schedule.schedule?.[selectedDay]) {
                        const dayConfig = schedule.schedule[selectedDay]
                        const lunch = dayConfig?.lunch
                        const dinner = dayConfig?.dinner

                        lunchEnabled = lunch?.enabled ?? false
                        dinnerEnabled = dinner?.enabled ?? false

                        if (lunch?.start) {
                            const [h, m] = lunch.start.split(':').map(Number)
                            startLunchH = h; startLunchM = m
                        }
                        if (lunch?.end) {
                            const [h, m] = lunch.end.split(':').map(Number)
                            endLunchH = h; endLunchM = m
                        }
                        if (dinner?.start) {
                            const [h, m] = dinner.start.split(':').map(Number)
                            startDinnerH = h; startDinnerM = m
                        }
                        if (dinner?.end) {
                            const [h, m] = dinner.end.split(':').map(Number)
                            endDinnerH = h; endDinnerM = m
                        }
                    }

                    const addSlots = (fromH: number, fromM: number, toH: number, toM: number) => {
                        const startMin = fromH * 60 + fromM
                        const endMin = toH * 60 + toM
                        for (let min = startMin; min < endMin; min += 15) {
                            const h = Math.floor(min / 60)
                            const m = min % 60
                            const time = `${h}:${m === 0 ? '00' : m.toString().padStart(2, '0')}`
                            slots.push({ time, available: checkAvailable(time) })
                        }
                    }

                    if (lunchEnabled) addSlots(startLunchH, startLunchM, endLunchH, endLunchM)
                    if (dinnerEnabled) addSlots(startDinnerH, startDinnerM, endDinnerH, endDinnerM)

                    setAvailableSlots(slots)
                }

                generateSlots()
            } catch (err) {
                console.error("Error generating slots:", err)
            }
        }

        fetchOccupancyAndGenerateSlots()
    }, [restaurant, formData.date, formData.guests, restaurantId])


    // --- HANDLERS ---
    const handleNextStep = () => {
        if (step === 1) {
            if (!formData.date || !formData.time) {
                toast.error("Seleziona data e orario")
                return
            }
            setStep(2)
        } else if (step === 2) {
            if (!formData.name || !formData.phone) {
                toast.error("Compila tutti i campi obbligatori")
                return
            }
            submitBooking()
        }
    }

    const handlePrevStep = () => {
        if (step > 1) setStep((s) => (s - 1) as any)
    }

    const submitBooking = async () => {
        if (!restaurant || !formData.date || !formData.time) return

        try {
            setLoading(true)

            // Combine date and time
            const [hours, minutes] = formData.time.split(":").map(Number)
            const bookingDate = new Date(formData.date)
            bookingDate.setHours(hours, minutes, 0, 0)

            // 1. Find a suitable table automatically
            // Need to fetch fresh tables and bookings for reliability
            const [{ data: allTables }, { data: dayBookings }] = await Promise.all([
                supabase.from('tables').select('id, number, restaurant_id, seats, room_id, is_active').eq('restaurant_id', restaurant.id),
                supabase.from('bookings').select('id, restaurant_id, table_id, name, date_time, guests, duration, status').eq('restaurant_id', restaurant.id)
                    .gte('date_time', new Date(bookingDate).setHours(0, 0, 0, 0))
                    .lt('date_time', new Date(bookingDate).setHours(23, 59, 59, 999))
            ])

            const activeTables = allTables?.filter((t: any) => t.is_active !== false) || []
            const bookingStart = bookingDate.getTime()
            const resDur = (restaurant.reservation_duration || 120) >= 9999 ? 240 : (restaurant.reservation_duration || 120)
            const bookingEnd = bookingStart + resDur * 60 * 1000

            // Filter tables by capacity and availability
            const suitableTables = activeTables
                .filter((t: any) => (t.seats || 4) >= formData.guests)
                .filter((t: any) => {
                    // Check if table has any conflicting bookings
                    const conflicts = dayBookings?.filter((b: any) => b.table_id === t.id).some((b: any) => {
                        const bStart = new Date(b.date_time).getTime()
                        const bDur = (restaurant.reservation_duration || 120) >= 9999 ? 240 : (restaurant.reservation_duration || 120)
                        const bEnd = bStart + bDur * 60 * 1000
                        return (bookingStart < bEnd && bookingEnd > bStart)
                    })
                    return !conflicts
                })
                .sort((a: any, b: any) => (a.seats || 4) - (b.seats || 4)) // Pick smallest fitting table

            const assignedTableId = suitableTables[0]?.id || null

            const { error: insertError } = await supabase
                .from("bookings")
                .insert({
                    restaurant_id: restaurant.id,
                    table_id: assignedTableId,
                    name: formData.name,
                    phone: formData.phone,
                    email: "",
                    guests: formData.guests,
                    date_time: format(bookingDate, "yyyy-MM-dd'T'HH:mm:ss"),
                    notes: (formData.roomId ? `[Sala: ${rooms.find(r => r.id === formData.roomId)?.name}] ` : "") + formData.notes,
                    status: "CONFIRMED"
                })

            if (insertError) throw insertError

            // 2. Success UI
            setStep(3)
            toast.success("Prenotazione inviata con successo!")

        } catch (err: any) {
            console.error("Booking error:", err)
            toast.error("Errore durante la prenotazione. Riprova.")
        } finally {
            setLoading(false)
        }
    }

    // --- RENDER ---

    if (loading && !restaurant) return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-zinc-500 text-sm tracking-widest uppercase">Caricamento...</p>
            </div>
        </div>
    )

    if (error || !restaurant) return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-center">
            <div className="max-w-md space-y-4">
                <WarningCircle size={48} className="text-red-500 mx-auto" weight="duotone" />
                <h1 className="text-2xl text-white font-bold">Ristorante non trovato</h1>
                <p className="text-zinc-400">{error || "Il link che hai seguito potrebbe essere scaduto o errato."}</p>
            </div>
        </div>
    )


    // Check if Public Reservations are Disabled
    if (restaurant.enable_public_reservations === false) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-4">
                    <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Storefront size={32} className="text-zinc-500" />
                    </div>
                    <h1 className="text-2xl text-white font-bold">Prenotazioni non disponibili</h1>
                    <p className="text-zinc-400">
                        Al momento non è possibile effettuare prenotazioni online per questo ristorante.
                        Contattaci telefonicamente.
                    </p>
                    {restaurant.phone && (
                        <Button variant="outline" className="mt-4 gap-2 border-zinc-700" onClick={() => window.open(`tel:${restaurant.phone}`)}>
                            <Phone size={18} />
                            Chiama Ristorante
                        </Button>
                    )}
                </div>
            </div>
        )
    }
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500/30 pb-20 md:pb-0"> {/* Added pb-20 for mobile */}
            {/* Background Ambience */}
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/10 via-zinc-950 to-zinc-950 pointer-events-none" />

            <div className="relative z-10 max-w-lg mx-auto min-h-screen flex flex-col md:justify-center md:py-12">

                {/* HEADER */}
                <div className="p-6 pb-2 text-center space-y-4">
                    <div className="w-20 h-20 mx-auto bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 shadow-2xl shadow-black/50">
                        <Storefront size={40} weight="duotone" className="text-amber-500" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">{restaurant.name}</h1>
                        <div className="flex items-center justify-center gap-2 text-sm text-zinc-500 mt-2 font-medium tracking-wide uppercase">
                            <Sparkle size={14} className="text-amber-500" />
                            <span>Prenotazione Online</span>
                        </div>
                    </div>
                </div>

                {/* MENU PREVIEW BUTTON */}
                <div className="px-6 py-4 flex justify-center">
                    <Button
                        variant="default"
                        size="lg"
                        onClick={() => setMenuPreviewOpen(true)}
                        className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-14 px-10 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all w-full md:w-auto flex items-center gap-3 text-lg"
                    >
                        <ForkKnife size={24} weight="bold" />
                        Vedi il Menu
                    </Button>
                </div>

                {/* MAIN CARD */}
                <main className="flex-1 px-4 py-6">
                    <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/5 rounded-3xl shadow-2xl overflow-hidden relative">
                        {/* Progress Bar */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800">
                            <motion.div
                                className="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                                initial={{ width: "33%" }}
                                animate={{ width: step === 1 ? "33%" : step === 2 ? "66%" : "100%" }}
                                transition={{ duration: 0.5, ease: "easeInOut" }}
                            />
                        </div>

                        <div className="p-6 md:p-8">
                            <AnimatePresence mode="wait">
                                {step === 1 && (
                                    <motion.div
                                        key="step1"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6"
                                    >
                                        <div className="text-center mb-6">
                                            <h2 className="text-xl font-semibold text-white">Prenota un tavolo</h2>
                                            <p className="text-zinc-400 text-sm mt-1">Scegli data e numero di ospiti</p>
                                        </div>

                                        {/* Guests */}
                                        <div className="space-y-3">
                                            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Ospiti</label>
                                            <div className="flex items-center justify-between bg-zinc-950/50 p-2 rounded-xl border border-zinc-800">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setFormData(d => ({ ...d, guests: Math.max(1, d.guests - 1) }))}
                                                    className="h-10 w-10 rounded-lg hover:bg-zinc-800 text-zinc-300"
                                                >
                                                    <CaretLeft size={20} />
                                                </Button>
                                                <span className="text-2xl font-bold text-white tabular-nums w-12 text-center">{formData.guests}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setFormData(d => ({ ...d, guests: Math.min(20, d.guests + 1) }))}
                                                    className="h-10 w-10 rounded-lg hover:bg-zinc-800 text-zinc-300"
                                                >
                                                    <CaretRight size={20} />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Date Picker (Simplified) */}
                                        <div className="space-y-3">
                                            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Giorno</label>
                                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                                {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                                                    const date = addDays(new Date(), offset)
                                                    const isSelected = formData.date && isSameDay(date, formData.date)
                                                    return (
                                                        <button
                                                            key={offset}
                                                            onClick={() => {
                                                                setFormData(d => ({ ...d, date: date, time: null })) // Reset time on date change
                                                            }}
                                                            className={`flex-shrink-0 w-16 h-20 rounded-xl flex flex-col items-center justify-center transition-all ${isSelected
                                                                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 scale-105"
                                                                : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 border border-zinc-800"
                                                                }`}
                                                        >
                                                            <span className="text-xs uppercase font-medium mb-1">{format(date, "EEE", { locale: it })}</span>
                                                            <span className="text-xl font-bold">{format(date, "d")}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* Time Slots */}
                                        <div className="space-y-3">
                                            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Orario</label>
                                            <div className="grid grid-cols-4 gap-2 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                                                {availableSlots.map((slot) => (
                                                    <button
                                                        key={slot.time}
                                                        disabled={!slot.available}
                                                        onClick={() => setFormData(d => ({ ...d, time: slot.time }))}
                                                        className={`py-3 rounded-xl text-sm font-bold transition-all tabular-nums ${formData.time === slot.time
                                                            ? "bg-amber-500 text-black shadow-lg shadow-amber-500/30 scale-[1.02]"
                                                            : slot.available
                                                                ? "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/80"
                                                                : "bg-zinc-950/50 text-zinc-700 cursor-not-allowed border border-zinc-900 opacity-50"
                                                            }`}
                                                    >
                                                        {slot.time}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Room Selection */}
                                        {restaurant.enable_reservation_room_selection && rooms.length > 0 && (
                                            <div className="space-y-3">
                                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Preferenza Sala</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {rooms.map((room) => (
                                                        <button
                                                            key={room.id}
                                                            onClick={() => setFormData(d => ({ ...d, roomId: d.roomId === room.id ? null : room.id }))}
                                                            className={`py-3 px-4 rounded-xl text-sm font-medium transition-all text-left flex items-center justify-between ${formData.roomId === room.id
                                                                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                                                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-800"
                                                                }`}
                                                        >
                                                            <span>{room.name}</span>
                                                            {formData.roomId === room.id && <CheckCircle weight="fill" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="pt-4">
                                            <Button
                                                className="w-full h-12 text-base font-semibold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20"
                                                onClick={handleNextStep}
                                            >
                                                Continua
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}

                                {step === 2 && (
                                    <motion.div
                                        key="step2"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6"
                                    >
                                        <div className="text-center mb-6">
                                            <h2 className="text-xl font-semibold text-white">I tuoi dati</h2>
                                            <p className="text-zinc-400 text-sm mt-1">Per confermare la prenotazione</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-zinc-500 uppercase">Nome e Cognome</label>
                                                <Input
                                                    value={formData.name}
                                                    onChange={(e) => setFormData(d => ({ ...d, name: e.target.value }))}
                                                    className="bg-zinc-950/50 border-zinc-800 h-12 text-white focus:border-amber-500/50 focus:ring-amber-500/20"
                                                    placeholder="Mario Rossi"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-zinc-500 uppercase">Telefono</label>
                                                <Input
                                                    type="tel"
                                                    value={formData.phone}
                                                    onChange={(e) => setFormData(d => ({ ...d, phone: e.target.value }))}
                                                    className="bg-zinc-950/50 border-zinc-800 h-12 text-white focus:border-amber-500/50 focus:ring-amber-500/20"
                                                    placeholder="+39 333 1234567"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-zinc-500 uppercase">Note (Allergie, richieste...)</label>
                                                <Textarea
                                                    value={formData.notes}
                                                    onChange={(e) => setFormData(d => ({ ...d, notes: e.target.value }))}
                                                    className="bg-zinc-950/50 border-zinc-800 min-h-[100px] text-white focus:border-amber-500/50 focus:ring-amber-500/20 resize-none"
                                                    placeholder="Scrivi qui..."
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-3 pt-4">
                                            <Button
                                                variant="outline"
                                                className="h-12 w-1/3 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                                onClick={handlePrevStep}
                                            >
                                                Indietro
                                            </Button>
                                            <Button
                                                className="h-12 w-2/3 text-base font-semibold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20"
                                                onClick={handleNextStep}
                                                disabled={loading}
                                            >
                                                {loading ? "Invio in corso..." : "Conferma Prenotazione"}
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}

                                {step === 3 && (
                                    <motion.div
                                        key="step3"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-center py-8 space-y-6"
                                    >
                                        <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                                            <CheckCircle size={48} weight="fill" className="text-green-500" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-white mb-2">Prenotazione Confermata!</h2>
                                            <p className="text-zinc-400 max-w-[280px] mx-auto text-sm leading-relaxed">
                                                Grazie {formData.name}, la tua prenotazione è stata confermata automaticamente.
                                                Ti aspettiamo il {formData.date && format(formData.date, "d MMMM", { locale: it })} alle {formData.time}.
                                            </p>
                                        </div>

                                        <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800 max-w-xs mx-auto space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500">Giorno</span>
                                                <span className="text-white font-medium">{formData.date && format(formData.date, "d MMMM yyyy", { locale: it })}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500">Ora</span>
                                                <span className="text-white font-medium">{formData.time}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500">Ospiti</span>
                                                <span className="text-white font-medium">{formData.guests} persone</span>
                                            </div>
                                        </div>

                                        <div className="pt-4">
                                            <Button
                                                variant="outline"
                                                onClick={() => window.location.reload()}
                                                className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
                                            >
                                                Effettua altra prenotazione
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </main>

                {/* FOOTER */}
                <footer className="p-6 text-center">
                    <p className="text-xs text-zinc-600 flex items-center justify-center gap-1.5">Powered by <img src="/minthi-logo.png" alt="MINTHI" className="h-4 w-auto inline-block opacity-50" /></p>
                </footer>
            </div>

            {/* FULL SCREEN MENU PREVIEW DIALOG */}
            <Dialog open={menuPreviewOpen} onOpenChange={setMenuPreviewOpen}>
                <DialogContent className="max-w-md w-full h-[90vh] p-0 bg-zinc-950 border-zinc-800 text-white overflow-hidden flex flex-col z-[9999]"> {/* ensure high z-index */}
                    <DialogHeader className="p-4 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur z-10 shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            <ForkKnife className="text-amber-500" />
                            Menu del Ristorante
                        </DialogTitle>
                        <DialogDescription className="text-xs text-zinc-500">
                            Anteprima dei piatti disponibili
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-4 space-y-8 pb-20">
                        {categories.length === 0 && (
                            <div className="text-center py-20 text-zinc-500">
                                <Info size={40} className="mx-auto mb-4 opacity-20" />
                                <p>Nessun piatto disponibile al momento.</p>
                            </div>
                        )}

                        {categories.map(cat => {
                            const catDishes = dishes.filter(d => d.category_id === cat.id)
                            if (catDishes.length === 0) return null
                            return (
                                <div key={cat.id} className="space-y-4">
                                    <h3 className="font-serif text-xl text-amber-500 border-b border-zinc-800 pb-2 flex items-center gap-2">
                                        {cat.name}
                                    </h3>
                                    <div className="space-y-4">
                                        {catDishes.map(dish => (
                                            <div key={dish.id} className="flex gap-4 items-start">
                                                {dish.image_url?.trim() && (
                                                <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-zinc-900 shadow-inner border border-white/5">
                                                    <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
                                                </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <h4 className="font-medium text-white truncate pr-2">{dish.name}</h4>
                                                        <span className="text-amber-400 font-semibold whitespace-nowrap">€{dish.price.toFixed(2)}</span>
                                                    </div>
                                                    {dish.description && (
                                                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{dish.description}</p>
                                                    )}
                                                    {dish.allergens && dish.allergens.length > 0 && (
                                                        <div className="flex gap-1 mt-2 flex-wrap">
                                                            {dish.allergens.map((alg, i) => (
                                                                <span key={i} className="text-[10px] uppercase tracking-wider text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">
                                                                    {alg}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <DialogFooter className="p-4 border-t border-zinc-800 bg-zinc-950 shrink-0">
                        <DialogClose asChild>
                            <Button variant="ghost" className="w-full">Chiudi Menu</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default PublicReservationPage
