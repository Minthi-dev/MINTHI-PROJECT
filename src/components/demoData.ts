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
  status: 'PAID', total_amount: total,
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
export interface FeatureSection {
  id: string
  tab: string
  color: string
  icon: string
  title: string
  features: string[]
  firstStepIndex: number
}

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: 'orders', tab: 'orders', color: 'amber', icon: 'ClockCounterClockwise',
    title: 'Gestione Ordini', firstStepIndex: 1,
    features: ['Ordini in tempo reale', 'Gestione stati piatti', 'Suddivisione portate'],
  },
  {
    id: 'tables', tab: 'tables', color: 'emerald', icon: 'MapPin',
    title: 'Tavoli e Sale', firstStepIndex: 3,
    features: ['QR code per ogni tavolo', 'Organizzazione per sale', 'Sessioni clienti'],
  },
  {
    id: 'menu', tab: 'menu', color: 'sky', icon: 'BookOpen',
    title: 'Menu Digitale', firstStepIndex: 7,
    features: ['Categorie e piatti', 'Foto e allergeni', 'Export PDF'],
  },
  {
    id: 'reservations', tab: 'reservations', color: 'violet', icon: 'Calendar',
    title: 'Prenotazioni', firstStepIndex: 11,
    features: ['Prenotazioni online', 'Timeline visuale', 'Gestione tavoli'],
  },
  {
    id: 'analytics', tab: 'analytics', color: 'rose', icon: 'ChartBar',
    title: 'Analitiche', firstStepIndex: 12,
    features: ['Incassi e statistiche', 'Piatti più venduti', 'Report orari'],
  },
  {
    id: 'settings', tab: 'settings', color: 'zinc', icon: 'Gear',
    title: 'Impostazioni', firstStepIndex: 13,
    features: ['Coperto e AYCE', 'Camerieri e staff', 'Pagamenti Stripe'],
  },
]

export interface DemoGuideStep {
  id: string
  tab: string
  title: string
  description: string
  tip?: string
  highlightSelector?: string  // CSS selector for SpotlightOverlay — omit to show page without darkening
  subTab?: string             // for settings sub-tabs
  isSummary?: boolean         // true for the welcome summary page (rendered differently)
  phase?: string              // 'summary' for the welcome step
  group?: string              // navigation group name
}

