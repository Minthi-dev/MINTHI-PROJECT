-- =====================================================================
-- TAKEAWAY FIXES (iPhone stability + single-RPC menu + idempotency)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Single RPC for customer menu (no more direct table reads from client).
--    Returns restaurant info + categories + dishes as a unified JSON.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_takeaway_menu(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT jsonb_build_object(
        'restaurant', (
            SELECT to_jsonb(r2) FROM (
                SELECT id, name, logo_url, address, menu_style, menu_primary_color,
                       takeaway_enabled, takeaway_require_stripe, takeaway_estimated_minutes,
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
            SELECT jsonb_agg(to_jsonb(d2)) FROM (
                SELECT id, name, description, price, vat_rate, category_id,
                       is_active, is_available, image_url, allergens
                FROM public.dishes
                WHERE restaurant_id = p_restaurant_id
                  AND is_active = true
                  AND COALESCE(is_available, true) = true
            ) d2
        ), '[]'::jsonb)
    );
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_menu(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_menu(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Idempotency key for takeaway orders.
--    Clients generate a UUID at cart build time and re-send on retry:
--    same key = return existing order (no duplicate charge, no duplicate pickup number).
-- ---------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_idempotency_key_restaurant
    ON public.orders(restaurant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Harden RPC get_takeaway_order_status — also look up by (restaurant_id, pickup_code)
--    case-insensitively (iPhone auto-capitalization sometimes mangles codes).
-- ---------------------------------------------------------------------
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
    estimated_minutes integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT o.id, o.pickup_number, o.status, o.total_amount, o.paid_amount,
           o.ready_at, o.created_at, o.customer_name,
           r.takeaway_estimated_minutes AS estimated_minutes
    FROM public.orders o
    JOIN public.restaurants r ON r.id = o.restaurant_id
    WHERE o.restaurant_id = p_restaurant_id
      AND upper(o.pickup_code) = upper(p_pickup_code)
      AND o.order_type    = 'takeaway'
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_order_status(uuid, text) TO anon, authenticated, service_role;
