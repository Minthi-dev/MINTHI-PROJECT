// Demo data for the interactive tour — matches real types exactly
import type { Table, TableSession, Order, OrderItem, Dish, Category, Booking, Room } from '../services/types'

const RESTAURANT_ID = 'demo-restaurant'
const now = new Date().toISOString()
const today = new Date()

// ── Rooms ────────────────────────────────────────────────────────────────────
export const DEMO_ROOMS: Room[] = [
  { id: 'demo-room-1', restaurant_id: RESTAURANT_ID, name: 'Sala Principale', is_active: true, order: 1 },
]

// ── Categories ───────────────────────────────────────────────────────────────
export const DEMO_CATEGORIES: Category[] = [
  { id: 'demo-cat-1', name: 'Antipasti', restaurant_id: RESTAURANT_ID, order: 1 },
  { id: 'demo-cat-2', name: 'Primi Piatti', restaurant_id: RESTAURANT_ID, order: 2 },
  { id: 'demo-cat-3', name: 'Secondi', restaurant_id: RESTAURANT_ID, order: 3 },
  { id: 'demo-cat-4', name: 'Dolci', restaurant_id: RESTAURANT_ID, order: 4 },
]

// ── Dishes (with photos!) ───────────────────────────────────────────────────
export const DEMO_DISHES: Dish[] = [
  // Antipasti
  { id: 'demo-dish-1', name: 'Bruschetta al Pomodoro', description: 'Pane tostato con pomodorini freschi e basilico', price: 6, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine'], image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80' },
  { id: 'demo-dish-2', name: 'Caprese', description: 'Mozzarella di bufala, pomodoro cuore di bue e basilico', price: 8, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'], image_url: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&q=80' },
  { id: 'demo-dish-3', name: 'Prosciutto e Melone', description: 'Prosciutto crudo di Parma con melone fresco', price: 9, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true, image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80' },
  // Primi
  { id: 'demo-dish-4', name: 'Carbonara', description: 'Guanciale, pecorino, tuorlo d\'uovo e pepe nero', price: 12, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'uova', 'latte'], image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80' },
  { id: 'demo-dish-5', name: 'Cacio e Pepe', description: 'Pecorino romano DOP e pepe nero macinato fresco', price: 11, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'latte'], image_url: 'https://images.unsplash.com/photo-1482049142915-d912423377dc?w=600&q=80' },
  { id: 'demo-dish-6', name: 'Risotto ai Funghi Porcini', description: 'Riso Carnaroli con porcini freschi e parmigiano', price: 14, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'], image_url: 'https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?w=600&q=80' },
  // Secondi
  { id: 'demo-dish-7', name: 'Bistecca alla Fiorentina', description: 'Tagliata di manzo al sangue con rucola e grana', price: 24, vat_rate: 10, category_id: 'demo-cat-3', restaurant_id: RESTAURANT_ID, is_active: true, image_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80' },
  { id: 'demo-dish-8', name: 'Branzino al Forno', description: 'Branzino con patate, olive e pomodorini', price: 18, vat_rate: 10, category_id: 'demo-cat-3', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['pesce'], image_url: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=600&q=80' },
  // Dolci
  { id: 'demo-dish-9', name: 'Tiramisu', description: 'Mascarpone, savoiardi, caffe e cacao amaro', price: 7, vat_rate: 10, category_id: 'demo-cat-4', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'uova', 'latte'], image_url: 'https://images.unsplash.com/photo-1414235077428-33898bd12284?w=600&q=80' },
  { id: 'demo-dish-10', name: 'Panna Cotta', description: 'Con coulis di frutti di bosco', price: 6, vat_rate: 10, category_id: 'demo-cat-4', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'], image_url: 'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=600&q=80' },
]

// Helper to get dish by id
const getDish = (id: string) => DEMO_DISHES.find(d => d.id === id)!

// ── Tables ────────────────────────────────────────────────────────────────────
export const DEMO_TABLES: Table[] = [
  { id: 'demo-table-1', number: '1', restaurant_id: RESTAURANT_ID, token: 'tok-1', seats: 4, room_id: 'demo-room-1', is_active: true },
  { id: 'demo-table-2', number: '2', restaurant_id: RESTAURANT_ID, token: 'tok-2', seats: 2, room_id: 'demo-room-1', is_active: true },
  { id: 'demo-table-3', number: '3', restaurant_id: RESTAURANT_ID, token: 'tok-3', seats: 2, room_id: 'demo-room-1', is_active: true },
  { id: 'demo-table-4', number: '4', restaurant_id: RESTAURANT_ID, token: 'tok-4', seats: 6, room_id: 'demo-room-1', is_active: true },
  { id: 'demo-table-5', number: '5', restaurant_id: RESTAURANT_ID, token: 'tok-5', seats: 4, room_id: 'demo-room-1', is_active: true },
  { id: 'demo-table-6', number: '6', restaurant_id: RESTAURANT_ID, token: 'tok-6', seats: 8, room_id: 'demo-room-1', is_active: true },
]

// ── Sessions (open sessions for occupied tables) ─────────────────────────────
export const DEMO_SESSIONS: TableSession[] = [
  { id: 'demo-session-1', restaurant_id: RESTAURANT_ID, table_id: 'demo-table-1', status: 'OPEN', opened_at: now, created_at: now, session_pin: '4721', customer_count: 4 },
  { id: 'demo-session-3', restaurant_id: RESTAURANT_ID, table_id: 'demo-table-3', status: 'OPEN', opened_at: now, created_at: now, session_pin: '8834', customer_count: 2 },
  { id: 'demo-session-5', restaurant_id: RESTAURANT_ID, table_id: 'demo-table-5', status: 'OPEN', opened_at: now, created_at: now, session_pin: '2156', customer_count: 6, paid_amount: 45 },
]

// ── Order Items ──────────────────────────────────────────────────────────────
const orderItems1: OrderItem[] = [
  { id: 'demo-oi-1', order_id: 'demo-order-1', dish_id: 'demo-dish-4', quantity: 2, status: 'READY', dish: getDish('demo-dish-4') },
  { id: 'demo-oi-2', order_id: 'demo-order-1', dish_id: 'demo-dish-1', quantity: 1, status: 'SERVED', dish: getDish('demo-dish-1') },
  { id: 'demo-oi-3', order_id: 'demo-order-1', dish_id: 'demo-dish-9', quantity: 1, status: 'PENDING', dish: getDish('demo-dish-9') },
]

const orderItems3: OrderItem[] = [
  { id: 'demo-oi-4', order_id: 'demo-order-3', dish_id: 'demo-dish-7', quantity: 1, status: 'IN_PREPARATION', dish: getDish('demo-dish-7') },
  { id: 'demo-oi-5', order_id: 'demo-order-3', dish_id: 'demo-dish-2', quantity: 1, status: 'SERVED', dish: getDish('demo-dish-2') },
  { id: 'demo-oi-6', order_id: 'demo-order-3', dish_id: 'demo-dish-5', quantity: 2, status: 'PENDING', dish: getDish('demo-dish-5') },
]

const orderItems5: OrderItem[] = [
  { id: 'demo-oi-7', order_id: 'demo-order-5', dish_id: 'demo-dish-5', quantity: 3, status: 'DELIVERED', dish: getDish('demo-dish-5') },
  { id: 'demo-oi-8', order_id: 'demo-order-5', dish_id: 'demo-dish-10', quantity: 2, status: 'READY', dish: getDish('demo-dish-10') },
  { id: 'demo-oi-9', order_id: 'demo-order-5', dish_id: 'demo-dish-8', quantity: 1, status: 'SERVED', dish: getDish('demo-dish-8') },
]

// ── Orders ────────────────────────────────────────────────────────────────────
export const DEMO_ORDERS: Order[] = [
  {
    id: 'demo-order-1', restaurant_id: RESTAURANT_ID, table_session_id: 'demo-session-1',
    status: 'pending', total_amount: 37, created_at: now, items: orderItems1, table_id: 'demo-table-1',
  },
  {
    id: 'demo-order-3', restaurant_id: RESTAURANT_ID, table_session_id: 'demo-session-3',
    status: 'pending', total_amount: 54, created_at: now, items: orderItems3, table_id: 'demo-table-3',
  },
  {
    id: 'demo-order-5', restaurant_id: RESTAURANT_ID, table_session_id: 'demo-session-5',
    status: 'pending', total_amount: 63, created_at: now, items: orderItems5, table_id: 'demo-table-5',
  },
]

// Past orders for analytics (completed orders from "today")
const makePastOrder = (id: string, total: number, hoursAgo: number): Order => ({
  id, restaurant_id: RESTAURANT_ID, table_session_id: `past-session-${id}`,
  status: 'completed', total_amount: total,
  created_at: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
  closed_at: new Date(Date.now() - (hoursAgo - 0.5) * 3600000).toISOString(),
  items: [
    { id: `${id}-i1`, order_id: id, dish_id: 'demo-dish-4', quantity: 2, status: 'DELIVERED', dish: getDish('demo-dish-4') },
    { id: `${id}-i2`, order_id: id, dish_id: 'demo-dish-9', quantity: 1, status: 'DELIVERED', dish: getDish('demo-dish-9') },
  ],
})

export const DEMO_PAST_ORDERS: Order[] = [
  makePastOrder('demo-past-1', 42, 8),
  makePastOrder('demo-past-2', 56, 6),
  makePastOrder('demo-past-3', 38, 5),
  makePastOrder('demo-past-4', 67, 4),
  makePastOrder('demo-past-5', 31, 3),
  makePastOrder('demo-past-6', 48, 2),
]

// ── Bookings ─────────────────────────────────────────────────────────────────
const todayStr = (h: number, m: number) => {
  const d = new Date(today)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export const DEMO_BOOKINGS: Booking[] = [
  { id: 'demo-book-1', restaurant_id: RESTAURANT_ID, name: 'Famiglia Rossi', phone: '+39 333 1234567', date_time: todayStr(19, 30), guests: 4, status: 'confirmed', notes: 'Seggiolone per bambino', table_id: 'demo-table-4' },
  { id: 'demo-book-2', restaurant_id: RESTAURANT_ID, name: 'Marco Bianchi', phone: '+39 339 7654321', date_time: todayStr(20, 30), guests: 2, status: 'pending', table_id: 'demo-table-2' },
  { id: 'demo-book-3', restaurant_id: RESTAURANT_ID, name: 'Laura Verdi', email: 'laura.verdi@email.it', date_time: todayStr(21, 0), guests: 6, status: 'confirmed', notes: 'Compleanno', table_id: 'demo-table-6' },
  { id: 'demo-book-4', restaurant_id: RESTAURANT_ID, name: 'Giovanni Neri', phone: '+39 347 9876543', date_time: todayStr(21, 30), guests: 3, status: 'pending', table_id: 'demo-table-5' },
]

// ── Feature Sections (for summary page) ─────────────────────────────────────
export interface FeatureSection {
  id: string
  tab: string
  icon: string
  title: string
  color: string
  features: string[]
  firstStepIndex: number
}

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: 'orders', tab: 'orders', icon: 'ClockCounterClockwise', title: 'Ordini',
    color: 'amber',
    features: [
      'Ordini in tempo reale dal QR',
      'Vista per tavolo o per piatto',
      'Filtri, zoom e storico',
      'Cambio stato con un tap',
    ],
    firstStepIndex: 1,
  },
  {
    id: 'tables', tab: 'tables', icon: 'MapPin', title: 'Tavoli & QR',
    color: 'emerald',
    features: [
      'QR Code unico per ogni tavolo',
      'Gestione sale e ricerca',
      'Storico sessioni e pagamenti',
      'Scarica PDF con tutti i QR',
    ],
    firstStepIndex: 7,
  },
  {
    id: 'menu', tab: 'menu', icon: 'BookOpen', title: 'Menu Digitale',
    color: 'sky',
    features: [
      'Categorie, piatti, foto e allergeni',
      'Menu personalizzati per fascia oraria',
      'Esporta menu in PDF',
      'Visibilita piatti on/off',
    ],
    firstStepIndex: 13,
  },
  {
    id: 'reservations', tab: 'reservations', icon: 'Calendar', title: 'Prenotazioni',
    color: 'violet',
    features: [
      'Timeline giornaliera',
      'Conferma o rifiuta con un click',
      'Prenotazioni pubbliche via QR',
      'Assegnazione tavoli automatica',
    ],
    firstStepIndex: 18,
  },
  {
    id: 'analytics', tab: 'analytics', icon: 'ChartBar', title: 'Analitiche',
    color: 'rose',
    features: [
      'Incassi e andamento nel tempo',
      'Classifica piatti piu venduti',
      'Ore di punta e trend',
    ],
    firstStepIndex: 19,
  },
  {
    id: 'settings', tab: 'settings', icon: 'Gear', title: 'Impostazioni',
    color: 'zinc',
    features: [
      'Coperto e All You Can Eat',
      'Gestione staff e camerieri',
      'Pagamenti Stripe online',
      'Abbonamento e fatturazione',
    ],
    firstStepIndex: 20,
  },
]

// ── Guide Steps ─────────────────────────────────────────────────────────────
export interface DemoGuideStep {
  id: string
  phase: 'summary' | 'tour'
  tab: string
  group: string
  title: string
  description: string
  highlightSelector?: string
  subTab?: string
}

export const DEMO_TOUR_STEPS: DemoGuideStep[] = [
  // Step 0: Summary page
  {
    id: 'summary', phase: 'summary', tab: 'orders', group: '',
    title: 'Panoramica Funzioni',
    description: 'Scopri tutte le funzionalita di Minthi prima di iniziare il tour.',
  },

  // ── ORDINI (steps 1-6) ──
  {
    id: 'orders-intro', phase: 'tour', tab: 'orders', group: 'Ordini',
    title: 'Ordini in Tempo Reale',
    description: 'Qui arrivano gli ordini dei clienti. Ogni card mostra tavolo, piatti e stato di preparazione.',
    highlightSelector: '[data-tour="orders-header"]',
  },
  {
    id: 'orders-view-toggle', phase: 'tour', tab: 'orders', group: 'Ordini',
    title: 'Vista Tavoli / Piatti',
    description: 'Alterna tra vista per tavolo (comande raggruppate) e vista per piatto (utile per la cucina).',
    highlightSelector: '[data-tour="orders-view-toggle"]',
  },
  {
    id: 'orders-filter', phase: 'tour', tab: 'orders', group: 'Ordini',
    title: 'Filtra per Categoria',
    description: 'Filtra gli ordini per categoria del menu (es. solo Primi, solo Dolci).',
    highlightSelector: '[data-tour="orders-filter-btn"]',
  },
  {
    id: 'orders-zoom', phase: 'tour', tab: 'orders', group: 'Ordini',
    title: 'Zoom Ordini',
    description: 'Ingrandisci o riduci le card degli ordini per adattarle al tuo schermo.',
    highlightSelector: '[data-tour="orders-zoom"]',
  },
  {
    id: 'orders-sort', phase: 'tour', tab: 'orders', group: 'Ordini',
    title: 'Ordina per Data',
    description: 'Scegli se vedere prima gli ordini meno recenti o i piu recenti.',
    highlightSelector: '[data-tour="orders-sort"]',
  },
  {
    id: 'orders-history', phase: 'tour', tab: 'orders', group: 'Ordini',
    title: 'Storico Ordini',
    description: 'Visualizza lo storico degli ordini completati durante la giornata.',
    highlightSelector: '[data-tour="orders-history-btn"]',
  },

  // ── TAVOLI (steps 7-12) ──
  {
    id: 'tables-intro', phase: 'tour', tab: 'tables', group: 'Tavoli',
    title: 'Gestione Tavoli',
    description: 'Panoramica di tutti i tavoli. Verde = libero, ambra = occupato, rosso = conto richiesto.',
    highlightSelector: '[data-tour="tables-header"]',
  },
  {
    id: 'tables-add', phase: 'tour', tab: 'tables', group: 'Tavoli',
    title: 'Nuovo Tavolo',
    description: 'Crea un nuovo tavolo con numero, nome e numero di posti. Genera automaticamente un QR Code.',
    highlightSelector: '[data-tour="add-table-btn"]',
  },
  {
    id: 'tables-qr', phase: 'tour', tab: 'tables', group: 'Tavoli',
    title: 'Scarica QR Code',
    description: 'Scarica un PDF con i QR Code di tutti i tavoli, pronto da stampare e posizionare.',
    highlightSelector: '[data-tour="download-qr-btn"]',
  },
  {
    id: 'tables-search', phase: 'tour', tab: 'tables', group: 'Tavoli',
    title: 'Cerca Tavolo',
    description: 'Cerca un tavolo per nome o numero per trovarlo rapidamente.',
    highlightSelector: '[data-tour="tables-search"]',
  },
  {
    id: 'tables-view-sort', phase: 'tour', tab: 'tables', group: 'Tavoli',
    title: 'Vista & Ordine',
    description: 'Ordina i tavoli per numero, posti o stato. Regola lo zoom della griglia.',
    highlightSelector: '[data-tour="tables-view-sort"]',
  },
  {
    id: 'tables-history', phase: 'tour', tab: 'tables', group: 'Tavoli',
    title: 'Storico Tavoli',
    description: 'Consulta lo storico delle sessioni chiuse con dettagli di pagamento e scontrini.',
    highlightSelector: '[data-tour="tables-history-btn"]',
  },

  // ── MENU (steps 13-17) ──
  {
    id: 'menu-intro', phase: 'tour', tab: 'menu', group: 'Menu',
    title: 'Menu Digitale',
    description: 'Gestisci il tuo menu digitale: categorie, piatti, foto, prezzi e allergeni.',
    highlightSelector: '[data-tour="menu-header"]',
  },
  {
    id: 'menu-add-dish', phase: 'tour', tab: 'menu', group: 'Menu',
    title: 'Nuovo Piatto',
    description: 'Aggiungi un piatto con nome, descrizione, prezzo, foto, categoria e allergeni.',
    highlightSelector: '[data-tour="add-dish-btn"]',
  },
  {
    id: 'menu-categories', phase: 'tour', tab: 'menu', group: 'Menu',
    title: 'Gestione Categorie',
    description: 'Crea e organizza le categorie del menu (Antipasti, Primi, Secondi, Dolci...).',
    highlightSelector: '[data-tour="add-category-btn"]',
  },
  {
    id: 'menu-custom', phase: 'tour', tab: 'menu', group: 'Menu',
    title: 'Menu Personalizzati',
    description: 'Crea menu speciali per pranzo/cena o giorni specifici con piatti selezionati.',
    highlightSelector: '[data-tour="menu-custom-menus"]',
  },
  {
    id: 'menu-export', phase: 'tour', tab: 'menu', group: 'Menu',
    title: 'Esporta Menu PDF',
    description: 'Genera un PDF del tuo menu completo o di categorie selezionate da stampare.',
    highlightSelector: '[data-tour="menu-export"]',
  },

  // ── PRENOTAZIONI (step 18) ──
  {
    id: 'reservations-intro', phase: 'tour', tab: 'reservations', group: 'Prenotazioni',
    title: 'Timeline Prenotazioni',
    description: 'Visualizza e gestisci le prenotazioni su una timeline giornaliera interattiva.',
    highlightSelector: '[data-tour="reservations-header"]',
  },

  // ── ANALISI (step 19) ──
  {
    id: 'analytics-intro', phase: 'tour', tab: 'analytics', group: 'Analisi',
    title: 'Analitiche e Report',
    description: 'Monitora incassi, piatti piu venduti, ore di punta e andamento nel tempo.',
    highlightSelector: '[data-tour="analytics-header"]',
  },

  // ── IMPOSTAZIONI (steps 20-31) ──
  {
    id: 'settings-intro', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Panoramica Impostazioni',
    description: 'Configura il tuo ristorante: suoni, costi, staff, prenotazioni e pagamenti.',
    highlightSelector: '[data-tour="settings-header"]',
    subTab: 'general',
  },
  {
    id: 'settings-sound', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Notifiche Sonore',
    description: 'Attiva un suono quando arriva un nuovo ordine. Scegli tra 4 toni diversi.',
    highlightSelector: '[data-tour="settings-sound-toggle"]',
    subTab: 'general',
  },
  {
    id: 'settings-ayce', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'All You Can Eat',
    description: 'Configura prezzo e limite ordini per il menu All You Can Eat, anche per giorno.',
    highlightSelector: '[data-tour="settings-ayce"]',
    subTab: 'costs',
  },
  {
    id: 'settings-coperto', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Coperto',
    description: 'Imposta il prezzo del coperto, personalizzabile per giorno e fascia oraria.',
    highlightSelector: '[data-tour="settings-coperto"]',
    subTab: 'costs',
  },
  {
    id: 'settings-course', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Suddivisione Portate',
    description: 'Se attivo, i clienti indicano l\'ordine di uscita (Antipasto, Primo, Secondo...).',
    highlightSelector: '[data-tour="settings-course-split"]',
    subTab: 'costs',
  },
  {
    id: 'settings-viewonly', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Menu Sola Lettura',
    description: 'Mostra il menu ai clienti senza possibilita di ordinare. Utile per menu vetrina.',
    highlightSelector: '[data-tour="settings-viewonly"]',
    subTab: 'costs',
  },
  {
    id: 'settings-waiter', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Modalita Cameriere',
    description: 'Attiva la dashboard cameriere con accesso tramite username e password.',
    highlightSelector: '[data-tour="settings-waiter-toggle"]',
    subTab: 'staff',
  },
  {
    id: 'settings-staff', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Gestione Staff',
    description: 'Crea credenziali per ogni cameriere con nome, username e password.',
    highlightSelector: '[data-tour="settings-add-staff"]',
    subTab: 'staff',
  },
  {
    id: 'settings-turnover', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Turnazione Tavoli',
    description: 'Imposta la durata standard di una prenotazione per gestire i turni.',
    highlightSelector: '[data-tour="settings-turnover"]',
    subTab: 'reservations',
  },
  {
    id: 'settings-public-booking', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Prenotazioni Pubbliche',
    description: 'Abilita le prenotazioni da parte dei clienti tramite QR Code.',
    highlightSelector: '[data-tour="settings-public-booking"]',
    subTab: 'reservations',
  },
  {
    id: 'settings-stripe', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Pagamenti Online',
    description: 'I clienti pagano direttamente dal menu digitale con carta tramite Stripe.',
    highlightSelector: '[data-tour="settings-stripe-toggle"]',
    subTab: 'subscription',
  },
  {
    id: 'settings-subscription', phase: 'tour', tab: 'settings', group: 'Impostazioni',
    title: 'Abbonamento',
    description: 'Gestisci il tuo abbonamento Minthi, visualizza fatture e metodo di pagamento.',
    highlightSelector: '[data-tour="settings-subscription"]',
    subTab: 'subscription',
  },

  // ── FINE (step 32) ──
  {
    id: 'end', phase: 'tour', tab: 'settings', group: '',
    title: 'Demo Completata!',
    description: 'Hai scoperto tutte le funzioni di Minthi. Premi "Fine Demo" per iniziare a configurare il tuo ristorante.',
  },
]

// ── Setup Steps ──────────────────────────────────────────────────────────────
export interface SetupStep {
  id: string
  tab: string
  title: string
  instruction: string
  highlightSelector: string
  checkFn: (ctx: { tablesCount: number; dishesCount: number; categoriesCount: number }) => boolean
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'create-categories',
    tab: 'menu',
    title: '1. Crea le Categorie',
    instruction: 'Premi "Nuova Categoria" per creare la prima categoria del menu (es. Antipasti, Primi, Secondi, Dolci).',
    highlightSelector: '[data-tour="add-category-btn"]',
    checkFn: ({ categoriesCount }) => categoriesCount > 0,
  },
  {
    id: 'create-dishes',
    tab: 'menu',
    title: '2. Aggiungi i Piatti',
    instruction: 'Premi "Nuovo Piatto" per aggiungere un piatto con nome, prezzo, foto e allergeni.',
    highlightSelector: '[data-tour="add-dish-btn"]',
    checkFn: ({ dishesCount }) => dishesCount > 0,
  },
  {
    id: 'create-tables',
    tab: 'tables',
    title: '3. Crea i Tavoli',
    instruction: 'Premi "Nuovo Tavolo" per creare un tavolo. Ogni tavolo genera un QR Code unico.',
    highlightSelector: '[data-tour="add-table-btn"]',
    checkFn: ({ tablesCount }) => tablesCount > 0,
  },
  {
    id: 'configure',
    tab: 'settings',
    title: '4. Configura e Attiva',
    instruction: 'Imposta coperto, orari e attiva l\'abbonamento in Impostazioni.',
    highlightSelector: '[data-tour="settings-header"]',
    checkFn: () => false,
  },
]
