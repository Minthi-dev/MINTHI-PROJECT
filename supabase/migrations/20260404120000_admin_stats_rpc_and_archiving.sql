-- ============================================================
-- 1. RPC: get_admin_stats
--    Calcola tutte le statistiche admin server-side.
--    Sostituisce il caricamento di 5000 ordini nel browser.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_admin_stats(
    p_start_date timestamptz,
    p_end_date   timestamptz,
    p_restaurant_ids uuid[] DEFAULT NULL  -- NULL = tutti i ristoranti
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
    v_restaurant_filter boolean := (p_restaurant_ids IS NOT NULL AND array_length(p_restaurant_ids, 1) > 0);
BEGIN
    WITH
    -- Ordini nel range di date
    filtered_orders AS (
        SELECT
            o.id,
            o.restaurant_id,
            o.status,
            o.total_amount,
            o.created_at,
            EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Europe/Rome')::int AS hour_of_day,
            (o.created_at AT TIME ZONE 'Europe/Rome')::date AS order_date
        FROM orders o
        WHERE o.created_at >= p_start_date
          AND o.created_at <= p_end_date
          AND (NOT v_restaurant_filter OR o.restaurant_id = ANY(p_restaurant_ids))
    ),
    -- Sessioni nel range di date
    filtered_sessions AS (
        SELECT
            ts.id,
            ts.restaurant_id,
            ts.status,
            ts.customer_count,
            ts.opened_at
        FROM table_sessions ts
        WHERE ts.opened_at >= p_start_date
          AND ts.opened_at <= p_end_date
          AND (NOT v_restaurant_filter OR ts.restaurant_id = ANY(p_restaurant_ids))
    ),
    -- Metriche base
    base_metrics AS (
        SELECT
            COUNT(*) FILTER (WHERE status = 'PAID')                        AS paid_orders,
            COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0)  AS total_revenue,
            COUNT(*)                                                         AS total_orders,
            COUNT(*) FILTER (WHERE status = 'OPEN')                        AS active_orders
        FROM filtered_orders
    ),
    -- Metriche sessioni
    session_metrics AS (
        SELECT
            COUNT(*)                                AS total_sessions,
            COALESCE(SUM(customer_count), 0)        AS total_customers,
            COUNT(*) FILTER (WHERE status = 'OPEN') AS active_sessions
        FROM filtered_sessions
    ),
    -- Revenue per ristorante
    revenue_by_restaurant AS (
        SELECT
            r.id,
            r.name,
            COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'PAID'), 0) AS revenue,
            COUNT(o.id)                                                          AS orders,
            COALESCE(SUM(s.customer_count), 0)                                  AS customers
        FROM restaurants r
        LEFT JOIN filtered_orders o ON o.restaurant_id = r.id
        LEFT JOIN filtered_sessions s ON s.restaurant_id = r.id
        WHERE (NOT v_restaurant_filter OR r.id = ANY(p_restaurant_ids))
        GROUP BY r.id, r.name
        ORDER BY revenue DESC
    ),
    -- Ore di punta (0-23)
    peak_hours AS (
        SELECT
            gs.hour,
            COUNT(o.id) AS count
        FROM generate_series(0, 23) AS gs(hour)
        LEFT JOIN filtered_orders o ON o.hour_of_day = gs.hour
        GROUP BY gs.hour
        ORDER BY gs.hour
    ),
    -- Crescita giornaliera
    daily_growth AS (
        SELECT
            order_date::text AS date,
            COUNT(*)         AS orders,
            COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0) AS revenue
        FROM filtered_orders
        GROUP BY order_date
        ORDER BY order_date
    )
    SELECT jsonb_build_object(
        'totalRevenue',           (SELECT total_revenue FROM base_metrics),
        'totalOrders',            (SELECT total_orders FROM base_metrics),
        'activeOrders',           (SELECT active_orders FROM base_metrics),
        'paidOrders',             (SELECT paid_orders FROM base_metrics),
        'totalSessions',          (SELECT total_sessions FROM session_metrics),
        'totalCustomers',         (SELECT total_customers FROM session_metrics),
        'activeSessions',         (SELECT active_sessions FROM session_metrics),
        'totalRestaurants',       (SELECT COUNT(*) FROM restaurants),
        'revenueByRestaurant',    (SELECT jsonb_agg(r ORDER BY r->>'revenue' DESC) FROM (
                                      SELECT jsonb_build_object('id', id, 'name', name, 'revenue', revenue, 'orders', orders, 'customers', customers)
                                      FROM revenue_by_restaurant
                                  ) sub(r)),
        'peakHours',              (SELECT jsonb_agg(jsonb_build_object('hour', hour, 'count', count) ORDER BY hour) FROM peak_hours),
        'dailyGrowth',            (SELECT jsonb_agg(jsonb_build_object('date', date, 'orders', orders, 'revenue', revenue) ORDER BY date) FROM daily_growth)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stats(timestamptz, timestamptz, uuid[]) TO anon, authenticated, service_role;


-- ============================================================
-- 2. FUNZIONE DI ARCHIVIAZIONE: archive_old_sessions
--    Sposta sessioni > 90 giorni nelle tabelle archivio.
--    Riduce la dimensione delle tabelle live.
-- ============================================================
CREATE OR REPLACE FUNCTION public.archive_old_sessions(p_days_old integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff timestamptz := NOW() - (p_days_old || ' days')::interval;
    v_sessions_archived int := 0;
    v_orders_archived int := 0;
    v_items_archived int := 0;
BEGIN
    -- Archivia order_items
    WITH archived AS (
        INSERT INTO archived_order_items
        SELECT oi.*
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN table_sessions ts ON ts.id = o.table_session_id
        WHERE ts.status = 'CLOSED'
          AND ts.closed_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    SELECT COUNT(*) INTO v_items_archived FROM archived;

    -- Archivia orders
    WITH archived AS (
        INSERT INTO archived_orders
        SELECT o.*
        FROM orders o
        JOIN table_sessions ts ON ts.id = o.table_session_id
        WHERE ts.status = 'CLOSED'
          AND ts.closed_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    SELECT COUNT(*) INTO v_orders_archived FROM archived;

    -- Archivia table_sessions
    WITH archived AS (
        INSERT INTO archived_table_sessions
        SELECT ts.*
        FROM table_sessions ts
        WHERE ts.status = 'CLOSED'
          AND ts.closed_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    SELECT COUNT(*) INTO v_sessions_archived FROM archived;

    -- Elimina dalle tabelle live (in ordine FK: items → orders → sessions)
    DELETE FROM order_items oi
    USING orders o
    JOIN table_sessions ts ON ts.id = o.table_session_id
    WHERE oi.order_id = o.id
      AND ts.status = 'CLOSED'
      AND ts.closed_at < v_cutoff;

    DELETE FROM orders o
    USING table_sessions ts
    WHERE o.table_session_id = ts.id
      AND ts.status = 'CLOSED'
      AND ts.closed_at < v_cutoff;

    DELETE FROM table_sessions
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

GRANT EXECUTE ON FUNCTION public.archive_old_sessions(integer) TO service_role;


-- ============================================================
-- 3. PULIZIA ORFANI: cart_items da sessioni chiuse
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_orphan_cart_items()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted int;
BEGIN
    DELETE FROM cart_items
    WHERE session_id IN (
        SELECT id FROM table_sessions WHERE status = 'CLOSED'
    )
    OR session_id NOT IN (SELECT id FROM table_sessions);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphan_cart_items() TO service_role;


-- ============================================================
-- 4. INDICI aggiuntivi per performance con 50+ ristoranti
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status        ON public.orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_restaurant    ON public.orders(created_at, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_restaurant_status ON public.table_sessions(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_table_sessions_closed_at         ON public.table_sessions(closed_at) WHERE status = 'CLOSED';
CREATE INDEX IF NOT EXISTS idx_order_items_order_id             ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant_date         ON public.bookings(restaurant_id, date_time);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_restaurant ON public.subscription_payments(restaurant_id, created_at DESC);
