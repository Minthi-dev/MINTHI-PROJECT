-- Fix dell'advisor di Supabase: VIEW non avevano security_invoker=on,
-- quindi venivano eseguite con i privilegi del proprietario (postgres)
-- e bypassavano la RLS della tabella sottostante. Questo permetteva ai
-- ruoli anon/authenticated di leggere righe che la RLS avrebbe nascosto.
--
-- Con security_invoker = on la view eredita i privilegi dell'utente
-- chiamante e la RLS della tabella sottostante viene applicata.
--
-- Riferimento: https://supabase.com/docs/guides/database/database-linter
-- Lint: 0010_security_definer_view

ALTER VIEW IF EXISTS public.restaurants_public SET (security_invoker = on);
ALTER VIEW IF EXISTS public.users_safe SET (security_invoker = on);
ALTER VIEW IF EXISTS public.fiscal_receipts_stats_30d SET (security_invoker = on);

-- Difesa-in-profondità: revoca i grant ad anon/authenticated dalle view
-- "stats" che non sono mai pensate per il client diretto. Restano leggibili
-- via service_role usato dalle edge function.
REVOKE ALL ON public.fiscal_receipts_stats_30d FROM anon, authenticated;

-- restaurants_public e users_safe restano accessibili a anon/authenticated
-- perché alcune route pubbliche le usano (landing, public booking page,
-- TakeawayMenu). Ora però rispettano la RLS sottostante: la tabella
-- restaurants ha policy che lasciano vedere solo i campi public-safe e
-- la tabella users non è leggibile da anon/authenticated, quindi
-- users_safe sarà di fatto vuota se chiamata senza service_role —
-- comportamento corretto.
