import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BarChart3, CalendarDays, ChefHat, CreditCard, MessageCircle, Package, QrCode, Receipt, Smartphone, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { rpc } from '@/shared/lib/api'
import { Button } from '@/shared/ui/button'
import { Logo } from '@/shared/ui/logo'

const FEATURES = [
  { icon: QrCode, title: 'Ordini dal tavolo', text: 'I clienti inquadrano il QR, inseriscono il PIN e ordinano dal telefono. Carrello condiviso tra tutto il tavolo.' },
  { icon: ChefHat, title: 'Cucina in tempo reale', text: 'Comande sullo schermo con segnale acustico, stati dei piatti e stampa automatica.' },
  { icon: Users, title: 'App per la sala', text: 'Mappa tavoli, ordini per conto del cliente, chiamate dal tavolo, conto e incassi.' },
  { icon: Package, title: 'Asporto salta-coda', text: 'Menu online, numero di ritiro, schermo con i numeri pronti e ritiro con QR.' },
  { icon: CreditCard, title: 'Pagamenti online', text: 'Conto diviso o intero con carta, Apple Pay e Google Pay. I soldi arrivano sul tuo conto.' },
  { icon: Receipt, title: 'Scontrini elettronici', text: 'Documento commerciale trasmesso all\'Agenzia delle Entrate, anche in automatico.' },
  { icon: CalendarDays, title: 'Prenotazioni', text: 'Pagina pubblica per prenotare e timeline dei tavoli per il servizio.' },
  { icon: BarChart3, title: 'Analitiche', text: 'Incassi, coperti, piatti più venduti, orari di punta e tempi di cucina.' },
]

const SHOTS = [
  { src: '/landing/tavoli-desktop.png', alt: 'Mappa dei tavoli' },
  { src: '/landing/ordini-desktop.png', alt: 'Ordini in tempo reale' },
  { src: '/landing/menu-mobile.png', alt: 'Menu cliente su telefono', mobile: true },
]

export function LandingPage() {
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: async () => (await rpc('get_public_config')) as Record<string, string>, staleTime: Infinity })
  const wa = cfg.data?.contact_whatsapp
  const contact = wa ? `https://wa.me/${wa}?text=${encodeURIComponent('Ciao! Vorrei una demo di MINTHI')}` : cfg.data?.contact_email ? `mailto:${cfg.data.contact_email}` : 'mailto:info@minthi.it'

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur pt-safe">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo size={30} />
          <nav className="flex items-center gap-2">
            <a href="#funzioni" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:block">Funzioni</a>
            <Button variant="ghost" asChild><Link to="/accedi">Accedi</Link></Button>
            <Button asChild><a href={contact} target="_blank" rel="noreferrer">Richiedi una demo</a></Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-x-0 -top-40 h-[36rem] bg-[radial-gradient(50%_60%_at_50%_30%,color-mix(in_oklch,var(--brand)_22%,transparent),transparent)]" />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-sm text-muted-foreground"><Smartphone className="size-4 text-primary" />Gestionale per ristoranti, bar ed eventi</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Il tuo locale, <span className="text-primary">più veloce</span> in ogni servizio.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">Menu digitale, ordini dal tavolo, cucina, asporto, pagamenti e scontrini elettronici. Tutto in un'unica app, sul telefono, sul tablet e sul computer.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild><a href={contact} target="_blank" rel="noreferrer">{wa ? <MessageCircle /> : null}Prova gratis con una demo</a></Button>
            <Button size="lg" variant="outline" asChild><a href="#funzioni">Scopri le funzioni<ArrowRight /></a></Button>
          </div>
          {cfg.data?.plan_price && <p className="mt-5 text-sm text-muted-foreground">Da {cfg.data.plan_price}, senza vincoli.</p>}
        </div>
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="overflow-hidden rounded-2xl border bg-surface shadow-lg">
            <img src={SHOTS[0].src} alt={SHOTS[0].alt} className="w-full" loading="eager" />
          </div>
        </div>
      </section>

      <section id="funzioni" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tutto quello che serve al servizio</h2>
          <p className="mt-4 text-muted-foreground">Ogni funzione si attiva quando ti serve: parti dal menu digitale e aggiungi il resto.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-surface p-5">
              <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent"><f.icon className="size-5 text-accent-foreground" /></span>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-surface-2/60">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Come funziona al tavolo</h2>
            <ol className="mt-8 grid gap-6">
              {[
                ['Apri il tavolo', 'Il cameriere apre il tavolo dall\'app e comunica un PIN di 4 cifre.'],
                ['Il cliente ordina', 'Inquadra il QR, inserisce il PIN e ordina. Il carrello è condiviso con tutto il tavolo.'],
                ['La cucina prepara', 'La comanda arriva subito in cucina, la sala vede cosa è pronto da servire.'],
                ['Si paga come si vuole', 'Al tavolo con carta, diviso tra le persone, oppure in cassa. Lo scontrino parte da solo.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                  <div><p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
                </li>
              ))}
            </ol>
          </div>
          <div className="mx-auto w-64 overflow-hidden rounded-[2rem] border-8 border-foreground/90 shadow-lg">
            <img src={SHOTS[2].src} alt={SHOTS[2].alt} className="w-full" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Vuoi vederlo nel tuo locale?</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Ti mostriamo MINTHI con il tuo menu e ti aiutiamo a configurarlo. Rispondiamo in poche ore.</p>
        <Button size="lg" className="mt-8" asChild><a href={contact} target="_blank" rel="noreferrer">Contattaci</a></Button>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo size={22} />
          <p>© {new Date().getFullYear()} MINTHI · Fatto in Italia</p>
          <Link to="/accedi" className="hover:text-foreground">Area riservata</Link>
        </div>
      </footer>
    </div>
  )
}
