-- =====================================================================
-- MINTHI v2 · 010 · Fasce orarie: valori ereditati dai default
--   period.cover assente/null  -> cover_default
--   period.ayce assente        -> ayce_default
--   period.ayce = false        -> AYCE non disponibile
-- =====================================================================

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
    cover_price := coalesce(nullif(v_found ->> 'cover', '')::numeric, v_settings.cover_default);
    -- chiave assente = valore di default; false = AYCE non disponibile in questa fascia
    v_ayce := case when v_found ? 'ayce' then v_found -> 'ayce' else v_settings.ayce_default end;
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

