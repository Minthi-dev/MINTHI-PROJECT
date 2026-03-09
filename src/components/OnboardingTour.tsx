import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ArrowRight, ArrowLeft, CheckCircle, ForkKnife, Table, ChartBar,
  Gear, QrCode, CalendarBlank, Users, CreditCard, Bell, Sparkle,
  Receipt, Clock, Star, Lightning
} from '@phosphor-icons/react'

interface OnboardingTourProps {
  onComplete: () => void
  restaurantName?: string
}

const STEPS = [
  {
    id: 'welcome',
    icon: Sparkle,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15 border-amber-500/30',
    title: 'Benvenuto su Minthi! 🎉',
    subtitle: 'Il tuo sistema di gestione ristorante',
    description: 'In pochi minuti scoprirai tutto quello che puoi fare con Minthi. Gestisci tavoli, ordini, prenotazioni e molto altro — tutto in un unico posto.',
    mockup: null,
  },
  {
    id: 'tables',
    icon: Table,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15 border-amber-500/30',
    title: 'Gestione Tavoli',
    subtitle: 'Controlla ogni tavolo in tempo reale',
    description: 'Dalla sezione Tavoli vedi lo stato di ogni tavolo: libero, occupato o in attesa di pagamento. Clicca su un tavolo per aprirlo, vedere gli ordini e gestire il conto.',
    mockup: 'tables',
  },
  {
    id: 'orders',
    icon: ForkKnife,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/15 border-orange-500/30',
    title: 'Gestione Ordini',
    subtitle: 'La cucina sempre aggiornata',
    description: 'In Gestione Ordini vedi tutti i piatti da preparare in tempo reale. Segna ogni piatto come "Pronto" e poi "Consegnato". I camerieri ricevono tutto sul loro dispositivo.',
    mockup: 'orders',
  },
  {
    id: 'menu',
    icon: Star,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/15 border-purple-500/30',
    title: 'Menu Digitale',
    subtitle: 'Crea e aggiorna il tuo menu',
    description: 'Aggiungi piatti con foto, descrizione, prezzo e allergeni. Organizzali in categorie. Il menu viene aggiornato istantaneamente su tutti i dispositivi dei clienti.',
    mockup: 'menu',
  },
  {
    id: 'qr',
    icon: QrCode,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/15 border-sky-500/30',
    title: 'Ordini via QR Code',
    subtitle: 'I clienti ordinano dal proprio telefono',
    description: 'Ogni tavolo ha un QR Code unico. I clienti lo scansionano, vedono il menu e ordinano direttamente. Gli ordini arrivano subito in cucina. Puoi anche accettare pagamenti online via Stripe.',
    mockup: 'qr',
  },
  {
    id: 'reservations',
    icon: CalendarBlank,
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/15 border-indigo-500/30',
    title: 'Prenotazioni',
    subtitle: 'Gestisci le prenotazioni online',
    description: 'I clienti possono prenotare dal link pubblico del tuo ristorante. Ricevi notifiche, conferma o rifiuta con un click. Imposta orari, sale e numero massimo di coperti.',
    mockup: 'reservations',
  },
  {
    id: 'waiters',
    icon: Users,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15 border-emerald-500/30',
    title: 'Modalità Cameriere',
    subtitle: 'Il tuo staff sempre connesso',
    description: 'Attiva la modalità cameriere per permettere al personale di prendere ordini dal loro smartphone. Ogni cameriere vede i propri tavoli e riceve notifiche quando i piatti sono pronti.',
    mockup: 'waiters',
  },
  {
    id: 'analytics',
    icon: ChartBar,
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/15 border-rose-500/30',
    title: 'Analytics',
    subtitle: 'Dati e statistiche del tuo ristorante',
    description: 'Monitora vendite, piatti più ordinati, incasso per fascia oraria e performance dei camerieri. I grafici si aggiornano in tempo reale e puoi esportare i dati.',
    mockup: 'analytics',
  },
  {
    id: 'settings',
    icon: Gear,
    iconColor: 'text-zinc-400',
    iconBg: 'bg-zinc-500/15 border-zinc-500/30',
    title: 'Impostazioni',
    subtitle: 'Configura il tuo ristorante',
    description: 'Imposta coperto, AYCE, orari di servizio, staff, prenotazioni e pagamenti online. Puoi anche personalizzare suoni di notifica e collegare il tuo account Stripe per ricevere pagamenti.',
    mockup: 'settings',
  },
  {
    id: 'activate',
    icon: Lightning,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15 border-amber-500/30',
    title: 'Come iniziare',
    subtitle: '3 passi per essere operativo',
    description: '',
    mockup: 'activate',
  },
  {
    id: 'done',
    icon: CheckCircle,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15 border-emerald-500/30',
    title: 'Sei pronto!',
    subtitle: 'Inizia subito a usare Minthi',
    description: 'Questa guida è disponibile in qualsiasi momento da Impostazioni → Guida Interattiva. Buon lavoro!',
    mockup: null,
  },
]

