-- Fix: permetti anche agli utenti autenticati di inserire in pending_registrations.
-- L'utente che visita la pagina di onboarding potrebbe avere ancora una sessione attiva.

CREATE POLICY "authenticated insert pending_registrations"
    ON public.pending_registrations FOR INSERT TO authenticated WITH CHECK (true);
