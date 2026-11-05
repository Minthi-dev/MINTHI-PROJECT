-- =====================================================================
-- MINTHI v2 · 008 · Job pianificati (pg_cron)
-- Il worker fiscale legge URL e chiave interna dal Vault:
--   vault: minthi_functions_url, minthi_internal_key
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname like 'minthi-%' loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

select cron.schedule('minthi-maintenance', '*/15 * * * *', $$select public.maintenance()$$);

select cron.schedule('minthi-fiscal-worker', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'minthi_functions_url') || '/fiscal-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-minthi-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'minthi_internal_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000)
  where exists (select 1 from public.fiscal_jobs where status = 'queued' and run_after <= now())
$$);
