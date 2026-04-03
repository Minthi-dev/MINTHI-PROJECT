-- 1. subscription_payments: rendere restaurant_id nullable e cambiare FK da CASCADE a SET NULL
--    Necessario perché deleteRestaurant ora fa UPDATE SET restaurant_id = NULL per preservare i dati per le statistiche admin
ALTER TABLE public.subscription_payments ALTER COLUMN restaurant_id DROP NOT NULL;

ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_restaurant_id_fkey;
ALTER TABLE public.subscription_payments
    ADD CONSTRAINT subscription_payments_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE SET NULL;

-- 2. archived_order_items: allineare CHECK constraint con order_items (accettare tutti gli stati)
ALTER TABLE public.archived_order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE public.archived_order_items
    ADD CONSTRAINT order_items_status_check CHECK (
        status = ANY (ARRAY[
            'PENDING'::text, 'IN_PREPARATION'::text, 'READY'::text, 'SERVED'::text,
            'DELIVERED'::text, 'PAID'::text, 'CANCELLED'::text,
            'pending'::text, 'preparing'::text, 'ready'::text, 'served'::text,
            'delivered'::text, 'paid'::text, 'cancelled'::text
        ])
    );
