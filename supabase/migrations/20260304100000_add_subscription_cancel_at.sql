-- Aggiunge la data di fine abbonamento quando l'utente disdice (cancel_at_period_end)
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS subscription_cancel_at TIMESTAMPTZ;
