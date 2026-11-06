-- =====================================================================
-- Smoke test v2: va eseguito DENTRO una transazione con rollback
-- (vedi supabase/tests/run.sh). Simula owner, cameriere, cliente
-- anonimo ed estraneo, e verifica flussi + RLS.
-- =====================================================================

create function public.test_assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'ASSERT FAILED: %', p_msg; end if;
end $$;
grant execute on function public.test_assert(boolean, text) to authenticated, anon;

create function public.test_expect_error(p_sql text, p_hint text) returns void language plpgsql as $$
declare v_hint text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if p_hint is not null and v_hint is distinct from p_hint then
      raise exception 'ASSERT FAILED: % -> hint % (atteso %) msg %', p_sql, v_hint, p_hint, sqlerrm;
    end if;
    return;
  end;
  raise exception 'ASSERT FAILED: nessun errore per %', p_sql;
end $$;
grant execute on function public.test_expect_error(text, text) to authenticated, anon;

-- ---------- dati di base (postgres) ----------
insert into auth.users (id, email, raw_user_meta_data, is_anonymous, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local', '{"full_name":"Owner"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'mario@staff.minthi.it', '{"full_name":"Mario","username":"mario"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', null, '{}', true, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', null, '{}', true, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'cuoco@staff.minthi.it', '{"username":"cuoco"}', false, 'authenticated', 'authenticated');

select public.test_assert((select count(*) from public.profiles) = 3, 'profili creati solo per utenti non anonimi');

insert into public.restaurants (id, name) values ('00000000-0000-0000-0000-0000000000f0', 'Trattoria Test');
select public.test_assert(exists (select 1 from public.restaurant_settings where restaurant_id = '00000000-0000-0000-0000-0000000000f0'), 'impostazioni create');

insert into public.memberships (restaurant_id, user_id, role, display_name, can_take_payments) values
  ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000a1', 'owner', 'Owner', true),
  ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000a2', 'waiter', 'Mario', true),
  ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000a5', 'kitchen', 'Cuoco', false);

update public.restaurant_settings set cover_default = 2, ayce_default = '{"price": 25, "maxRounds": 2, "intervalMin": 0}'
where restaurant_id = '00000000-0000-0000-0000-0000000000f0';
update public.takeaway_settings set enabled = true where restaurant_id = '00000000-0000-0000-0000-0000000000f0';

-- ---------- owner: menu e tavoli via RLS ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

insert into public.categories (id, restaurant_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f0', 'Primi');
insert into public.dishes (id, restaurant_id, category_id, name, price, included_in_ayce, ayce_max_per_person) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000c1', 'Carbonara', 12, false, null),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000c1', 'Nigiri', 6, true, 2);
insert into public.tables (id, restaurant_id, name, qr_token) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f0', '1', 'tok-table-1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f0', '2', 'tok-table-2');

select public.test_expect_error($$update public.restaurants set status = 'suspended'$$, null); -- colonna protetta

-- ---------- cameriere: apre il tavolo ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select set_config('test.open', public.open_table_session('00000000-0000-0000-0000-0000000000e1', 2, true, true)::text, true);
select public.test_expect_error($$select public.open_table_session('00000000-0000-0000-0000-0000000000e1', 2)$$, 'already_open');
select public.test_assert((select cover_price from public.table_sessions where id = (current_setting('test.open')::jsonb ->> 'sessionId')::uuid) = 2, 'coperto congelato');
select public.test_assert((select ayce_price from public.table_sessions where id = (current_setting('test.open')::jsonb ->> 'sessionId')::uuid) = 25, 'prezzo AYCE congelato');
update public.dishes set price = 1;
set local role postgres;
select public.test_assert((select count(*) from public.dishes where price = 1) = 0, 'cameriere non modifica il menu');
set local role authenticated;

-- ---------- cliente anonimo ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","is_anonymous":true}';
select public.test_assert((select count(*) from public.table_sessions) = 0, 'cliente non vede sessioni prima del PIN');
select public.test_assert(public.get_table_entry('tok-table-1') ->> 'hasOpenSession' = 'true', 'entry pubblica');
select public.test_assert(public.join_table('tok-table-1', '0000x') ->> 'error' = 'wrong_pin', 'PIN errato');
select public.join_table('tok-table-1', '0000x'); select public.join_table('tok-table-1', '0000x'); select public.join_table('tok-table-1', '0000x');
select public.test_assert(public.join_table('tok-table-1', '0000x') ->> 'attemptsLeft' = '0', 'tentativi contati');
select public.test_expect_error($$select public.join_table('tok-table-1', '0000')$$, 'too_many_attempts');
set local role postgres; delete from public.pin_attempts; set local role authenticated;
select public.join_table('tok-table-1', current_setting('test.open')::jsonb ->> 'pin');
select public.test_assert((select count(*) from public.session_secrets) = 0, 'cliente non legge il PIN');
select public.test_assert((select count(*) from public.dishes) = 0, 'cliente non legge le tabelle del menu');
select public.test_assert(jsonb_array_length(public.get_public_menu('00000000-0000-0000-0000-0000000000f0') -> 'dishes') = 2, 'menu pubblico');

insert into public.cart_items (session_id, dish_id, quantity) values
  ((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, '00000000-0000-0000-0000-0000000000d1', 2),
  ((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, '00000000-0000-0000-0000-0000000000d2', 3);
select set_config('test.order1', public.submit_order((current_setting('test.open')::jsonb ->> 'sessionId')::uuid)::text, true);
select public.test_assert((select total from public.orders where id = current_setting('test.order1')::uuid) = 24, 'totale ordine (nigiri inclusi AYCE)');
select public.test_assert((select count(*) from public.cart_items) = 0, 'carrello svuotato');

-- limite per piatto AYCE: 2 a persona x 2 persone = 4, già 3
insert into public.cart_items (session_id, dish_id, quantity) values
  ((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, '00000000-0000-0000-0000-0000000000d2', 2);
select public.test_expect_error($$select public.submit_order((current_setting('test.open')::jsonb ->> 'sessionId')::uuid)$$, 'ayce_dish_limit');
update public.cart_items set quantity = 1;
select public.submit_order((current_setting('test.open')::jsonb ->> 'sessionId')::uuid);
-- 2 turni AYCE già usati
insert into public.cart_items (session_id, dish_id, quantity) values
  ((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, '00000000-0000-0000-0000-0000000000d1', 1);
select public.test_expect_error($$select public.submit_order((current_setting('test.open')::jsonb ->> 'sessionId')::uuid)$$, 'ayce_rounds');

-- conto: 2 carbonara (24) + coperto 2x2 (4) + AYCE 25x2 (50) = 78
select public.test_assert((public.session_bill((current_setting('test.open')::jsonb ->> 'sessionId')::uuid) ->> 'total')::numeric = 78, 'totale conto');
select public.test_expect_error($$select public.record_payment((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, 'cash', 10)$$, 'forbidden');

-- ---------- estraneo anonimo ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated","is_anonymous":true}';
select public.test_assert((select count(*) from public.orders) = 0, 'estraneo non vede ordini');
select public.test_assert((select count(*) from public.cart_items) = 0, 'estraneo non vede carrelli');
select public.test_expect_error($$insert into public.cart_items (session_id, dish_id, quantity) values ((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, '00000000-0000-0000-0000-0000000000d1', 1)$$, null);
select public.test_expect_error($$select public.session_bill((current_setting('test.open')::jsonb ->> 'sessionId')::uuid)$$, 'forbidden');

-- asporto
select set_config('test.ta', public.place_takeaway_order('00000000-0000-0000-0000-0000000000f0',
  '[{"dishId":"00000000-0000-0000-0000-0000000000d1","quantity":1}]', '{"first_name":"Luca","phone":"3331234567"}')::text, true);
select public.test_assert((current_setting('test.ta')::jsonb ->> 'total')::numeric = 12, 'totale asporto');
select public.test_assert((current_setting('test.ta')::jsonb ->> 'pickupNumber')::int = 1, 'numero ritiro');
select public.test_expect_error($$select public.place_takeaway_order('00000000-0000-0000-0000-0000000000f0', '[{"dishId":"00000000-0000-0000-0000-0000000000d1","quantity":1}]', '{"first_name":"Luca"}')$$, 'missing_field');
select public.test_assert(public.get_takeaway_order(current_setting('test.ta')::jsonb ->> 'token') ->> 'status' = 'received', 'stato asporto');
select public.test_assert((select count(*) from public.orders) = 1, 'cliente asporto vede solo il proprio ordine');

-- prenotazione pubblica
select public.create_public_booking('00000000-0000-0000-0000-0000000000f0', 'Anna', '3339876543', null, now() + interval '1 day', 4);

-- ---------- cucina ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
select public.set_items_status(array(select id from public.order_items where order_id = current_setting('test.order1')::uuid), 'ready');
select public.test_assert((select count(*) from public.order_items where order_id = current_setting('test.order1')::uuid and status = 'ready') = 2, 'piatti pronti');
select public.test_expect_error($$select public.open_table_session('00000000-0000-0000-0000-0000000000e2', 2)$$, 'forbidden');
select public.test_assert((select count(*) from public.session_secrets) = 0, 'cucina non legge PIN');

-- ---------- cameriere: incasso e chiusura ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select public.test_expect_error($$select public.close_table_session((current_setting('test.open')::jsonb ->> 'sessionId')::uuid)$$, 'unpaid');
select public.test_expect_error($$select public.record_payment((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, 'cash', 1000)$$, 'invalid_amount');
select public.record_payment((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, 'cash', 40);
select public.record_payment((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, 'card', 38);
select public.test_assert((public.session_bill((current_setting('test.open')::jsonb ->> 'sessionId')::uuid) ->> 'due')::numeric = 0, 'conto saldato');
select public.close_table_session((current_setting('test.open')::jsonb ->> 'sessionId')::uuid);
select public.set_takeaway_status((current_setting('test.ta')::jsonb ->> 'orderId')::uuid, 'ready');
select public.test_assert(jsonb_array_length(public.get_takeaway_display('00000000-0000-0000-0000-0000000000f0') -> 'ready') = 1, 'display');

-- ---------- cliente dopo la chiusura ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","is_anonymous":true}';
select public.test_assert((select status from public.table_sessions) = 'closed', 'cliente vede la chiusura (realtime)');
select public.test_expect_error($$insert into public.cart_items (session_id, dish_id, quantity) values ((current_setting('test.open')::jsonb ->> 'sessionId')::uuid, '00000000-0000-0000-0000-0000000000d1', 1)$$, null);

-- ---------- owner: analitiche ----------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select public.test_assert((public.restaurant_analytics('00000000-0000-0000-0000-0000000000f0', now() - interval '1 day', now() + interval '1 day') ->> 'revenue')::numeric = 78, 'analitiche incasso');
select public.test_assert((select count(*) from public.bookings) = 1, 'owner vede prenotazione');

-- ---------- anon senza login ----------
reset role;
set local role anon;
select public.test_expect_error($$select * from public.restaurants$$, null);
select public.test_assert(public.get_public_restaurant('00000000-0000-0000-0000-0000000000f0') ->> 'name' = 'Trattoria Test', 'info pubbliche');

reset role;
select 'SMOKE_OK' as result;
