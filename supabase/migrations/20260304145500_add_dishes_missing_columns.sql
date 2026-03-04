-- Aggiunge colonne mancanti alla tabella dishes.
-- La query del menu cliente seleziona is_available e short_code,
-- ma queste colonne non erano nel DB, causando errore silenzioso e menu vuoto.

ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS short_code TEXT;
