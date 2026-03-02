-- Pulizia degli utenti "fantasma" rimasti bloccati nel database
-- durante i tentativi di registrazione falliti precedenti (prima che introducessimo l'RPC atomico).
-- Questo sbloccherà le email che risultavano "già usate".

DELETE FROM public.users
WHERE role = 'OWNER'
AND id NOT IN (
    SELECT owner_id 
    FROM public.restaurants 
    WHERE owner_id IS NOT NULL
);
