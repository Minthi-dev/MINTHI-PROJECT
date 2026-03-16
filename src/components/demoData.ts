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

// ── Dishes (with image_url for photo display) ───────────────────────────────
export const DEMO_DISHES: Dish[] = [
  // Antipasti
  { id: 'demo-dish-1', name: 'Bruschetta al Pomodoro', description: 'Pane tostato con pomodorini freschi e basilico', price: 6, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine'], image_url: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=400&h=300&fit=crop' },
  { id: 'demo-dish-2', name: 'Caprese', description: 'Mozzarella di bufala, pomodoro cuore di bue e basilico', price: 8, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'], image_url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=400&h=300&fit=crop' },
  { id: 'demo-dish-3', name: 'Prosciutto e Melone', description: 'Prosciutto crudo di Parma con melone fresco', price: 9, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true, image_url: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=400&h=300&fit=crop' },
  // Primi
  { id: 'demo-dish-4', name: 'Carbonara', description: 'Guanciale, pecorino, tuorlo d\'uovo e pepe nero', price: 12, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'uova', 'latte'], image_url: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400&h=300&fit=crop' },
  { id: 'demo-dish-5', name: 'Cacio e Pepe', description: 'Pecorino romano DOP e pepe nero macinato fresco', price: 11, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'latte'], image_url: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=300&fit=crop' },
  { id: 'demo-dish-6', name: 'Risotto ai Funghi Porcini', description: 'Riso Carnaroli con porcini freschi e parmigiano', price: 14, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'], image_url: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=400&h=300&fit=crop' },
  // Secondi
  { id: 'demo-dish-7', name: 'Bistecca alla Fiorentina', description: 'Tagliata di manzo al sangue con rucola e grana', price: 24, vat_rate: 10, category_id: 'demo-cat-3', restaurant_id: RESTAURANT_ID, is_active: true, image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop' },
  { id: 'demo-dish-8', name: 'Branzino al Forno', description: 'Branzino con patate, olive e pomodorini', price: 18, vat_rate: 10, category_id: 'demo-cat-3', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['pesce'], image_url: 'https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab?w=400&h=300&fit=crop' },
  // Dolci
  { id: 'demo-dish-9', name: 'Tiramisù', description: 'Mascarpone, savoiardi, caffè e cacao amaro', price: 7, vat_rate: 10, category_id: 'demo-cat-4', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'uova', 'latte'], image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&h=300&fit=crop' },
  { id: 'demo-dish-10', name: 'Panna Cotta', description: 'Con coulis di frutti di bosco', price: 6, vat_rate: 10, category_id: 'demo-cat-4', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'], image_url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=300&fit=crop' },
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
  { id: 'demo-book-3', restaurant_id: RESTAURANT_ID, name: 'Laura Verdi', email: 'laura.verdi@email.it', date_time: todayStr(21, 0), guests: 6, status: 'confirmed', notes: 'Compleanno — torta a sorpresa', table_id: 'demo-table-6' },
  { id: 'demo-book-4', restaurant_id: RESTAURANT_ID, name: 'Giovanni Neri', phone: '+39 347 9876543', date_time: todayStr(21, 30), guests: 3, status: 'pending', table_id: 'demo-table-5' },
]

// ── Summary features for welcome page ────────────────────────────────────────
export interface FeatureSummary {
  icon: string
  title: string
  description: string
}

export const APP_FEATURES: FeatureSummary[] = [
  { icon: '📋', title: 'Ordini in Tempo Reale', description: 'Ricevi gli ordini dai clienti automaticamente' },
  { icon: '📱', title: 'Menu Digitale con QR', description: 'I clienti scansionano e ordinano dal telefono' },
  { icon: '🪑', title: 'Gestione Tavoli', description: 'Controlla tavoli liberi e occupati' },
  { icon: '📅', title: 'Prenotazioni Online', description: 'I clienti prenotano dal tuo link' },
  { icon: '📊', title: 'Analitiche e Incassi', description: 'Grafici su vendite e piatti più ordinati' },
  { icon: '👨‍🍳', title: 'Dashboard Cameriere', description: 'I camerieri gestiscono ordini con PIN' },
  { icon: '💳', title: 'Pagamenti Online', description: 'Ricevi pagamenti con Stripe' },
  { icon: '⚙️', title: 'Coperto e AYCE', description: 'Configura coperto e All You Can Eat' },
]

// ── Guide Steps ──────────────────────────────────────────────────────────────
export interface DemoGuideStep {
  id: string
  tab: string
  title: string
  description: string
  tip?: string
  highlightSelector?: string  // CSS selector for SpotlightOverlay — omit to show page without darkening
  subTab?: string             // for settings sub-tabs
  isSummary?: boolean         // true for the welcome summary page (rendered differently)
}

export const DEMO_TOUR_STEPS: DemoGuideStep[] = [
  // Step 0: Welcome summary page (full-screen card with all features)
  {
    id: 'welcome',
    tab: 'orders',
    title: 'Benvenuto in Minthi!',
    description: 'Questa è una demo con dati di esempio. Nulla viene salvato. Dopo la demo configurerai il tuo ristorante.',
    isSummary: true,
  },

  // ORDINI
  {
    id: 'orders-nav',
    tab: 'orders',
    title: 'Gestione Ordini',
    description: 'Questa è la sezione Ordini. Ogni card è un tavolo con i suoi piatti ordinati. I colori indicano lo stato: giallo = in attesa, blu = in preparazione, verde = pronto, viola = consegnato.',
    highlightSelector: '[data-tour="orders-header"]',
  },

  // TAVOLI
  {
    id: 'tables-nav',
    tab: 'tables',
    title: 'I Tuoi Tavoli',
    description: 'Qui vedi tutti i tavoli. Verde = libero, ambra = occupato. Clicca su un tavolo per attivarlo, vedere il conto o liberarlo.',
    highlightSelector: '[data-tour="tables-header"]',
  },
  {
    id: 'tables-add',
    tab: 'tables',
    title: 'Aggiungi Tavoli',
    description: 'Clicca "+" per creare un nuovo tavolo. Scegli numero, posti e sala.',
    highlightSelector: '[data-tour="add-table-btn"]',
  },
  {
    id: 'tables-qr',
    tab: 'tables',
    title: 'Scarica QR Code',
    description: 'Ogni tavolo ha un QR Code. Clicca qui per scaricare tutti i QR in PDF, stampali e mettili sui tavoli. Il cliente scansiona il QR, vede il menu e ordina dal telefono.',
    highlightSelector: '[data-tour="download-qr-btn"]',
  },

  // MENU
  {
    id: 'menu-nav',
    tab: 'menu',
    title: 'Il Tuo Menu',
    description: 'Qui crei il menu che i clienti vedono quando scansionano il QR. Organizza i piatti in categorie, aggiungi foto, prezzo, descrizione e allergeni.',
    highlightSelector: '[data-tour="menu-header"]',
  },
  {
    id: 'menu-add-dish',
    tab: 'menu',
    title: 'Aggiungi un Piatto',
    description: 'Clicca "+" per aggiungere un nuovo piatto. Inserisci nome, prezzo, categoria, foto e allergeni.',
    highlightSelector: '[data-tour="add-dish-btn"]',
  },

  // PRENOTAZIONI
  {
    id: 'reservations-nav',
    tab: 'reservations',
    title: 'Prenotazioni',
    description: 'La timeline mostra le prenotazioni del giorno. Puoi confermare, rifiutare o modificarle. Attivando le prenotazioni online, i clienti prenotano dal tuo link.',
    highlightSelector: '[data-tour="reservations-header"]',
  },

  // ANALITICHE
  {
    id: 'analytics-nav',
    tab: 'analytics',
    title: 'Analitiche',
    description: 'Grafici su incassi giornalieri, piatti più ordinati e ore di punta. Filtra per giorno, settimana o mese.',
    highlightSelector: '[data-tour="analytics-header"]',
  },

  // IMPOSTAZIONI
  {
    id: 'settings-nav',
    tab: 'settings',
    title: 'Impostazioni',
    description: 'Configura: nome ristorante, coperto, All You Can Eat, modalità cameriere, prenotazioni online, pagamenti Stripe e abbonamento.',
    highlightSelector: '[data-tour="nav-settings"]',
    subTab: 'general',
  },

  // FINE
  {
    id: 'end',
    tab: 'orders',
    title: 'Demo Completata!',
    description: 'Hai visto tutte le funzioni di Minthi. Clicca "Fine Demo" per uscire e iniziare a configurare il tuo ristorante.',
  },
]

// ── Setup Steps ──────────────────────────────────────────────────────────────
export interface SetupStep {
  id: string
  tab: string
  title: string
  shortDescription: string
  fullExplanation: string
  highlightSelector: string
  actionHint: string  // clear instruction on what button to press
  checkFn: (ctx: { tablesCount: number; dishesCount: number; categoriesCount: number }) => boolean
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'create-categories',
    tab: 'menu',
    title: 'Crea le Categorie',
    shortDescription: 'Crea almeno una categoria per il menu (es. Antipasti, Primi, Dolci).',
    actionHint: 'Clicca il pulsante "Categorie" in alto a destra, poi "Nuova Categoria".',
    fullExplanation: 'Le categorie organizzano il tuo menu (es. Antipasti, Primi, Secondi, Dolci, Bevande). I clienti vedranno i piatti divisi per categoria.\n\nPuoi riordinarle trascinandole. L\'ordine qui = ordine nel menu cliente.',
    highlightSelector: '[data-tour="menu-header"]',
    checkFn: ({ categoriesCount }) => categoriesCount > 0,
  },
  {
    id: 'create-dishes',
    tab: 'menu',
    title: 'Aggiungi i Piatti',
    shortDescription: 'Aggiungi almeno un piatto con nome, prezzo e categoria.',
    actionHint: 'Clicca il pulsante "+" arancione in alto per aggiungere un piatto.',
    fullExplanation: 'Per ogni piatto inserisci: nome, prezzo, descrizione, categoria, foto e allergeni.\n\nPuoi disattivare un piatto senza eliminarlo (utile per piatti stagionali).',
    highlightSelector: '[data-tour="add-dish-btn"]',
    checkFn: ({ dishesCount }) => dishesCount > 0,
  },
  {
    id: 'create-tables',
    tab: 'tables',
    title: 'Crea i Tavoli',
    shortDescription: 'Aggiungi i tavoli per generare i QR Code.',
    actionHint: 'Clicca il pulsante "+" in alto a destra per aggiungere un tavolo.',
    fullExplanation: 'Ogni tavolo ottiene un QR Code. Stampa i QR e mettili sui tavoli.\n\nI clienti scansionano il QR → vedono il menu → ordinano dal telefono → l\'ordine arriva nella Gestione Ordini.',
    highlightSelector: '[data-tour="add-table-btn"]',
    checkFn: ({ tablesCount }) => tablesCount > 0,
  },
  {
    id: 'configure',
    tab: 'settings',
    title: 'Configura le Impostazioni',
    shortDescription: 'Personalizza coperto, orari, camerieri e abbonamento.',
    actionHint: 'Esplora le tab in alto: Generale, Costi & Menu, Staff, Prenotazioni, Abbonamento & Pagamenti.',
    fullExplanation: '• Generale — Nome ristorante, suoni notifica ordini, menu sola lettura, tempi di cottura\n• Costi & Menu — Coperto (prezzo per persona) e All You Can Eat (prezzo fisso, limiti per piatto). Entrambi con programmazione settimanale.\n• Staff — Crea credenziali per i camerieri. Ogni cameriere accede dalla pagina di login con username e password, e vede solo i tavoli assegnati.\n• Prenotazioni — Attiva prenotazioni online via QR Code, imposta durata turni\n• Abbonamento & Pagamenti — Gestisci il tuo piano Minthi e attiva Stripe Connect per ricevere pagamenti digitali dai clienti',
    highlightSelector: '[data-tour="nav-settings"]',
    checkFn: () => false,
  },
]