// ── Fake data mockups ──────────────────────────────────────────────────────────

const TablesMockup = () => (
  <div className="grid grid-cols-3 gap-2 mt-2">
    {[
      { n: '1', status: 'Occupato', color: 'border-amber-500/60 bg-amber-900/20', badge: 'bg-amber-500 text-black', pin: '4721' },
      { n: '2', status: 'Libero', color: 'border-zinc-700/40 bg-black/40', badge: 'bg-transparent text-zinc-500 border border-zinc-700', pin: null },
      { n: '3', status: 'Pagato', color: 'border-emerald-500/60 bg-emerald-900/30', badge: 'bg-emerald-500 text-white', pin: '8834' },
    ].map(t => (
      <div key={t.n} className={`rounded-xl border p-2.5 ${t.color}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xl font-black text-white">{t.n}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.badge}`}>{t.status}</span>
        </div>
        {t.pin ? (
          <div className="text-center">
            <p className="text-[8px] text-amber-500/60 uppercase tracking-widest mb-1">PIN</p>
            <span className="text-lg font-mono font-black text-amber-400">{t.pin}</span>
          </div>
        ) : (
          <div className="text-center text-zinc-700 py-1">
            <ForkKnife size={16} className="mx-auto" weight="duotone" />
          </div>
        )}
      </div>
    ))}
  </div>
)

const OrdersMockup = () => (
  <div className="space-y-2 mt-2">
    {[
      { qty: 2, name: 'Tagliatelle al ragù', status: 'Da preparare', statusColor: 'text-amber-400', dot: 'bg-amber-400' },
      { qty: 1, name: 'Bistecca alla fiorentina', status: 'Pronto!', statusColor: 'text-emerald-400', dot: 'bg-emerald-400' },
      { qty: 3, name: 'Tiramisù', status: 'Da preparare', statusColor: 'text-amber-400', dot: 'bg-amber-400' },
    ].map((item, i) => (
      <div key={i} className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2 border border-zinc-700/40">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-amber-500">{item.qty}</span>
          <span className="text-xs font-medium text-zinc-300">{item.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${item.dot} animate-pulse`} />
          <span className={`text-[9px] font-bold ${item.statusColor}`}>{item.status}</span>
        </div>
      </div>
    ))}
  </div>
)

const MenuMockup = () => (
  <div className="space-y-2 mt-2">
    {[
      { name: 'Carbonara', cat: 'Primi', price: '14.00', emoji: '🍝' },
      { name: 'Tiramisù', cat: 'Dolci', price: '7.50', emoji: '🍮' },
      { name: 'Bistecca', cat: 'Secondi', price: '22.00', emoji: '🥩' },
    ].map((d, i) => (
      <div key={i} className="flex items-center gap-3 bg-zinc-800/60 rounded-lg px-3 py-2 border border-zinc-700/40">
        <span className="text-xl">{d.emoji}</span>
        <div className="flex-1">
          <p className="text-xs font-bold text-zinc-200">{d.name}</p>
          <p className="text-[9px] text-zinc-500">{d.cat}</p>
        </div>
        <span className="text-xs font-black text-amber-400">€{d.price}</span>
      </div>
    ))}
  </div>
)

const QrMockup = () => (
  <div className="flex items-center gap-4 mt-2">
    <div className="bg-white p-3 rounded-xl">
      <div className="w-16 h-16 grid grid-cols-4 gap-0.5">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className={`rounded-[1px] ${[0,1,4,5,2,7,8,11,13,14,15,3,6,9,10,12][i] % 3 !== 0 ? 'bg-black' : 'bg-white'}`} />
        ))}
      </div>
    </div>
    <div className="flex-1 space-y-2">
      <p className="text-xs text-zinc-300 font-medium">Il cliente scansiona e ordina</p>
      <div className="bg-zinc-800/60 rounded-lg px-3 py-2 border border-zinc-700/40">
        <div className="flex items-center gap-2">
          <Receipt size={12} className="text-amber-400" />
          <span className="text-[10px] text-zinc-400">Ordine ricevuto · Tavolo 3</span>
        </div>
      </div>
      <div className="bg-emerald-900/30 rounded-lg px-3 py-1.5 border border-emerald-500/30">
        <span className="text-[9px] text-emerald-400 font-semibold">✓ Pagamento online disponibile</span>
      </div>
    </div>
  </div>
)

const ReservationsMockup = () => (
  <div className="space-y-2 mt-2">
    {[
      { name: 'Famiglia Rossi', time: '20:00', covers: 4, status: 'Confermata', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
      { name: 'Marco Bianchi', time: '21:00', covers: 2, status: 'In attesa', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    ].map((r, i) => (
      <div key={i} className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2 border border-zinc-700/40">
        <div>
          <p className="text-xs font-bold text-zinc-200">{r.name}</p>
          <p className="text-[9px] text-zinc-500"><Clock size={8} className="inline mr-1" />{r.time} · {r.covers} persone</p>
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${r.color}`}>{r.status}</span>
      </div>
    ))}
  </div>
)

