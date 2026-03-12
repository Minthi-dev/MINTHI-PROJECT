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
  { id: 'demo-book-3', restaurant_id: RESTAURANT_ID, name: 'Laura Verdi', email: 'laura.verdi@email.it', date_time: todayStr(20, 30), guests: 6, status: 'confirmed', notes: 'Compleanno \u2014 torta a sorpresa' },
  { id: 'demo-book-4', restaurant_id: RESTAURANT_ID, name: 'Giovanni Neri', phone: '+39 347 9876543', date_time: todayStr(21, 30), guests: 3, status: 'pending' },
]

// ── Guide Steps (expanded with highlighting) ─────────────────────────────────
export interface DemoGuideStep {
  id: string
  tab: string
  title: string
  description: string
  tip?: string
  highlightSelector?: string  // CSS selector for SpotlightOverlay
  subTab?: string             // for settings sub-tabs
}

export const DEMO_TOUR_STEPS: DemoGuideStep[] = [
  {
    id: 'welcome',
    tab: 'orders',
    title: 'Benvenuto nella Dashboard',
    description: 'Questa \u00e8 la tua dashboard Minthi. Da qui gestisci tutto il tuo ristorante: ordini, tavoli, menu, prenotazioni, analitiche e impostazioni. Usa il menu laterale a sinistra per navigare tra le sezioni. Ogni sezione \u00e8 in tempo reale: le modifiche si aggiornano istantaneamente su tutti i dispositivi.',
    tip: 'Naviga liberamente tra le sezioni cliccando sul menu laterale!',
    highlightSelector: 'nav',
  },
  {
    id: 'orders-overview',
    tab: 'orders',
    title: 'Gestione Ordini',
    description: 'La sezione Ordini \u00e8 la cucina digitale del tuo ristorante. Qui vedi in tempo reale tutti gli ordini attivi raggruppati per tavolo. Ogni ordine mostra i piatti ordinati con il loro stato: In Attesa (giallo), In Preparazione (blu), Pronto (verde), Servito (grigio). Puoi passare dalla vista per Tavolo alla vista per Piatto per organizzare il lavoro della cucina.',
    tip: 'Clicca su un piatto per avanzarne lo stato: In Attesa \u2192 In Preparazione \u2192 Pronto \u2192 Servito.',
    highlightSelector: '[data-tour="orders-header"]',
  },
  {
    id: 'orders-status',
    tab: 'orders',
    title: 'Flusso degli Stati Ordine',
    description: 'Ogni piatto segue un flusso preciso: PENDING (in attesa di essere preso in carico) \u2192 IN PREPARAZIONE (la cucina ci sta lavorando) \u2192 PRONTO (da portare al tavolo) \u2192 SERVITO (consegnato al cliente) \u2192 CONSEGNATO. Il colore della card cambia in base allo stato. I camerieri vedono in tempo reale quando un piatto \u00e8 pronto per essere portato al tavolo. In modalit\u00e0 cameriere, i camerieri possono aggiornare gli stati dal loro dispositivo.',
  },
  {
    id: 'tables-overview',
    tab: 'tables',
    title: 'Gestione Tavoli',
    description: 'La griglia tavoli mostra tutti i tavoli del ristorante in tempo reale. Ogni card indica: numero tavolo, posti disponibili, stato (libero in verde, occupato in ambra, in attesa di pagamento in rosso). Puoi vedere quanti clienti sono seduti, da quanto tempo \u00e8 aperta la sessione e l\'importo totale ordinato. I tavoli con pagamento parziale online mostrano un badge viola.',
    tip: 'Clicca su un tavolo occupato per aprire il dettaglio con il conto completo.',
    highlightSelector: '[data-tour="add-table-btn"]',
  },
  {
    id: 'tables-qr',
    tab: 'tables',
    title: 'QR Code e Attivazione',
    description: 'Ogni tavolo ha un QR Code univoco. Quando un cliente lo scansiona con il telefono, accede al tuo menu digitale e pu\u00f2 ordinare direttamente. Per attivare un tavolo: clicca sulla card del tavolo, inserisci il numero di clienti e conferma. Si apre una sessione che traccia tutti gli ordini. Puoi scaricare tutti i QR Code come PDF per stamparli e posizionarli sui tavoli.',
    tip: 'Usa il pulsante "Scarica QR" per generare un PDF con tutti i codici QR.',
    highlightSelector: '[data-tour="download-qr-btn"]',
  },
  {
    id: 'menu-categories',
    tab: 'menu',
    title: 'Menu \u2014 Categorie',
    description: 'Il menu \u00e8 organizzato per categorie (es. Antipasti, Primi, Secondi, Dolci). Le categorie sono l\'ossatura del tuo menu: i clienti le vedono come sezioni nel menu digitale. Puoi creare quante categorie vuoi, riordinarle con il drag-and-drop e rinominarle. Ogni piatto appartiene a una categoria.',
    tip: 'Trascina le categorie per riordinarle: l\'ordine qui \u00e8 quello che vedono i clienti.',
    highlightSelector: '[data-tour="menu-header"]',
  },
  {
    id: 'menu-dishes',
    tab: 'menu',
    title: 'Menu \u2014 Piatti',
    description: 'Per ogni piatto puoi impostare: nome, prezzo, descrizione, foto, categoria, aliquota IVA e allergeni (glutine, latte, uova, pesce, ecc. secondo la normativa EU). Puoi rendere un piatto attivo/inattivo senza eliminarlo (utile per piatti stagionali). Se hai il coperto attivo, viene aggiunto automaticamente al conto. Se usi l\'All You Can Eat, puoi segnare quali piatti sono inclusi.',
    tip: 'Clicca l\'icona matita per modificare un piatto, o il pulsante + per aggiungerne uno nuovo.',
    highlightSelector: '[data-tour="add-dish-btn"]',
  },
  {
    id: 'menu-customer',
    tab: 'menu',
    title: 'Esperienza del Cliente',
    description: 'Quando il cliente scansiona il QR Code dal tavolo, si apre il menu digitale sul suo smartphone. Vede le categorie, pu\u00f2 sfogliare i piatti con foto e descrizioni, filtrare per allergeni e aggiungere piatti al carrello. Al momento dell\'ordine pu\u00f2 aggiungere note per la cucina (es. "senza cipolla"). L\'ordine arriva in tempo reale nella tua dashboard Ordini. Se hai attivato i pagamenti Stripe, il cliente pu\u00f2 pagare direttamente dal telefono.',
    tip: 'Il menu \u00e8 responsivo e si adatta a qualsiasi dispositivo mobile.',
  },
  {
    id: 'reservations',
    tab: 'reservations',
    title: 'Gestione Prenotazioni',
    description: 'La sezione prenotazioni mostra una timeline visuale delle prenotazioni per la giornata selezionata. Ogni blocco rappresenta una prenotazione con nome, numero ospiti, orario e note. Puoi confermare o rifiutare prenotazioni in attesa, trascinare i blocchi per cambiare orario, e vedere a colpo d\'occhio la capienza residua. Nel demo vedi 4 prenotazioni per stasera con 15 coperti totali.',
    tip: 'Trascina una prenotazione sulla timeline per cambiare orario.',
    highlightSelector: '[data-tour="reservations-header"]',
  },
  {
    id: 'reservations-online',
    tab: 'reservations',
    title: 'Prenotazioni Online',
    description: 'Puoi attivare le prenotazioni online dal tab Impostazioni \u2192 Prenotazioni. Una volta attive, i clienti possono prenotare dal link pubblico del tuo ristorante (es. minthi.it/prenota/il-tuo-ristorante). Scegliono data, orario, numero ospiti e lasciano nome, telefono e note. Tu ricevi la prenotazione in tempo reale e puoi confermarla o rifiutarla. Puoi impostare la durata media di una prenotazione e gli orari di disponibilit\u00e0.',
  },
  {
    id: 'analytics',
    tab: 'analytics',
    title: 'Analitiche e Statistiche',
    description: 'La sezione analitiche ti mostra le performance del ristorante con grafici interattivi: incassi giornalieri/settimanali/mensili, piatti pi\u00f9 ordinati (top seller), ore di punta, numero medio di coperti e andamento nel tempo. Puoi filtrare per periodo (oggi, settimana, mese, personalizzato) e confrontare periodi diversi. I dati si aggiornano in tempo reale man mano che arrivano nuovi ordini.',
    tip: 'Usa i filtri data in alto per analizzare periodi specifici.',
    highlightSelector: '[data-tour="analytics-header"]',
  },
  {
    id: 'settings-general',
    tab: 'settings',
    title: 'Impostazioni \u2014 Generale',
    description: 'Nel tab Generale trovi: Nome Ristorante (visibile ai clienti), Suoni Notifica (avviso sonoro quando arriva un ordine, scegli tra diversi suoni), Modalit\u00e0 Cameriere (abilita l\'accesso camerieri con PIN per prendere ordini dai tavoli), Menu Sola Lettura (i clienti vedono il menu ma non possono ordinare online), Tempi di Cottura (stima automatica dei tempi per la cucina). Da qui puoi anche riavviare la guida demo.',
    highlightSelector: '[data-tour="settings-header"]',
    subTab: 'general',
  },
  {
    id: 'settings-costs',
    tab: 'settings',
    title: 'Impostazioni \u2014 Costi e Staff',
    description: 'Costi: configura il Coperto (importo fisso per persona, pu\u00f2 variare per giorno/fascia oraria con il calendario settimanale) e l\'All You Can Eat (prezzo fisso a persona, puoi scegliere quali piatti includere e impostare fasce orarie). Staff: aggiungi camerieri con nome e PIN personale. I camerieri accedono alla loro dashboard semplificata dove vedono i tavoli assegnati, prendono ordini e gestiscono i pagamenti.',
    subTab: 'costs',
  },
  {
    id: 'settings-payments',
    tab: 'settings',
    title: 'Impostazioni \u2014 Pagamenti e Abbonamento',
    description: 'Pagamenti: attiva Stripe Connect per ricevere pagamenti online dai clienti direttamente sul tuo conto. I clienti possono pagare il conto dal telefono (totale o dividendo per piatti). Dati Fiscali: inserisci Partita IVA e Ragione Sociale per le fatture. Abbonamento Minthi: gestisci il tuo piano, cambia metodo di pagamento, scarica le fatture e vedi lo storico dei pagamenti dal Portale di Fatturazione Stripe.',
    subTab: 'subscription',
  },
  {
    id: 'waiter-preview',
    tab: 'settings',
    title: 'Dashboard Cameriere',
    description: 'I camerieri accedono a una dashboard semplificata ottimizzata per l\'uso in sala. Vedono solo i tavoli del ristorante, possono attivare un tavolo (inserendo il numero di clienti), prendere ordini per un tavolo (con selezione piatti dal menu e note), vedere lo stato degli ordini in tempo reale, e gestire il conto (segnare come pagato o svuotare il tavolo). L\'accesso avviene con un PIN personale creato dal ristoratore nelle impostazioni Staff.',
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
  checkFn: (ctx: { tablesCount: number; dishesCount: number; categoriesCount: number }) => boolean
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'create-categories',
    tab: 'menu',
    title: 'Crea le Categorie del Menu',
    shortDescription: 'Crea almeno una categoria per organizzare i piatti del tuo menu.',
    fullExplanation: 'Le categorie sono le sezioni del tuo menu digitale (es. Antipasti, Primi Piatti, Secondi, Contorni, Dolci, Bevande). I clienti vedranno i piatti organizzati per categoria quando scansionano il QR Code.\n\nPuoi creare quante categorie vuoi e riordinarle trascinandole. L\'ordine che imposti qui \u00e8 esattamente quello che vedranno i clienti.\n\nEsempi di categorie comuni: Antipasti, Primi, Secondi, Contorni, Dolci, Bevande, Pizze, Panini, Men\u00f9 Bambini.',
    highlightSelector: '[data-tour="menu-header"]',
    checkFn: ({ categoriesCount }) => categoriesCount > 0,
  },
  {
    id: 'create-dishes',
    tab: 'menu',
    title: 'Aggiungi i Tuoi Piatti',
    shortDescription: 'Aggiungi almeno un piatto al menu con prezzo e descrizione.',
    fullExplanation: 'Per ogni piatto puoi inserire:\n\n\u2022 Nome \u2014 il nome visibile ai clienti\n\u2022 Prezzo \u2014 in euro, con centesimi\n\u2022 Descrizione \u2014 ingredienti, preparazione, note\n\u2022 Categoria \u2014 in quale sezione del menu appare\n\u2022 Foto \u2014 carica un\'immagine del piatto\n\u2022 Allergeni \u2014 seleziona tra i 14 allergeni EU (glutine, latte, uova, pesce, crostacei, arachidi, soia, frutta a guscio, sedano, senape, sesamo, lupini, molluschi, anidride solforosa)\n\u2022 Aliquota IVA \u2014 solitamente 10% per la ristorazione\n\u2022 Attivo/Inattivo \u2014 disattiva un piatto senza eliminarlo (utile per piatti stagionali)\n\u2022 All You Can Eat \u2014 segna se il piatto \u00e8 incluso nel men\u00f9 AYCE',
    highlightSelector: '[data-tour="add-dish-btn"]',
    checkFn: ({ dishesCount }) => dishesCount > 0,
  },
  {
    id: 'create-tables',
    tab: 'tables',
    title: 'Crea i Tavoli del Ristorante',
    shortDescription: 'Aggiungi i tavoli della tua sala per generare i QR Code.',
    fullExplanation: 'Ogni tavolo che crei ottiene automaticamente un QR Code univoco. Stampa i QR e posizionali sui tavoli: i clienti li scansionano per accedere al menu e ordinare.\n\nPer ogni tavolo imposti:\n\u2022 Numero/Nome \u2014 come identifichi il tavolo (es. 1, 2, 3 oppure "Terrazza 1")\n\u2022 Posti \u2014 quante persone pu\u00f2 ospitare\n\u2022 Sala \u2014 in quale sala si trova (se hai pi\u00f9 sale)\n\nDopo aver creato i tavoli, usa il pulsante "Scarica QR" per generare un PDF con tutti i codici QR pronti da stampare. Ogni QR \u00e8 personalizzato con il nome del tuo ristorante.',
    highlightSelector: '[data-tour="add-table-btn"]',
    checkFn: ({ tablesCount }) => tablesCount > 0,
  },
  {
    id: 'configure',
    tab: 'settings',
    title: 'Configura le Impostazioni',
    shortDescription: 'Personalizza coperto, orari, pagamenti e attiva l\'abbonamento.',
    fullExplanation: 'Le impostazioni ti permettono di personalizzare ogni aspetto:\n\n\u2022 Generale \u2014 Nome ristorante, suoni notifica, modalit\u00e0 cameriere, menu sola lettura\n\u2022 Costi \u2014 Coperto (importo per persona, configurabile per giorno/fascia oraria), All You Can Eat (prezzo fisso, piatti inclusi)\n\u2022 Staff \u2014 Aggiungi camerieri con PIN personale per la dashboard cameriere\n\u2022 Prenotazioni \u2014 Attiva prenotazioni online, imposta durata e orari disponibili\n\u2022 Pagamenti \u2014 Stripe Connect per ricevere pagamenti online, dati fiscali (P.IVA, ragione sociale)\n\u2022 Abbonamento \u2014 Attiva il piano Minthi, gestisci fatturazione e metodo di pagamento\n\nPuoi sempre modificare queste impostazioni in seguito.',
    highlightSelector: '[data-tour="nav-settings"]',
    checkFn: () => false, // Never auto-complete — user decides when done
  },
]
