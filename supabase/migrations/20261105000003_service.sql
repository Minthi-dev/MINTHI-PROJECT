-- =====================================================================
-- MINTHI v2 · 003 · Servizio: sessioni tavolo, carrello, ordini,
--                   pagamenti, prenotazioni
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sessione tavolo: dall'apertura alla chiusura del conto.
-- I prezzi di coperto e AYCE sono "congelati" all'apertura.
-- ---------------------------------------------------------------------
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  guests integer not null default 1 check (guests between 1 and 100),
  cover_price numeric(8, 2) not null default 0,
  ayce boolean not null default false,
  ayce_price numeric(8, 2) not null default 0,
  ayce_max_rounds integer not null default 0,
  ayce_interval_min integer not null default 0,
  notes text not null default '',
  assistance_requested_at timestamptz,
  customer_email text,
  customer_tax_code text,
  customer_lottery_code text,
  opened_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
-- Un solo tavolo aperto per volta
create unique index table_sessions_one_open on public.table_sessions(table_id) where status = 'open';
create index table_sessions_restaurant_idx on public.table_sessions(restaurant_id, status, opened_at desc);
create trigger table_sessions_touch before update on public.table_sessions
  for each row execute function public.touch_updated_at();

-- Il PIN sta in una tabella separata leggibile solo dallo staff
create table public.session_secrets (
  session_id uuid primary key references public.table_sessions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  pin text not null check (pin ~ '^[0-9]{4}$')
);

-- Clienti (utenti anonimi) che hanno inserito il PIN corretto
create table public.session_guests (
  session_id uuid not null references public.table_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index session_guests_user_idx on public.session_guests(user_id);

create table public.pin_attempts (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid,
  attempted_at timestamptz not null default now()
);
create index pin_attempts_table_idx on public.pin_attempts(table_id, attempted_at desc);

create or replace function public.is_session_guest(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.session_guests g
    join public.table_sessions s on s.id = g.session_id
    where g.session_id = p_session_id and g.user_id = auth.uid() and s.status = 'open'
  )
$$;

-- ---------------------------------------------------------------------
-- Carrello condiviso del tavolo
-- ---------------------------------------------------------------------
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete cascade,
  dish_id uuid not null references public.dishes(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 99),
  notes text check (notes is null or length(notes) <= 300),
  course integer not null default 1 check (course between 1 and 9),
  added_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cart_items_session_idx on public.cart_items(session_id);
create trigger cart_items_touch before update on public.cart_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Ordini (tavolo e asporto)
--   tavolo  : submitted | cancelled
--   asporto : awaiting_payment | received | preparing | ready | picked_up | cancelled
-- ---------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind text not null check (kind in ('dine_in', 'takeaway')),
  session_id uuid references public.table_sessions(id) on delete set null,
  status text not null check (status in ('submitted', 'awaiting_payment', 'received', 'preparing', 'ready', 'picked_up', 'cancelled')),
  total numeric(10, 2) not null default 0,
  placed_by uuid references auth.users(id) on delete set null,
  placed_by_staff boolean not null default false,
  -- asporto
  pickup_number integer,
  pickup_code text,
  pickup_token text unique,
  customer_first_name text,
  customer_last_name text,
  customer_phone text,
  customer_email text,
  customer_notes text,
  customer_tax_code text,
  customer_lottery_code text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded', 'partially_refunded')),
  paid_amount numeric(10, 2) not null default 0,
  ready_at timestamptz,
  picked_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'dine_in' and session_id is not null and status in ('submitted', 'cancelled'))
      or (kind = 'takeaway' and status <> 'submitted'))
);
create index orders_restaurant_idx on public.orders(restaurant_id, created_at desc);
create index orders_session_idx on public.orders(session_id);
create index orders_takeaway_active_idx on public.orders(restaurant_id, status) where kind = 'takeaway';
create unique index orders_pickup_code_idx on public.orders(restaurant_id, pickup_code) where pickup_code is not null;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id uuid references public.table_sessions(id) on delete set null,
  dish_id uuid references public.dishes(id) on delete set null,
  dish_name text not null,
  unit_price numeric(10, 2) not null,          -- 0 se incluso nell'AYCE
  list_price numeric(10, 2) not null,          -- prezzo di listino al momento
  vat_rate_code text not null,
  quantity integer not null check (quantity between 1 and 99),
  notes text,
  course integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'preparing', 'ready', 'served', 'cancelled')),
  picked_quantity integer not null default 0,
  paid_quantity integer not null default 0,
  ready_at timestamptz,
  served_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_kitchen_idx on public.order_items(restaurant_id, status) where status in ('pending', 'preparing', 'ready');
create index order_items_session_idx on public.order_items(session_id);

-- Numero di ritiro progressivo giornaliero
create table public.pickup_counters (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  day date not null,
  last_number integer not null default 0,
  primary key (restaurant_id, day)
);

-- ---------------------------------------------------------------------
-- Pagamenti (unificati: conto tavolo e asporto, contanti/POS/Stripe)
-- ---------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id uuid references public.table_sessions(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  method text not null check (method in ('cash', 'card', 'stripe', 'voucher', 'other')),
  status text not null default 'succeeded' check (status in ('pending', 'succeeded', 'refunded', 'failed')),
  amount numeric(10, 2) not null check (amount > 0),
  refunded_amount numeric(10, 2) not null default 0,
  label text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_receipt_url text,
  -- voci saldate con questo pagamento: [{ "orderItemId": "...", "quantity": 1 }]
  items jsonb,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (session_id is not null or order_id is not null)
);
create index payments_restaurant_idx on public.payments(restaurant_id, created_at desc);
create index payments_session_idx on public.payments(session_id);
create index payments_order_idx on public.payments(order_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Prenotazioni
-- ---------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text,
  email text,
  starts_at timestamptz not null,
  duration_min integer not null default 120 check (duration_min between 15 and 600),
  guests integer not null check (guests between 1 and 100),
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  source text not null default 'staff' check (source in ('staff', 'public')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_restaurant_idx on public.bookings(restaurant_id, starts_at);
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();
