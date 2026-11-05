# MINTHI — Audit v1 (novembre 2026)

Audit del codice e del database di produzione (`bueovvvrgpwdcpkyocac`) prima della riscrittura v2.
Backup completo dei dati: schema privato `legacy_backup` (34 tabelle) nel progetto Supabase.

## 1. Sicurezza (critico)

| # | Problema | Impatto |
|---|---|---|
| S1 | Policy RLS `ALL ... USING (true)` per `anon` su `restaurants`, `restaurant_staff`, `tables`, `table_sessions`, `dishes`, `categories`, `rooms`, `bookings`, `cart_items`, `waiter_activity_logs` | Chiunque abbia la anon key (pubblica nel bundle JS) legge/modifica/cancella dati di **tutti** i ristoranti |
| S2 | `table_sessions.session_pin` leggibile da anon | Il PIN del tavolo è aggirabile |
| S3 | `restaurant_staff.password` (hash bcrypt) leggibile da anon | Brute-force offline delle password camerieri |
| S4 | `restaurants.waiter_password` in chiaro, default `waiter123` | Password condivisa e prevedibile |
| S5 | Le policy usano `auth.uid()` ma l'app **non usa Supabase Auth** (sessioni custom in `app_sessions`) | Metà delle policy sono inutili, l'altra metà è aperta |
| S6 | Policy duplicate/contraddittorie (3-5 per tabella) accumulate in 48 migration | RLS impossibile da ragionare |
| S7 | `secure-admin-action` espone `nuke_database` | Un bug di auth = DB cancellato |
| S8 | `app_config` UPDATE aperto a `public` | Chiunque cambia la configurazione della landing |
| S9 | Chiavi live (Stripe `sk_live`, OpenAPI `production`) usate anche in sviluppo | Test = soldi/scontrini veri. **Messo `OPENAPI_ENV=test`** |

## 2. Architettura

- **20 edge function `secure-*`** che replicano a mano un CRUD (con service role) solo per aggirare la RLS rotta. Con Supabase Auth + RLS corretta il CRUD va fatto direttamente via PostgREST.
- **Data layer monolitico**: `DatabaseService.ts` 2.586 righe, ~130 metodi.
- **Componenti giganti**: `RestaurantDashboard.tsx` 5.652 righe (chunk da 1,5 MB), `CustomerMenu.tsx` 3.620, `WaiterDashboard.tsx` 2.357.
- Nessuna cache dati condivisa (fetch + `useState` ovunque, cache manuale in localStorage).
- TypeScript non strict; build con `--noCheck`; nessun lint configurato; nessun test.
- Schema `restaurants` con **80+ colonne** (impostazioni AYCE, coperto, asporto, fiscale, Stripe, abbonamento tutto nella stessa riga).
- Config duplicata: orari pranzo/cena in colonne *e* in `weekly_service_hours`; AYCE in `all_you_can_eat` *e* `weekly_ayce` *e* `ayce_price`.
- 5 edge function deployate senza sorgente nel repo (rimosse).

## 3. UI / UX

- Identità incoerente: spinner verde (login), ambra (asporto), landing arancione+verde, logo diverso tra pagine.
- 3 librerie di icone (Phosphor, Lucide, Heroicons), 3 file CSS globali sovrapposti.
- Solo dark mode reale; colori hardcoded nelle classi invece che token.
- Mobile: pannelli dashboard non pensati per tablet di sala.

## 4. Inventario funzionale da preservare (v2 deve fare tutto questo)

**Piattaforma (admin)**: ristoranti (crea, sospendi, riattiva, elimina), token di invito con mesi gratis/sconto, bonus, abbonamenti Stripe e pagamenti, statistiche globali, QR fisici riassegnabili (`/qr/:code`), configurazione landing.

**Ristorante (owner)**: onboarding da invito + setup guidato + demo; sale e tavoli; categorie e piatti (foto, allergeni, IVA, codice breve, disponibilità, esclusione AYCE, limite AYCE a persona); menu personalizzati con programmazione oraria; coperto per giorno/fascia; All You Can Eat per giorno/fascia; orari di servizio settimanali; portate e suggerimento portate; menu sola consultazione; stile menu e colore; staff camerieri con permessi (pagamenti); analitiche (vendite, piatti, categorie, tempi di cottura, camerieri) con password dedicata; prenotazioni (timeline, durata, sale, pagina pubblica); impostazioni Stripe Connect (onboarding, dashboard Express, pagamenti online on/off); fiscale (OpenAPI: onboarding, credenziali AdE, IVA default, emissione automatica/manuale, email al cliente, PDF, storni, lotteria); stampa termica ESC/POS (USB/rete) e stampa automatica asporto.

**Sala/cucina**: attivazione tavolo con PIN e numero persone; ordini in tempo reale per tavolo e per piatto; stati piatto; consegna automatica dei piatti pronti; vista cucina con suoni; conto tavolo, divisione, pagamenti parziali, chiusura; richiesta assistenza; app cameriere (tavoli, ordini al posto del cliente, ordinamento drag&drop, log attività).

**Cliente al tavolo**: QR + PIN; menu con categorie, ricerca, allergeni; carrello condiviso realtime; portate; limiti AYCE; invio ordine; storico ordini; pagamento online (intero/quota); uscita automatica a tavolo chiuso.

**Asporto**: menu pubblico; dati cliente configurabili; numero ritiro giornaliero; codice/QR di ritiro con scanner; pagamento in cassa o Stripe obbligatorio; stato ordine realtime; schermo pubblico `/display`; limite ordini/ora; rate limit; pulizia e anonimizzazione dati.

## 5. Decisioni v2

Vedi [ARCHITECTURE.md](./ARCHITECTURE.md).
