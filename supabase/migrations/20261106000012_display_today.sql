-- =====================================================================
-- MINTHI v2 · 012 · Schermo numeri: solo gli ordini della giornata
-- (il numero di ritiro riparte ogni giorno: niente doppioni ieri/oggi)
-- =====================================================================

create or replace function public.get_takeaway_display(p_restaurant_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select name, logo_url,
      (date_trunc('day', now() at time zone timezone) at time zone timezone) as day_start
    from public.restaurants where id = p_restaurant_id
  )
  select jsonb_build_object(
    'restaurant', (select jsonb_build_object('name', name, 'logoUrl', logo_url) from r),
    'preparing', coalesce((select jsonb_agg(o.pickup_number order by o.created_at) from public.orders o, r
      where o.restaurant_id = p_restaurant_id and o.kind = 'takeaway' and o.status in ('received', 'preparing')
        and o.created_at >= r.day_start), '[]'::jsonb),
    'ready', coalesce((select jsonb_agg(o.pickup_number order by o.ready_at desc) from public.orders o, r
      where o.restaurant_id = p_restaurant_id and o.kind = 'takeaway' and o.status = 'ready'
        and o.created_at >= r.day_start), '[]'::jsonb)
  )
$$;
grant execute on function public.get_takeaway_display(uuid) to anon, authenticated;