const WaitersMockup = () => (
  <div className="space-y-2 mt-2">
    {[
      { name: 'Mario', tables: '1, 3, 5', orders: 8, color: 'text-emerald-400' },
      { name: 'Sara', tables: '2, 4', orders: 5, color: 'text-sky-400' },
    ].map((w, i) => (
      <div key={i} className="flex items-center gap-3 bg-zinc-800/60 rounded-lg px-3 py-2 border border-zinc-700/40">
        <div className={`w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center font-black text-sm ${w.color}`}>
          {w.name[0]}
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-zinc-200">{w.name}</p>
          <p className="text-[9px] text-zinc-500">Tavoli: {w.tables}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-black text-amber-400">{w.orders}</p>
          <p className="text-[9px] text-zinc-600">ordini</p>
        </div>
      </div>
    ))}
  </div>
)

const AnalyticsMockup = () => (
  <div className="mt-2 space-y-2">
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Incasso oggi', value: '€ 842', color: 'text-emerald-400' },
        { label: 'Ordini', value: '34', color: 'text-amber-400' },
        { label: 'Media ordine', value: '€ 24', color: 'text-sky-400' },
      ].map((s, i) => (
        <div key={i} className="bg-zinc-800/60 rounded-lg px-2 py-2 border border-zinc-700/40 text-center">
          <p className={`text-sm font-black ${s.color}`}>{s.value}</p>
          <p className="text-[8px] text-zinc-600 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 border border-zinc-700/40">
      <p className="text-[9px] text-zinc-500 mb-1.5">Piatti più ordinati</p>
      {[['Carbonara', 28], ['Tiramisù', 22], ['Bistecca', 17]].map(([name, n], i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className="text-[9px] text-zinc-400 w-16 truncate">{name}</span>
          <div className="flex-1 bg-zinc-700/40 rounded-full h-1.5">
            <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(n as number / 28) * 100}%` }} />
          </div>
          <span className="text-[9px] text-zinc-500">{n}</span>
        </div>
      ))}
    </div>
  </div>
)

const SettingsMockup = () => (
  <div className="space-y-2 mt-2">
    {[
      { label: 'Coperto', value: '€ 2.00', icon: Users },
      { label: 'Pagamenti Stripe', value: 'Attivo', icon: CreditCard },
      { label: 'Notifiche audio', value: 'Classic', icon: Bell },
      { label: 'Modalità cameriere', value: 'Attiva', icon: Users },
    ].map(({ label, value, icon: Icon }, i) => (
      <div key={i} className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2 border border-zinc-700/40">
        <div className="flex items-center gap-2">
          <Icon size={12} className="text-zinc-400" />
          <span className="text-xs text-zinc-300">{label}</span>
        </div>
        <span className="text-xs font-bold text-amber-400">{value}</span>
      </div>
    ))}
  </div>
)

const ActivateMockup = () => (
  <div className="space-y-3 mt-2">
    {[
      {
        step: '1', title: 'Crea il tuo menu',
        desc: 'Vai in Menu e aggiungi piatti e categorie', icon: ForkKnife, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      },
      {
        step: '2', title: 'Configura i tavoli',
        desc: 'In Tavoli crea i tuoi tavoli e scarica i QR Code', icon: Table, color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
      },
      {
        step: '3', title: 'Attiva l\'abbonamento',
        desc: 'In Impostazioni → Abbonamento sblocca tutte le funzioni', icon: Sparkle, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      },
    ].map(({ step, title, desc, icon: Icon, color }) => (
      <div key={step} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${color}`}>
        <div className="w-6 h-6 rounded-full bg-black/30 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-xs font-black text-white">{step}</span>
        </div>
        <div>
          <p className="text-xs font-bold text-zinc-200">{title}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">{desc}</p>
        </div>
      </div>
    ))}
  </div>
)

