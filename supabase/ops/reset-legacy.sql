-- One-off: rimuove lo schema v1 prima di applicare le migration v2.
-- I dati v1 restano nello schema privato legacy_backup.
do $$
declare j record;
begin
  for j in select jobname from cron.job loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

drop schema public cascade;
create schema public;
alter schema public owner to postgres;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all functions in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
