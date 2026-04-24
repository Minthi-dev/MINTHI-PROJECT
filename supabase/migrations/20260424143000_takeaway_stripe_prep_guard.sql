-- =====================================================================
-- TAKEAWAY STRIPE PREPAY GUARD
-- - Public display shows only orders actually in preparation/ready.
-- - Customer status can distinguish mandatory online prepay from pay-on-pickup.
-- - New/updated rows cannot materially over-record paid_amount.
-- =====================================================================

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_paid_amount_not_over_total;
ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_paid_amount_not_over_total
    CHECK (paid_amount <= total_amount + 0.01)
    NOT VALID;

-- Unpaid PENDING orders are not "in preparation" and should not appear on
-- the public collection display.
CREATE OR REPLACE FUNCTION public.get_takeaway_display(p_restaurant_id uuid)
RETURNS TABLE(
    id uuid,
    pickup_number integer,
    status text,
    ready_at timestamptz,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT o.id, o.pickup_number, o.status, o.ready_at, o.created_at
    FROM public.orders o
    JOIN public.restaurants r ON r.id = o.restaurant_id
    WHERE o.restaurant_id = p_restaurant_id
      AND r.takeaway_enabled = true
      AND o.order_type = 'takeaway'
      AND o.status IN ('PREPARING', 'READY')
    ORDER BY o.created_at ASC
    LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_display(uuid) TO anon, authenticated, service_role;

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
    SELECT o.id, o.pickup_number, o.status, o.total_amount, o.paid_amount,
           o.ready_at, o.created_at, o.customer_name,
           r.takeaway_estimated_minutes AS estimated_minutes,
           r.takeaway_require_stripe
    FROM public.orders o
    JOIN public.restaurants r ON r.id = o.restaurant_id
    WHERE o.restaurant_id = p_restaurant_id
      AND upper(o.pickup_code) = upper(p_pickup_code)
      AND o.order_type = 'takeaway'
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_order_status(uuid, text) TO anon, authenticated, service_role;
