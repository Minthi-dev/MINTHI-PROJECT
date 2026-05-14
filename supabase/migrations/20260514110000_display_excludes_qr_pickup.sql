-- =====================================================================
-- The "Display sala d'attesa" (PublicDisplayScreen) shows the pickup
-- number while the order is PREPARING / READY so the customer can see
-- when their turn comes. This UX only makes sense for the "code"
-- pickup mode (verbal call by number).
--
-- For "qr" pickup mode the customer scans their own personal QR code
-- and the staff acknowledges it inline — the display number is
-- irrelevant for them and clutters the screen for everyone else.
--
-- Update get_takeaway_display to hide QR-pickup orders.
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
      AND o.status IN ('PENDING', 'PREPARING', 'READY')
      AND COALESCE(o.takeaway_pickup_mode, 'code') = 'code'
    ORDER BY o.created_at ASC
    LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_display(uuid) TO anon, authenticated, service_role;
