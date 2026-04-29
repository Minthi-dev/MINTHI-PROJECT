-- =====================================================================
-- Takeaway QR pickup
-- ---------------------------------------------------------------------
-- Adds an alternative takeaway flow where the paid customer shows a QR
-- code and staff scan it to hand out products. Item pickup is atomic so
-- multiple staff devices cannot double-deliver the same quantity.
-- =====================================================================

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS takeaway_pickup_mode text NOT NULL DEFAULT 'code';

ALTER TABLE public.restaurants
    DROP CONSTRAINT IF EXISTS restaurants_takeaway_pickup_mode_check;

ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_takeaway_pickup_mode_check
    CHECK (takeaway_pickup_mode IN ('code', 'qr'));

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS takeaway_pickup_mode text NOT NULL DEFAULT 'code',
    ADD COLUMN IF NOT EXISTS takeaway_pickup_token text;

ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_takeaway_pickup_mode_check;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_takeaway_pickup_mode_check
    CHECK (takeaway_pickup_mode IN ('code', 'qr'));

CREATE UNIQUE INDEX IF NOT EXISTS orders_takeaway_pickup_token_uidx
    ON public.orders (takeaway_pickup_token)
    WHERE takeaway_pickup_token IS NOT NULL;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS takeaway_picked_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
    DROP CONSTRAINT IF EXISTS order_items_takeaway_picked_quantity_check;

ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_takeaway_picked_quantity_check
    CHECK (takeaway_picked_quantity >= 0 AND takeaway_picked_quantity <= quantity);

COMMENT ON COLUMN public.restaurants.takeaway_pickup_mode IS
    'Modalità ritiro asporto: code = numero ritiro, qr = QR cliente scannerizzabile dallo staff.';

COMMENT ON COLUMN public.orders.takeaway_pickup_token IS
    'Token segreto mostrato nel QR cliente per validare il ritiro asporto.';

COMMENT ON COLUMN public.order_items.takeaway_picked_quantity IS
    'Quantità già consegnata al cliente nel flusso ritiro QR.';

UPDATE public.restaurants
SET takeaway_pickup_mode = 'code'
WHERE takeaway_pickup_mode IS NULL;

UPDATE public.orders
SET takeaway_pickup_mode = 'code'
WHERE takeaway_pickup_mode IS NULL;

UPDATE public.restaurants
SET takeaway_collect_email = false,
    takeaway_email_required = false
WHERE COALESCE(takeaway_email_required, false) = false;

ALTER TABLE public.restaurant_fiscal_settings
    ALTER COLUMN fiscal_email_to_customer SET DEFAULT false;

UPDATE public.restaurant_fiscal_settings
SET fiscal_email_to_customer = false;