export const DEMO_TOUR_STEPS: DemoGuideStep[] = [
  // Step 0: Welcome
  {
    id: 'welcome',
    tab: 'orders',
    title: 'Benvenuto in Minthi!',
    description: 'Questa è una demo con dati di esempio. Nulla viene salvato. Dopo la demo configurerai il tuo ristorante.',
    isSummary: true,
  },

  // ORDINI
  {
    id: 'orders-overview',
    tab: 'orders',
    title: '📋 Gestione Ordini',
    description: 'Questa è la schermata principale. Ogni card rappresenta un tavolo con i piatti ordinati dai clienti. I colori indicano lo stato: giallo = in attesa, blu = in preparazione, verde = pronto da servire, viola = consegnato al tavolo.',
    tip: 'Clicca su un piatto per cambiare il suo stato. Quando tutti i piatti sono pronti, puoi completare l\'ordine.',
    highlightSelector: '[data-tour="orders-header"]',
  },

  // TAVOLI
  {
    id: 'tables-overview',
    tab: 'tables',
    title: '🪑 I Tuoi Tavoli',
    description: 'La griglia mostra tutti i tavoli del ristorante. Verde = libero, ambra = occupato con clienti. Clicca su un tavolo libero per attivarlo (far sedere clienti), o su uno occupato per vedere il conto e gestire la sessione.',
    tip: 'Puoi organizzare i tavoli in Sale (es. Sala Interna, Esterno, Terrazza) per una gestione più ordinata.',
    highlightSelector: '[data-tour="tables-header"]',
  },
  {
    id: 'tables-add',
    tab: 'tables',
    title: '➕ Aggiungi Tavoli',
    description: 'Clicca qui per creare un nuovo tavolo. Inserisci numero, posti a sedere e assegnalo a una sala. Puoi anche creare nuove sale direttamente dal popup.',
    highlightSelector: '[data-tour="add-table-btn"]',
  },
  {
    id: 'tables-qr',
    tab: 'tables',
    title: '📱 QR Code Tavoli',
    description: 'Ogni tavolo ha un QR Code unico. Scarica tutti i QR in PDF, stampali e mettili sui tavoli. Ecco come funziona: il cliente scansiona il QR → vede il tuo menu digitale sul telefono → sceglie i piatti e ordina → l\'ordine arriva automaticamente nella sezione Ordini.',
    tip: 'Questo è il cuore di Minthi: i clienti ordinano dal telefono, tu ricevi gli ordini in tempo reale!',
    highlightSelector: '[data-tour="download-qr-btn"]',
  },
  {
    id: 'tables-rooms',
    tab: 'tables',
    title: '🏠 Gestione Sale',
    description: 'Organizza i tavoli in aree diverse: Sala Interna, Esterno, Terrazza, Privé. Le sale ti aiutano a gestire meglio i camerieri (ogni cameriere può servire una sala specifica) e le prenotazioni (i clienti possono scegliere la sala quando prenotano).',
    highlightSelector: '[data-tour="rooms-btn"]',
  },

  // MENU
  {
    id: 'menu-overview',
    tab: 'menu',
    title: '🍽️ Il Tuo Menu',
    description: 'Qui crei il menu che i clienti vedranno quando scansionano il QR del tavolo. Il menu è organizzato in categorie (Antipasti, Primi, Secondi...) e ogni piatto ha nome, prezzo, foto, descrizione e allergeni.',
    highlightSelector: '[data-tour="menu-header"]',
  },
  {
    id: 'menu-categories',
    tab: 'menu',
    title: '📂 Gestione Categorie',
    description: 'Le categorie organizzano il tuo menu: Antipasti, Primi Piatti, Secondi, Dolci, Bevande, ecc. Puoi creare quante categorie vuoi e riordinarle trascinando. L\'ordine delle categorie qui = ordine visibile ai clienti.',
    highlightSelector: '[data-tour="categories-btn"]',
  },
  {
    id: 'menu-add-dish',
    tab: 'menu',
    title: '🍕 Aggiungi Piatti',
    description: 'Per ogni piatto puoi inserire: nome, prezzo, descrizione, foto, allergeni (glutine, lattosio, ecc.) e categoria. Puoi anche disattivare un piatto senza eliminarlo — utile per piatti stagionali o esauriti.',
    highlightSelector: '[data-tour="add-dish-btn"]',
  },
  {
    id: 'menu-export',
    tab: 'menu',
    title: '📄 Esporta Menu PDF',
    description: 'Scarica il tuo menu in formato PDF per stamparlo o condividerlo. Puoi scegliere quali categorie includere, dare un nome personalizzato al menu, e anche esportare i menu personalizzati (es. Menu Pranzo, Menu Degustazione).',
    highlightSelector: '[data-tour="export-menu-btn"]',
  },

  // PRENOTAZIONI
  {
    id: 'reservations-overview',
    tab: 'reservations',
    title: '📅 Prenotazioni',
    description: 'La timeline mostra le prenotazioni del giorno. Puoi creare, confermare, rifiutare o modificare prenotazioni. Trascina una prenotazione per spostarla su un altro tavolo o orario.',
    tip: 'Attivando le prenotazioni online (nelle Impostazioni), i clienti potranno prenotare direttamente dal tuo link o QR code!',
  },

  // ANALITICHE
  {
    id: 'analytics-overview',
    tab: 'analytics',
    title: '📊 Analitiche',
    description: 'Grafici dettagliati su: incassi giornalieri/settimanali/mensili, piatti più venduti, ore di punta e numero di coperti. Puoi filtrare per periodo e scaricare il report in PDF.',
  },

  // IMPOSTAZIONI - ogni tab
  {
    id: 'settings-general',
    tab: 'settings',
    subTab: 'general',
    title: '⚙️ Impostazioni Generali',
    description: 'Configura il nome del ristorante, attiva i suoni di notifica per i nuovi ordini (4 toni diversi), abilita il "Menu Sola Lettura" (clienti vedono il menu ma non possono ordinare), e mostra i tempi medi di cottura calcolati automaticamente.',
  },
  {
    id: 'settings-costs',
    tab: 'settings',
    subTab: 'costs',
    title: '💰 Costi & Menu',
    description: 'Configura il Coperto (prezzo fisso per persona, es. €2), l\'All You Can Eat (prezzo fisso, con limite ordini per piatto), e la Suddivisione in Portate (i clienti scelgono l\'ordine delle portate: antipasto → primo → secondo). Ogni opzione ha una programmazione settimanale.',
  },
  {
    id: 'settings-staff',
    tab: 'settings',
    subTab: 'staff',
    title: '👨‍🍳 Gestione Camerieri',
    description: 'Crea username e password per ogni cameriere. Il cameriere accede dalla pagina di login del sito con le sue credenziali → vede SOLO i tavoli della sua area → può segnare i piatti come serviti e gestire i pagamenti (se abilitato). Puoi anche disattivare temporaneamente un cameriere.',
    tip: 'I camerieri accedono dalla stessa pagina di login, usando le credenziali che crei qui.',
  },
  {
    id: 'settings-reservations',
    tab: 'settings',
    subTab: 'reservations',
    title: '🗓️ Prenotazioni Online',
    description: 'Attiva le prenotazioni via link/QR pubblico: i clienti prenotano dal telefono scegliendo data, ora e numero di persone. Configura la durata dei turni (1h-4h) e gli orari di servizio pranzo/cena. Puoi anche abilitare la scelta della sala durante la prenotazione.',
  },
  {
    id: 'settings-payments',
    tab: 'settings',
    subTab: 'subscription',
    title: '💳 Pagamenti e Abbonamento',
    description: 'Due sezioni: 1) Pagamenti Clienti — Collega il tuo conto Stripe con Stripe Connect, i clienti potranno pagare online direttamente dal tavolo. I soldi vanno sul tuo conto bancario. 2) Abbonamento Minthi — Gestisci il tuo piano, scarica fatture, cambia metodo di pagamento.',
  },

  // FINE
  {
    id: 'end',
    tab: 'orders',
    title: '🎉 Demo Completata!',
    description: 'Hai visto tutte le funzioni di Minthi! Ora puoi uscire dalla demo e iniziare a configurare il tuo ristorante con la Configurazione Guidata.',
  },
]

