# MINTHI

Gestionale per ristoranti, bar ed eventi: menu digitale con ordini dal tavolo via QR, cucina e sala in tempo reale, asporto, prenotazioni, pagamenti online e scontrini elettronici.

**Stack**: React 19 · TypeScript (strict) · Vite · Tailwind CSS 4 · TanStack Query · Supabase (PostgreSQL 17, Auth, Realtime, Storage, Edge Functions) · Stripe Connect · OpenAPI.it · Capacitor (iOS)

## Funzionalità

| Area | Cosa fa |
|---|---|
| **Sala** | Mappa tavoli in tempo reale, apertura con PIN, ordini per conto del cliente, conto, incassi (contanti/carta/buoni), spostamento tavolo, chiamate dal tavolo |
| **Cliente al tavolo** | QR + PIN, menu con allergeni, carrello condiviso realtime, portate, All You Can Eat con limiti, stato dei piatti, pagamento del conto (intero o diviso) |
| **Cucina** | Comande per ordine con segnale acustico, avanzamento piatti, stampa automatica ESC/POS |
| **Asporto** | Menu online, numero e codice di ritiro, pagamento online o al banco, ritiro con QR, schermo pubblico dei numeri |
| **Prenotazioni** | Pagina pubblica, elenco e timeline per tavolo, stati |
| **Menu** | Categorie, piatti con foto, IVA, allergeni, codici rapidi; menu speciali programmati per giorno e fascia |
| **Prezzi** | Coperto e AYCE per fascia oraria, congelati all'apertura del tavolo |
| **Pagamenti** | Stripe Connect Express (direct charge sul conto del locale), rimborsi |
| **Scontrini** | Documento commerciale online via OpenAPI.it con coda idempotente e retry, PDF, annullo, invio email |
| **Staff** | Ruoli titolare / responsabile / sala / cucina, accesso con username personale |
| **Admin piattaforma** | Ristoranti, inviti con mesi gratuiti, abbonamenti, QR fisici riassegnabili, configurazione landing |

## Architettura

Vedi [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e l'audit della v1 in [`docs/AUDIT.md`](docs/AUDIT.md).

- La sicurezza è nel database: **RLS su ogni tabella**, grant per colonna sui campi sensibili, logica di business in **RPC `security definer`** che ricalcolano sempre prezzi e permessi.
- Le **Edge Functions** (10) servono solo dove ci sono segreti o servizi esterni: Stripe, scontrini, creazione account staff, admin.
- Il frontend è organizzato **per funzionalità** (`src/features/*`) con un **design system** condiviso (`src/shared/ui`).

```
src/
  app/          router, provider, stili globali
  features/     auth, shell, floor, orders, kitchen, takeaway, reservations,
                menu, analytics, settings, account, admin, customer, public,
                landing, printing, menu-view
  shared/       ui (componenti), lib (supabase, api, format), hooks
  types/        database.ts generato dallo schema
supabase/
  migrations/   schema v2 (tabelle, RPC, RLS, cron)
  functions/    edge functions Deno
  tests/        smoke test SQL eseguito in transazione con rollback
```

## Sviluppo

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

| Comando | |
|---|---|
| `npm run dev` | server di sviluppo |
| `npm run build` | typecheck + build di produzione |
| `npm run typecheck` | solo TypeScript |
| `npm run db:test -- <project-ref>` | applica schema + smoke test in transazione e fa rollback (non modifica nulla) |
| `npm run db:types` | rigenera `src/types/database.ts` |
| `npm run ios:sync` | build e sincronizzazione del progetto iOS |

Le variabili `SUPABASE_ACCESS_TOKEN` servono agli script `db:*`.

### Segreti delle Edge Functions

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `OPENAPI_ENV` (`test` | `production`), `OPENAPI_EMAIL`, `OPENAPI_API_KEY`, `OPENAPI_WEBHOOK_SECRET`, `MINTHI_INTERNAL_KEY`, opzionali `RESEND_API_KEY`, `MINTHI_EMAIL_FROM`, `MINTHI_APP_URL`.

Nel Vault del database: `minthi_functions_url` e `minthi_internal_key` (usati dal job pianificato del worker fiscale).

### Stampante termica in rete

Sul PC del locale: `npm install ws && node printer-relay.js <IP_STAMPANTE>`, poi in *Impostazioni → Stampante* scegli "Rete".

## Licenza

Vedi [LICENSE](LICENSE).
