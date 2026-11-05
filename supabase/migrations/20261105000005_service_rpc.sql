-- =====================================================================
-- MINTHI v2 · 005 · Logica del servizio (RPC)
-- Tutte le funzioni ricalcolano prezzi e permessi lato server.
-- =====================================================================

create or replace function public.raise_app_error(p_code text, p_message text)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_message, hint = p_code;
end $$;

create or replace function public.random_pin()
returns text language sql volatile as $$
  select lpad((floor(random() * 10000))::int::text, 4, '0')
$$;

-- ---------------------------------------------------------------------
-- Info pubbliche del ristorante (pagine cliente, asporto, prenotazioni)
-- ---------------------------------------------------------------------
create or replace function public.get_public_restaurant(p_restaurant_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'logoUrl', r.logo_url,
    'address', r.address,
    'phone', r.phone,
    'timezone', r.timezone,
    'isActive', r.status = 'active',
    'theme', s.menu_theme,
    'dineInEnabled', s.dine_in_enabled,
    'viewOnlyMenu', s.view_only_menu,
    'coursesEnabled', s.courses_enabled,
    'showPrepTimes', s.show_prep_times,
    'weeklySchedule', s.weekly_schedule,
    'reservations', jsonb_build_object(
      'enabled', s.reservations_enabled and s.reservations_public,
      'durationMin', s.reservation_duration_min,
      'roomSelection', s.reservation_room_selection,
      'rooms', case when s.reservation_room_selection then coalesce((
        select jsonb_agg(jsonb_build_object('id', rm.id, 'name', rm.name) order by rm.sort_order)
        from public.rooms rm where rm.restaurant_id = r.id and rm.is_active), '[]'::jsonb) else '[]'::jsonb end
    ),
    'takeaway', jsonb_build_object(
      'enabled', t.enabled,
      'requireOnlinePayment', t.require_online_payment,
      'estimatedMinutes', t.estimated_minutes,
      'pickupNotice', t.pickup_notice,
      'pickupMode', t.pickup_mode,
      'fields', jsonb_build_object(
        'firstName', t.field_first_name, 'lastName', t.field_last_name,
        'phone', t.field_phone, 'email', t.field_email)
    ),
    'onlinePayments', coalesce(sa.online_payments_enabled and sa.charges_enabled, false)
  )
  from public.restaurants r
  join public.restaurant_settings s on s.restaurant_id = r.id
  join public.takeaway_settings t on t.restaurant_id = r.id
  left join public.stripe_accounts sa on sa.restaurant_id = r.id
  where r.id = p_restaurant_id
$$;

-- Menu visibile adesso (categorie + piatti)
create or replace function public.get_public_menu(p_restaurant_id uuid, p_context text default 'table')
returns jsonb language sql stable security definer set search_path = public as $$
  with vis as (select public.visible_dish_ids(p_restaurant_id) as id),
  d as (
    select d.* from public.dishes d
    join vis on vis.id = d.id
    where p_context <> 'takeaway' or d.takeaway_available
  )
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order, c.name)
      from public.categories c
      where c.restaurant_id = p_restaurant_id and c.is_active
        and exists (select 1 from d where d.category_id = c.id)
    ), '[]'::jsonb),
    'dishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'categoryId', d.category_id, 'name', d.name, 'description', d.description,
        'price', d.price, 'allergens', to_jsonb(d.allergens), 'imageUrl', d.image_url,
        'isAvailable', d.is_available, 'includedInAyce', d.included_in_ayce,
        'ayceMaxPerPerson', d.ayce_max_per_person, 'shortCode', d.short_code
      ) order by d.sort_order, d.name)
      from d
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- QR tavolo
-- ---------------------------------------------------------------------
create or replace function public.get_table_entry(p_qr_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tableId', t.id,
    'tableName', t.name,
    'restaurantId', t.restaurant_id,
    'hasOpenSession', exists (select 1 from public.table_sessions s where s.table_id = t.id and s.status = 'open'),
    'restaurant', public.get_public_restaurant(t.restaurant_id)
  )
  from public.tables t
  where t.qr_token = p_qr_token and t.is_active
$$;

