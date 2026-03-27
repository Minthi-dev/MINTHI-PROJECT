import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DatabaseService } from '../services/DatabaseService'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ForkKnife, QrCode, ChartBar, CreditCard, CalendarBlank,
    Users, CheckCircle, ArrowRight, Eye, EyeSlash, Rocket, ShieldCheck, Clock,
    X, Sparkle, ChefHat, Tray
} from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'

const MACRO_FEATURES = [
    {
        id: 'ordini_qr',
        icon: QrCode,
        title: 'Ordini QR Code in Tempo Reale',
        short: 'I clienti ordinano dal tavolo. Niente attese.',
        details: 'Trasforma ogni tavolo in un punto cassa digitale. I clienti inquadrano il QR code, sfogliano il menu interattivo e inviano l\'ordine direttamente in cucina. Elimina le attese, riduce gli errori del personale e aumenta lo scontrino medio grazie agli upsell suggeriti automaticamente durante l\'ordine.'
    },
    {
        id: 'camerieri',
        icon: Users,
        title: 'Piattaforma Camerieri',
        short: 'Gestione completa dello staff di sala.',
        details: 'Un\'interfaccia dedicata per il tuo staff. I camerieri possono prendere ordini al tavolo da smartphone o tablet, gestire i pagamenti, e ricevere notifiche istantanee quando i piatti sono pronti. Monitora le performance di ogni membro del team direttamente dalla tua dashboard.'
    },
    {
        id: 'prenotazioni_ai',
        icon: Sparkle,
        title: 'Prenotazioni Intelligenti AI',
        short: 'Ricerca tavoli automatica con intelligenza artificiale.',
        details: 'Dimentica le telefonate continue. I clienti prenotano online 24/7. L\'A.I. gestisce l\'assegnazione ottimale dei tavoli, calcola i tempi medi di permanenza per massimizzare i coperti e previene gli overbooking. Include promemoria automatici per ridurre i no-show.'
    },
    {
        id: 'menu_smart',
        icon: ForkKnife,
        title: 'Menù Intelligente',
        short: 'Menu dinamici, personalizzati e sempre aggiornati.',
        details: 'Crea menu personalizzati (es. Menu Pranzo, Cena, Eventi) che si attivano automaticamente in base agli orari. Aggiungi foto ad alta risoluzione, evidenzia gli allergeni e gestisci tag come "Vegano" o "Gluten Free". Modifica prezzi e disponibilità in 1 secondo, ovunque ti trovi.'
    },
    {
        id: 'analitiche',
        icon: ChartBar,
        title: 'Analitiche Avanzate',
        short: 'Fatturato, vendite e performance sotto controllo.',
        details: 'Monitora la salute del tuo business con grafici in tempo reale. Scopri i piatti più redditizi, gli orari di punta e l\'incasso totale giornaliero. Analizza i trend per ottimizzare il margine operativo e gli acquisti in magazzino.'
    },
    {
        id: 'pagamenti_ayce',
        icon: CreditCard,
        title: 'Gestione Completa Pagamenti e AYCE',
        short: 'Incassi via app, coperto automatico e formula All You Can Eat.',
        details: 'I clienti possono pagare in autonomia dal tavolo usando Apple Pay, Google Pay o carta. Il sistema calcola in automatico le quote alla romana, aggiunge il costo del coperto e gestisce scenari complessi come la formula All You Can Eat, bloccando preventivamente abusi o ordini eccessivi.'
    },
]

