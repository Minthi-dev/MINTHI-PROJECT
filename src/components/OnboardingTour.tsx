import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface OnboardingTourProps {
  onComplete: () => void
  restaurantName?: string
  setActiveTab: (tab: string) => void
  setIsSidebarOpen: (open: boolean) => void
}

const DRIVER_DARK_CSS = `
  .minthi-tour-popover.driver-popover {
    background: #18181b !important;
    border: 1px solid rgba(255,255,255,0.09) !important;
    border-radius: 18px !important;
    color: #f4f4f5 !important;
    box-shadow: 0 32px 64px -16px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.04) !important;
    max-width: 360px !important;
    padding: 0 !important;
  }
  .minthi-tour-popover .driver-popover-title {
    color: #ffffff !important;
    font-size: 16px !important;
    font-weight: 800 !important;
    letter-spacing: -0.02em !important;
    padding: 20px 20px 0 20px !important;
    line-height: 1.3 !important;
  }
  .minthi-tour-popover .driver-popover-description {
    color: #a1a1aa !important;
    font-size: 13px !important;
    line-height: 1.65 !important;
    padding: 8px 20px 0 20px !important;
  }
  .minthi-tour-popover .driver-popover-description strong {
    color: #f59e0b !important;
    font-weight: 700 !important;
  }
  .minthi-tour-popover .driver-popover-footer {
    margin-top: 0 !important;
    padding: 16px 20px 20px 20px !important;
    gap: 8px !important;
    border-top: 1px solid rgba(255,255,255,0.06) !important;
    margin-top: 16px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
  }
  .minthi-tour-popover .driver-popover-navigation-btns {
    display: flex !important;
    gap: 8px !important;
  }
  .minthi-tour-popover .driver-popover-next-btn {
    background: #f59e0b !important;
    color: #000000 !important;
    font-weight: 800 !important;
    border-radius: 10px !important;
    border: none !important;
    padding: 9px 20px !important;
    font-size: 13px !important;
    cursor: pointer !important;
    text-shadow: none !important;
    transition: background 0.15s !important;
    letter-spacing: -0.01em !important;
  }
  .minthi-tour-popover .driver-popover-next-btn:hover {
    background: #fbbf24 !important;
  }
  .minthi-tour-popover .driver-popover-prev-btn {
    background: transparent !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    color: #71717a !important;
    border-radius: 10px !important;
    padding: 9px 16px !important;
    font-size: 13px !important;
    cursor: pointer !important;
    text-shadow: none !important;
    transition: all 0.15s !important;
  }
  .minthi-tour-popover .driver-popover-prev-btn:hover {
    border-color: rgba(255,255,255,0.25) !important;
    color: #f4f4f5 !important;
  }
  .minthi-tour-popover .driver-popover-close-btn {
    color: #3f3f46 !important;
    font-size: 16px !important;
    line-height: 1 !important;
    position: absolute !important;
    top: 16px !important;
    right: 16px !important;
    cursor: pointer !important;
    transition: color 0.15s !important;
    background: transparent !important;
    border: none !important;
    padding: 4px !important;
  }
  .minthi-tour-popover .driver-popover-close-btn:hover {
    color: #a1a1aa !important;
  }
  .minthi-tour-popover .driver-popover-progress-text {
    color: #3f3f46 !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    letter-spacing: 0.02em !important;
  }
  .minthi-tour-popover .driver-popover-arrow-side-left.driver-popover-arrow {
    border-right-color: #18181b !important;
  }
  .minthi-tour-popover .driver-popover-arrow-side-right.driver-popover-arrow {
    border-left-color: #18181b !important;
  }
  .minthi-tour-popover .driver-popover-arrow-side-top.driver-popover-arrow {
    border-bottom-color: #18181b !important;
  }
  .minthi-tour-popover .driver-popover-arrow-side-bottom.driver-popover-arrow {
    border-top-color: #18181b !important;
  }
  .driver-active-element {
    border-radius: 10px !important;
  }
  .driver-overlay {
    background: rgba(0,0,0,0.72) !important;
  }
`