create or replace function public.resolve_qr_code(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select restaurant_id from public.physical_qr_codes where code = lower(p_code)
$$;

-- Il cliente (utente anonimo) entra nel tavolo col PIN
create or replace function public.join_table(p_qr_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_table public.tables;
  v_session public.table_sessions;
  v_pin text;
  v_failures integer;
begin
  if auth.uid() is null then
    perform public.raise_app_error('auth_required', 'Sessione non valida, ricarica la pagina.');
  end if;

  select * into v_table from public.tables where qr_token = p_qr_token and is_active;
  if v_table is null then
    perform public.raise_app_error('table_not_found', 'Tavolo non trovato.');
  end if;

  select * into v_session from public.table_sessions where table_id = v_table.id and status = 'open';
  if v_session is null then
    perform public.raise_app_error('table_closed', 'Il tavolo non è ancora stato aperto. Chiedi al personale.');
  end if;

  -- già dentro: niente PIN
  if exists (select 1 from public.session_guests where session_id = v_session.id and user_id = auth.uid()) then
    return jsonb_build_object('sessionId', v_session.id, 'restaurantId', v_session.restaurant_id);
  end if;

  select count(*) into v_failures from public.pin_attempts
  where table_id = v_table.id and user_id = auth.uid() and attempted_at > now() - interval '10 minutes';
  if v_failures >= 5 then
    perform public.raise_app_error('too_many_attempts', 'Troppi tentativi. Riprova tra qualche minuto.');
  end if;

  select pin into v_pin from public.session_secrets where session_id = v_session.id;
  if v_pin is distinct from trim(coalesce(p_pin, '')) then
    -- niente eccezione: il tentativo deve restare registrato
    insert into public.pin_attempts (table_id, user_id) values (v_table.id, auth.uid());
    return jsonb_build_object('error', 'wrong_pin', 'message', 'PIN non corretto.', 'attemptsLeft', greatest(0, 4 - v_failures));
  end if;

  insert into public.session_guests (session_id, user_id) values (v_session.id, auth.uid())
  on conflict do nothing;

  return jsonb_build_object('sessionId', v_session.id, 'restaurantId', v_session.restaurant_id);
end $$;

-- ---------------------------------------------------------------------
-- Apertura / gestione tavolo (staff)
-- ---------------------------------------------------------------------
create or replace function public.open_table_session(
  p_table_id uuid,
  p_guests integer,
  p_ayce boolean default false,
  p_cover boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_table public.tables;
  v_pricing record;
  v_session_id uuid;
  v_pin text := public.random_pin();
begin
  select * into v_table from public.tables where id = p_table_id;
  if v_table is null or not public.has_role(v_table.restaurant_id, array['owner', 'manager', 'waiter']) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  if exists (select 1 from public.table_sessions where table_id = p_table_id and status = 'open') then
    perform public.raise_app_error('already_open', 'Il tavolo è già aperto.');
  end if;

  select * into v_pricing from public.pricing_at(v_table.restaurant_id, now());
  if p_ayce and not coalesce(v_pricing.ayce_available, false) then
    perform public.raise_app_error('ayce_unavailable', 'All You Can Eat non disponibile in questa fascia.');
  end if;

  insert into public.table_sessions (
    restaurant_id, table_id, guests, cover_price, ayce, ayce_price, ayce_max_rounds, ayce_interval_min, opened_by
  ) values (
    v_table.restaurant_id, p_table_id, greatest(1, p_guests),
    case when p_cover then coalesce(v_pricing.cover_price, 0) else 0 end,
    p_ayce,
    case when p_ayce then v_pricing.ayce_price else 0 end,
    case when p_ayce then v_pricing.ayce_max_rounds else 0 end,
    case when p_ayce then v_pricing.ayce_interval_min else 0 end,
    auth.uid()
  ) returning id into v_session_id;

  insert into public.session_secrets (session_id, restaurant_id, pin) values (v_session_id, v_table.restaurant_id, v_pin);
  perform public.log_activity(v_table.restaurant_id, 'table_opened',
    jsonb_build_object('tableId', p_table_id, 'table', v_table.name, 'guests', p_guests, 'ayce', p_ayce));

  return jsonb_build_object('sessionId', v_session_id, 'pin', v_pin);
end $$;

create or replace function public.regenerate_session_pin(p_session_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid;
  v_pin text := public.random_pin();
begin
  select restaurant_id into v_rid from public.table_sessions where id = p_session_id and status = 'open';
  if v_rid is null or not public.has_role(v_rid, array['owner', 'manager', 'waiter']) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  update public.session_secrets set pin = v_pin where session_id = p_session_id;
  return v_pin;
end $$;

create or replace function public.move_table_session(p_session_id uuid, p_table_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.table_sessions;
  v_target public.tables;
begin
  select * into v_session from public.table_sessions where id = p_session_id and status = 'open';
  select * into v_target from public.tables where id = p_table_id and is_active;
  if v_session is null or v_target is null or v_target.restaurant_id <> v_session.restaurant_id
     or not public.has_role(v_session.restaurant_id, array['owner', 'manager', 'waiter']) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  if exists (select 1 from public.table_sessions where table_id = p_table_id and status = 'open') then
    perform public.raise_app_error('already_open', 'Il tavolo di destinazione è occupato.');
  end if;
  update public.table_sessions set table_id = p_table_id where id = p_session_id;
  perform public.log_activity(v_session.restaurant_id, 'table_moved',
    jsonb_build_object('sessionId', p_session_id, 'to', v_target.name));
end $$;

create or replace function public.set_assistance(p_session_id uuid, p_requested boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid;
begin
  select restaurant_id into v_rid from public.table_sessions where id = p_session_id and status = 'open';
  if v_rid is null then
    perform public.raise_app_error('not_found', 'Tavolo non trovato.');
  end if;
  if p_requested then
    if not (public.is_session_guest(p_session_id) or public.is_member(v_rid)) then
      perform public.raise_app_error('forbidden', 'Non autorizzato.');
    end if;
    if not public.hit_rate_limit('assist:' || p_session_id, 3, interval '2 minutes') then
      perform public.raise_app_error('rate_limited', 'Richiesta già inviata, il personale arriva.');
    end if;
    update public.table_sessions set assistance_requested_at = now() where id = p_session_id;
  else
    if not public.is_member(v_rid) then
      perform public.raise_app_error('forbidden', 'Non autorizzato.');
    end if;
    update public.table_sessions set assistance_requested_at = null where id = p_session_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Invio ordine dal tavolo
--   p_items null  -> usa il carrello condiviso (cliente)
--   p_items json  -> [{ "dishId", "quantity", "notes", "course" }] (staff)
-- ---------------------------------------------------------------------
create or replace function public.submit_order(p_session_id uuid, p_items jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session public.table_sessions;
  v_is_staff boolean;
  v_items jsonb;
  v_order_id uuid;
  v_total numeric := 0;
  v_rounds integer;
  v_last timestamptz;
  v_item jsonb;
  v_dish public.dishes;
  v_qty integer;
  v_already integer;
  v_unit numeric;
  v_restaurant_status text;
  v_view_only boolean;
begin
  select * into v_session from public.table_sessions where id = p_session_id for update;
  if v_session is null or v_session.status <> 'open' then
    perform public.raise_app_error('table_closed', 'Il tavolo è chiuso.');
  end if;

  v_is_staff := public.has_role(v_session.restaurant_id, array['owner', 'manager', 'waiter']);
  if not v_is_staff and not public.is_session_guest(p_session_id) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;

  select r.status, s.view_only_menu into v_restaurant_status, v_view_only
  from public.restaurants r join public.restaurant_settings s on s.restaurant_id = r.id
  where r.id = v_session.restaurant_id;
  if v_restaurant_status <> 'active' then
    perform public.raise_app_error('restaurant_inactive', 'Il ristorante non accetta ordini al momento.');
  end if;
  if v_view_only and not v_is_staff then
    perform public.raise_app_error('view_only', 'Il menu è in sola consultazione: ordina al personale.');
  end if;

  if p_items is null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'dishId', dish_id, 'quantity', quantity, 'notes', notes, 'course', course)), '[]'::jsonb)
    into v_items from public.cart_items where session_id = p_session_id;
  else
    v_items := p_items;
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    perform public.raise_app_error('empty_order', 'Il carrello è vuoto.');
  end if;
  if jsonb_array_length(v_items) > 100 then
    perform public.raise_app_error('too_many_items', 'Troppe righe in un solo ordine.');
  end if;

  -- Limiti AYCE (turni e intervallo) valgono per i clienti, non per lo staff
  if v_session.ayce and not v_is_staff then
    select count(*), max(created_at) into v_rounds, v_last
    from public.orders where session_id = p_session_id and status <> 'cancelled';
    if v_session.ayce_max_rounds > 0 and v_rounds >= v_session.ayce_max_rounds then
      perform public.raise_app_error('ayce_rounds', 'Hai raggiunto il numero massimo di ordini.');
    end if;
    if v_session.ayce_interval_min > 0 and v_last is not null
       and v_last > now() - make_interval(mins => v_session.ayce_interval_min) then
      perform public.raise_app_error('ayce_interval',
        'Potrai ordinare di nuovo alle ' || to_char((v_last + make_interval(mins => v_session.ayce_interval_min))
          at time zone (select timezone from public.restaurants where id = v_session.restaurant_id), 'HH24:MI') || '.');
    end if;
  end if;

  insert into public.orders (restaurant_id, kind, session_id, status, placed_by, placed_by_staff)
  values (v_session.restaurant_id, 'dine_in', p_session_id, 'submitted', auth.uid(), v_is_staff)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty < 1 or v_qty > 99 then
      perform public.raise_app_error('invalid_quantity', 'Quantità non valida.');
    end if;

    select * into v_dish from public.dishes
    where id = (v_item ->> 'dishId')::uuid and restaurant_id = v_session.restaurant_id;
    if v_dish is null or not v_dish.is_active then
      perform public.raise_app_error('dish_unavailable', 'Un piatto non è più disponibile.');
    end if;
    if not v_dish.is_available then
      perform public.raise_app_error('dish_unavailable', v_dish.name || ' è esaurito.');
    end if;
    if not v_is_staff and not exists (select 1 from public.visible_dish_ids(v_session.restaurant_id) x where x = v_dish.id) then
      perform public.raise_app_error('dish_unavailable', v_dish.name || ' non è nel menu in questo momento.');
    end if;

    if v_session.ayce and v_dish.included_in_ayce then
      v_unit := 0;
      if v_dish.ayce_max_per_person is not null and not v_is_staff then
        select coalesce(sum(oi.quantity), 0) into v_already
        from public.order_items oi
        where oi.session_id = p_session_id and oi.dish_id = v_dish.id and oi.status <> 'cancelled';
        if v_already + v_qty > v_dish.ayce_max_per_person * v_session.guests then
          perform public.raise_app_error('ayce_dish_limit',
            v_dish.name || ': massimo ' || (v_dish.ayce_max_per_person * v_session.guests) || ' per il tavolo.');
        end if;
      end if;
    else
      v_unit := v_dish.price;
    end if;

    insert into public.order_items (
      order_id, restaurant_id, session_id, dish_id, dish_name, unit_price, list_price, vat_rate_code,
      quantity, notes, course
    ) values (
      v_order_id, v_session.restaurant_id, p_session_id, v_dish.id, v_dish.name, v_unit, v_dish.price,
      v_dish.vat_rate_code, v_qty, nullif(left(trim(coalesce(v_item ->> 'notes', '')), 300), ''),
      greatest(1, least(9, coalesce((v_item ->> 'course')::int, 1)))
    );
    v_total := v_total + v_unit * v_qty;
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  if p_items is null then
    delete from public.cart_items where session_id = p_session_id;
  end if;

  return v_order_id;
end $$;

-- ---------------------------------------------------------------------
-- Stato dei piatti (cucina / sala)
-- ---------------------------------------------------------------------
create or replace function public.set_items_status(p_item_ids uuid[], p_status text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if p_status not in ('pending', 'preparing', 'ready', 'served', 'cancelled') then
    perform public.raise_app_error('invalid_status', 'Stato non valido.');
  end if;
  if exists (
    select 1 from public.order_items oi where oi.id = any (p_item_ids)
      and not public.is_member(oi.restaurant_id)
  ) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  if p_status = 'cancelled' and exists (
    select 1 from public.order_items oi where oi.id = any (p_item_ids)
      and not public.has_role(oi.restaurant_id, array['owner', 'manager', 'waiter'])
  ) then
    perform public.raise_app_error('forbidden', 'Solo la sala può annullare un piatto.');
  end if;

  update public.order_items oi set
    status = p_status,
    ready_at = case when p_status = 'ready' then coalesce(oi.ready_at, now())
                    when p_status in ('pending', 'preparing') then null else oi.ready_at end,
    served_at = case when p_status = 'served' then coalesce(oi.served_at, now())
                     when p_status <> 'served' then null else oi.served_at end
  where oi.id = any (p_item_ids) and oi.status <> 'cancelled';
  get diagnostics v_count = row_count;

  -- consegna automatica: pronto => servito
  if p_status = 'ready' then
    update public.order_items oi set status = 'served', served_at = now()
    from public.restaurant_settings s, public.orders o
    where oi.id = any (p_item_ids) and o.id = oi.order_id and o.kind = 'dine_in'
      and s.restaurant_id = oi.restaurant_id and s.auto_serve_ready_items;
  end if;

  -- totale ordine aggiornato se si annulla
  if p_status = 'cancelled' then
    update public.orders o set total = coalesce((
      select sum(oi.unit_price * oi.quantity) from public.order_items oi
      where oi.order_id = o.id and oi.status <> 'cancelled'), 0)
    where o.id in (select order_id from public.order_items where id = any (p_item_ids));
  end if;

  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Conto del tavolo
-- ---------------------------------------------------------------------
create or replace function public.session_bill(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_session public.table_sessions;
  v_lines jsonb;
  v_items_total numeric;
  v_paid numeric;
  v_total numeric;
begin
  select * into v_session from public.table_sessions where id = p_session_id;
  if v_session is null then
    perform public.raise_app_error('not_found', 'Conto non trovato.');
  end if;
  if not (public.is_member(v_session.restaurant_id)
          or exists (select 1 from public.session_guests g where g.session_id = p_session_id and g.user_id = auth.uid())) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'item', 'label', dish_name, 'quantity', qty, 'unitPrice', unit_price,
      'total', unit_price * qty, 'paidQuantity', paid_qty, 'includedInAyce', unit_price = 0 and v_session.ayce
    ) order by dish_name), '[]'::jsonb),
    coalesce(sum(unit_price * qty), 0)
  into v_lines, v_items_total
  from (
    select oi.dish_name, oi.unit_price, sum(oi.quantity) as qty, sum(oi.paid_quantity) as paid_qty
    from public.order_items oi
    where oi.session_id = p_session_id and oi.status <> 'cancelled'
    group by oi.dish_name, oi.unit_price
  ) g;

  v_total := v_items_total;

  if v_session.cover_price > 0 then
    v_lines := v_lines || jsonb_build_object('kind', 'cover', 'label', 'Coperto', 'quantity', v_session.guests,
      'unitPrice', v_session.cover_price, 'total', v_session.cover_price * v_session.guests);
    v_total := v_total + v_session.cover_price * v_session.guests;
  end if;
  if v_session.ayce and v_session.ayce_price > 0 then
    v_lines := v_lines || jsonb_build_object('kind', 'ayce', 'label', 'All You Can Eat', 'quantity', v_session.guests,
      'unitPrice', v_session.ayce_price, 'total', v_session.ayce_price * v_session.guests);
    v_total := v_total + v_session.ayce_price * v_session.guests;
  end if;

  select coalesce(sum(amount - refunded_amount), 0) into v_paid
  from public.payments where session_id = p_session_id and status in ('succeeded', 'refunded');

  return jsonb_build_object(
    'sessionId', p_session_id,
    'guests', v_session.guests,
    'lines', v_lines,
    'total', round(v_total, 2),
    'paid', round(v_paid, 2),
    'due', round(greatest(0, v_total - v_paid), 2),
    'perPerson', round(greatest(0, v_total - v_paid) / greatest(1, v_session.guests), 2)
  );
end $$;

-- Incasso manuale (contanti, POS, buoni)
create or replace function public.record_payment(
  p_session_id uuid,
  p_method text,
  p_amount numeric,
  p_label text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session public.table_sessions;
  v_bill jsonb;
  v_id uuid;
begin
  select * into v_session from public.table_sessions where id = p_session_id for update;
  if v_session is null or v_session.status <> 'open' then
    perform public.raise_app_error('table_closed', 'Il tavolo è chiuso.');
  end if;
  if not public.can_take_payments(v_session.restaurant_id) then
    perform public.raise_app_error('forbidden', 'Non sei abilitato a incassare.');
  end if;
  if p_method not in ('cash', 'card', 'voucher', 'other') then
    perform public.raise_app_error('invalid_method', 'Metodo di pagamento non valido.');
  end if;
  v_bill := public.session_bill(p_session_id);
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) > (v_bill ->> 'due')::numeric + 0.01 then
    perform public.raise_app_error('invalid_amount', 'Importo non valido (da pagare: ' || (v_bill ->> 'due') || ' €).');
  end if;

  insert into public.payments (restaurant_id, session_id, method, amount, label, recorded_by)
  values (v_session.restaurant_id, p_session_id, p_method, round(p_amount, 2), nullif(trim(coalesce(p_label, '')), ''), auth.uid())
  returning id into v_id;

  perform public.log_activity(v_session.restaurant_id, 'payment_recorded',
    jsonb_build_object('sessionId', p_session_id, 'method', p_method, 'amount', round(p_amount, 2)));
  return v_id;
end $$;

create or replace function public.close_table_session(p_session_id uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.table_sessions;
  v_due numeric;
begin
  select * into v_session from public.table_sessions where id = p_session_id for update;
  if v_session is null or v_session.status <> 'open' then
    perform public.raise_app_error('table_closed', 'Il tavolo è già chiuso.');
  end if;
  if not public.has_role(v_session.restaurant_id, array['owner', 'manager', 'waiter']) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;

  v_due := (public.session_bill(p_session_id) ->> 'due')::numeric;
  if v_due > 0.01 then
    if not p_force then
      perform public.raise_app_error('unpaid', 'Restano ' || v_due || ' € da incassare.');
    end if;
    if not public.is_manager(v_session.restaurant_id) then
      perform public.raise_app_error('forbidden', 'Solo un responsabile può chiudere un conto non saldato.');
    end if;
  end if;

  update public.table_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid(),
    assistance_requested_at = null
  where id = p_session_id;
  delete from public.cart_items where session_id = p_session_id;
  delete from public.session_secrets where session_id = p_session_id;

  perform public.log_activity(v_session.restaurant_id, 'table_closed',
    jsonb_build_object('sessionId', p_session_id, 'forcedWithDue', case when v_due > 0.01 then v_due else null end));
end $$;

-- ---------------------------------------------------------------------
-- Asporto
-- ---------------------------------------------------------------------
create or replace function public.next_pickup_number(p_restaurant_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_day date;
  v_n integer;
begin
  v_day := (now() at time zone (select timezone from public.restaurants where id = p_restaurant_id))::date;
  insert into public.pickup_counters as c (restaurant_id, day, last_number)
  values (p_restaurant_id, v_day, 1)
  on conflict (restaurant_id, day) do update set last_number = case when c.last_number >= 999 then 1 else c.last_number + 1 end
  returning last_number into v_n;
  return v_n;
end $$;

create or replace function public.random_pickup_code()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6)
$$;

create or replace function public.place_takeaway_order(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_set public.takeaway_settings;
  v_status text;
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_dish public.dishes;
  v_qty integer;
  v_code text;
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
  v_number integer;
  v_recent integer;
  v_field text;
  v_mode text;
  v_value text;
begin
  if auth.uid() is null then
    perform public.raise_app_error('auth_required', 'Sessione non valida, ricarica la pagina.');
  end if;
  if not exists (select 1 from public.restaurants where id = p_restaurant_id and status = 'active') then
    perform public.raise_app_error('restaurant_inactive', 'Il locale non accetta ordini al momento.');
  end if;
  select * into v_set from public.takeaway_settings where restaurant_id = p_restaurant_id;
  if v_set is null or not v_set.enabled then
    perform public.raise_app_error('takeaway_disabled', 'L''asporto non è attivo.');
  end if;
  if not public.hit_rate_limit('takeaway:' || auth.uid(), 5, interval '10 minutes') then
    perform public.raise_app_error('rate_limited', 'Troppi ordini ravvicinati, riprova tra poco.');
  end if;
  if v_set.max_orders_per_hour is not null then
    select count(*) into v_recent from public.orders
    where restaurant_id = p_restaurant_id and kind = 'takeaway' and status <> 'cancelled'
      and created_at > now() - interval '1 hour';
    if v_recent >= v_set.max_orders_per_hour then
      perform public.raise_app_error('busy', 'Il locale è al completo per ora, riprova più tardi.');
    end if;
  end if;

  -- campi cliente obbligatori
  foreach v_field in array array['first_name', 'last_name', 'phone', 'email'] loop
    v_mode := case v_field when 'first_name' then v_set.field_first_name when 'last_name' then v_set.field_last_name
                           when 'phone' then v_set.field_phone else v_set.field_email end;
    v_value := trim(coalesce(p_customer ->> v_field, ''));
    if v_mode = 'required' and v_value = '' then
      perform public.raise_app_error('missing_field', 'Compila tutti i campi obbligatori.');
    end if;
  end loop;
  if coalesce(p_customer ->> 'email', '') <> '' and (p_customer ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform public.raise_app_error('invalid_email', 'Email non valida.');
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    perform public.raise_app_error('empty_order', 'Il carrello è vuoto.');
  end if;

  v_status := case when v_set.require_online_payment then 'awaiting_payment' else 'received' end;
  v_number := public.next_pickup_number(p_restaurant_id);
  loop
    v_code := public.random_pickup_code();
    exit when not exists (select 1 from public.orders where restaurant_id = p_restaurant_id and pickup_code = v_code);
  end loop;

  insert into public.orders (
    restaurant_id, kind, status, placed_by, pickup_number, pickup_code, pickup_token,
    customer_first_name, customer_last_name, customer_phone, customer_email, customer_notes,
    customer_tax_code, customer_lottery_code
  ) values (
    p_restaurant_id, 'takeaway', v_status, auth.uid(), v_number, v_code, v_token,
    case when v_set.field_first_name <> 'off' then nullif(left(trim(coalesce(p_customer ->> 'first_name', '')), 60), '') end,
    case when v_set.field_last_name <> 'off' then nullif(left(trim(coalesce(p_customer ->> 'last_name', '')), 60), '') end,
    case when v_set.field_phone <> 'off' then nullif(left(trim(coalesce(p_customer ->> 'phone', '')), 30), '') end,
    case when v_set.field_email <> 'off' then nullif(left(lower(trim(coalesce(p_customer ->> 'email', ''))), 120), '') end,
    nullif(left(trim(coalesce(p_customer ->> 'notes', '')), 500), ''),
    nullif(upper(left(trim(coalesce(p_customer ->> 'tax_code', '')), 16)), ''),
    nullif(upper(left(trim(coalesce(p_customer ->> 'lottery_code', '')), 8)), '')
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty < 1 or v_qty > 99 then
      perform public.raise_app_error('invalid_quantity', 'Quantità non valida.');
    end if;
    select * into v_dish from public.dishes
    where id = (v_item ->> 'dishId')::uuid and restaurant_id = p_restaurant_id
      and is_active and is_available and takeaway_available;
    if v_dish is null or not exists (select 1 from public.visible_dish_ids(p_restaurant_id) x where x = v_dish.id) then
      perform public.raise_app_error('dish_unavailable', 'Un piatto non è più disponibile.');
    end if;
    insert into public.order_items (order_id, restaurant_id, dish_id, dish_name, unit_price, list_price, vat_rate_code, quantity, notes)
    values (v_order_id, p_restaurant_id, v_dish.id, v_dish.name, v_dish.price, v_dish.price, v_dish.vat_rate_code, v_qty,
      nullif(left(trim(coalesce(v_item ->> 'notes', '')), 300), ''));
    v_total := v_total + v_dish.price * v_qty;
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  return jsonb_build_object('orderId', v_order_id, 'token', v_token, 'pickupCode', v_code,
    'pickupNumber', v_number, 'status', v_status, 'total', v_total);
end $$;

-- Stato ordine per il cliente (con il token del link/QR)
create or replace function public.get_takeaway_order(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'restaurantId', o.restaurant_id, 'status', o.status, 'paymentStatus', o.payment_status,
    'pickupNumber', o.pickup_number, 'pickupCode', o.pickup_code, 'total', o.total,
    'createdAt', o.created_at, 'readyAt', o.ready_at, 'pickedUpAt', o.picked_up_at,
    'customerName', o.customer_first_name,
    'estimatedMinutes', t.estimated_minutes,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'name', oi.dish_name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price,
        'status', oi.status, 'pickedQuantity', oi.picked_quantity) order by oi.created_at)
      from public.order_items oi where oi.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  join public.takeaway_settings t on t.restaurant_id = o.restaurant_id
  where o.pickup_token = p_token and o.kind = 'takeaway'
$$;

create or replace function public.set_takeaway_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id and kind = 'takeaway' for update;
  if v_order is null or not public.is_member(v_order.restaurant_id) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  if p_status not in ('received', 'preparing', 'ready', 'picked_up', 'cancelled') then
    perform public.raise_app_error('invalid_status', 'Stato non valido.');
  end if;
  if v_order.status = 'awaiting_payment' and p_status <> 'cancelled' then
    perform public.raise_app_error('awaiting_payment', 'Ordine in attesa di pagamento online.');
  end if;
  if p_status = 'cancelled' and v_order.payment_status = 'paid'
     and not public.is_manager(v_order.restaurant_id) then
    perform public.raise_app_error('forbidden', 'Un ordine già pagato va annullato da un responsabile (con rimborso).');
  end if;

  update public.orders set
    status = p_status,
    ready_at = case when p_status = 'ready' then coalesce(ready_at, now()) else ready_at end,
    picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end
  where id = p_order_id;

  update public.order_items set
    status = case p_status when 'preparing' then 'preparing' when 'ready' then 'ready'
                           when 'picked_up' then 'served' when 'cancelled' then 'cancelled' else status end,
    ready_at = case when p_status in ('ready', 'picked_up') then coalesce(ready_at, now()) else ready_at end,
    picked_quantity = case when p_status = 'picked_up' then quantity else picked_quantity end
  where order_id = p_order_id and status <> 'cancelled';
end $$;

-- Incasso asporto in cassa
create or replace function public.record_takeaway_payment(p_order_id uuid, p_method text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_due numeric;
  v_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id and kind = 'takeaway' for update;
  if v_order is null or not public.can_take_payments(v_order.restaurant_id) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  if p_method not in ('cash', 'card', 'voucher', 'other') then
    perform public.raise_app_error('invalid_method', 'Metodo di pagamento non valido.');
  end if;
  v_due := v_order.total - v_order.paid_amount;
  if v_due <= 0 then
    perform public.raise_app_error('already_paid', 'Ordine già pagato.');
  end if;
  insert into public.payments (restaurant_id, order_id, method, amount, recorded_by)
  values (v_order.restaurant_id, p_order_id, p_method, v_due, auth.uid()) returning id into v_id;
  update public.orders set paid_amount = total, payment_status = 'paid',
    status = case when status = 'awaiting_payment' then 'received' else status end
  where id = p_order_id;
  return v_id;
end $$;

-- Ritiro con scansione QR/codice: restituisce l'ordine allo staff
create or replace function public.find_pickup(p_restaurant_id uuid, p_code_or_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_token text := trim(coalesce(p_code_or_token, ''));
  v_order_id uuid;
begin
  if not public.is_member(p_restaurant_id) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  -- accetta anche l'URL completo del QR
  v_token := regexp_replace(v_token, '^.*/', '');
  select id into v_order_id from public.orders
  where restaurant_id = p_restaurant_id and kind = 'takeaway'
    and (pickup_token = v_token or pickup_code = upper(v_token)
         or (v_token ~ '^[0-9]{1,3}$' and pickup_number = v_token::int
             and created_at > now() - interval '18 hours'))
  order by created_at desc limit 1;
  if v_order_id is null then
    return null;
  end if;
  return (select public.get_takeaway_order(pickup_token) from public.orders where id = v_order_id);
end $$;

-- Ritiro parziale (eventi con più banchi): [{ "itemId", "quantity" }]
create or replace function public.claim_pickup_items(p_order_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_item jsonb;
begin
  select * into v_order from public.orders where id = p_order_id and kind = 'takeaway' for update;
  if v_order is null or not public.is_member(v_order.restaurant_id) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  if v_order.status in ('awaiting_payment', 'cancelled') then
    perform public.raise_app_error('not_claimable', 'Ordine non ritirabile.');
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    update public.order_items set
      picked_quantity = least(quantity, picked_quantity + greatest(0, (v_item ->> 'quantity')::int)),
      status = case when least(quantity, picked_quantity + greatest(0, (v_item ->> 'quantity')::int)) >= quantity
                    then 'served' else status end
    where id = (v_item ->> 'itemId')::uuid and order_id = p_order_id and status <> 'cancelled';
  end loop;
  if not exists (select 1 from public.order_items where order_id = p_order_id and status <> 'cancelled' and picked_quantity < quantity) then
    update public.orders set status = 'picked_up', picked_up_at = now() where id = p_order_id;
  end if;
end $$;

-- Schermo pubblico dei numeri
create or replace function public.get_takeaway_display(p_restaurant_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'restaurant', (select jsonb_build_object('name', name, 'logoUrl', logo_url) from public.restaurants where id = p_restaurant_id),
    'preparing', coalesce((select jsonb_agg(pickup_number order by created_at) from public.orders
      where restaurant_id = p_restaurant_id and kind = 'takeaway' and status in ('received', 'preparing')
        and created_at > now() - interval '18 hours'), '[]'::jsonb),
    'ready', coalesce((select jsonb_agg(pickup_number order by ready_at desc) from public.orders
      where restaurant_id = p_restaurant_id and kind = 'takeaway' and status = 'ready'
        and created_at > now() - interval '18 hours'), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- Prenotazione pubblica
-- ---------------------------------------------------------------------
create or replace function public.create_public_booking(
  p_restaurant_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_starts_at timestamptz,
  p_guests integer,
  p_notes text default null,
  p_room_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_set public.restaurant_settings;
  v_id uuid;
begin
  if auth.uid() is null then
    perform public.raise_app_error('auth_required', 'Sessione non valida, ricarica la pagina.');
  end if;
  select * into v_set from public.restaurant_settings where restaurant_id = p_restaurant_id;
  if v_set is null or not (v_set.reservations_enabled and v_set.reservations_public)
     or not exists (select 1 from public.restaurants where id = p_restaurant_id and status = 'active') then
    perform public.raise_app_error('reservations_disabled', 'Le prenotazioni online non sono attive.');
  end if;
  if not public.hit_rate_limit('booking:' || auth.uid(), 3, interval '30 minutes') then
    perform public.raise_app_error('rate_limited', 'Hai già inviato una prenotazione, riprova più tardi.');
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_phone, ''))) < 6 then
    perform public.raise_app_error('missing_field', 'Inserisci nome e telefono.');
  end if;
  if p_starts_at < now() - interval '5 minutes' or p_starts_at > now() + interval '180 days' then
    perform public.raise_app_error('invalid_date', 'Data non valida.');
  end if;
  if p_guests < 1 or p_guests > 50 then
    perform public.raise_app_error('invalid_guests', 'Numero di persone non valido.');
  end if;
  if p_room_id is not null and not exists (select 1 from public.rooms where id = p_room_id and restaurant_id = p_restaurant_id) then
    p_room_id := null;
  end if;

  insert into public.bookings (restaurant_id, room_id, name, phone, email, starts_at, duration_min, guests, notes, source, created_by)
  values (p_restaurant_id, case when v_set.reservation_room_selection then p_room_id end,
    left(trim(p_name), 120), left(trim(p_phone), 30), nullif(left(lower(trim(coalesce(p_email, ''))), 120), ''),
    p_starts_at, v_set.reservation_duration_min, p_guests, nullif(left(trim(coalesce(p_notes, '')), 500), ''),
    'public', auth.uid())
  returning id into v_id;
  return v_id;
end $$;
