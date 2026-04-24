-- =====================================================================
-- SERVER APP SESSIONS + AUTOMATIC TAKEAWAY PREP TIME STATS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Server-side app sessions for custom username/password login.
--    Edge Functions must validate the opaque session token, not only the
--    userId sent by the browser.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('ADMIN', 'OWNER', 'STAFF')),
    restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_active
    ON public.app_sessions(user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_sessions_restaurant
    ON public.app_sessions(restaurant_id)
    WHERE restaurant_id IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'app_sessions'
          AND policyname = 'app_sessions_service_role_only'
    ) THEN
        CREATE POLICY app_sessions_service_role_only
            ON public.app_sessions
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Automatic takeaway prep estimates.
--    A finished order contributes its total ready time divided by the
--    number of units in that order. Dish estimates use recent, reliable
--    samples; low-sample dishes fall back to restaurant-level recent data.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_takeaway_dish_prep_stats(
    p_restaurant_id uuid,
    p_days integer DEFAULT 45
)
RETURNS TABLE(
    dish_id uuid,
    sample_count integer,
    avg_minutes numeric,
    estimate_minutes integer,
    confidence text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    WITH recent_orders AS (
        SELECT
            o.id,
            GREATEST(
                1::numeric,
                LEAST(180::numeric, EXTRACT(EPOCH FROM (o.ready_at - o.created_at)) / 60.0)
            ) AS prep_minutes,
            COALESCE(SUM(oi.quantity), 0)::numeric AS total_units
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.restaurant_id = p_restaurant_id
          AND o.order_type = 'takeaway'
          AND o.ready_at IS NOT NULL
          AND o.created_at >= now() - make_interval(days => GREATEST(7, COALESCE(p_days, 45)))
          AND o.status IN ('READY', 'PICKED_UP', 'PAID')
        GROUP BY o.id
        HAVING COALESCE(SUM(oi.quantity), 0) > 0
    ),
    dish_samples AS (
        SELECT
            oi.dish_id,
            SUM(oi.quantity)::integer AS sample_count,
            AVG(ro.prep_minutes / NULLIF(ro.total_units, 0)) AS avg_minutes
        FROM recent_orders ro
        JOIN public.order_items oi ON oi.order_id = ro.id
        WHERE oi.dish_id IS NOT NULL
        GROUP BY oi.dish_id
    ),
    restaurant_sample AS (
        SELECT
            COALESCE(SUM(total_units), 0)::integer AS sample_count,
            AVG(prep_minutes / NULLIF(total_units, 0)) AS avg_minutes
        FROM recent_orders
    )
    SELECT
        d.id AS dish_id,
        COALESCE(ds.sample_count, 0) AS sample_count,
        ROUND(COALESCE(ds.avg_minutes, rs.avg_minutes, 8)::numeric, 1) AS avg_minutes,
        GREATEST(2, LEAST(45, CEIL(COALESCE(
            CASE WHEN COALESCE(ds.sample_count, 0) >= 3 THEN ds.avg_minutes END,
            CASE WHEN COALESCE(rs.sample_count, 0) >= 6 THEN rs.avg_minutes END,
            8
        ))::integer)) AS estimate_minutes,
        CASE
            WHEN COALESCE(ds.sample_count, 0) >= 8 THEN 'high'
            WHEN COALESCE(ds.sample_count, 0) >= 3 THEN 'medium'
            WHEN COALESCE(rs.sample_count, 0) >= 6 THEN 'restaurant_fallback'
            ELSE 'default'
        END AS confidence
    FROM public.dishes d
    LEFT JOIN dish_samples ds ON ds.dish_id = d.id
    CROSS JOIN restaurant_sample rs
    WHERE d.restaurant_id = p_restaurant_id
      AND d.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_dish_prep_stats(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_dish_prep_stats(uuid, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_takeaway_restaurant_prep_estimate(p_restaurant_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    WITH recent_orders AS (
        SELECT
            GREATEST(
                1::numeric,
                LEAST(180::numeric, EXTRACT(EPOCH FROM (o.ready_at - o.created_at)) / 60.0)
            ) AS prep_minutes,
            COALESCE(SUM(oi.quantity), 0)::numeric AS total_units
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.restaurant_id = p_restaurant_id
          AND o.order_type = 'takeaway'
          AND o.ready_at IS NOT NULL
          AND o.created_at >= now() - interval '45 days'
          AND o.status IN ('READY', 'PICKED_UP', 'PAID')
        GROUP BY o.id
        HAVING COALESCE(SUM(oi.quantity), 0) > 0
    )
    SELECT GREATEST(5, LEAST(60, CEIL(COALESCE(AVG(prep_minutes / NULLIF(total_units, 0)), 8))::integer))
    FROM recent_orders;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_restaurant_prep_estimate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_restaurant_prep_estimate(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_takeaway_menu(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    WITH prep AS (
        SELECT * FROM public.get_takeaway_dish_prep_stats(p_restaurant_id, 45)
    ),
    restaurant_estimate AS (
        SELECT public.get_takeaway_restaurant_prep_estimate(p_restaurant_id) AS minutes
    )
    SELECT jsonb_build_object(
        'restaurant', (
            SELECT to_jsonb(r2) FROM (
                SELECT id, name, logo_url, address, menu_style, menu_primary_color,
                       takeaway_enabled, takeaway_require_stripe,
                       COALESCE((SELECT minutes FROM restaurant_estimate), 8) AS takeaway_estimated_minutes,
                       takeaway_pickup_notice, enable_stripe_payments, stripe_connect_enabled
                FROM public.restaurants
                WHERE id = p_restaurant_id
                  AND COALESCE(is_active, true) = true
            ) r2
        ),
        'categories', COALESCE((
            SELECT jsonb_agg(to_jsonb(c2) ORDER BY c2."order") FROM (
                SELECT id, name, "order", is_active
                FROM public.categories
                WHERE restaurant_id = p_restaurant_id
                  AND is_active = true
            ) c2
        ), '[]'::jsonb),
        'dishes', COALESCE((
            SELECT jsonb_agg(to_jsonb(d2) ORDER BY d2.name) FROM (
                SELECT d.id, d.name, d.description, d.price, d.vat_rate, d.category_id,
                       d.is_active, d.is_available, d.image_url, d.allergens,
                       COALESCE(p.estimate_minutes, (SELECT minutes FROM restaurant_estimate), 8) AS prep_estimated_minutes,
                       COALESCE(p.sample_count, 0) AS prep_sample_count,
                       COALESCE(p.confidence, 'default') AS prep_confidence
                FROM public.dishes d
                LEFT JOIN prep p ON p.dish_id = d.id
                WHERE d.restaurant_id = p_restaurant_id
                  AND d.is_active = true
                  AND COALESCE(d.is_available, true) = true
            ) d2
        ), '[]'::jsonb)
    );
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_menu(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_menu(uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_takeaway_order_status(uuid, text);

CREATE OR REPLACE FUNCTION public.get_takeaway_order_status(
    p_restaurant_id uuid,
    p_pickup_code text
)
RETURNS TABLE(
    id uuid,
    pickup_number integer,
    status text,
    total_amount numeric,
    paid_amount numeric,
    ready_at timestamptz,
    created_at timestamptz,
    customer_name text,
    estimated_minutes integer,
    takeaway_require_stripe boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    WITH target_order AS (
        SELECT o.*
        FROM public.orders o
        WHERE o.restaurant_id = p_restaurant_id
          AND upper(o.pickup_code) = upper(p_pickup_code)
          AND o.order_type = 'takeaway'
        LIMIT 1
    ),
    prep AS (
        SELECT * FROM public.get_takeaway_dish_prep_stats(p_restaurant_id, 45)
    ),
    item_estimate AS (
        SELECT
            oi.order_id,
            GREATEST(5, LEAST(120, CEIL(SUM(oi.quantity * COALESCE(p.estimate_minutes, public.get_takeaway_restaurant_prep_estimate(p_restaurant_id), 8)))::integer)) AS minutes
        FROM public.order_items oi
        LEFT JOIN prep p ON p.dish_id = oi.dish_id
        JOIN target_order t ON t.id = oi.order_id
        GROUP BY oi.order_id
    )
    SELECT t.id, t.pickup_number, t.status, t.total_amount, t.paid_amount,
           t.ready_at, t.created_at, t.customer_name,
           COALESCE(ie.minutes, public.get_takeaway_restaurant_prep_estimate(p_restaurant_id), 8) AS estimated_minutes,
           r.takeaway_require_stripe
    FROM target_order t
    JOIN public.restaurants r ON r.id = t.restaurant_id
    LEFT JOIN item_estimate ie ON ie.order_id = t.id;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_order_status(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_takeaway_restaurant_info(p_restaurant_id uuid)
RETURNS TABLE(
    id uuid,
    name text,
    logo_url text,
    address text,
    menu_style text,
    menu_primary_color text,
    takeaway_enabled boolean,
    takeaway_require_stripe boolean,
    takeaway_estimated_minutes integer,
    takeaway_pickup_notice text,
    enable_stripe_payments boolean,
    stripe_connect_enabled boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT id, name, logo_url, address, menu_style, menu_primary_color,
           takeaway_enabled, takeaway_require_stripe,
           public.get_takeaway_restaurant_prep_estimate(p_restaurant_id) AS takeaway_estimated_minutes,
           takeaway_pickup_notice, enable_stripe_payments, stripe_connect_enabled
    FROM public.restaurants
    WHERE id = p_restaurant_id
      AND COALESCE(is_active, true) = true;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_restaurant_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_restaurant_info(uuid) TO anon, authenticated, service_role;