const MOCKUP_MAP: Record<string, React.ComponentType> = {
  tables: TablesMockup,
  orders: OrdersMockup,
  menu: MenuMockup,
  qr: QrMockup,
  reservations: ReservationsMockup,
  waiters: WaitersMockup,
  analytics: AnalyticsMockup,
  settings: SettingsMockup,
  activate: ActivateMockup,
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OnboardingTour({ onComplete, restaurantName }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const step = STEPS[currentStep]
  const isLast = currentStep === STEPS.length - 1
  const isFirst = currentStep === 0
  const MockupComponent = step.mockup ? MOCKUP_MAP[step.mockup] : null
  const StepIcon = step.icon

  const handleNext = () => {
    if (isLast) onComplete()
    else setCurrentStep(s => s + 1)
  }

  const handleBack = () => {
    if (!isFirst) setCurrentStep(s => s - 1)
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="relative bg-zinc-900 border border-zinc-700/60 rounded-3xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] w-full max-w-sm overflow-hidden"
        >
          {/* Skip button */}
          {!isLast && (
            <button
              onClick={onComplete}
              className="absolute top-4 right-4 z-10 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 text-xs"
            >
              Salta guida
              <X size={14} />
            </button>
          )}

          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800">
            <motion.div
              className="h-full bg-amber-500 rounded-full"
              animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="pt-8 px-6 pb-6 space-y-5">
            {/* Header */}
            <div className="flex flex-col items-center text-center gap-3 pt-2">
              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center ${step.iconBg}`}>
                <StepIcon size={28} weight="duotone" className={step.iconColor} />
              </div>
              <div>
                <h2 className="text-xl font-black text-white leading-tight">{step.title}</h2>
                <p className="text-sm text-zinc-500 mt-0.5">{step.subtitle}</p>
              </div>
            </div>

            {/* Description */}
            {step.description && (
              <p className="text-sm text-zinc-400 leading-relaxed text-center">{step.description}</p>
            )}

            {/* Mockup */}
            {MockupComponent && (
              <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-3">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Esempio</p>
                <MockupComponent />
              </div>
            )}

            {/* Step dots */}
            <div className="flex items-center justify-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === currentStep ? 'w-4 h-1.5 bg-amber-500' : 'w-1.5 h-1.5 bg-zinc-700 hover:bg-zinc-500'
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              {!isFirst && (
                <button
                  onClick={handleBack}
                  className="flex-1 h-11 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-sm font-semibold flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft size={16} />
                  Indietro
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm transition-all flex items-center justify-center gap-1.5 shadow-[0_8px_20px_-8px_rgba(245,158,11,0.6)] hover:shadow-[0_12px_25px_-8px_rgba(245,158,11,0.7)]"
              >
                {isLast ? (
                  <>
                    <CheckCircle size={16} weight="fill" />
                    Inizia ora!
                  </>
                ) : (
                  <>
                    {isFirst ? 'Iniziamo' : 'Avanti'}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>

            {/* Step counter */}
            <p className="text-center text-[10px] text-zinc-600">
              {currentStep + 1} di {STEPS.length}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
