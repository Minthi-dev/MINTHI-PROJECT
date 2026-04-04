-- ============================================================
-- Fix get_admin_stats to include archived data in statistics
-- Without this, archiving old sessions breaks historical stats
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_admin_stats(
    p_start_date timestamptz,
    p_end_date   timestamptz,
    p_restaurant_ids uuid[] DEFAULT NULL
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
    -- UNION live + archived orders
    all_orders AS (
        SELECT id, restaurant_id, status, total_amount, created_at, closed_at
        FROM orders
        UNION ALL
        SELECT id, restaurant_id, status, total_amount, created_at, closed_at
        FROM archived_orders
    ),
    -- UNION live + archived sessions
    all_sessions AS (
        SELECT id, restaurant_id, status, customer_count, opened_at, closed_at
        FROM table_sessions
        UNION ALL
        SELECT id, restaurant_id, status, customer_count, opened_at, closed_at
        FROM archived_table_sessions
    ),
    -- Filtered orders in date range
    filtered_orders AS (
        SELECT
            o.id,
            o.restaurant_id,
            o.status,
            o.total_amount,
            o.created_at,
            EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Europe/Rome')::int AS hour_of_day,
            (o.created_at AT TIME ZONE 'Europe/Rome')::date AS order_date
        FROM all_orders o
        WHERE o.created_at >= p_start_date
          AND o.created_at <= p_end_date
          AND (NOT v_restaurant_filter OR o.restaurant_id = ANY(p_restaurant_ids))
    ),
    -- Filtered sessions in date range
    filtered_sessions AS (
        SELECT
            ts.id,
            ts.restaurant_id,
            ts.status,
            ts.customer_count,
            ts.opened_at
        FROM all_sessions ts
        WHERE ts.opened_at >= p_start_date
          AND ts.opened_at <= p_end_date
          AND (NOT v_restaurant_filter OR ts.restaurant_id = ANY(p_restaurant_ids))
    ),
    -- Base metrics
    base_metrics AS (
        SELECT
            COUNT(*) FILTER (WHERE status = 'PAID')                        AS paid_orders,
            COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0)  AS total_revenue,
            COUNT(*)                                                         AS total_orders,
            COUNT(*) FILTER (WHERE status = 'OPEN')                        AS active_orders
        FROM filtered_orders
    ),
    -- Session metrics
    session_metrics AS (
        SELECT
            COUNT(*)                                AS total_sessions,
            COALESCE(SUM(customer_count), 0)        AS total_customers,
            COUNT(*) FILTER (WHERE status = 'OPEN') AS active_sessions
        FROM filtered_sessions
    ),
    -- Revenue per restaurant
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
    -- Peak hours (0-23)
    peak_hours AS (
        SELECT
            gs.hour,
            COUNT(o.id) AS count
        FROM generate_series(0, 23) AS gs(hour)
        LEFT JOIN filtered_orders o ON o.hour_of_day = gs.hour
        GROUP BY gs.hour
        ORDER BY gs.hour
    ),
    -- Daily growth
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
