import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { DatabaseService } from '../services/DatabaseService'

// Fade-in on scroll component
function FadeIn({ children, className = '', delay = 0, direction = 'up' }: {
  children: React.ReactNode
  className?: string
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  const dirMap = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
    none: { x: 0, y: 0 }
  }
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...dirMap[direction] }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Parallax image wrapper
function ParallaxImage({ src, alt, className = '' }: { src: string, alt: string, className?: string }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['-5%', '5%'])
  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.img src={src} alt={alt} style={{ y }} className="w-full h-full object-cover" />
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [price, setPrice] = useState<number | null>(null)
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95])
  const heroY = useTransform(scrollYProgress, [0, 0.5], ['0%', '10%'])

  useEffect(() => {
    DatabaseService.getStripePriceDetails()
      .then(d => setPrice(d.amount / 100))
      .catch(() => setPrice(null))
  }, [])

  const features = [
    {
      title: 'Menu Digitale',
      subtitle: 'Il tuo menu, sempre aggiornato',
      description: 'I clienti scansionano il QR code al tavolo e sfogliano il menu dal proprio telefono. Foto, descrizioni, allergeni, prezzi — tutto aggiornabile in tempo reale dalla dashboard.',
      image: '/landing/menu-desktop.png',
      mobileImage: '/landing/menu-mobile.png',
      mobileImage2: '/landing/dettaglio-mobile.png',
    },
    {
      title: 'Gestione Ordini',
      subtitle: 'Tutto sotto controllo, in tempo reale',
      description: 'Ogni ordine arriva istantaneamente in cucina. Vedi lo stato di ogni piatto, il tempo di attesa, e gestisci le priorità con un tocco.',
      image: '/landing/ordini2-desktop.png',
    },
    {
      title: 'Gestione Tavoli',
      subtitle: '20 tavoli o 200, sempre sotto controllo',
      description: 'Mappa visuale di ogni sala. Vedi in un colpo d\'occhio quali tavoli sono occupati, il PIN di accesso, gli ordini in corso. Attiva e disattiva i tavoli istantaneamente.',
      image: '/landing/tavoli-desktop.png',
    },
    {
      title: 'App Camerieri',
      subtitle: 'Il cameriere del futuro',
      description: 'Ogni cameriere ha la sua dashboard sul telefono. Notifiche in tempo reale per piatti pronti, richieste di assistenza, gestione tavoli — tutto dal palmo della mano.',
      mobileImage: '/landing/waiter-mobile.png',
      mobileImage2: '/landing/attivita-mobile.png',
    },
    {
      title: 'Prenotazioni',
      subtitle: 'Mai più appunti su carta',
      description: 'Timeline visuale delle prenotazioni per sala. I clienti prenotano online, tu gestisci tutto dalla dashboard. Capacità, orari, note speciali — tutto in un posto.',
      image: '/landing/prenotazioni-desktop.png',
    },
    {
      title: 'Analitiche',
      subtitle: 'Decisioni basate sui dati',
      description: 'Ricavi, piatti più venduti, performance camerieri, analisi magazzino. Report esportabili, grafici interattivi, tutto aggiornato in tempo reale.',
      image: '/landing/analitiche-desktop.png',
      image2: '/landing/camerieri-desktop.png',
    },
  ]

  return (
    <div className="bg-black text-white font-sans overflow-x-hidden selection:bg-amber-500/30">

      {/* ===== NAVBAR ===== */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-light tracking-[0.3em] text-white">MIN</span>
            <span className="text-lg font-light tracking-[0.3em] text-amber-500">THI</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-zinc-400">
            <a href="#funzioni" className="hover:text-white transition-colors">Funzionalit&agrave;</a>
            <a href="#prezzi" className="hover:text-white transition-colors">Prezzi</a>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2 bg-amber-500 text-black font-semibold rounded-full text-[13px] hover:bg-amber-400 transition-colors"
            >
              Accedi
            </button>
          </div>
          <button
            onClick={() => navigate('/')}
            className="md:hidden px-4 py-1.5 bg-amber-500 text-black font-semibold rounded-full text-[12px]"
          >
            Accedi
          </button>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center px-6 pt-20">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.03] via-transparent to-transparent" />

        <motion.div style={{ opacity: heroOpacity, scale: heroScale, y: heroY }} className="relative text-center max-w-4xl mx-auto">
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
              <a
                href="#prezzi"
                className="px-8 py-4 bg-amber-500 text-black font-semibold rounded-full text-base hover:bg-amber-400 transition-all hover:shadow-[0_0_40px_-10px_rgba(245,158,11,0.4)]"
              >
                Inizia Ora
              </a>
              <a
                href="#funzioni"
                className="px-8 py-4 border border-white/10 text-white rounded-full text-base hover:bg-white/5 transition-all font-light"
              >
                Scopri le funzioni
              </a>
            </div>
          </FadeIn>

          {/* Hero device mockup */}
          <FadeIn delay={0.7} className="mt-20">
            <div className="relative mx-auto max-w-5xl">
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                <img src="/landing/tavoli-desktop.png" alt="MINTHI Dashboard" className="w-full" />
              </div>
              {/* Glow effect */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-amber-500/20 via-transparent to-transparent opacity-40 pointer-events-none" />
            </div>
          </FadeIn>
        </motion.div>
      </section>

      {/* ===== STATS BAR ===== */}
      <section className="py-20 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '< 1s', label: 'Ordine in cucina' },
            { value: '100%', label: 'Tempo reale' },
            { value: '0€', label: 'Costi nascosti' },
            { value: '24/7', label: 'Supporto' },
          ].map((stat, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div>
                <p className="text-3xl md:text-4xl font-extralight text-amber-500">{stat.value}</p>
                <p className="text-zinc-500 text-sm mt-2 font-light">{stat.label}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="funzioni" className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-24">
            <p className="text-amber-500 text-[13px] font-medium tracking-[0.4em] uppercase mb-4">Funzionalit&agrave;</p>
            <h2 className="text-4xl md:text-6xl font-extralight tracking-tight">
              Tutto ci&ograve; di cui hai bisogno.
              <br />
              <span className="text-zinc-500">Niente di pi&ugrave;.</span>
            </h2>
          </FadeIn>

          {features.map((feature, index) => (
            <div key={index} className={`mb-32 md:mb-48 last:mb-0`}>
              {/* Section header */}
              <FadeIn className="text-center mb-12 md:mb-16">
                <p className="text-amber-500 text-[13px] font-medium tracking-[0.3em] uppercase mb-3">{feature.subtitle}</p>
                <h3 className="text-3xl md:text-5xl font-extralight tracking-tight">{feature.title}</h3>
                <p className="text-zinc-400 text-base md:text-lg font-light max-w-2xl mx-auto mt-6 leading-relaxed">
                  {feature.description}
                </p>
              </FadeIn>

              {/* Images */}
              {feature.image && !feature.mobileImage && (
                <FadeIn>
                  <div className="relative mx-auto max-w-5xl">
                    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                      <img src={feature.image} alt={feature.title} className="w-full" />
                    </div>
                    {feature.image2 && (
                      <FadeIn delay={0.3} className="mt-8">
                        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                          <img src={feature.image2} alt={`${feature.title} 2`} className="w-full" />
                        </div>
                      </FadeIn>
                    )}
                  </div>
                </FadeIn>
              )}

              {/* Desktop + Mobile combo */}
              {feature.image && feature.mobileImage && (
                <div className="relative mx-auto max-w-6xl flex flex-col md:flex-row items-center gap-8 md:gap-12">
                  <FadeIn direction="left" className="flex-1">
                    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                      <img src={feature.image} alt={feature.title} className="w-full" />
                    </div>
                  </FadeIn>
                  <FadeIn direction="right" delay={0.2} className="flex gap-4">
                    <div className="w-[180px] md:w-[220px] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                      <img src={feature.mobileImage} alt={`${feature.title} mobile`} className="w-full" />
                    </div>
                    {feature.mobileImage2 && (
                      <div className="w-[180px] md:w-[220px] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                        <img src={feature.mobileImage2} alt={`${feature.title} mobile 2`} className="w-full" />
                      </div>
                    )}
                  </FadeIn>
                </div>
              )}

              {/* Mobile only (no desktop) */}
              {!feature.image && feature.mobileImage && (
                <FadeIn>
                  <div className="flex justify-center gap-6 md:gap-10">
                    <div className="w-[200px] md:w-[280px] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                      <img src={feature.mobileImage} alt={feature.title} className="w-full" />
                    </div>
                    {feature.mobileImage2 && (
                      <div className="w-[200px] md:w-[280px] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                        <img src={feature.mobileImage2} alt={`${feature.title} 2`} className="w-full" />
                      </div>
                    )}
                  </div>
                </FadeIn>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== CUSTOMER EXPERIENCE ===== */}
      <section className="py-24 md:py-32 bg-zinc-950/50">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-16">
            <p className="text-amber-500 text-[13px] font-medium tracking-[0.4em] uppercase mb-4">Esperienza cliente</p>
            <h2 className="text-4xl md:text-6xl font-extralight tracking-tight">
              Scansiona. Ordina. Paga.
            </h2>
            <p className="text-zinc-400 text-lg font-light max-w-2xl mx-auto mt-6 leading-relaxed">
              Il cliente scansiona il QR code, sfoglia il menu con foto e descrizioni,
              ordina dal proprio telefono e paga — tutto senza aspettare.
            </p>
          </FadeIn>

          <FadeIn>
            <div className="flex justify-center gap-6 md:gap-10">
              <div className="w-[180px] md:w-[260px] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-black/50 transform -rotate-3">
                <img src="/landing/menu-mobile.png" alt="Menu cliente" className="w-full" />
              </div>
              <div className="w-[180px] md:w-[260px] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-black/50 transform translate-y-8">
                <img src="/landing/dettaglio-mobile.png" alt="Dettaglio piatto" className="w-full" />
              </div>
              <div className="w-[180px] md:w-[260px] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-black/50 transform rotate-3 hidden sm:block">
                <img src="/landing/carrello-mobile.png" alt="Carrello" className="w-full" />
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ===== WHY MINTHI ===== */}
      <section className="py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <FadeIn className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-extralight tracking-tight">
              Perch&eacute; <span className="text-amber-500">MINTHI</span>?
            </h2>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Zero hardware',
                desc: 'Nessun terminale, nessun tablet dedicato. Funziona su qualsiasi dispositivo con un browser.',
              },
              {
                title: 'Setup in 5 minuti',
                desc: 'Crea il tuo account, carica il menu, stampa i QR code. Sei operativo in una pausa caff\u00e8.',
              },
              {
                title: 'Aggiornamenti continui',
                desc: 'Nuove funzionalit\u00e0 ogni mese, senza costi aggiuntivi. Il tuo ristorante migliora con noi.',
              },
              {
                title: 'Tempo reale',
                desc: 'Ogni ordine, ogni modifica, ogni notifica \u2014 istantanea. Zero ritardi, zero errori di comunicazione.',
              },
              {
                title: 'Multi-dispositivo',
                desc: 'Dashboard su desktop, app camerieri su telefono, menu cliente su qualsiasi smartphone.',
              },
              {
                title: 'Supporto dedicato',
                desc: 'Assistenza umana via telefono e chat. Ti aiutiamo a configurare tutto e risolvere qualsiasi problema.',
              },
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 0.08}>
                <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-amber-500/20 transition-colors">
                  <h4 className="text-lg font-medium text-white mb-3">{item.title}</h4>
                  <p className="text-zinc-400 text-sm font-light leading-relaxed">{item.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="prezzi" className="py-24 md:py-32 bg-zinc-950/50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <FadeIn>
            <p className="text-amber-500 text-[13px] font-medium tracking-[0.4em] uppercase mb-4">Prezzi</p>
            <h2 className="text-4xl md:text-6xl font-extralight tracking-tight mb-6">
              Semplice e trasparente.
            </h2>
            <p className="text-zinc-400 text-lg font-light max-w-xl mx-auto mb-16">
              Un unico piano con tutte le funzionalit&agrave;. Nessun costo nascosto, nessuna sorpresa.
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="relative max-w-md mx-auto">
              {/* Card glow */}
              <div className="absolute -inset-1 bg-gradient-to-b from-amber-500/20 to-transparent rounded-3xl blur-xl opacity-40" />

              <div className="relative bg-zinc-900 border border-amber-500/20 rounded-3xl p-10">
                <p className="text-amber-500 text-sm font-medium tracking-wider uppercase mb-6">MINTHI Pro</p>

                <div className="flex items-baseline justify-center gap-1 mb-2">
                  <span className="text-6xl md:text-7xl font-extralight text-white">
                    {price !== null ? `€${price}` : '...'}
                  </span>
                  <span className="text-zinc-500 text-lg font-light">/mese</span>
                </div>
                <p className="text-zinc-500 text-sm mb-10">IVA esclusa</p>

                <ul className="text-left space-y-4 mb-10">
                  {[
                    'Menu digitale con QR code',
                    'Ordini in tempo reale',
                    'Gestione tavoli e sale',
                    'App camerieri illimitati',
                    'Prenotazioni online',
                    'Analitiche e report',
                    'Menu personalizzati programmabili',
                    'Pagamenti digitali',
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
                  onClick={() => navigate('/')}
                  className="w-full py-4 bg-amber-500 text-black font-semibold rounded-full text-base hover:bg-amber-400 transition-all hover:shadow-[0_0_40px_-10px_rgba(245,158,11,0.4)]"
                >
                  Inizia Ora
                </button>

                <p className="text-zinc-600 text-xs mt-4">Disdici quando vuoi. Nessun vincolo.</p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
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
              onClick={() => navigate('/')}
              className="px-10 py-4 bg-amber-500 text-black font-semibold rounded-full text-lg hover:bg-amber-400 transition-all hover:shadow-[0_0_50px_-10px_rgba(245,158,11,0.5)]"
            >
              Inizia Ora
            </button>
          </FadeIn>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
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
