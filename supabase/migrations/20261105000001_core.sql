-- =====================================================================
-- MINTHI v2 · 001 · Core: profili, ristoranti, membri, impostazioni
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Funzione generica updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Profili (1:1 con auth.users, solo utenti non anonimi)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username extensions.citext unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  email text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.profiles (id, full_name, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'username', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Ristoranti
-- ---------------------------------------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  address text,
  phone text,
  email text,
  logo_url text,
  timezone text not null default 'Europe/Rome',
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspension_reason text,
  setup_completed boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger restaurants_touch before update on public.restaurants
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Membri dello staff
--   owner   : tutto
--   manager : tutto tranne abbonamento / Stripe / fiscale / staff owner
--   waiter  : sala, ordini, conto (incasso se can_take_payments)
--   kitchen : vista cucina
-- ---------------------------------------------------------------------
create table public.memberships (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'waiter', 'kitchen')),
  display_name text not null default '',
  can_take_payments boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Helper di autorizzazione (usati dalle policy RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.has_role(p_restaurant_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = auth.uid()
      and m.is_active
      and m.role = any (p_roles)
  )
$$;

create or replace function public.is_member(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_restaurant_id, array['owner', 'manager', 'waiter', 'kitchen'])
$$;

create or replace function public.is_manager(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_restaurant_id, array['owner', 'manager'])
$$;

create or replace function public.is_owner(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_restaurant_id, array['owner'])
$$;

create or replace function public.can_take_payments(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager(p_restaurant_id) or exists (
    select 1 from public.memberships m
    where m.restaurant_id = p_restaurant_id and m.user_id = auth.uid()
      and m.is_active and m.role = 'waiter' and m.can_take_payments
  )
$$;

-- ---------------------------------------------------------------------
-- Impostazioni del ristorante (una riga per ristorante)
--
-- weekly_schedule: unica fonte di verità per orari, coperto e AYCE.
-- {
--   "days": [            -- 7 elementi, indice 0 = domenica
--     { "lunch":  { "start": "12:00", "end": "15:00",
--                   "cover": 2.5 | null,
--                   "ayce": { "price": 25, "maxRounds": 0, "intervalMin": 0 } | null },
--       "dinner": { ... } | null }
--   ]
-- }
-- Fuori dalle fasce valgono cover_default e ayce_default.
-- ---------------------------------------------------------------------
create table public.restaurant_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  dine_in_enabled boolean not null default true,
  view_only_menu boolean not null default false,
  courses_enabled boolean not null default false,
  course_suggestions_enabled boolean not null default false,
  show_prep_times boolean not null default false,
  auto_serve_ready_items boolean not null default false,
  weekly_schedule jsonb not null default '{"days": [null, null, null, null, null, null, null]}'::jsonb,
  cover_default numeric(8, 2) not null default 0 check (cover_default >= 0),
  ayce_default jsonb,
  menu_theme jsonb not null default '{"style": "elegant", "accent": "#10b981"}'::jsonb,
  reservations_enabled boolean not null default true,
  reservations_public boolean not null default true,
  reservation_duration_min integer not null default 120 check (reservation_duration_min between 15 and 600),
  reservation_room_selection boolean not null default false,
  active_custom_menu_id uuid,
  updated_at timestamptz not null default now()
);
create trigger restaurant_settings_touch before update on public.restaurant_settings
  for each row execute function public.touch_updated_at();

create table public.takeaway_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  require_online_payment boolean not null default false,
  estimated_minutes integer not null default 20 check (estimated_minutes between 1 and 240),
  pickup_notice text,
  auto_print boolean not null default false,
  max_orders_per_hour integer check (max_orders_per_hour is null or max_orders_per_hour > 0),
  auto_mark_picked_up boolean not null default false,
  pickup_mode text not null default 'code' check (pickup_mode in ('code', 'qr')),
  -- campi cliente: off | optional | required
  field_first_name text not null default 'required' check (field_first_name in ('off', 'optional', 'required')),
  field_last_name text not null default 'off' check (field_last_name in ('off', 'optional', 'required')),
  field_phone text not null default 'required' check (field_phone in ('off', 'optional', 'required')),
  field_email text not null default 'optional' check (field_email in ('off', 'optional', 'required')),
  updated_at timestamptz not null default now()
);
create trigger takeaway_settings_touch before update on public.takeaway_settings
  for each row execute function public.touch_updated_at();

-- Righe di default create insieme al ristorante
create or replace function public.handle_new_restaurant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.restaurant_settings (restaurant_id) values (new.id) on conflict do nothing;
  insert into public.takeaway_settings (restaurant_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_restaurant_created
  after insert on public.restaurants
  for each row execute function public.handle_new_restaurant();

-- ---------------------------------------------------------------------
-- Log attività staff
-- ---------------------------------------------------------------------
create table public.activity_log (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_restaurant_idx on public.activity_log(restaurant_id, created_at desc);

create or replace function public.log_activity(p_restaurant_id uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (restaurant_id, actor_id, action, details)
  values (p_restaurant_id, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------
-- Rate limit generico (finestra fissa)
-- ---------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null default 0
);

create or replace function public.hit_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
