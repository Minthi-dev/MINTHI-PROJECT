-- =====================================================================
-- MINTHI v2 · 006 · Analitiche, admin, manutenzione
-- =====================================================================

create or replace function public.restaurant_analytics(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_result jsonb;
begin
  if not public.is_manager(p_restaurant_id) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  select timezone into v_tz from public.restaurants where id = p_restaurant_id;

  with
  pay as (
    select p.*, (p.amount - p.refunded_amount) as net
    from public.payments p
    where p.restaurant_id = p_restaurant_id and p.status in ('succeeded', 'refunded')
      and p.created_at >= p_from and p.created_at < p_to
  ),
  items as (
    select oi.*, o.kind, c.name as category_name
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.dishes d on d.id = oi.dish_id
    left join public.categories c on c.id = d.category_id
    where oi.restaurant_id = p_restaurant_id and oi.status <> 'cancelled'
      and o.status not in ('cancelled', 'awaiting_payment')
      and oi.created_at >= p_from and oi.created_at < p_to
  ),
  sessions as (
    select * from public.table_sessions
    where restaurant_id = p_restaurant_id and opened_at >= p_from and opened_at < p_to
  ),
  takeaway as (
    select * from public.orders
    where restaurant_id = p_restaurant_id and kind = 'takeaway' and status not in ('cancelled', 'awaiting_payment')
      and created_at >= p_from and created_at < p_to
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(net) from pay), 0),
    'payments', (select count(*) from pay),
    'tables', (select count(*) from sessions),
    'covers', coalesce((select sum(guests) from sessions), 0),
    'takeawayOrders', (select count(*) from takeaway),
    'itemsSold', coalesce((select sum(quantity) from items), 0),
    'avgTicket', coalesce((select round(sum(net) / nullif(count(distinct coalesce(session_id, order_id)), 0), 2) from pay), 0),
    'byDay', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'revenue', revenue) order by day) from (
        select (created_at at time zone v_tz)::date as day, sum(net) as revenue from pay group by 1) x), '[]'::jsonb),
    'byHour', coalesce((select jsonb_agg(jsonb_build_object('hour', hour, 'items', qty) order by hour) from (
        select extract(hour from created_at at time zone v_tz)::int as hour, sum(quantity) as qty from items group by 1) x), '[]'::jsonb),
    'byMethod', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', amount)) from (
        select method, sum(net) as amount from pay group by 1) x), '[]'::jsonb),
    'topDishes', coalesce((select jsonb_agg(x order by (x ->> 'quantity')::int desc) from (
        select jsonb_build_object('name', dish_name, 'quantity', sum(quantity), 'revenue', sum(unit_price * quantity)) as x
        from items group by dish_name order by sum(quantity) desc limit 15) t), '[]'::jsonb),
    'byCategory', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'quantity', qty, 'revenue', revenue))
      from (select coalesce(category_name, 'Senza categoria') as category, sum(quantity) as qty,
              sum(unit_price * quantity) as revenue from items group by 1) x), '[]'::jsonb),
    'prepTimes', coalesce((select jsonb_agg(jsonb_build_object('name', dish_name, 'minutes', minutes, 'samples', n)
        order by minutes desc) from (
        select dish_name, round(avg(extract(epoch from (ready_at - created_at)) / 60)::numeric, 1) as minutes, count(*) as n
        from items where ready_at is not null and ready_at > created_at
        group by dish_name having count(*) >= 2 order by 2 desc limit 15) x), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(m.display_name, pr.full_name, 'Staff'), 'tables', n))
      from (select opened_by, count(*) as n from sessions where opened_by is not null group by 1) s
      left join public.memberships m on m.user_id = s.opened_by and m.restaurant_id = p_restaurant_id
      left join public.profiles pr on pr.id = s.opened_by), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

-- Panoramica piattaforma (solo admin)
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  return jsonb_build_object(
    'restaurants', (select count(*) from public.restaurants),
    'activeRestaurants', (select count(*) from public.restaurants where status = 'active'),
    'orders30d', (select count(*) from public.orders where created_at > now() - interval '30 days' and status <> 'cancelled'),
    'gmv30d', coalesce((select sum(amount - refunded_amount) from public.payments
      where created_at > now() - interval '30 days' and status in ('succeeded', 'refunded')), 0),
    'mrr', coalesce((select sum(amount) from public.subscription_payments
      where status = 'paid' and created_at > now() - interval '30 days'), 0),
    'perRestaurant', coalesce((select jsonb_agg(x order by x ->> 'name') from (
      select jsonb_build_object(
        'id', r.id, 'name', r.name, 'status', r.status, 'createdAt', r.created_at,
        'subscriptionStatus', b.subscription_status,
        'orders30d', (select count(*) from public.orders o where o.restaurant_id = r.id
                       and o.created_at > now() - interval '30 days' and o.status <> 'cancelled'),
        'gmv30d', coalesce((select sum(p.amount - p.refunded_amount) from public.payments p where p.restaurant_id = r.id
                       and p.created_at > now() - interval '30 days' and p.status in ('succeeded', 'refunded')), 0),
        'owner', (select pr.email from public.memberships m join public.profiles pr on pr.id = m.user_id
                  where m.restaurant_id = r.id and m.role = 'owner' limit 1)
      ) as x
      from public.restaurants r left join public.billing_accounts b on b.restaurant_id = r.id) t), '[]'::jsonb)
  );
end $$;

-- Validazione invito (pagina pubblica di registrazione)
create or replace function public.check_invite(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('valid', true, 'freeMonths', free_months, 'discountPercent', discount_percent,
    'discountDuration', discount_duration, 'discountMonths', discount_months, 'expiresAt', expires_at)
  from public.invites
  where token = p_token and used_at is null and expires_at > now()
$$;

-- ---------------------------------------------------------------------
-- Manutenzione (pg_cron)
-- ---------------------------------------------------------------------
create or replace function public.maintenance()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- asporto non pagato online entro 2 ore: annullato
  update public.orders set status = 'cancelled'
  where kind = 'takeaway' and status = 'awaiting_payment' and created_at < now() - interval '2 hours';

  -- privacy: dati cliente asporto anonimizzati dopo 30 giorni
  update public.orders set customer_first_name = null, customer_last_name = null, customer_phone = null,
    customer_email = null, customer_notes = null, customer_tax_code = null, customer_lottery_code = null
  where kind = 'takeaway' and created_at < now() - interval '30 days'
    and (customer_first_name is not null or customer_phone is not null or customer_email is not null);

  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.pin_attempts where attempted_at < now() - interval '1 day';
  delete from public.pickup_counters where day < current_date - 7;
  delete from public.session_guests g using public.table_sessions s
    where s.id = g.session_id and s.status = 'closed' and s.closed_at < now() - interval '1 day';
end $$;
revoke all on function public.maintenance() from public, anon, authenticated;
