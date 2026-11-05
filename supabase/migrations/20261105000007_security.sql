-- =====================================================================
-- MINTHI v2 · 007 · Sicurezza: grant, RLS, realtime, storage
--
-- Regole:
--   * anon (nessun login) non tocca nessuna tabella: solo RPC pubbliche.
--   * authenticated passa sempre dalla RLS.
--   * le colonne sensibili si aggiornano solo con grant per colonna.
-- =====================================================================

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Funzioni interne: nessuno le chiama direttamente
revoke all on function public.hit_rate_limit(text, integer, interval) from public, authenticated;
revoke all on function public.log_activity(uuid, text, jsonb) from public, authenticated;
revoke all on function public.next_pickup_number(uuid) from public, authenticated;
revoke all on function public.handle_new_user() from public, authenticated;
revoke all on function public.handle_new_restaurant() from public, authenticated;

-- RPC pubbliche (anche senza login)
grant execute on function public.get_public_restaurant(uuid) to anon, authenticated;
grant execute on function public.get_public_menu(uuid, text) to anon, authenticated;
grant execute on function public.get_table_entry(text) to anon, authenticated;
grant execute on function public.resolve_qr_code(text) to anon, authenticated;
grant execute on function public.get_takeaway_display(uuid) to anon, authenticated;
grant execute on function public.get_takeaway_order(text) to anon, authenticated;
grant execute on function public.check_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS ovunque
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Helper: piatto ordinabile in quel ristorante (bypassa la RLS dei piatti)
create or replace function public.dish_orderable(p_dish_id uuid, p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dishes where id = p_dish_id and restaurant_id = p_restaurant_id and is_active)
$$;

-- Helper: ristorante di una sessione
create or replace function public.session_restaurant(p_session_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select restaurant_id from public.table_sessions where id = p_session_id
$$;

create or replace function public.was_session_guest(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.session_guests where session_id = p_session_id and user_id = auth.uid())
$$;

-- profiles -------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin()
    or exists (select 1 from public.memberships m1 join public.memberships m2 on m1.restaurant_id = m2.restaurant_id
               where m1.user_id = auth.uid() and m2.user_id = profiles.id and m1.role in ('owner', 'manager')));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- restaurants ----------------------------------------------------------
create policy restaurants_select on public.restaurants for select to authenticated
  using (public.is_member(id));
create policy restaurants_update on public.restaurants for update to authenticated
  using (public.is_manager(id)) with check (public.is_manager(id));
revoke insert, update, delete on public.restaurants from authenticated;
grant update (name, slug, address, phone, email, logo_url, timezone, setup_completed) on public.restaurants to authenticated;

-- memberships (scritture solo dalla edge function "staff") -------------
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_member(restaurant_id));
revoke insert, update, delete on public.memberships from authenticated;

-- impostazioni ---------------------------------------------------------
create policy settings_select on public.restaurant_settings for select to authenticated
  using (public.is_member(restaurant_id));
create policy settings_update on public.restaurant_settings for update to authenticated
  using (public.is_manager(restaurant_id)) with check (public.is_manager(restaurant_id));
revoke insert, delete on public.restaurant_settings from authenticated;

create policy takeaway_settings_select on public.takeaway_settings for select to authenticated
  using (public.is_member(restaurant_id));
create policy takeaway_settings_update on public.takeaway_settings for update to authenticated
  using (public.is_manager(restaurant_id)) with check (public.is_manager(restaurant_id));
revoke insert, delete on public.takeaway_settings from authenticated;

create policy activity_select on public.activity_log for select to authenticated
  using (public.is_manager(restaurant_id));
revoke insert, update, delete on public.activity_log from authenticated;

revoke all on public.rate_limits, public.pin_attempts, public.pickup_counters, public.fiscal_jobs from authenticated;

