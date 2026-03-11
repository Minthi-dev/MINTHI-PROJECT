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

// ── Dishes ────────────────────────────────────────────────────────────────────
export const DEMO_DISHES: Dish[] = [
  // Antipasti
  { id: 'demo-dish-1', name: 'Bruschetta al Pomodoro', description: 'Pane tostato con pomodorini freschi e basilico', price: 6, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine'] },
  { id: 'demo-dish-2', name: 'Caprese', description: 'Mozzarella di bufala, pomodoro cuore di bue e basilico', price: 8, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'] },
  { id: 'demo-dish-3', name: 'Prosciutto e Melone', description: 'Prosciutto crudo di Parma con melone fresco', price: 9, vat_rate: 10, category_id: 'demo-cat-1', restaurant_id: RESTAURANT_ID, is_active: true },
  // Primi
  { id: 'demo-dish-4', name: 'Carbonara', description: 'Guanciale, pecorino, tuorlo d\'uovo e pepe nero', price: 12, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'uova', 'latte'] },
  { id: 'demo-dish-5', name: 'Cacio e Pepe', description: 'Pecorino romano DOP e pepe nero macinato fresco', price: 11, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'latte'] },
  { id: 'demo-dish-6', name: 'Risotto ai Funghi Porcini', description: 'Riso Carnaroli con porcini freschi e parmigiano', price: 14, vat_rate: 10, category_id: 'demo-cat-2', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'] },
  // Secondi
  { id: 'demo-dish-7', name: 'Bistecca alla Fiorentina', description: 'Tagliata di manzo al sangue con rucola e grana', price: 24, vat_rate: 10, category_id: 'demo-cat-3', restaurant_id: RESTAURANT_ID, is_active: true },
  { id: 'demo-dish-8', name: 'Branzino al Forno', description: 'Branzino con patate, olive e pomodorini', price: 18, vat_rate: 10, category_id: 'demo-cat-3', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['pesce'] },
  // Dolci
  { id: 'demo-dish-9', name: 'Tiramisù', description: 'Mascarpone, savoiardi, caffè e cacao amaro', price: 7, vat_rate: 10, category_id: 'demo-cat-4', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['glutine', 'uova', 'latte'] },
  { id: 'demo-dish-10', name: 'Panna Cotta', description: 'Con coulis di frutti di bosco', price: 6, vat_rate: 10, category_id: 'demo-cat-4', restaurant_id: RESTAURANT_ID, is_active: true, allergens: ['latte'] },
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
  { id: 'demo-book-1', restaurant_id: RESTAURANT_ID, name: 'Famiglia Rossi', phone: '+39 333 1234567', date_time: todayStr(20, 0), guests: 4, status: 'confirmed', notes: 'Seggiolone per bambino' },
  { id: 'demo-book-2', restaurant_id: RESTAURANT_ID, name: 'Marco Bianchi', phone: '+39 339 7654321', date_time: todayStr(21, 0), guests: 2, status: 'pending' },
  { id: 'demo-book-3', restaurant_id: RESTAURANT_ID, name: 'Laura Verdi', email: 'laura.verdi@email.it', date_time: todayStr(20, 30), guests: 6, status: 'confirmed', notes: 'Compleanno — torta a sorpresa' },
  { id: 'demo-book-4', restaurant_id: RESTAURANT_ID, name: 'Giovanni Neri', phone: '+39 347 9876543', date_time: todayStr(21, 30), guests: 3, status: 'pending' },
]

// ── Guide Steps ──────────────────────────────────────────────────────────────
export interface DemoGuideStep {
  id: string
  tab: string
  title: string
  description: string
  tip?: string
}

export const DEMO_TOUR_STEPS: DemoGuideStep[] = [
  {
    id: 'orders',
    tab: 'orders',
    title: 'Gestione Ordini',
    description: 'Questa è la cucina digitale. Qui vedi in tempo reale tutti gli ordini attivi, i piatti da preparare e quelli pronti da servire. Puoi passare dalla vista per Tavolo alla vista per Piatto.',
    tip: 'Prova a cliccare sui piatti per segnarli come "Pronto" o "Consegnato"!',
  },
  {
    id: 'tables',
    tab: 'tables',
    title: 'Gestione Tavoli',
    description: 'Qui controlli lo stato di ogni tavolo: libero, occupato o in attesa di pagamento. Il tavolo 1 ha ordini in preparazione, il 3 è in attesa e il 5 ha un pagamento parziale online.',
    tip: 'Clicca su un tavolo per vedere i dettagli e gestire il conto.',
  },
  {
    id: 'menu',
    tab: 'menu',
    title: 'Menu Digitale',
    description: 'Il tuo menu organizzato per categorie: Antipasti, Primi, Secondi e Dolci. Ogni piatto ha nome, prezzo, descrizione e allergeni. I clienti lo vedono scansionando il QR Code.',
    tip: 'Clicca sull\'icona matita di un piatto per modificarlo.',
  },
  {
    id: 'reservations',
    tab: 'reservations',
    title: 'Prenotazioni',
    description: 'Le prenotazioni di oggi: 4 prenotazioni per un totale di 15 coperti. Puoi confermare, rifiutare o modificare ogni prenotazione. I clienti possono prenotare dal link pubblico del ristorante.',
    tip: 'Puoi attivare le prenotazioni online da Impostazioni → Prenotazioni.',
  },
  {
    id: 'analytics',
    tab: 'analytics',
    title: 'Analitiche',
    description: 'Grafici e statistiche sulle performance del ristorante: incassi, piatti più ordinati, ore di punta e andamento nel tempo. Tutti i dati si aggiornano in tempo reale.',
    tip: 'Usa i filtri per confrontare periodi diversi.',
  },
  {
    id: 'settings',
    tab: 'settings',
    title: 'Impostazioni',
    description: 'Da qui configuri tutto: nome del ristorante, coperto, orari, modalità cameriere, pagamenti Stripe e il tuo abbonamento Minthi. È il centro di controllo della piattaforma.',
    tip: 'Vai su "Abbonamento & Pagamenti" per attivare il piano.',
  },
]

export interface SetupStep {
  id: string
  tab: string
  title: string
  description: string
  checkFn: (ctx: { tablesCount: number; dishesCount: number; categoriesCount: number }) => boolean
  ctaLabel: string
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'create-categories',
    tab: 'menu',
    title: 'Crea le Categorie del Menu',
    description: 'Prima di aggiungere i piatti, crea le categorie (es. Antipasti, Primi, Secondi, Dolci). Vai nella tab Menu e usa il pulsante per aggiungere una categoria.',
    checkFn: ({ categoriesCount }) => categoriesCount > 0,
    ctaLabel: 'Vai al Menu',
  },
  {
    id: 'create-dishes',
    tab: 'menu',
    title: 'Aggiungi i Tuoi Piatti',
    description: 'Ora aggiungi i piatti al menu: nome, prezzo, descrizione e allergeni. Puoi anche aggiungere foto. Clicca "Nuovo Piatto" nella tab Menu.',
    checkFn: ({ dishesCount }) => dishesCount > 0,
    ctaLabel: 'Aggiungi Piatto',
  },
  {
    id: 'create-tables',
    tab: 'tables',
    title: 'Crea i Tavoli del Ristorante',
    description: 'Aggiungi i tavoli della tua sala. Per ogni tavolo verrà generato un QR Code unico che i clienti potranno scansionare per ordinare.',
    checkFn: ({ tablesCount }) => tablesCount > 0,
    ctaLabel: 'Vai ai Tavoli',
  },
  {
    id: 'configure',
    tab: 'settings',
    title: 'Configura e Attiva',
    description: 'Ultimo passo! Imposta coperto, orari di servizio e attiva l\'abbonamento Minthi per sbloccare tutte le funzioni. Vai su Impostazioni → Abbonamento & Pagamenti.',
    checkFn: () => false, // Never auto-complete — user decides when done
    ctaLabel: 'Vai alle Impostazioni',
  },
]
