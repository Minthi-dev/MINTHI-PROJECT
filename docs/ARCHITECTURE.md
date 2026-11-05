# MINTHI v2 — Architettura

## Principi

1. **Supabase Auth vero** per tutti: owner/staff/admin con email+password (i camerieri entrano con username, mappato su un'email tecnica `username@staff.minthi.it`), clienti con **sessione anonima** Supabase.
2. **La sicurezza sta nel database**: RLS su ogni tabella, scritta una volta e leggibile. Il frontend legge/scrive direttamente via PostgREST quando la RLS basta; le operazioni con logica (ordine, PIN, conto) sono **RPC `security definer`** che ricalcolano prezzi e permessi lato server.
3. **Edge Functions solo dove servono segreti o servizi esterni**: Stripe, scontrini fiscali, email, creazione utenti. Da 39 a ~10.
4. **Un'unica fonte di verità** per ogni configurazione (niente colonne duplicate).
5. **Frontend a feature**, file piccoli, dati con TanStack Query + Realtime, tipi generati dal DB, validazione Zod.

## Ruoli

| Ruolo | Come entra | Cosa vede |
|---|---|---|
| `platform admin` | email | tutto (flag `profiles.is_platform_admin`) |
| `owner` | email | il proprio ristorante, tutto |
| `manager` | email/username | come owner, esclusi abbonamento/Stripe/fiscale |
| `waiter` | username | sala, ordini, conto (incasso se `can_take_payments`) |
| `kitchen` | username | solo vista cucina |
| cliente tavolo | anonimo + PIN | menu, carrello e ordini della **propria** sessione |
| cliente asporto/prenotazione | anonimo | menu pubblico, il **proprio** ordine/prenotazione |

Helper SQL (`security definer stable`): `is_platform_admin()`, `has_role(restaurant_id, roles[])`, `is_member(restaurant_id)`, `is_session_guest(session_id)`.

## Moduli DB

- **Core**: `profiles`, `restaurants`, `memberships`, `restaurant_settings`, `takeaway_settings`
- **Sala**: `rooms`, `tables`, `table_sessions`, `session_secrets` (PIN, solo staff), `session_guests`, `pin_attempts`
- **Menu**: `categories`, `dishes`, `custom_menus`, `custom_menu_dishes`, `custom_menu_schedules`
- **Ordini**: `cart_items`, `orders` (tavolo + asporto), `order_items` (snapshot prezzo/IVA), `payments` (unificati), `pickup_counters`
- **Prenotazioni**: `bookings`
- **Fiscale**: `fiscal_settings`, `fiscal_receipts`, `fiscal_jobs` (outbox con provider: `openapi`, in futuro `rt_epson`)
- **Pagamenti/abbonamenti**: `billing_accounts`, `subscription_payments`, `invites`, `restaurant_bonuses`
- **Piattaforma**: `platform_config`, `physical_qr_codes`, `rate_limits`, `activity_log`

Schedule unico per giorno/fascia (`restaurant_settings.weekly_schedule`): orari, coperto e AYCE insieme.

## Edge Functions

| Funzione | Scopo |
|---|---|
| `staff` | crea/modifica/elimina account staff (service role su Auth) |
| `admin` | operazioni piattaforma: ristoranti, inviti, bonus, sospensioni |
| `register` | onboarding da invito: crea owner + ristorante |
| `stripe-connect` | onboarding, account session, dashboard Express, stato |
| `checkout` | pagamento conto tavolo, asporto, abbonamento |
| `stripe-webhook` | eventi Stripe (firma verificata), idempotente |
| `refund` | rimborsi Stripe |
| `fiscal` | configurazione esercente, emissione manuale, storno, PDF |
| `fiscal-worker` | consuma `fiscal_jobs` (pg_cron ogni minuto) |
| `fiscal-webhook` | esiti dal provider |

## Frontend

```
src/
  app/            router, provider, layout
  features/
    auth/ admin/ onboarding/ dashboard/ tables/ orders/ kitchen/
    menu/ reservations/ takeaway/ analytics/ settings/ billing/ fiscal/
    customer/ landing/ printing/
  shared/
    ui/           design system (shadcn rivisto, token)
    lib/          supabase, query client, format, errori
    hooks/
  types/database.ts   generato dal DB
```

Stack: React 19, TypeScript strict, Vite, Tailwind 4 con token CSS (light/dark), shadcn/Radix, Lucide, TanStack Query, React Router, react-hook-form + Zod, Sonner, Recharts, Capacitor (iOS).