// ── Setup Steps ──────────────────────────────────────────────────────────────
export interface SetupStep {
  id: string
  tab: string
  subTab?: string
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
    shortDescription: 'Organizza il menu in categorie (es. Antipasti, Primi, Dolci, Bevande).',
    actionHint: 'Clicca "Categorie" in alto a destra, poi "Nuova Categoria".',
    fullExplanation: 'Le categorie organizzano il tuo menu. I clienti vedranno i piatti divisi per categoria sul loro telefono.\n\nEsempi: Antipasti, Primi Piatti, Secondi, Contorni, Dolci, Bevande, Caffetteria.\n\nPuoi riordinarle trascinandole — l\'ordine qui è l\'ordine che vedono i clienti.',
    highlightSelector: '[data-tour="categories-btn"]',
    checkFn: ({ categoriesCount }) => categoriesCount > 0,
  },
  {
    id: 'create-dishes',
    tab: 'menu',
    title: 'Aggiungi i Piatti',
    shortDescription: 'Inserisci i piatti con nome, prezzo, descrizione e foto.',
    actionHint: 'Clicca il pulsante "+" arancione per aggiungere un piatto.',
    fullExplanation: 'Per ogni piatto puoi inserire:\n• Nome e prezzo\n• Descrizione (opzionale)\n• Foto (opzionale, consigliata!)\n• Allergeni (glutine, lattosio, ecc.)\n• Categoria\n\nPuoi disattivare un piatto senza eliminarlo — utile per piatti stagionali.',
    highlightSelector: '[data-tour="add-dish-btn"]',
    checkFn: ({ dishesCount }) => dishesCount > 0,
  },
  {
    id: 'create-tables',
    tab: 'tables',
    title: 'Crea i Tavoli',
    shortDescription: 'Aggiungi i tavoli del ristorante con numero e posti.',
    actionHint: 'Clicca "+" in alto a destra per creare un tavolo.',
    fullExplanation: 'Ogni tavolo ottiene un QR Code unico. Stampa i QR e mettili sui tavoli.\n\nI clienti scansionano il QR → vedono il menu → ordinano dal telefono → l\'ordine arriva nella Gestione Ordini.\n\nPuoi organizzare i tavoli in Sale (Sala Interna, Esterno, ecc.).',
    highlightSelector: '[data-tour="add-table-btn"]',
    checkFn: ({ tablesCount }) => tablesCount > 0,
  },
  {
    id: 'download-qr',
    tab: 'tables',
    title: 'Scarica i QR Code',
    shortDescription: 'Scarica e stampa i QR Code per i tavoli.',
    actionHint: 'Clicca il pulsante "Scarica QR" per generare il PDF con tutti i QR.',
    fullExplanation: 'Scarica un PDF con tutti i QR Code dei tavoli (4 per pagina A4). Stampali e posizionali sui tavoli.\n\nQuando il cliente scansiona il QR:\n1. Vede il tuo menu digitale\n2. Sceglie i piatti\n3. Conferma l\'ordine\n4. Tu ricevi l\'ordine in tempo reale!',
    highlightSelector: '[data-tour="download-qr-btn"]',
    checkFn: () => false,
  },
  {
    id: 'setup-hours',
    tab: 'settings',
    subTab: 'reservations',
    title: 'Orari di Servizio',
    shortDescription: 'Configura gli orari di apertura pranzo e cena.',
    actionHint: 'Imposta gli orari nella sezione "Orari Settimanali" qui sotto.',
    fullExplanation: 'Configura per ogni giorno:\n• Pranzo: orario apertura e chiusura\n• Cena: orario apertura e chiusura\n\nGli orari servono per:\n• Le prenotazioni online (mostra solo slot disponibili)\n• L\'applicazione automatica dei menu personalizzati\n• Il calcolo della durata dei turni',
    highlightSelector: '[data-settings-tab="reservations"]',
    checkFn: () => false,
  },
  {
    id: 'setup-staff',
    tab: 'settings',
    subTab: 'staff',
    title: 'Configura Camerieri',
    shortDescription: 'Crea credenziali per i camerieri (opzionale).',
    actionHint: 'Attiva la "Modalità Cameriere" e poi clicca "Aggiungi Cameriere".',
    fullExplanation: 'I camerieri accedono dalla pagina di login con username e password.\n\nOgni cameriere:\n• Vede solo i tavoli della sua area\n• Può segnare piatti come serviti\n• Può gestire i pagamenti (se abilitato)\n\nPuoi disattivare un cameriere senza eliminarlo.',
    highlightSelector: '[data-settings-tab="staff"]',
    checkFn: () => false,
  },
  {
    id: 'setup-costs',
    tab: 'settings',
    subTab: 'costs',
    title: 'Coperto e Prezzi',
    shortDescription: 'Imposta coperto per persona e modalità AYCE (opzionale).',
    actionHint: 'Configura il Coperto e/o l\'All You Can Eat qui sotto.',
    fullExplanation: '• Coperto: prezzo fisso per persona (es. €2). Si applica automaticamente quando attivi un tavolo.\n• All You Can Eat: prezzo fisso, il cliente può ordinare i piatti AYCE senza limiti (o con limiti per piatto).\n• Suddivisione Portate: i clienti scelgono l\'ordine (antipasto → primo → secondo).\n\nTutto è programmabile per giorno della settimana.',
    highlightSelector: '[data-settings-tab="costs"]',
    checkFn: () => false,
  },
  {
    id: 'setup-payments',
    tab: 'settings',
    subTab: 'subscription',
    title: 'Pagamenti Online',
    shortDescription: 'Collega Stripe per ricevere pagamenti digitali (opzionale).',
    actionHint: 'Clicca "Collega Account Stripe" per iniziare la configurazione.',
    fullExplanation: 'Con Stripe Connect i tuoi clienti possono pagare online direttamente dal tavolo.\n\nCome funziona:\n1. Colleghi il tuo conto Stripe\n2. Il cliente ordina dal QR\n3. Clicca "Paga Online"\n4. I soldi vanno direttamente sul tuo conto bancario\n\nMinthi non trattiene nulla — paghi solo le commissioni Stripe standard.',
    highlightSelector: '[data-settings-tab="subscription"]',
    checkFn: () => false,
  },
]
