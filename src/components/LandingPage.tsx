import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DatabaseService } from '../services/DatabaseService'

// ─── Animated reveal on scroll ───
function FadeIn({ children, className = '', delay = 0, direction = 'up' }: {
  children: React.ReactNode
  className?: string
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const dirs: Record<string, { x?: number; y?: number }> = {
    up: { y: 50 }, down: { y: -50 }, left: { x: 60 }, right: { x: -60 }, none: {}
  }
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...dirs[direction] }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── Staggered children reveal ───
function StaggerChildren({ children, className = '', stagger = 0.08 }: {
  children: React.ReactNode
  className?: string
  stagger?: number
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={{ visible: { transition: { staggerChildren: stagger } } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const childVariant = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' } }
} as const

// ─── Desktop screenshot with browser chrome cropped via CSS ───
function DesktopMockup({ src, alt, className = '', cropTop = 70 }: {
  src: string; alt: string; className?: string; cropTop?: number
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative ${className}`}
    >
      {/* Glow */}
      <div className="absolute -inset-4 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent rounded-3xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      {/* Screen */}
      <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 bg-zinc-950">
        <div style={{ marginTop: `-${cropTop}px`, paddingBottom: 0 }}>
          <img src={src} alt={alt} className="w-full block" style={{ display: 'block' }} />
        </div>
      </div>
      {/* Reflection line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </motion.div>
  )
}

// ─── Mobile screenshot with phone frame ───
function PhoneMockup({ src, alt, className = '', cropTop = 65, cropBottom = 50, hideRestaurantName = false }: {
  src: string; alt: string; className?: string; cropTop?: number; cropBottom?: number; hideRestaurantName?: boolean
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={`relative ${className}`}
    >
      <div className="relative rounded-[2.2rem] overflow-hidden border-[3px] border-zinc-700/60 shadow-2xl shadow-black/70 bg-black">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-b-2xl z-20" />
        {/* Screen content — crop status bar and bottom bar */}
        <div className="relative overflow-hidden" style={{ marginTop: `-${cropTop}px`, marginBottom: `-${cropBottom}px` }}>
          <img src={src} alt={alt} className="w-full block" />
          {/* Hide restaurant name with gradient overlay if needed */}
          {hideRestaurantName && (
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black via-black/90 to-transparent z-10" />
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Floating badge ───
function FloatingBadge({ children, className = '', delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [price, setPrice] = useState<number | null>(null)
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95])
  const heroY = useTransform(scrollYProgress, [0, 0.5], ['0%', '8%'])

  // URL params from admin registration link
  const bonusMonths = parseInt(searchParams.get('bonus') || '0')
  const discountPercent = parseInt(searchParams.get('discount') || '0')
  const token = searchParams.get('token') || ''

  useEffect(() => {
    DatabaseService.getStripePriceDetails()
      .then(d => setPrice(d.amount / 100))
      .catch(() => setPrice(null))
  }, [])

  const displayPrice = price !== null ? price.toFixed(2) : null
  const discountedPrice = price !== null && discountPercent > 0
    ? (price * (1 - discountPercent / 100)).toFixed(2)
    : null

  // CTA click — go to register if token, otherwise go to login
  const handleCTA = () => {
    if (token) {
      navigate(`/register/${token}`)
    } else {
      navigate('/')
    }
  }

  // ─── FEATURES DATA ───
  const features = [
    {
      id: 'menu',
      badge: 'Menu Digitale',
      title: 'Il tuo menu, sempre aggiornato',
      description: 'I clienti scansionano il QR code al tavolo e sfogliano il menu dal proprio telefono. Foto HD, descrizioni dettagliate, allergeni, prezzi — tutto aggiornabile in tempo reale dalla dashboard.',
      details: [
        'Categorie personalizzabili con ordinamento drag & drop',
        'Foto piatti con compressione automatica',
        'Allergeni e varianti per ogni piatto',
        'Esportazione menu in PDF per la stampa',
        'QR code unico per ogni tavolo con PIN di accesso',
      ],
      desktopImg: '/landing/menu-desktop.png',
      mobileImgs: ['/landing/menu-mobile.png', '/landing/dettaglio-mobile.png'],
      hideName: true,
    },
    {
      id: 'orders',
      badge: 'Gestione Ordini',
      title: 'Tutto sotto controllo, in tempo reale',
      description: 'Ogni ordine arriva istantaneamente in cucina. Vedi lo stato di ogni piatto, il tempo di attesa, e gestisci le priorità con un tocco. La cucina non perde più neanche un ordine.',
      details: [
        'Notifiche sonore personalizzabili per nuovi ordini',
        'Vista per tavolo o per piatto singolo',
        'Filtro per categoria (antipasti, primi, secondi...)',
        'Gestione portate: dividi l\'ordine in più portate',
        'Completamento piatti con animazione di conferma',
        'Suggerimento portate successive automatico',
      ],
      desktopImg: '/landing/ordini2-desktop.png',
      cropTop: 90,
    },
    {
      id: 'tables',
      badge: 'Gestione Tavoli',
      title: '20 tavoli o 200, sempre sotto controllo',
      description: 'Mappa visuale di ogni sala. Vedi in un colpo d\'occhio quali tavoli sono occupati, il PIN di accesso, gli ordini in corso. Attiva e disattiva i tavoli istantaneamente.',
      details: [
        'Sale multiple (Sala Interna, Terrazza, Giardino...)',
        'QR code e PIN unico per ogni tavolo',
        'Stato in tempo reale: occupato, libero, da pulire',
        'Conto tavolo con split payment e pagamento parziale',
        'Scarica PDF griglia QR per tutti i tavoli della sala',
      ],
      desktopImg: '/landing/tavoli-desktop.png',
    },
    {
      id: 'waiter',
      badge: 'App Camerieri',
      title: 'Il cameriere del futuro',
      description: 'Ogni cameriere ha la sua dashboard sul telefono. Notifiche in tempo reale per piatti pronti, richieste di assistenza, gestione tavoli — tutto dal palmo della mano.',
      details: [
        'Dashboard mobile con vista tavoli per sala',
        'Notifiche push per piatti pronti da servire',
        'Presa ordini rapida dal telefono del cameriere',
        'Gestione conto e pagamenti direttamente dal tavolo',
        'Attività in tempo reale: chi fa cosa, quando',
        'Permessi personalizzabili per ogni cameriere',
      ],
      mobileImgs: ['/landing/waiter-mobile.png', '/landing/attivita-mobile.png'],
    },
    {
      id: 'reservations',
      badge: 'Prenotazioni',
      title: 'Mai più appunti su carta',
      description: 'Timeline visuale delle prenotazioni per sala. I clienti prenotano online dal link dedicato, tu gestisci tutto dalla dashboard. Capacità, orari, note speciali — tutto in un posto.',
      details: [
        'Pagina pubblica di prenotazione personalizzata',
        'Timeline visuale per giornata e per sala',
        'Gestione capacità tavoli e coperti disponibili',
        'Note e richieste speciali per ogni prenotazione',
        'Conferma automatica o manuale',
        'PDF locandina QR per promuovere le prenotazioni',
      ],
      desktopImg: '/landing/prenotazioni-desktop.png',
    },
    {
      id: 'custom-menus',
      badge: 'Menu Personalizzati',
      title: 'Un menu diverso per ogni occasione',
      description: 'Crea menu personalizzati selezionando i piatti dal tuo catalogo. Programmali con orari settimanali — il pranzo del martedì, la cena del weekend, il brunch domenicale. Si attivano e disattivano automaticamente.',
      details: [
        'Selezione piatti per categoria con checkbox',
        'Programmazione oraria settimanale (es. Lun-Ven 12-15)',
        'Attivazione/disattivazione automatica per fascia oraria',
        'Menu multipli attivabili in parallelo',
        'Bottoni "Seleziona tutti" / "Deseleziona tutti" per categoria',
      ],
    },
    {
      id: 'payments',
      badge: 'Pagamenti Digitali',
      title: 'Ordina, mangia, paga. Dal telefono.',
      description: 'I clienti pagano direttamente dal menu digitale con Stripe. Pagamento intero, alla romana, o per piatti selezionati. Tu ricevi i fondi direttamente sul tuo conto.',
      details: [
        'Pagamento con carta di credito via Stripe',
        'Split payment: alla romana o per piatti selezionati',
        'Stripe Connect: i fondi arrivano sul tuo conto',
        'Notifica in tempo reale quando il cliente paga',
        'Storico pagamenti e ricevute nella dashboard',
      ],
    },
    {
      id: 'analytics',
      badge: 'Analitiche',
      title: 'Decisioni basate sui dati',
      description: 'Ricavi giornalieri, piatti più venduti, performance per categoria, andamento nel tempo. Report esportabili, grafici interattivi — tutto aggiornato in tempo reale.',
      details: [
        'Dashboard con ricavi, ordini e scontrino medio',
        'Grafico andamento nel tempo (giorno/settimana/mese)',
        'Classifica piatti più venduti e meno venduti',
        'Performance per categoria con grafici a barre',
        'Performance camerieri con ordini gestiti',
        'Protezione con password per privacy',
        'Export report in formato CSV',
      ],
      desktopImg: '/landing/analitiche-desktop.png',
      desktopImg2: '/landing/camerieri-desktop.png',
    },
    {
      id: 'customer',
      badge: 'Esperienza Cliente',
      title: 'Scansiona. Ordina. Paga.',
      description: 'Il cliente scansiona il QR code al tavolo, sfoglia il menu con foto e descrizioni, aggiunge al carrello, sceglie le portate, ordina e paga — tutto senza aspettare il cameriere.',
      details: [
        'Menu mobile con foto HD e ricerca rapida',
        'Carrello con gestione quantità e note',
        'Divisione automatica in portate',
        'Pagamento digitale con carta di credito',
        'Richiesta assistenza cameriere con un tap',
        'Supporto multi-lingua (prossimamente)',
      ],
      mobileImgs: ['/landing/menu-mobile.png', '/landing/dettaglio-mobile.png', '/landing/carrello-mobile.png'],
      hideName: true,
      isCustomerSection: true,
    },
  ]

  return (
    <div className="bg-black text-white font-sans overflow-x-hidden selection:bg-amber-500/30">

      {/* ════════ NAVBAR ════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/70 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-lg font-light tracking-[0.3em] text-white">MIN</span>
            <span className="text-lg font-light tracking-[0.3em] text-amber-500">THI</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-zinc-400">
            <a href="#funzioni" className="hover:text-white transition-colors duration-300">Funzionalità</a>
            <a href="#prezzi" className="hover:text-white transition-colors duration-300">Prezzi</a>
            <button
              onClick={handleCTA}
              className="px-5 py-2 bg-amber-500 text-black font-semibold rounded-full text-[13px] hover:bg-amber-400 transition-all hover:shadow-[0_0_30px_-8px_rgba(245,158,11,0.4)]"
            >
              {token ? 'Registrati' : 'Accedi'}
            </button>
          </div>
          <button
            onClick={handleCTA}
            className="md:hidden px-4 py-1.5 bg-amber-500 text-black font-semibold rounded-full text-[12px]"
          >
            {token ? 'Registrati' : 'Accedi'}
          </button>
        </div>
      </nav>

      {/* ════════ HERO ════════ */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center px-6 pt-20 pb-10">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-amber-500/[0.04] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-amber-600/[0.02] rounded-full blur-[100px]" />
        </div>

        <motion.div style={{ opacity: heroOpacity, scale: heroScale, y: heroY }} className="relative text-center max-w-4xl mx-auto">
          {/* Promo badge */}
          {(bonusMonths > 0 || discountPercent > 0) && (
            <FloatingBadge delay={0} className="mb-8">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/30 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-300 text-sm font-medium">
                  {bonusMonths > 0 && `${bonusMonths} ${bonusMonths === 1 ? 'mese' : 'mesi'} gratis`}
                  {bonusMonths > 0 && discountPercent > 0 && ' + '}
                  {discountPercent > 0 && `${discountPercent}% di sconto`}
                </span>
              </div>
            </FloatingBadge>
          )}

          <FadeIn delay={0.1}>
            <p className="text-amber-500 text-[13px] font-medium tracking-[0.4em] uppercase mb-6">
              Il futuro della ristorazione
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <h1 className="text-5xl sm:text-6xl md:text-8xl font-extralight tracking-tight leading-[0.9] mb-8">
              <span className="text-white">Gestisci il tuo</span>
              <br />
              <span className="text-amber-500 font-light">ristorante</span>
              <br />
              <span className="text-white">come mai prima.</span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.4}>
            <p className="text-zinc-400 text-lg sm:text-xl font-light max-w-2xl mx-auto leading-relaxed mb-12">
              Menu digitale, ordini in tempo reale, analitiche avanzate e app camerieri.
              <br className="hidden sm:block" />
              Tutto in un'unica piattaforma elegante e potente.
            </p>
          </FadeIn>

          <FadeIn delay={0.5}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleCTA}
                className="px-8 py-4 bg-amber-500 text-black font-semibold rounded-full text-base hover:bg-amber-400 transition-all hover:shadow-[0_0_40px_-10px_rgba(245,158,11,0.4)] hover:scale-105 active:scale-95"
              >
                {token ? 'Registrati Gratis' : 'Inizia Ora'}
              </button>
              <a
                href="#funzioni"
                className="px-8 py-4 border border-white/10 text-white rounded-full text-base hover:bg-white/5 transition-all font-light hover:border-white/20"
              >
                Scopri le funzioni
              </a>
            </div>
          </FadeIn>

          {/* Hero screenshot */}
          <FadeIn delay={0.7} className="mt-20">
            <DesktopMockup src="/landing/tavoli-desktop.png" alt="MINTHI Dashboard" />
          </FadeIn>
        </motion.div>
      </section>

      {/* ════════ STATS BAR ════════ */}
      <section className="py-20 border-y border-white/5 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/[0.02] to-transparent" />
        <StaggerChildren className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center relative">
          {[
            { value: '< 1s', label: 'Ordine in cucina' },
            { value: '100%', label: 'Tempo reale' },
            { value: '0€', label: 'Costi nascosti' },
            { value: '24/7', label: 'Supporto' },
          ].map((stat, i) => (
            <motion.div key={i} variants={childVariant}>
              <p className="text-3xl md:text-4xl font-extralight text-amber-500 tabular-nums">{stat.value}</p>
              <p className="text-zinc-500 text-sm mt-2 font-light">{stat.label}</p>
            </motion.div>
          ))}
        </StaggerChildren>
      </section>

      {/* ════════ FEATURES ════════ */}
      <section id="funzioni" className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-24">
            <p className="text-amber-500 text-[13px] font-medium tracking-[0.4em] uppercase mb-4">Funzionalità</p>
            <h2 className="text-4xl md:text-6xl font-extralight tracking-tight">
              Tutto ciò di cui hai bisogno.
              <br />
              <span className="text-zinc-500">Niente di più.</span>
            </h2>
          </FadeIn>

          {features.map((feature, index) => (
            <div key={feature.id} className="mb-32 md:mb-44 last:mb-0">
              {/* Section header */}
              <FadeIn className="text-center mb-12 md:mb-16">
                <span className="inline-block px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[12px] font-medium tracking-[0.2em] uppercase mb-5">
                  {feature.badge}
                </span>
                <h3 className="text-3xl md:text-5xl font-extralight tracking-tight mb-6">{feature.title}</h3>
                <p className="text-zinc-400 text-base md:text-lg font-light max-w-2xl mx-auto leading-relaxed">
                  {feature.description}
                </p>
              </FadeIn>

              {/* Feature details pills */}
              {feature.details && (
                <StaggerChildren className="flex flex-wrap justify-center gap-2.5 mb-12 md:mb-16 max-w-3xl mx-auto" stagger={0.05}>
                  {feature.details.map((detail, i) => (
                    <motion.span
                      key={i}
                      variants={childVariant}
                      className="px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-zinc-400 text-[13px] font-light hover:border-amber-500/20 hover:text-zinc-300 transition-all duration-300 cursor-default"
                    >
                      {detail}
                    </motion.span>
                  ))}
                </StaggerChildren>
              )}

              {/* ─── Image layouts ─── */}

              {/* Desktop only */}
              {feature.desktopImg && !feature.mobileImgs && (
                <div className="max-w-5xl mx-auto">
                  <DesktopMockup src={feature.desktopImg} alt={feature.title} cropTop={feature.cropTop || 70} />
                  {feature.desktopImg2 && (
                    <FadeIn delay={0.3} className="mt-8">
                      <DesktopMockup src={feature.desktopImg2} alt={`${feature.title} 2`} />
                    </FadeIn>
                  )}
                </div>
              )}

              {/* Desktop + Mobile combo */}
              {feature.desktopImg && feature.mobileImgs && (
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-12">
                  <FadeIn direction="left" className="flex-[2]">
                    <DesktopMockup src={feature.desktopImg} alt={feature.title} />
                  </FadeIn>
                  <div className="flex gap-4 md:gap-5">
                    {feature.mobileImgs.map((img, i) => (
                      <FadeIn key={i} direction="right" delay={0.15 * (i + 1)}>
                        <PhoneMockup
                          src={img}
                          alt={`${feature.title} mobile ${i + 1}`}
                          className="w-[150px] md:w-[200px]"
                          hideRestaurantName={feature.hideName}
                        />
                      </FadeIn>
                    ))}
                  </div>
                </div>
              )}

              {/* Mobile only */}
              {!feature.desktopImg && feature.mobileImgs && (
                <FadeIn>
                  <div className={`flex justify-center gap-5 md:gap-8 ${feature.isCustomerSection ? 'items-end' : 'items-center'}`}>
                    {feature.mobileImgs.map((img, i) => {
                      const rotations = [-3, 0, 3]
                      const translates = [0, -12, 0]
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 60 }}
                          whileInView={{ opacity: 1, y: translates[i] || 0 }}
                          viewport={{ once: true, margin: '-40px' }}
                          transition={{ duration: 0.8, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                          style={{ transform: `rotate(${rotations[i] || 0}deg)` }}
                          className={`${feature.isCustomerSection ? 'hidden sm:block' : ''} ${i === 0 || i === 1 ? '' : 'hidden sm:block'}`}
                        >
                          <PhoneMockup
                            src={img}
                            alt={`${feature.title} ${i + 1}`}
                            className="w-[160px] md:w-[220px]"
                            hideRestaurantName={feature.hideName}
                          />
                        </motion.div>
                      )
                    })}
                  </div>
                </FadeIn>
              )}

              {/* No images — text-only feature (custom menus, payments) */}
              {!feature.desktopImg && !feature.mobileImgs && (
                <FadeIn>
                  <div className="max-w-2xl mx-auto">
                    <div className="relative p-8 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent">
                      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-50" />
                      <div className="relative grid sm:grid-cols-2 gap-4">
                        {feature.details?.map((detail, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <span className="mt-1 w-4 h-4 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                            <span className="text-zinc-400 text-sm font-light">{detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </FadeIn>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════════ WHY MINTHI ════════ */}
      <section className="py-24 md:py-32 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/50 via-transparent to-zinc-950/50" />
        <div className="relative max-w-5xl mx-auto px-6">
          <FadeIn className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-extralight tracking-tight">
              Perché <span className="text-amber-500">MINTHI</span>?
            </h2>
          </FadeIn>

          <StaggerChildren className="grid md:grid-cols-3 gap-6" stagger={0.08}>
            {[
              { title: 'Zero hardware', desc: 'Nessun terminale, nessun tablet dedicato. Funziona su qualsiasi dispositivo con un browser.' },
              { title: 'Setup in 5 minuti', desc: 'Crea il tuo account, carica il menu, stampa i QR code. Sei operativo in una pausa caffè.' },
              { title: 'Aggiornamenti continui', desc: 'Nuove funzionalità ogni mese, senza costi aggiuntivi. Il tuo ristorante migliora con noi.' },
              { title: 'Tempo reale', desc: 'Ogni ordine, ogni modifica, ogni notifica — istantanea. Zero ritardi, zero errori di comunicazione.' },
              { title: 'Multi-dispositivo', desc: 'Dashboard su desktop, app camerieri su telefono, menu cliente su qualsiasi smartphone.' },
              { title: 'Supporto dedicato', desc: 'Assistenza umana via telefono e chat. Ti aiutiamo a configurare tutto e risolvere qualsiasi problema.' },
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={childVariant}
                className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-amber-500/20 hover:bg-amber-500/[0.02] transition-all duration-500"
              >
                <h4 className="text-lg font-medium text-white mb-3 group-hover:text-amber-400 transition-colors duration-300">{item.title}</h4>
                <p className="text-zinc-400 text-sm font-light leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* ════════ PRICING ════════ */}
      <section id="prezzi" className="py-24 md:py-32 relative">
        <div className="absolute inset-0 bg-zinc-950/50" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <FadeIn>
            <p className="text-amber-500 text-[13px] font-medium tracking-[0.4em] uppercase mb-4">Prezzi</p>
            <h2 className="text-4xl md:text-6xl font-extralight tracking-tight mb-6">
              Semplice e trasparente.
            </h2>
            <p className="text-zinc-400 text-lg font-light max-w-xl mx-auto mb-16">
              Un unico piano con tutte le funzionalità. Nessun costo nascosto, nessuna sorpresa.
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="relative max-w-md mx-auto">
              {/* Glow */}
              <div className="absolute -inset-3 bg-gradient-to-b from-amber-500/20 via-amber-500/5 to-transparent rounded-[2rem] blur-2xl opacity-60" />

              <div className="relative bg-zinc-900 border border-amber-500/20 rounded-3xl p-10 overflow-hidden">
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.03] via-transparent to-transparent" />

                <div className="relative">
                  <p className="text-amber-500 text-sm font-medium tracking-wider uppercase mb-6">MINTHI Pro</p>

                  {/* Promo badge */}
                  {(bonusMonths > 0 || discountPercent > 0) && (
                    <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-300 text-sm font-medium">
                        Offerta speciale per te
                      </span>
                    </div>
                  )}

                  {/* Price */}
                  <div className="flex items-baseline justify-center gap-1 mb-2">
                    {discountedPrice ? (
                      <>
                        <span className="text-3xl text-zinc-500 line-through font-light mr-2">€{displayPrice}</span>
                        <span className="text-6xl md:text-7xl font-extralight text-white">€{discountedPrice}</span>
                      </>
                    ) : (
                      <span className="text-6xl md:text-7xl font-extralight text-white">
                        {displayPrice !== null ? `€${displayPrice}` : '...'}
                      </span>
                    )}
                    <span className="text-zinc-500 text-lg font-light">/mese</span>
                  </div>
                  <p className="text-zinc-500 text-sm mb-2">IVA esclusa</p>
                  {bonusMonths > 0 && (
                    <p className="text-emerald-400 text-sm font-medium mb-6">
                      + {bonusMonths} {bonusMonths === 1 ? 'mese' : 'mesi'} gratis inclus{bonusMonths === 1 ? 'o' : 'i'}
                    </p>
                  )}
                  {!bonusMonths && <div className="mb-8" />}

                  <ul className="text-left space-y-4 mb-10">
                    {[
                      'Menu digitale con QR code',
                      'Ordini in tempo reale',
                      'Gestione tavoli e sale',
                      'App camerieri illimitati',
                      'Prenotazioni online',
                      'Analitiche e report',
                      'Menu personalizzati programmabili',
                      'Pagamenti digitali con Stripe',
                      'Gestione portate',
                      'Supporto dedicato',
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-3 text-zinc-300 text-sm font-light">
                        <span className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={handleCTA}
                    className="w-full py-4 bg-amber-500 text-black font-semibold rounded-full text-base hover:bg-amber-400 transition-all hover:shadow-[0_0_40px_-10px_rgba(245,158,11,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {token ? 'Registrati Gratis' : 'Inizia Ora'}
                  </button>

                  <p className="text-zinc-600 text-xs mt-4">Disdici quando vuoi. Nessun vincolo.</p>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ════════ FINAL CTA ════════ */}
      <section className="py-32 md:py-40 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-amber-500/[0.03] to-transparent" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <FadeIn>
            <h2 className="text-4xl md:text-6xl font-extralight tracking-tight mb-6">
              Pronto a trasformare
              <br />
              il tuo ristorante?
            </h2>
            <p className="text-zinc-400 text-lg font-light mb-10">
              Unisciti a MINTHI e porta la tua gestione al livello successivo.
            </p>
            <button
              onClick={handleCTA}
              className="px-10 py-4 bg-amber-500 text-black font-semibold rounded-full text-lg hover:bg-amber-400 transition-all hover:shadow-[0_0_50px_-10px_rgba(245,158,11,0.5)] hover:scale-105 active:scale-95"
            >
              {token ? 'Registrati Gratis' : 'Inizia Ora'}
            </button>
          </FadeIn>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <span className="text-sm font-light tracking-[0.3em] text-zinc-500">MIN</span>
            <span className="text-sm font-light tracking-[0.3em] text-amber-500/60">THI</span>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-zinc-600">
            <a href="tel:+393517570155" className="hover:text-zinc-400 transition-colors">+39 351 757 0155</a>
            <span>&middot;</span>
            <span>&copy; {new Date().getFullYear()} MINTHI Systems</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