export default function OnboardingTour({
  onComplete,
  restaurantName,
  setActiveTab,
  setIsSidebarOpen,
}: OnboardingTourProps) {
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)

  // Inject custom dark CSS
  useEffect(() => {
    const existing = document.getElementById('minthi-driver-styles')
    if (existing) existing.remove()
    const styleEl = document.createElement('style')
    styleEl.id = 'minthi-driver-styles'
    styleEl.textContent = DRIVER_DARK_CSS
    document.head.appendChild(styleEl)
    return () => {
      document.getElementById('minthi-driver-styles')?.remove()
    }
  }, [])

  // Initialize and start tour
  useEffect(() => {
    // Reset to orders tab and open sidebar so all elements are available
    setActiveTab('orders')
    setIsSidebarOpen(true)

    // Small delay to let sidebar render
    const startTimeout = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        smoothScroll: true,
        allowClose: true,
        overlayOpacity: 0.72,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: 'minthi-tour-popover',
        progressText: '{{current}} di {{total}}',
        nextBtnText: 'Avanti →',
        prevBtnText: '← Indietro',
        doneBtnText: 'Inizia subito! ✓',
        onDestroyStarted: () => {
          driverObj.destroy()
          onComplete()
        },
        steps: [
          // ── 1. Welcome ────────────────────────────────────────────────
          {
            popover: {
              title: `👋 Benvenuto${restaurantName ? ` su ${restaurantName}` : ' su Minthi'}!`,
              description: `Ti guido alla scoperta di tutte le funzioni, <strong>direttamente nell'interfaccia</strong>. Ci vorranno circa 2 minuti.<br><br>Clicca <strong>Avanti</strong> per iniziare — puoi uscire in qualsiasi momento con la ✕`,
            },
          },

          // ── 2. Orders nav ─────────────────────────────────────────────
          {
            element: '[data-tour="nav-orders"]',
            popover: {
              title: '🍳 Gestione Ordini',
              description: 'Questa è la sezione <strong>Ordini</strong> nella barra laterale. Cliccala per vedere la cucina digitale in tempo reale: tutti gli ordini attivi, piatti da preparare e da consegnare.',
              side: 'right',
              align: 'center',
            },
          },

          // ── 3. Orders header ──────────────────────────────────────────
          {
            element: '[data-tour="orders-header"]',
            popover: {
              title: 'Vista Cucina',
              description: 'Qui vedi gli ordini in due modalità: per <strong>Tavolo</strong> o per <strong>Piatto</strong>. Puoi filtrare per categoria, regolare lo zoom e monitorare lo stato di ogni piatto. Ogni ordine arriva <strong>istantaneamente</strong>.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('tables')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 4. Tables nav ─────────────────────────────────────────────
          {
            element: '[data-tour="nav-tables"]',
            popover: {
              title: '🪑 Gestione Tavoli',
              description: 'Clicca <strong>Tavoli</strong> per gestire la sala. Vedrai lo stato di ogni tavolo: libero, occupato o in attesa di pagamento. Da qui apri i tavoli, gestisci ordini e chiudi i conti.',
              side: 'right',
              align: 'center',
            },
            onPrevClick: () => {
              setActiveTab('orders')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.movePrevious(), 300)
            },
          },

          // ── 5. Add table ──────────────────────────────────────────────
          {
            element: '[data-tour="add-table-btn"]',
            popover: {
              title: '➕ Crea i Tuoi Tavoli',
              description: '<strong>Primo passo!</strong> Clicca questo pulsante per aggiungere i tavoli del tuo ristorante. Scegli numero o nome — saranno subito pronti a ricevere ordini.',
              side: 'bottom',
              align: 'start',
            },
          },

          // ── 6. QR ─────────────────────────────────────────────────────
          {
            element: '[data-tour="download-qr-btn"]',
            popover: {
              title: '📱 Scarica i QR Code',
              description: 'Questo pulsante genera un <strong>PDF con tutti i QR Code</strong> dei tuoi tavoli. Stampali e posizionali sui tavoli: i clienti scansionano, vedono il menu e ordinano dal telefono.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('menu')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 7. Menu nav ───────────────────────────────────────────────
          {
            element: '[data-tour="nav-menu"]',
            popover: {
              title: '📋 Menu Digitale',
              description: 'Da <strong>Menu</strong> costruisci il tuo menu digitale: piatti, categorie, prezzi, foto, descrizioni e allergeni. Ogni modifica è visibile ai clienti <strong>immediatamente</strong>.',
              side: 'right',
              align: 'center',
            },
            onPrevClick: () => {
              setActiveTab('tables')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.movePrevious(), 300)
            },
          },

          // ── 8. Add dish ───────────────────────────────────────────────
          {
            element: '[data-tour="add-dish-btn"]',
            popover: {
              title: '🍽️ Aggiungi Piatti',
              description: '<strong>Secondo passo!</strong> Clicca per creare i tuoi piatti. Per ognuno puoi impostare: nome, prezzo, foto, descrizione e allergeni. Crea prima le <strong>categorie</strong> (Antipasti, Primi, etc.).',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('reservations')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 9. Reservations nav ───────────────────────────────────────
          {
            element: '[data-tour="nav-reservations"]',
            popover: {
              title: '📅 Prenotazioni Online',
              description: 'Nella sezione <strong>Prenotazioni</strong> gestisci le prenotazioni dei clienti. Puoi attivare un <strong>link pubblico</strong> per far prenotare online. Conferma o rifiuta con un click.',
              side: 'right',
              align: 'center',
            },
            onPrevClick: () => {
              setActiveTab('menu')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.movePrevious(), 300)
            },
          },

          // ── 10. Reservations content ──────────────────────────────────
          {
            element: '[data-tour="reservations-header"]',
            popover: {
              title: 'Calendario Prenotazioni',
              description: 'Filtra per giorno, vedi quante persone arrivano e in quali fasce orarie. Configura orari disponibili, sale e numero massimo di coperti da <strong>Impostazioni → Prenotazioni</strong>.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('analytics')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 11. Analytics nav ─────────────────────────────────────────
          {
            element: '[data-tour="nav-analytics"]',
            popover: {
              title: '📊 Analitiche',
              description: 'In <strong>Analitiche</strong> monitori le performance: incassi giornalieri, piatti più venduti, ore di punta e statistiche del personale. Tutti i dati sono aggiornati in <strong>tempo reale</strong>.',
              side: 'right',
              align: 'center',
            },
            onPrevClick: () => {
              setActiveTab('reservations')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.movePrevious(), 300)
            },
          },

          // ── 12. Analytics content ─────────────────────────────────────
          {
            element: '[data-tour="analytics-header"]',
            popover: {
              title: 'I Tuoi Numeri',
              description: 'Grafici interattivi su vendite, piatti più ordinati e andamento settimanale. Puoi confrontare periodi diversi ed esportare i dati.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('settings')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 13. Settings nav ──────────────────────────────────────────
          {
            element: '[data-tour="nav-settings"]',
            popover: {
              title: '⚙️ Impostazioni',
              description: 'In <strong>Impostazioni</strong> configuri tutto il ristorante: coperto, orari di servizio, modalità cameriere, pagamenti Stripe e abbonamento. È qui che <strong>attivi il servizio completo</strong>.',
              side: 'right',
              align: 'center',
            },
            onPrevClick: () => {
              setActiveTab('analytics')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.movePrevious(), 300)
            },
          },

          // ── 14. Settings content ──────────────────────────────────────
          {
            element: '[data-tour="settings-header"]',
            popover: {
              title: 'Configura e Attiva',
              description: 'Da qui configura: <strong>Generale</strong> (nome, suoni), <strong>Costi & Menu</strong> (coperto, AYCE), <strong>Staff</strong> (camerieri), <strong>Prenotazioni</strong> e <strong>Abbonamento & Pagamenti</strong> per attivare Stripe e il piano Minthi.',
              side: 'bottom',
              align: 'start',
            },
          },

          // ── 15. Done ──────────────────────────────────────────────────
          {
            popover: {
              title: '✅ Sei Pronto!',
              description: `<strong>3 passi per iniziare:</strong><br>1. Vai in <strong>Menu</strong> → crea categorie e aggiungi i tuoi piatti<br>2. Vai in <strong>Tavoli</strong> → aggiungi i tavoli e scarica i QR Code<br>3. Vai in <strong>Impostazioni → Abbonamento</strong> → attiva il piano<br><br>Puoi rivedere questa guida da <strong>Impostazioni → Generale → Avvia Guida</strong>.`,
            },
          },
        ],
      })

      driverRef.current = driverObj
      driverObj.drive()
    }, 150)

    return () => {
      clearTimeout(startTimeout)
      if (driverRef.current) {
        driverRef.current.destroy()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
