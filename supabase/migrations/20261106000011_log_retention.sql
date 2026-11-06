-- =====================================================================
-- MINTHI v2 · 011 · Ritenzione dei log tecnici
--
-- pg_cron salva ogni esecuzione in cron.job_run_details e pg_net ogni
-- risposta HTTP in net._http_response. Con un job al minuto, in pochi
-- mesi diventano centinaia di MB e sull'istanza Nano saturano il disco.
-- La manutenzione ora li tiene corti.
-- =====================================================================

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

  -- log tecnici (a blocchi, per non bloccare il database)
  delete from cron.job_run_details
  where runid in (select runid from cron.job_run_details where start_time < now() - interval '2 days' limit 5000);
  delete from net._http_response
  where id in (select id from net._http_response where created < now() - interval '1 day' limit 5000);
end $$;
revoke all on function public.maintenance() from public, anon, authenticated;
