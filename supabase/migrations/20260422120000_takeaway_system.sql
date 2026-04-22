-- =====================================================================
-- TAKEAWAY (ASPORTO) SYSTEM
-- Dual-mode ordering: dine-in (existing) + takeaway (new)
-- Customer scans QR → orders + pays → public display shows pickup number
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Restaurant-level takeaway configuration
-- ---------------------------------------------------------------------
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS takeaway_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS dine_in_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS takeaway_require_stripe boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS takeaway_estimated_minutes integer NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS takeaway_pickup_notice text;

-- Sanity bounds on estimated minutes
ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS chk_takeaway_minutes;
ALTER TABLE public.restaurants
    ADD CONSTRAINT chk_takeaway_minutes CHECK (takeaway_estimated_minutes BETWEEN 1 AND 240);

-- ---------------------------------------------------------------------
-- 2. Orders table: add takeaway fields and expand status domain
-- ---------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'dine_in',
    ADD COLUMN IF NOT EXISTS pickup_number integer,
    ADD COLUMN IF NOT EXISTS pickup_code text,
    ADD COLUMN IF NOT EXISTS customer_name text,
    ADD COLUMN IF NOT EXISTS customer_phone text,
    ADD COLUMN IF NOT EXISTS customer_notes text,
    ADD COLUMN IF NOT EXISTS paid_amount numeric(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ready_at timestamptz,
    ADD COLUMN IF NOT EXISTS picked_up_at timestamptz,
    ADD COLUMN IF NOT EXISTS payments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Allow takeaway orders to exist without a table session.
ALTER TABLE public.orders ALTER COLUMN table_session_id DROP NOT NULL;

-- Expand status domain: add takeaway-specific states
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY[
        'OPEN'::text,
        'PENDING'::text,
        'PREPARING'::text,
        'READY'::text,
        'PICKED_UP'::text,
        'PAID'::text,
        'CANCELLED'::text
    ]));

-- Order type domain
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_order_type_check CHECK (order_type = ANY (ARRAY['dine_in'::text, 'takeaway'::text]));

-- Context integrity: dine_in requires table_session_id; takeaway requires pickup_number
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_type_requires_ctx;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_type_requires_ctx CHECK (
        (order_type = 'dine_in' AND table_session_id IS NOT NULL)
        OR (order_type = 'takeaway' AND pickup_number IS NOT NULL)
    );

-- paid_amount never negative and never exceeds total_amount materially (soft bound +0.01 for rounding)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_paid_amount;
ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_paid_amount CHECK (paid_amount >= 0);

-- Unique pickup_code per restaurant (when present) — customer identity token
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_pickup_code_restaurant
    ON public.orders(restaurant_id, pickup_code)
    WHERE pickup_code IS NOT NULL;

-- Same pickup_number may recycle per day; ensure uniqueness per (restaurant, day)
-- is enforced via the counter below.

-- ---------------------------------------------------------------------
-- 3. Pickup counters (daily sequence per restaurant)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickup_counters (
    restaurant_id uuid NOT NULL,
    day date NOT NULL,
    last_number integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (restaurant_id, day)
);

ALTER TABLE public.pickup_counters ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only service_role (edge functions) may access.

COMMENT ON TABLE public.pickup_counters IS 'Per-day per-restaurant pickup number sequence; written exclusively via next_pickup_number() RPC.';

-- ---------------------------------------------------------------------
-- 4. RPC: atomic next pickup number
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_pickup_number(
    p_restaurant_id uuid,
    p_tz text DEFAULT 'Europe/Rome'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_day date := (timezone(p_tz, now()))::date;
    v_num integer;
BEGIN
    INSERT INTO public.pickup_counters(restaurant_id, day, last_number, updated_at)
    VALUES (p_restaurant_id, v_day, 1, now())
    ON CONFLICT (restaurant_id, day)
    DO UPDATE SET last_number = public.pickup_counters.last_number + 1,
                  updated_at  = now()
    RETURNING last_number INTO v_num;

    RETURN v_num;
END;
$$;

REVOKE ALL ON FUNCTION public.next_pickup_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_pickup_number(uuid, text) TO service_role;

-- ---------------------------------------------------------------------
-- 5. Public RPC: sanitized takeaway board for the in-room display
--    Returns only fields safe for public display (no customer name/phone).
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
      AND (
        o.status IN ('PENDING', 'PREPARING', 'READY')
        OR (o.status IN ('PICKED_UP', 'PAID') AND o.picked_up_at IS NOT NULL AND o.picked_up_at > now() - interval '5 minutes')
      )
    ORDER BY o.created_at ASC
    LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_display(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Public RPC: customer fetches their own takeaway order by pickup_code
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
      AND o.pickup_code   = p_pickup_code
      AND o.order_type    = 'takeaway'
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_order_status(uuid, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Public RPC: restaurant metadata needed for customer takeaway entry
-- ---------------------------------------------------------------------
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
           takeaway_enabled, takeaway_require_stripe, takeaway_estimated_minutes,
           takeaway_pickup_notice, enable_stripe_payments, stripe_connect_enabled
    FROM public.restaurants
    WHERE id = p_restaurant_id
      AND COALESCE(is_active, true) = true;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_restaurant_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_restaurant_info(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. Indexes for dashboard + display queries
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_takeaway_active
    ON public.orders(restaurant_id, created_at)
    WHERE order_type = 'takeaway' AND status IN ('PENDING', 'PREPARING', 'READY');

CREATE INDEX IF NOT EXISTS idx_orders_type_restaurant
    ON public.orders(restaurant_id, order_type, status);

-- ---------------------------------------------------------------------
-- 9. Backfill: existing orders are all dine_in
-- ---------------------------------------------------------------------
-- DEFAULT 'dine_in' already applied; ensure no nulls remain (legacy inserts):
UPDATE public.orders SET order_type = 'dine_in' WHERE order_type IS NULL;