DROP FUNCTION IF EXISTS public.get_takeaway_restaurant_info(uuid);

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
    takeaway_pickup_mode text,
    enable_stripe_payments boolean,
    stripe_connect_enabled boolean,
    takeaway_collect_first_name boolean,
    takeaway_first_name_required boolean,
    takeaway_collect_last_name boolean,
    takeaway_last_name_required boolean,
    takeaway_collect_phone boolean,
    takeaway_phone_required boolean,
    takeaway_collect_email boolean,
    takeaway_email_required boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT id, name, logo_url, address, menu_style, menu_primary_color,
           takeaway_enabled, takeaway_require_stripe,
           public.get_takeaway_restaurant_prep_estimate(p_restaurant_id) AS takeaway_estimated_minutes,
           takeaway_pickup_notice,
           COALESCE(takeaway_pickup_mode, 'code') AS takeaway_pickup_mode,
           enable_stripe_payments, stripe_connect_enabled,
           COALESCE(takeaway_collect_first_name, true)  AS takeaway_collect_first_name,
           COALESCE(takeaway_first_name_required, true) AS takeaway_first_name_required,
           COALESCE(takeaway_collect_last_name, false)  AS takeaway_collect_last_name,
           COALESCE(takeaway_last_name_required, false) AS takeaway_last_name_required,
           COALESCE(takeaway_collect_phone, true)       AS takeaway_collect_phone,
           COALESCE(takeaway_phone_required, true)      AS takeaway_phone_required,
           COALESCE(takeaway_collect_email, false)      AS takeaway_collect_email,
           COALESCE(takeaway_email_required, false)     AS takeaway_email_required
    FROM public.restaurants
    WHERE id = p_restaurant_id
      AND COALESCE(is_active, true) = true;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_restaurant_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_restaurant_info(uuid) TO anon, authenticated, service_role;

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
                       takeaway_pickup_notice,
                       COALESCE(takeaway_pickup_mode, 'code') AS takeaway_pickup_mode,
                       enable_stripe_payments, stripe_connect_enabled,
                       COALESCE(takeaway_collect_first_name, true)  AS takeaway_collect_first_name,
                       COALESCE(takeaway_first_name_required, true) AS takeaway_first_name_required,
                       COALESCE(takeaway_collect_last_name, false)  AS takeaway_collect_last_name,
                       COALESCE(takeaway_last_name_required, false) AS takeaway_last_name_required,
                       COALESCE(takeaway_collect_phone, true)       AS takeaway_collect_phone,
                       COALESCE(takeaway_phone_required, true)      AS takeaway_phone_required,
                       COALESCE(takeaway_collect_email, false)      AS takeaway_collect_email,
                       COALESCE(takeaway_email_required, false)     AS takeaway_email_required
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
    takeaway_require_stripe boolean,
    takeaway_pickup_mode text,
    takeaway_pickup_token text,
    items jsonb
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
    ),
    item_rows AS (
        SELECT
            oi.order_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', oi.id,
                    'name', COALESCE(oi.dish_name_snapshot, d.name, 'Prodotto'),
                    'quantity', oi.quantity,
                    'picked_quantity', LEAST(COALESCE(oi.takeaway_picked_quantity, 0), oi.quantity),
                    'remaining_quantity', GREATEST(oi.quantity - COALESCE(oi.takeaway_picked_quantity, 0), 0),
                    'status', oi.status
                )
                ORDER BY oi.created_at, oi.id
            ) AS items
        FROM public.order_items oi
        LEFT JOIN public.dishes d ON d.id = oi.dish_id
        JOIN target_order t ON t.id = oi.order_id
        GROUP BY oi.order_id
    )
    SELECT t.id, t.pickup_number, t.status, t.total_amount, t.paid_amount,
           t.ready_at, t.created_at, COALESCE(t.customer_name, 'Cliente') AS customer_name,
           COALESCE(ie.minutes, public.get_takeaway_restaurant_prep_estimate(p_restaurant_id), 8) AS estimated_minutes,
           r.takeaway_require_stripe,
           COALESCE(t.takeaway_pickup_mode, r.takeaway_pickup_mode, 'code') AS takeaway_pickup_mode,
           t.takeaway_pickup_token,
           COALESCE(ir.items, '[]'::jsonb) AS items
    FROM target_order t
    JOIN public.restaurants r ON r.id = t.restaurant_id
    LEFT JOIN item_estimate ie ON ie.order_id = t.id
    LEFT JOIN item_rows ir ON ir.order_id = t.id;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_order_status(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_takeaway_pickup_item(
    p_restaurant_id uuid,
    p_order_id uuid,
    p_order_item_id uuid,
    p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_item public.order_items%ROWTYPE;
    v_qty integer;
    v_current integer;
    v_new_picked integer;
    v_unpicked_count integer;
    v_fully_paid boolean;
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'Quantità non valida';
    END IF;

    SELECT *
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND restaurant_id = p_restaurant_id
      AND order_type = 'takeaway'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ordine non trovato';
    END IF;

    IF v_order.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Ordine annullato';
    END IF;

    v_fully_paid := COALESCE(v_order.paid_amount, 0) + 0.01 >= COALESCE(v_order.total_amount, 0);
    IF NOT v_fully_paid THEN
        RAISE EXCEPTION 'Ordine non ancora pagato';
    END IF;

    SELECT *
    INTO v_item
    FROM public.order_items
    WHERE id = p_order_item_id
      AND order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prodotto non trovato';
    END IF;

    v_qty := GREATEST(COALESCE(v_item.quantity, 0), 0);
    v_current := LEAST(COALESCE(v_item.takeaway_picked_quantity, 0), v_qty);

    IF v_current >= v_qty THEN
        RAISE EXCEPTION 'Prodotto già ritirato';
    END IF;

    v_new_picked := LEAST(v_qty, v_current + p_quantity);

    UPDATE public.order_items
    SET takeaway_picked_quantity = v_new_picked,
        status = CASE WHEN v_new_picked >= v_qty THEN 'DELIVERED' ELSE status END
    WHERE id = p_order_item_id;

    SELECT COUNT(*)
    INTO v_unpicked_count
    FROM public.order_items
    WHERE order_id = p_order_id
      AND COALESCE(status, '') <> 'CANCELLED'
      AND LEAST(COALESCE(takeaway_picked_quantity, 0), quantity) < quantity;

    IF v_unpicked_count = 0 THEN
        UPDATE public.orders
        SET status = 'PAID',
            picked_up_at = COALESCE(picked_up_at, now()),
            closed_at = COALESCE(closed_at, now())
        WHERE id = p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'orderId', p_order_id,
        'orderItemId', p_order_item_id,
        'pickedQuantity', v_new_picked,
        'remainingQuantity', GREATEST(v_qty - v_new_picked, 0),
        'orderCompleted', v_unpicked_count = 0
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_takeaway_pickup_item(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_takeaway_pickup_item(uuid, uuid, uuid, integer) TO service_role;