-- menu e sala (lettura staff, scrittura responsabili) ------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'dishes', 'custom_menus', 'rooms', 'tables'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(restaurant_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_manager(restaurant_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.is_manager(restaurant_id)) with check (public.is_manager(restaurant_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_manager(restaurant_id))', t);
  end loop;
end $$;

-- i camerieri possono segnare un piatto esaurito
create or replace function public.set_dish_availability(p_dish_id uuid, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_rid uuid;
begin
  select restaurant_id into v_rid from public.dishes where id = p_dish_id;
  if v_rid is null or not public.has_role(v_rid, array['owner', 'manager', 'waiter', 'kitchen']) then
    perform public.raise_app_error('forbidden', 'Non autorizzato.');
  end if;
  update public.dishes set is_available = p_available where id = p_dish_id;
end $$;

create or replace function public.custom_menu_restaurant(p_menu_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select restaurant_id from public.custom_menus where id = p_menu_id
$$;

create policy custom_menu_dishes_select on public.custom_menu_dishes for select to authenticated
  using (public.is_member(public.custom_menu_restaurant(custom_menu_id)));
create policy custom_menu_dishes_write on public.custom_menu_dishes for all to authenticated
  using (public.is_manager(public.custom_menu_restaurant(custom_menu_id)))
  with check (public.is_manager(public.custom_menu_restaurant(custom_menu_id))
    and public.dish_orderable(dish_id, public.custom_menu_restaurant(custom_menu_id)));

create policy custom_menu_schedules_select on public.custom_menu_schedules for select to authenticated
  using (public.is_member(public.custom_menu_restaurant(custom_menu_id)));
create policy custom_menu_schedules_write on public.custom_menu_schedules for all to authenticated
  using (public.is_manager(public.custom_menu_restaurant(custom_menu_id)))
  with check (public.is_manager(public.custom_menu_restaurant(custom_menu_id)));

create policy physical_qr_admin on public.physical_qr_codes for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- sessioni tavolo ------------------------------------------------------
create policy sessions_select on public.table_sessions for select to authenticated
  using (public.is_member(restaurant_id) or public.was_session_guest(id));
create policy sessions_update on public.table_sessions for update to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager', 'waiter']) and status = 'open')
  with check (public.has_role(restaurant_id, array['owner', 'manager', 'waiter']));
revoke insert, update, delete on public.table_sessions from authenticated;
grant update (guests, notes, customer_email, customer_tax_code, customer_lottery_code) on public.table_sessions to authenticated;

create policy secrets_select on public.session_secrets for select to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager', 'waiter']));
revoke insert, update, delete on public.session_secrets from authenticated;

create policy guests_select on public.session_guests for select to authenticated
  using (user_id = auth.uid() or public.is_member(public.session_restaurant(session_id)));
revoke insert, update, delete on public.session_guests from authenticated;

-- carrello condiviso ---------------------------------------------------
create policy cart_select on public.cart_items for select to authenticated
  using (public.is_session_guest(session_id)
    or public.has_role(public.session_restaurant(session_id), array['owner', 'manager', 'waiter']));
create policy cart_insert on public.cart_items for insert to authenticated
  with check (
    (public.is_session_guest(session_id)
      or public.has_role(public.session_restaurant(session_id), array['owner', 'manager', 'waiter']))
    and public.dish_orderable(dish_id, public.session_restaurant(session_id))
    and added_by = auth.uid());
create policy cart_update on public.cart_items for update to authenticated
  using (public.is_session_guest(session_id)
    or public.has_role(public.session_restaurant(session_id), array['owner', 'manager', 'waiter']))
  with check (public.is_session_guest(session_id)
    or public.has_role(public.session_restaurant(session_id), array['owner', 'manager', 'waiter']));
create policy cart_delete on public.cart_items for delete to authenticated
  using (public.is_session_guest(session_id)
    or public.has_role(public.session_restaurant(session_id), array['owner', 'manager', 'waiter']));
revoke update on public.cart_items from authenticated;
grant update (quantity, notes, course) on public.cart_items to authenticated;

-- ordini (scritture solo via RPC) --------------------------------------
create policy orders_select on public.orders for select to authenticated
  using (public.is_member(restaurant_id) or placed_by = auth.uid()
    or (session_id is not null and public.was_session_guest(session_id)));
revoke insert, update, delete on public.orders from authenticated;

create policy order_items_select on public.order_items for select to authenticated
  using (public.is_member(restaurant_id)
    or (session_id is not null and public.was_session_guest(session_id))
    or exists (select 1 from public.orders o where o.id = order_id and o.placed_by = auth.uid()));
revoke insert, update, delete on public.order_items from authenticated;

create policy payments_select on public.payments for select to authenticated
  using (public.is_member(restaurant_id));
revoke insert, update, delete on public.payments from authenticated;

-- prenotazioni ---------------------------------------------------------
create policy bookings_select on public.bookings for select to authenticated
  using (public.is_member(restaurant_id));
create policy bookings_insert on public.bookings for insert to authenticated
  with check (public.has_role(restaurant_id, array['owner', 'manager', 'waiter']));
create policy bookings_update on public.bookings for update to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager', 'waiter']))
  with check (public.has_role(restaurant_id, array['owner', 'manager', 'waiter']));
create policy bookings_delete on public.bookings for delete to authenticated
  using (public.is_manager(restaurant_id));

-- abbonamento e pagamenti online ---------------------------------------
create policy billing_select on public.billing_accounts for select to authenticated
  using (public.is_owner(restaurant_id));
create policy billing_update on public.billing_accounts for update to authenticated
  using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
revoke insert, update, delete on public.billing_accounts from authenticated;
grant update (billing_name, vat_number, tax_code, address, city, postal_code, province, sdi_code, pec)
  on public.billing_accounts to authenticated;

create policy subscription_payments_select on public.subscription_payments for select to authenticated
  using (public.is_owner(restaurant_id));
revoke insert, update, delete on public.subscription_payments from authenticated;

create policy stripe_accounts_select on public.stripe_accounts for select to authenticated
  using (public.is_manager(restaurant_id));
create policy stripe_accounts_update on public.stripe_accounts for update to authenticated
  using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
revoke insert, update, delete on public.stripe_accounts from authenticated;
grant update (online_payments_enabled) on public.stripe_accounts to authenticated;

create policy invites_admin on public.invites for select to authenticated using (public.is_platform_admin());
revoke insert, update, delete on public.invites from authenticated;

create policy bonuses_select on public.restaurant_bonuses for select to authenticated
  using (public.is_owner(restaurant_id));
revoke insert, update, delete on public.restaurant_bonuses from authenticated;

create policy config_select on public.platform_config for select to authenticated
  using (is_public or public.is_platform_admin());
revoke insert, update, delete on public.platform_config from authenticated;

create or replace function public.get_public_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.platform_config where is_public
$$;
grant execute on function public.get_public_config() to anon, authenticated;

-- fiscale --------------------------------------------------------------
create policy fiscal_settings_select on public.fiscal_settings for select to authenticated
  using (public.is_owner(restaurant_id));
create policy fiscal_settings_update on public.fiscal_settings for update to authenticated
  using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
revoke insert, update, delete on public.fiscal_settings from authenticated;
grant update (enabled, auto_issue_online_payments, email_to_customer, default_vat_rate_code)
  on public.fiscal_settings to authenticated;

create policy fiscal_receipts_select on public.fiscal_receipts for select to authenticated
  using (public.is_manager(restaurant_id));
revoke insert, update, delete on public.fiscal_receipts from authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'cart_items', 'table_sessions', 'bookings', 'payments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Storage: immagini piatti e loghi in <restaurant_id>/<file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('dishes', 'dishes', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('logos', 'logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_restaurant_id(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

drop policy if exists minthi_images_insert on storage.objects;
drop policy if exists minthi_images_update on storage.objects;
drop policy if exists minthi_images_delete on storage.objects;

create policy minthi_images_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('dishes', 'logos') and public.is_manager(public.storage_restaurant_id(name)));
create policy minthi_images_update on storage.objects for update to authenticated
  using (bucket_id in ('dishes', 'logos') and public.is_manager(public.storage_restaurant_id(name)));
create policy minthi_images_delete on storage.objects for delete to authenticated
  using (bucket_id in ('dishes', 'logos') and public.is_manager(public.storage_restaurant_id(name)));
