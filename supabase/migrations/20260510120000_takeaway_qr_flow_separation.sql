-- =====================================================================
-- Takeaway QR flow separation
-- ---------------------------------------------------------------------
-- The public waiting display is for the numbered pickup flow only.
-- QR pickup orders are paid purchases handled by QR scan/product checkoff.
-- =====================================================================

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
      AND COALESCE(o.takeaway_pickup_mode, r.takeaway_pickup_mode, 'code') = 'code'
      AND o.status IN ('PREPARING', 'READY')
    ORDER BY o.created_at ASC
    LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_display(uuid) TO anon, authenticated, service_role;
