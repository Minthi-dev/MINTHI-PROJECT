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
    // Open sidebar so nav items are in the DOM
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
              description: `Ciao! Ti guido alla scoperta di tutte le funzioni del gestionale. Ci vorranno circa <strong>2 minuti</strong>. Clicca <strong>Avanti</strong> per iniziare — puoi uscire in qualsiasi momento con la ✕`,
            },
          },

          // ── 2. Orders nav item ────────────────────────────────────────
          {
            element: '[data-tour="nav-orders"]',
            popover: {
              title: '🍳 Gestione Ordini',
              description: 'Questa è la tua cucina digitale. Vedi in <strong>tempo reale</strong> tutti gli ordini attivi, i piatti da preparare e da servire. Perfetto per cucina e sala.',
              side: 'right',
              align: 'center',
            },
          },

          // ── 3. Orders content header ──────────────────────────────────
          {
            element: '[data-tour="orders-header"]',
            popover: {
              title: 'Vista Ordini',
              description: 'Passa tra vista per <strong>Tavolo</strong> e vista per <strong>Piatto</strong>. Filtra per categoria e regola lo zoom. Ogni ordine appare qui <strong>istantaneamente</strong> appena il cliente ordina.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('tables')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 4. Tables nav item ────────────────────────────────────────
          {
            element: '[data-tour="nav-tables"]',
            popover: {
              title: '🪑 Tavoli della Sala',
              description: 'Da qui controlli ogni tavolo: libero, occupato o in attesa di pagamento. Puoi aprire un tavolo per vedere gli ordini e gestire il conto.',
              side: 'right',
              align: 'center',
            },
          },

          // ── 5. Add table button ───────────────────────────────────────
          {
            element: '[data-tour="add-table-btn"]',
            popover: {
              title: 'Crea i Tuoi Tavoli',
              description: 'Clicca qui per aggiungere un nuovo tavolo. Scegli il numero o il nome e sarà subito attivo. Puoi creare quanti tavoli vuoi.',
              side: 'bottom',
              align: 'start',
            },
          },

          // ── 6. Download QR ────────────────────────────────────────────
          {
            element: '[data-tour="download-qr-btn"]',
            popover: {
              title: '📱 QR Code per i Tavoli',
              description: 'Scarica un PDF con il QR Code di ogni tavolo. I clienti lo scansionano, vedono il tuo menu e ordinano dal loro telefono. Gli ordini arrivano <strong>direttamente in cucina</strong>.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('menu')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 7. Menu nav item ──────────────────────────────────────────
          {
            element: '[data-tour="nav-menu"]',
            popover: {
              title: '📋 Menu Digitale',
              description: 'Qui costruisci il tuo menu: aggiungi piatti con foto, prezzi, descrizioni e allergeni. Organizza in categorie. Ogni modifica è visibile ai clienti <strong>istantaneamente</strong>.',
              side: 'right',
              align: 'center',
            },
          },

          // ── 8. Add dish button ────────────────────────────────────────
          {
            element: '[data-tour="add-dish-btn"]',
            popover: {
              title: 'Aggiungi i Tuoi Piatti',
              description: 'Clicca per aggiungere un nuovo piatto. Puoi inserire nome, prezzo, foto, descrizione e allergeni. Crea anche <strong>categorie</strong> per organizzare il menu.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('reservations')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 9. Reservations ───────────────────────────────────────────
          {
            element: '[data-tour="nav-reservations"]',
            popover: {
              title: '📅 Prenotazioni Online',
              description: 'I clienti possono prenotare tramite un <strong>link pubblico</strong> dedicato al tuo ristorante. Ricevi notifiche, conferma o rifiuta le prenotazioni con un click.',
              side: 'right',
              align: 'center',
            },
          },

          // ── 10. Reservations content ──────────────────────────────────
          {
            element: '[data-tour="reservations-header"]',
            popover: {
              title: 'Gestione Prenotazioni',
              description: 'Filtra per data, vedi quante persone arrivano e in quali fasce orarie. Puoi configurare orari, numero massimo di coperti e sale da Impostazioni.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('analytics')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 11. Analytics ─────────────────────────────────────────────
          {
            element: '[data-tour="nav-analytics"]',
            popover: {
              title: '📊 Analitiche',
              description: 'Monitora le performance del tuo ristorante: incassi, piatti più ordinati, ore di punta e statistiche dello staff. Dati in <strong>tempo reale</strong>.',
              side: 'right',
              align: 'center',
            },
          },

          // ── 12. Analytics content ─────────────────────────────────────
          {
            element: '[data-tour="analytics-header"]',
            popover: {
              title: 'I Tuoi Numeri',
              description: 'Grafici interattivi su vendite, piatti più ordinati e performance del personale. Puoi anche esportare i dati e confrontare diversi periodi.',
              side: 'bottom',
              align: 'start',
            },
            onNextClick: () => {
              setActiveTab('settings')
              setIsSidebarOpen(true)
              setTimeout(() => driverObj.moveNext(), 300)
            },
          },

          // ── 13. Settings nav item ─────────────────────────────────────
          {
            element: '[data-tour="nav-settings"]',
            popover: {
              title: '⚙️ Impostazioni',
              description: 'Configura tutto: coperto, orari di servizio, modalità cameriere, pagamenti Stripe, prenotazioni e abbonamento. È qui che <strong>attivi il servizio completo</strong>.',
              side: 'right',
              align: 'center',
            },
          },

          // ── 14. Settings content ──────────────────────────────────────
          {
            element: '[data-tour="settings-header"]',
            popover: {
              title: 'Configura il Ristorante',
              description: 'Vai su <strong>Abbonamento & Pagamenti</strong> per attivare il piano Minthi e sbloccare tutte le funzioni. Ricordati di collegare Stripe per ricevere i pagamenti online dai clienti.',
              side: 'bottom',
              align: 'start',
            },
          },

          // ── 15. Done ──────────────────────────────────────────────────
          {
            popover: {
              title: '✅ Sei Pronto!',
              description: `Per iniziare: <br>1. Vai in <strong>Menu</strong> e aggiungi i tuoi piatti<br>2. Vai in <strong>Tavoli</strong> e crea i tuoi tavoli<br>3. Attiva il piano in <strong>Impostazioni → Abbonamento</strong><br><br>Puoi rivedere questa guida da <strong>Impostazioni → Guida Interattiva</strong>.`,
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
