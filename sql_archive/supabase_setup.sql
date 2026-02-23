-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- -------------------------------------------------
-- DROP existing tables (safe re-run)
-- -------------------------------------------------
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.table_sessions cascade;
drop table if exists public.bookings cascade;
drop table if exists public.tables cascade;
drop table if exists public.dishes cascade;
drop table if exists public.categories cascade;
drop table if exists public.restaurant_staff cascade;
drop table if exists public.users cascade;
drop table if exists public.restaurants cascade;

-- Legacy drops (cleanup)
drop table if exists public.menu_items cascade;
drop table if exists public.menu_categories cascade;
drop table if exists public.reservations cascade;


-- -------------------------------------------------
-- CREATE tables (Normalized Schema with UUIDs)
-- -------------------------------------------------

-- 1. Users (Global users)
create table public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  name text,
  password_hash text,
  role text not null check (role in ('ADMIN', 'OWNER', 'STAFF', 'CUSTOMER')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Restaurants
create table public.restaurants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  owner_id uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Restaurant Staff (Link users to restaurants)
create table public.restaurant_staff (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id),
  restaurant_id uuid references public.restaurants(id),
  role text not null check (role in ('OWNER', 'STAFF')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Categories (Menu Categories)
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  restaurant_id uuid references public.restaurants(id),
  "order" integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Dishes (Menu Items)
create table public.dishes (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  price decimal(10,2) not null,
  vat_rate decimal(5,2) default 0,
  category_id uuid references public.categories(id),
  restaurant_id uuid references public.restaurants(id),
  is_active boolean default true,
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Tables
create table public.tables (
  id uuid primary key default uuid_generate_v4(),
  number text not null, -- e.g. "Tavolo 1"
  restaurant_id uuid references public.restaurants(id),
  token text unique default uuid_generate_v4()::text, -- For QR Code
  pin text, -- For manual access
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Table Sessions (Tracks a group of customers at a table)
create table public.table_sessions (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants(id),
  table_id uuid references public.tables(id),
  status text not null check (status in ('OPEN', 'CLOSED')) default 'OPEN',
  opened_at timestamp with time zone default timezone('utc'::text, now()) not null,
  closed_at timestamp with time zone
);

-- 8. Orders (An order belongs to a session)
create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants(id),
  table_session_id uuid references public.table_sessions(id),
  status text not null check (status in ('OPEN', 'PAID', 'CANCELLED')) default 'OPEN',
  total_amount decimal(10,2) default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  closed_at timestamp with time zone
);

-- 9. Order Items (Individual items in an order)
create table public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id),
  dish_id uuid references public.dishes(id),
  quantity integer not null default 1,
  note text,
  status text not null check (status in ('PENDING', 'IN_PREPARATION', 'READY', 'SERVED')) default 'PENDING',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 10. Bookings
create table public.bookings (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants(id),
  name text not null,
  email text,
  phone text,
  date_time timestamp with time zone not null,
  guests integer not null,
  notes text,
  status text default 'CONFIRMED',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- -------------------------------------------------
-- Row Level Security (RLS)
-- -------------------------------------------------
alter table public.users enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_staff enable row level security;
alter table public.categories enable row level security;
alter table public.dishes enable row level security;
alter table public.tables enable row level security;
alter table public.table_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.bookings enable row level security;

-- -------------------------------------------------
-- Policies (Allow ALL for development/demo)
-- -------------------------------------------------
create policy "Enable all access for all users" on public.users for all using (true);
create policy "Enable all access for all users" on public.restaurants for all using (true);
create policy "Enable all access for all users" on public.restaurant_staff for all using (true);
create policy "Enable all access for all users" on public.categories for all using (true);
create policy "Enable all access for all users" on public.dishes for all using (true);
create policy "Enable all access for all users" on public.tables for all using (true);
create policy "Enable all access for all users" on public.table_sessions for all using (true);
create policy "Enable all access for all users" on public.orders for all using (true);
create policy "Enable all access for all users" on public.order_items for all using (true);
create policy "Enable all access for all users" on public.bookings for all using (true);

-- -------------------------------------------------
-- Realtime
-- -------------------------------------------------
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.table_sessions;
alter publication supabase_realtime add table public.tables;