export default function RestaurantOnboarding() {
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()

    const [tokenData, setTokenData] = useState<any>(null)
    const [tokenError, setTokenError] = useState(false)
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [selectedFeature, setSelectedFeature] = useState<typeof MACRO_FEATURES[0] | null>(null)
    const [priceAmount, setPriceAmount] = useState<number>(0)
    const [passwordVisible, setPasswordVisible] = useState(false)

    const [form, setForm] = useState({
        name: '',
        phone: '',
        email: '',
        username: '',
        password: '',
        // Dati fiscali
        billingName: '',
        vatNumber: '',
        billingAddress: '',
        billingCity: '',
        billingCap: '',
        billingProvince: '',
        codiceUnivoco: '',
    })

    // Validate token on mount (token is optional — /register works without it)
    useEffect(() => {
        // Clear any existing session to prevent conflicting redirects after registration
        localStorage.removeItem('minthi_user')
        supabase.auth.signOut().catch(console.error)

        if (!token) {
            // No token — standard registration (no bonus/discount)
            setTokenData({ token: null, free_months: 0, discount_percent: 0, stripe_coupon_id: null })
            setLoading(false)
        } else {
            DatabaseService.validateRegistrationToken(token).then(data => {
                if (data) { setTokenData(data) } else { setTokenError(true) }
                setLoading(false)
            }).catch(() => { setTokenError(true); setLoading(false) })
        }

        // Fetch subscription price for display
        DatabaseService.getAppConfig('stripe_price_amount').then(val => {
            if (val && parseFloat(val) > 0) setPriceAmount(parseFloat(val))
        }).catch(() => {})
    }, [token])

    const handleSubmit = async () => {
        if (!form.name.trim()) return toast.error('Inserisci il nome del ristorante')
        if (!form.username.trim()) return toast.error('Inserisci un username')
        if (form.password.length < 6) return toast.error('La password deve avere almeno 6 caratteri')
        if (!form.billingName.trim()) return toast.error('Inserisci il nome azienda')
        if (!form.vatNumber.trim()) return toast.error('Inserisci la Partita IVA')
        if (!form.billingAddress.trim()) return toast.error('Inserisci l\'indirizzo')
        if (!form.billingCity.trim()) return toast.error('Inserisci il comune')
        if (!form.billingCap.trim()) return toast.error('Inserisci il CAP')
        if (!form.billingProvince.trim()) return toast.error('Inserisci la provincia')
        if (!form.codiceUnivoco.trim()) return toast.error('Inserisci il codice univoco SDI')
        if (!tokenData) return toast.error('Errore di configurazione. Ricarica la pagina.')

        setSubmitting(true)
        try {
            // Caso bonus (mesi gratis): crea subito utente + ristorante, nessun pagamento
            if (tokenData.free_months > 0) {
                await DatabaseService.registerRestaurant({
                    name: form.name.trim(),
                    phone: form.phone.trim(),
                    email: form.email.trim(),
                    username: form.username.trim(),
                    password: form.password,
                    freeMonths: tokenData.free_months,
                    registrationToken: tokenData.token,
                    billingName: form.billingName.trim(),
                    vatNumber: form.vatNumber.trim(),
                    billingAddress: form.billingAddress.trim(),
                    billingCity: form.billingCity.trim(),
                    billingCap: form.billingCap.trim(),
                    billingProvince: form.billingProvince.trim(),
                    codiceUnivoco: form.codiceUnivoco.trim(),
                })
                toast.success(`Registrazione completata! Hai ${tokenData.free_months} mesi gratis.`)
                navigate('/')
                return
            }

            // Caso senza bonus: salva dati in pending_registrations e vai su Stripe.
            // Il ristorante viene creato NEL DB solo DOPO che Stripe conferma il pagamento.
            const priceId = await DatabaseService.getAppConfig('stripe_price_id')
            if (!priceId) {
                toast.error('Errore di configurazione. Contatta il supporto.')
                setSubmitting(false)
                return
            }

            toast.loading('Preparazione pagamento...', { id: 'stripe' })
            const { url } = await DatabaseService.createPendingRegistrationCheckout({
                registrationToken: tokenData.token || null,
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
                username: form.username.trim(),
                password: form.password,
                billingName: form.billingName.trim(),
                vatNumber: form.vatNumber.trim(),
                billingAddress: form.billingAddress.trim(),
                billingCity: form.billingCity.trim(),
                billingCap: form.billingCap.trim(),
                billingProvince: form.billingProvince.trim(),
                codiceUnivoco: form.codiceUnivoco.trim(),
                priceId,
                couponId: tokenData.stripe_coupon_id || null,
            })
            toast.dismiss('stripe')
            window.location.href = url
        } catch (err: any) {
            toast.dismiss('stripe')
            console.error('Registration error:', err)
            const msg = err.message || ''
            if (msg.includes('Username') && msg.includes('già in uso')) {
                toast.error(msg)
            } else if (msg.includes('Esiste già')) {
                toast.error(msg)
            } else if (msg.includes('duplicate') || msg.includes('unique')) {
                toast.error('Nome ristorante o username già in uso. Scegli valori diversi.')
            } else {
                toast.error('Errore durante la registrazione: ' + (msg || 'Riprova'))
            }
            setSubmitting(false)
        }
    }

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
        )
    }

    // Invalid token
    if (tokenError) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center px-6">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                        <ShieldCheck size={32} className="text-red-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">Link non valido</h1>
                    <p className="text-zinc-400 text-sm mb-6">Questo link di registrazione è scaduto, già usato, o non esiste. Contatta l'amministratore per un nuovo link.</p>
                    <button onClick={() => navigate('/')} className="px-6 py-3 bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 transition-colors text-sm font-medium">
                        Vai al Login
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black text-white overflow-x-hidden">
            {/* Ambient BG */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-30%] left-[50%] -translate-x-1/2 w-[80%] h-[60%] bg-amber-500/[0.04] rounded-full blur-[200px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-amber-500/[0.03] rounded-full blur-[150px]" />
            </div>

            {/* Header */}
            <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/5 bg-black/60 backdrop-blur-xl sticky top-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <ForkKnife size={20} weight="fill" className="text-black" />
                    </div>
                    <span className="text-lg font-bold tracking-tight">MINTHI</span>
                </div>
                <button
                    onClick={() => setShowForm(true)}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-full text-sm transition-all hover:shadow-lg hover:shadow-amber-500/20 active:scale-95"
                >
                    Inizia Ora
                </button>
            </header>

            {/* Hero */}
            <section className="relative z-10 px-6 py-20 text-center max-w-3xl mx-auto">
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                        {tokenData?.free_months > 0 && (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium">
                                <Rocket size={16} weight="fill" />
                                {tokenData.free_months} {tokenData.free_months === 1 ? 'mese' : 'mesi'} gratis inclusi!
                            </div>
                        )}
                        {tokenData?.discount_percent > 0 && (
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-sm font-medium">
                                <CheckCircle size={16} weight="fill" />
                                {tokenData.discount_percent}% di sconto
                                {tokenData.discount_duration === 'forever' ? ' per sempre'
                                    : tokenData.discount_duration === 'once' ? ' per 1 mese'
                                        : ` per ${tokenData.discount_duration} mesi`}
                            </div>
                        )}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
                        Il tuo ristorante,<br />
                        <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">completamente digitale</span>
                    </h1>
                    <p className="text-lg text-zinc-400 leading-relaxed max-w-xl mx-auto mb-10">
                        La piattaforma All-in-One per gestire ordini, camerieri, pagamenti e prenotazioni. Progettata per massimizzare in tuoi incassi e dimezzare i tempi di attesa.
                    </p>
                    <button
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-2xl text-lg hover:shadow-xl hover:shadow-amber-500/30 transition-all active:scale-95"
                    >
                        Registra il tuo Ristorante
                        <ArrowRight size={20} weight="bold" />
                    </button>

                    {/* Pricing info */}
                    {(priceAmount > 0 || tokenData?.free_months > 0 || tokenData?.discount_percent > 0) && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                            className="mt-8 inline-block"
                        >
                            <div className="px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/8 text-center">
                                {tokenData?.free_months > 0 ? (
                                    <p className="text-emerald-400 font-semibold text-base">
                                        {tokenData.free_months} {tokenData.free_months === 1 ? 'mese' : 'mesi'} gratis
                                        {priceAmount > 0 && <span className="text-zinc-500 font-normal text-sm">, poi €{priceAmount.toFixed(0)}/mese</span>}
                                    </p>
                                ) : tokenData?.discount_percent > 0 && priceAmount > 0 ? (
                                    <div className="flex items-center justify-center gap-3">
                                        <div>
                                            <p className="text-zinc-500 text-sm line-through">€{priceAmount.toFixed(0)}/mese</p>
                                            <p className="text-white font-bold text-2xl">€{(priceAmount * (1 - tokenData.discount_percent / 100)).toFixed(2)}<span className="text-sm font-normal text-zinc-400">/mese</span></p>
                                        </div>
                                        <div className="px-3 py-1 bg-amber-500/15 border border-amber-500/20 rounded-full">
                                            <p className="text-amber-400 font-bold text-sm">-{tokenData.discount_percent}%</p>
                                            <p className="text-amber-500/60 text-[10px]">
                                                {tokenData.discount_duration === 'forever' ? 'per sempre'
                                                    : tokenData.discount_duration === 'once' ? '1 mese'
                                                        : `${tokenData.discount_duration} mesi`}
                                            </p>
                                        </div>
                                    </div>
                                ) : priceAmount > 0 ? (
                                    <p className="text-white font-semibold text-lg">
                                        €{priceAmount.toFixed(0)}<span className="text-zinc-500 font-normal text-sm">/mese</span>
                                    </p>
                                ) : null}
                                <p className="text-zinc-600 text-xs mt-1">Annullabile in qualsiasi momento</p>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </section>

            {/* Features Grid */}
            <section className="relative z-10 px-6 pb-20 max-w-5xl mx-auto">
                <div className="mb-10 text-center">
                    <h2 className="text-2xl font-bold mb-3">Tutto quello di cui hai bisogno</h2>
                    <p className="text-zinc-400 text-sm">Clicca sulle funzionalità per scoprire i dettagli</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {MACRO_FEATURES.map((f, i) => (
                        <motion.div
                            key={f.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08, duration: 0.4 }}
                            onClick={() => setSelectedFeature(f)}
                            className="p-6 rounded-2xl bg-zinc-900/60 border border-white/5 hover:border-amber-500/30 hover:bg-zinc-800/80 transition-all group cursor-pointer"
                        >
                            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500 group-hover:shadow-lg group-hover:shadow-amber-500/20 transition-all">
                                <f.icon size={24} weight="duotone" className="text-amber-400 group-hover:text-black transition-colors" />
                            </div>
                            <h3 className="font-bold text-base text-white mb-2">{f.title}</h3>
                            <p className="text-sm text-zinc-400 leading-relaxed mb-4">{f.short}</p>
                            <div className="text-xs font-bold text-amber-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                Scopri di più <ArrowRight size={12} weight="bold" />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Feature Modal Popup */}
            <AnimatePresence>
                {selectedFeature && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setSelectedFeature(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-lg bg-zinc-950 border border-amber-500/20 rounded-3xl overflow-hidden shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 sm:p-8">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                                        <selectedFeature.icon size={28} weight="duotone" className="text-black" />
                                    </div>
                                    <button
                                        onClick={() => setSelectedFeature(null)}
                                        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        <X size={16} weight="bold" />
                                    </button>
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-4 leading-tight">{selectedFeature.title}</h3>
                                <p className="text-zinc-300 leading-relaxed text-sm sm:text-base">
                                    {selectedFeature.details}
                                </p>
                            </div>
                            <div className="p-4 bg-zinc-900 border-t border-white/5 flex justify-end">
                                <button
                                    onClick={() => {
                                        setSelectedFeature(null)
                                        setTimeout(() => setShowForm(true), 150)
                                    }}
                                    className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition-colors"
                                >
                                    Attiva {selectedFeature.title}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* How it works */}
            <section className="relative z-10 px-6 pb-20 max-w-3xl mx-auto">
                <h2 className="text-2xl font-bold text-center mb-10">
                    Come <span className="text-amber-400">funziona</span>
                </h2>
                <div className="space-y-6">
                    {[
                        { step: '1', title: 'Registrati', desc: 'Inserisci i dati del tuo ristorante e scegli le credenziali di accesso.' },
                        { step: '2', title: 'Configura il menu', desc: 'Aggiungi categorie, piatti, prezzi e foto. Puoi anche importare dati di esempio.' },
                        { step: '3', title: 'Stampa i QR code', desc: 'Ogni tavolo ha il suo QR. I clienti scansionano, sfogliano il menu e ordinano.' },
                        { step: '4', title: 'Ricevi ordini', desc: 'Gli ordini arrivano in tempo reale nella dashboard cucina. Basta carta e penna.' },
                    ].map((s, i) => (
                        <motion.div
                            key={s.step}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                            className="flex items-start gap-4"
                        >
                            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                                <span className="text-amber-400 font-bold text-sm">{s.step}</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm mb-0.5">{s.title}</h3>
                                <p className="text-xs text-zinc-500">{s.desc}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Registration Form (slide up panel) */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => !submitting && setShowForm(false)}>
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Fixed Header */}
                        <div className="shrink-0 p-6 pb-4">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <Rocket size={20} weight="fill" className="text-amber-400" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-bold text-white">Registra il tuo Ristorante</h2>
                                    <p className="text-xs text-zinc-500">Compila i dati per iniziare</p>
                                </div>
                                <button
                                    onClick={() => !submitting && setShowForm(false)}
                                    className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                                >
                                    <X size={16} weight="bold" />
                                </button>
                            </div>

                            {tokenData?.free_months > 0 && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-medium">
                                    <CheckCircle size={16} weight="fill" />
                                    Hai {tokenData.free_months} {tokenData.free_months === 1 ? 'mese gratuito' : 'mesi gratuiti'} — nessun pagamento richiesto!
                                </div>
                            )}
                        </div>

                        {/* Scrollable Form Content */}
                        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Nome Ristorante *</label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                                        className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                        placeholder="Es. Trattoria Da Mario"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Telefono</label>
                                        <input
                                            type="tel"
                                            value={form.phone}
                                            onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                                            className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                            placeholder="+39 ..."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Email</label>
                                        <input
                                            type="email"
                                            value={form.email}
                                            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                                            className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                            placeholder="info@ristorante.it"
                                        />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-white/5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Dati Fiscali</p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Nome Azienda *</label>
                                            <input
                                                type="text"
                                                value={form.billingName}
                                                onChange={(e) => setForm(f => ({ ...f, billingName: e.target.value }))}
                                                className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                                placeholder="Ristorante Da Mario S.r.l."
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-zinc-400 font-medium mb-1.5 block">P. IVA *</label>
                                            <input
                                                type="text"
                                                value={form.vatNumber}
                                                onChange={(e) => setForm(f => ({ ...f, vatNumber: e.target.value }))}
                                                className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                                placeholder="IT12345678901"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Via / Indirizzo *</label>
                                            <input
                                                type="text"
                                                value={form.billingAddress}
                                                onChange={(e) => setForm(f => ({ ...f, billingAddress: e.target.value }))}
                                                className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                                placeholder="Via Roma 1"
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Comune *</label>
                                                <input
                                                    type="text"
                                                    value={form.billingCity}
                                                    onChange={(e) => setForm(f => ({ ...f, billingCity: e.target.value }))}
                                                    className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                                    placeholder="Milano"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-zinc-400 font-medium mb-1.5 block">CAP *</label>
                                                <input
                                                    type="text"
                                                    value={form.billingCap}
                                                    onChange={(e) => setForm(f => ({ ...f, billingCap: e.target.value }))}
                                                    className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                                    placeholder="20100"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Prov. *</label>
                                                <input
                                                    type="text"
                                                    value={form.billingProvince}
                                                    onChange={(e) => setForm(f => ({ ...f, billingProvince: e.target.value.toUpperCase().slice(0, 2) }))}
                                                    className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors uppercase"
                                                    placeholder="MI"
                                                    maxLength={2}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Codice Univoco SDI *</label>
                                            <input
                                                type="text"
                                                value={form.codiceUnivoco}
                                                onChange={(e) => setForm(f => ({ ...f, codiceUnivoco: e.target.value.toUpperCase() }))}
                                                className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors uppercase font-mono"
                                                placeholder="XXXXXXX"
                                                maxLength={7}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-white/5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Credenziali di Accesso</p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Username *</label>
                                            <input
                                                type="text"
                                                value={form.username}
                                                onChange={(e) => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                                                className="w-full h-12 px-4 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
                                                placeholder="trattoria_mario"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Password *</label>
                                            <div className="relative">
                                                <input
                                                    type={passwordVisible ? 'text' : 'password'}
                                                    value={form.password}
                                                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                                                    className="w-full h-12 px-4 pr-12 bg-zinc-900 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:border-amber-500/50 transition-colors"
                                                    placeholder="Min. 6 caratteri"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setPasswordVisible(v => !v)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                                >
                                                    {passwordVisible ? <EyeSlash size={18} /> : <Eye size={18} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sticky Submit Button */}
                        <div className="shrink-0 p-6 pt-4 border-t border-white/5 bg-zinc-950 rounded-b-none sm:rounded-b-3xl safe-bottom">
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full h-13 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-xl text-sm hover:shadow-lg hover:shadow-amber-500/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                        Registrazione in corso...
                                    </>
                                ) : tokenData?.free_months > 0 ? (
                                    <>
                                        <CheckCircle size={18} weight="bold" />
                                        Registrati Gratis
                                    </>
                                ) : (
                                    <>
                                        <CreditCard size={18} weight="bold" />
                                        Registrati e Paga
                                    </>
                                )}
                            </button>

                            {!tokenData?.free_months && (
                                <p className="text-[10px] text-zinc-600 text-center mt-2 pb-[env(safe-area-inset-bottom)]">
                                    Verrai reindirizzato a Stripe per il pagamento dell'abbonamento.
                                </p>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Footer */}
            <footer className="relative z-10 border-t border-white/5 px-6 py-8 text-center">
                <p className="text-xs text-zinc-600">© 2026 MINTHI — Piattaforma per la ristorazione digitale</p>
                <p className="text-xs text-zinc-600 mt-1">Assistenza: <a href="tel:+393517570155" className="text-amber-400/60 hover:text-amber-400 transition-colors">+39 351 757 0155</a></p>
            </footer>
        </div>
    )
}
