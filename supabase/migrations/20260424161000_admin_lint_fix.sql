-- Fix schema lint errors left by older cleanup migrations.

DROP FUNCTION IF EXISTS public.reset_database_admin();

CREATE FUNCTION public.reset_database_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_id uuid;
    admin_email text;
    admin_name text;
    admin_username text;
    admin_password_hash text;
BEGIN
    SELECT id, email, name, username, password_hash
    INTO admin_id, admin_email, admin_name, admin_username, admin_password_hash
    FROM public.users
    WHERE role = 'ADMIN'
    LIMIT 1;

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

    IF admin_id IS NOT NULL THEN
        INSERT INTO public.users (id, email, name, username, password_hash, role)
        VALUES (admin_id, admin_email, admin_name, admin_username, admin_password_hash, 'ADMIN');
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_database_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_database_admin() TO service_role;

DROP FUNCTION IF EXISTS public.archive_old_sessions(integer);

CREATE FUNCTION public.archive_old_sessions(p_days_old integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff timestamptz := now() - (p_days_old || ' days')::interval;
    v_sessions_archived int := 0;
    v_orders_archived int := 0;
    v_items_archived int := 0;
BEGIN
    WITH archived AS (
        INSERT INTO public.archived_order_items (
            id, order_id, dish_id, quantity, note, status,
            created_at, course_number, restaurant_id, ready_at
        )
        SELECT
            oi.id, oi.order_id, oi.dish_id, oi.quantity, oi.note, oi.status,
            oi.created_at, oi.course_number, oi.restaurant_id, oi.ready_at
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        JOIN public.table_sessions ts ON ts.id = o.table_session_id
        WHERE ts.status = 'CLOSED'
          AND ts.closed_at < v_cutoff
          AND o.order_type = 'dine_in'
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    SELECT count(*) INTO v_items_archived FROM archived;

    WITH archived AS (
        INSERT INTO public.archived_orders (
            id, restaurant_id, table_session_id, status,
            total_amount, created_at, closed_at, payment_method
        )
        SELECT
            o.id, o.restaurant_id, o.table_session_id, o.status,
            o.total_amount, o.created_at, o.closed_at, o.payment_method
        FROM public.orders o
        JOIN public.table_sessions ts ON ts.id = o.table_session_id
        WHERE ts.status = 'CLOSED'
          AND ts.closed_at < v_cutoff
          AND o.order_type = 'dine_in'
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    SELECT count(*) INTO v_orders_archived FROM archived;

    WITH archived AS (
        INSERT INTO public.archived_table_sessions (
            id, restaurant_id, table_id, status, opened_at,
            closed_at, session_pin, customer_count, ayce_enabled, coperto_enabled
        )
        SELECT
            ts.id, ts.restaurant_id, ts.table_id, ts.status, ts.opened_at,
            ts.closed_at, ts.session_pin, ts.customer_count, ts.ayce_enabled, ts.coperto_enabled
        FROM public.table_sessions ts
        WHERE ts.status = 'CLOSED'
          AND ts.closed_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    SELECT count(*) INTO v_sessions_archived FROM archived;

    DELETE FROM public.order_items oi
    USING public.orders o
    JOIN public.table_sessions ts ON ts.id = o.table_session_id
    WHERE oi.order_id = o.id
      AND ts.status = 'CLOSED'
      AND ts.closed_at < v_cutoff
      AND o.order_type = 'dine_in';

    DELETE FROM public.orders o
    USING public.table_sessions ts
    WHERE o.table_session_id = ts.id
      AND ts.status = 'CLOSED'
      AND ts.closed_at < v_cutoff
      AND o.order_type = 'dine_in';

    DELETE FROM public.table_sessions
    WHERE status = 'CLOSED'
      AND closed_at < v_cutoff;

    RETURN jsonb_build_object(
        'sessions_archived', v_sessions_archived,
        'orders_archived', v_orders_archived,
        'items_archived', v_items_archived,
        'cutoff_date', v_cutoff
    );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_old_sessions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_old_sessions(integer) TO service_role;
