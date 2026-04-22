-- =====================================================================
-- 1. Tighten public display: remove an order as soon as it's picked up.
--    Previous version kept PICKED_UP/PAID visible for 5 minutes which
--    confused customers — restaurateurs want the customer number gone
--    the moment they click "Consegnato".
-- 2. Add `order_items.paid_online_at` so dine-in Stripe pre-payments can
--    be tracked without disrupting the kitchen workflow (an item paid
--    online is NOT "done" — the kitchen still has to prepare and deliver
--    it). Webhook must set this timestamp instead of flipping status.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. get_takeaway_display — no more grace window
-- ---------------------------------------------------------------------
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
    ORDER BY o.created_at ASC
    LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_display(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Dine-in pre-payment support: track that an item was paid online
--    WITHOUT marking it as done (kitchen keeps working on it normally).
-- ---------------------------------------------------------------------
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS paid_online_at timestamptz;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS paid_online_session_id text;

CREATE INDEX IF NOT EXISTS ix_order_items_paid_online_session
    ON public.order_items(paid_online_session_id)
    WHERE paid_online_session_id IS NOT NULL;
