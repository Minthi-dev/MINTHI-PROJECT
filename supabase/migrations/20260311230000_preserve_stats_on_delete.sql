-- Preserva subscription_payments quando un ristorante viene eliminato
-- Cambia FK da ON DELETE CASCADE a ON DELETE SET NULL
-- così lo storico incassi rimane visibile nelle statistiche admin

ALTER TABLE public.subscription_payments
    DROP CONSTRAINT IF EXISTS subscription_payments_restaurant_id_fkey;

ALTER TABLE public.subscription_payments
    ADD CONSTRAINT subscription_payments_restaurant_id_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id)
    ON DELETE SET NULL;
