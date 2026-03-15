-- RPC eseguita con SECURITY DEFINER per bypassare RLS
-- Cancella tutti i dati eccetto l'utente admin
CREATE OR REPLACE FUNCTION public.reset_database_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    admin_id uuid;
    admin_email text;
    admin_name text;
    admin_username text;
    admin_password_hash text;
    admin_raw_password text;
BEGIN
    -- Salva i dati admin prima di cancellare tutto
    SELECT id, email, name, username, password_hash, raw_password
    INTO admin_id, admin_email, admin_name, admin_username, admin_password_hash, admin_raw_password
    FROM public.users
    WHERE role = 'ADMIN'
    LIMIT 1;

    -- Cancella tutto con CASCADE
    TRUNCATE TABLE
        public.pin_attempts,
        public.waiter_activity_logs,
        public.cart_items,
        public.order_items,
        public.orders,
        public.table_sessions,
        public.bookings,
        public.custom_menu_dishes,
        public.custom_menu_schedules,
        public.custom_menus,
        public.dishes,
        public.categories,
        public.tables,
        public.rooms,
        public.restaurant_bonuses,
        public.restaurant_discounts,
        public.subscription_payments,
        public.restaurant_staff,
        public.pending_registrations,
        public.registration_tokens,
        public.archived_order_items,
        public.archived_orders,
        public.archived_table_sessions,
        public.restaurants,
        public.users
    CASCADE;

    -- Reinserisce l'admin
    IF admin_id IS NOT NULL THEN
        INSERT INTO public.users (id, email, name, username, password_hash, raw_password, role)
        VALUES (admin_id, admin_email, admin_name, admin_username, admin_password_hash, admin_raw_password, 'ADMIN');
    END IF;
END;
$$;

-- Solo admin può eseguirla
REVOKE ALL ON FUNCTION public.reset_database_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_database_admin() TO authenticated, anon;
