-- =====================================================================
-- MINTHI v2 · 002 · Menu, sale, tavoli
-- =====================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index categories_restaurant_idx on public.categories(restaurant_id, sort_order);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  price numeric(10, 2) not null check (price >= 0),
  vat_rate_code text not null default '10' check (vat_rate_code in ('4', '5', '10', '22', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6')),
  allergens text[] not null default '{}',
  short_code text check (short_code is null or length(short_code) <= 12),
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,       -- visibile nel menu
  is_available boolean not null default true,    -- esaurito temporaneamente
  included_in_ayce boolean not null default false,
  ayce_max_per_person integer check (ayce_max_per_person is null or ayce_max_per_person > 0),
  takeaway_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dishes_restaurant_idx on public.dishes(restaurant_id, category_id, sort_order);
create trigger dishes_touch before update on public.dishes
  for each row execute function public.touch_updated_at();

-- Menu personalizzati (es. "Pranzo di lavoro", "Brunch domenica")
create table public.custom_menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index custom_menus_restaurant_idx on public.custom_menus(restaurant_id);
create trigger custom_menus_touch before update on public.custom_menus
  for each row execute function public.touch_updated_at();

alter table public.restaurant_settings
  add constraint restaurant_settings_active_menu_fk
  foreign key (active_custom_menu_id) references public.custom_menus(id) on delete set null;

create table public.custom_menu_dishes (
  custom_menu_id uuid not null references public.custom_menus(id) on delete cascade,
  dish_id uuid not null references public.dishes(id) on delete cascade,
  primary key (custom_menu_id, dish_id)
);

-- Programmazione automatica: giorno (0=dom) + fascia
create table public.custom_menu_schedules (
  id uuid primary key default gen_random_uuid(),
  custom_menu_id uuid not null references public.custom_menus(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  period text not null check (period in ('lunch', 'dinner')),
  unique (custom_menu_id, day_of_week, period)
);

-- ---------------------------------------------------------------------
-- Sale e tavoli
-- ---------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index rooms_restaurant_idx on public.rooms(restaurant_id, sort_order);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 30),
  seats integer not null default 4 check (seats between 1 and 100),
  -- token pubblico stampato nel QR (non è l'id interno)
  qr_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index tables_restaurant_idx on public.tables(restaurant_id, room_id, sort_order);

-- QR fisici riassegnabili (stampati dalla piattaforma)
create table public.physical_qr_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{6,32}$'),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  label text,
  assigned_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Calcolo fascia, coperto e AYCE in un istante
-- ---------------------------------------------------------------------
create or replace function public.pricing_at(p_restaurant_id uuid, p_at timestamptz default now())
returns table (
  period text,
  cover_price numeric,
  ayce_available boolean,
  ayce_price numeric,
  ayce_max_rounds integer,
  ayce_interval_min integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_local timestamp;
  v_time time;
  v_day jsonb;
  v_settings public.restaurant_settings;
  v_p text;
  v_cfg jsonb;
  v_found jsonb;
  v_found_period text;
  v_ayce jsonb;
begin
  select timezone into v_tz from public.restaurants where id = p_restaurant_id;
  select * into v_settings from public.restaurant_settings where restaurant_id = p_restaurant_id;
  if v_settings is null then
    return;
  end if;

  v_local := p_at at time zone coalesce(v_tz, 'Europe/Rome');
  v_time := v_local::time;
  v_day := v_settings.weekly_schedule -> 'days' -> extract(dow from v_local)::int;

  if v_day is not null and jsonb_typeof(v_day) = 'object' then
    foreach v_p in array array['lunch', 'dinner'] loop
      v_cfg := v_day -> v_p;
      if v_cfg is not null and jsonb_typeof(v_cfg) = 'object'
         and (v_cfg ->> 'start') is not null and (v_cfg ->> 'end') is not null then
        if ((v_cfg ->> 'start')::time < (v_cfg ->> 'end')::time
              and v_time >= (v_cfg ->> 'start')::time and v_time < (v_cfg ->> 'end')::time)
           or ((v_cfg ->> 'start')::time >= (v_cfg ->> 'end')::time
              and (v_time >= (v_cfg ->> 'start')::time or v_time < (v_cfg ->> 'end')::time)) then
          v_found := v_cfg;
          v_found_period := v_p;
          exit;
        end if;
      end if;
    end loop;
  end if;

  if v_found is not null then
    period := v_found_period;
    cover_price := coalesce((v_found ->> 'cover')::numeric, v_settings.cover_default);
    v_ayce := v_found -> 'ayce';
  else
    period := null;
    cover_price := v_settings.cover_default;
    v_ayce := v_settings.ayce_default;
  end if;

  if v_ayce is not null and jsonb_typeof(v_ayce) = 'object' then
    ayce_available := true;
    ayce_price := coalesce((v_ayce ->> 'price')::numeric, 0);
    ayce_max_rounds := coalesce((v_ayce ->> 'maxRounds')::int, 0);
    ayce_interval_min := coalesce((v_ayce ->> 'intervalMin')::int, 0);
  else
    ayce_available := false;
    ayce_price := 0;
    ayce_max_rounds := 0;
    ayce_interval_min := 0;
  end if;

  return next;
end $$;

-- Menu personalizzato attivo ora (manuale > programmato > nessuno)
create or replace function public.current_custom_menu(p_restaurant_id uuid, p_at timestamptz default now())
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_manual uuid;
  v_period text;
  v_dow int;
  v_tz text;
  v_menu uuid;
begin
  select active_custom_menu_id into v_manual from public.restaurant_settings where restaurant_id = p_restaurant_id;
  if v_manual is not null then
    return v_manual;
  end if;

  select period into v_period from public.pricing_at(p_restaurant_id, p_at);
  if v_period is null then
    return null;
  end if;

  select timezone into v_tz from public.restaurants where id = p_restaurant_id;
  v_dow := extract(dow from (p_at at time zone coalesce(v_tz, 'Europe/Rome')))::int;

  select s.custom_menu_id into v_menu
  from public.custom_menu_schedules s
  join public.custom_menus m on m.id = s.custom_menu_id
  where m.restaurant_id = p_restaurant_id and s.day_of_week = v_dow and s.period = v_period
  order by m.created_at
  limit 1;

  return v_menu;
end $$;

-- Piatti visibili ai clienti in questo momento
create or replace function public.visible_dish_ids(p_restaurant_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with menu as (select public.current_custom_menu(p_restaurant_id) as id)
  select d.id
  from public.dishes d
  left join public.categories c on c.id = d.category_id
  cross join menu
  where d.restaurant_id = p_restaurant_id
    and d.is_active
    and coalesce(c.is_active, true)
    and (menu.id is null or exists (
      select 1 from public.custom_menu_dishes cmd
      where cmd.custom_menu_id = menu.id and cmd.dish_id = d.id
    ))
$$;
