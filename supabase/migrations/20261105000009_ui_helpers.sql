-- =====================================================================
-- MINTHI v2 · 009 · Helper per l'interfaccia staff
-- =====================================================================

-- Lo staff deve sapere se gli scontrini sono attivi, senza leggere la configurazione.
create or replace function public.fiscal_active(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_restaurant_id) and coalesce(
    (select enabled and status = 'active' from public.fiscal_settings where restaurant_id = p_restaurant_id), false)
$$;

-- Righe di fatturazione/fiscale create insieme al ristorante (anche da SQL).
create or replace function public.handle_new_restaurant_accounts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.billing_accounts (restaurant_id) values (new.id) on conflict do nothing;
  insert into public.fiscal_settings (restaurant_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.handle_new_restaurant_accounts() from public, anon, authenticated;

drop trigger if exists on_restaurant_created_accounts on public.restaurants;
create trigger on_restaurant_created_accounts
  after insert on public.restaurants
  for each row execute function public.handle_new_restaurant_accounts();
