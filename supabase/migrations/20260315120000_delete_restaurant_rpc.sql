-- RPC function to delete a restaurant and all its child records
-- Uses SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION delete_restaurant_admin(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_logo_url text;
    v_owner_id uuid;
BEGIN
    -- Get restaurant info
    SELECT logo_url, owner_id INTO v_logo_url, v_owner_id
    FROM restaurants WHERE id = p_restaurant_id;

    -- Delete pin_attempts (depends on tables)
    DELETE FROM pin_attempts WHERE table_id IN (
        SELECT id FROM tables WHERE restaurant_id = p_restaurant_id
    );

    -- Delete cart_items (depends on table_sessions)
    DELETE FROM cart_items WHERE session_id IN (
        SELECT id FROM table_sessions WHERE restaurant_id = p_restaurant_id
    );

    -- Delete order_items (depends on orders)
    DELETE FROM order_items WHERE order_id IN (
        SELECT id FROM orders WHERE restaurant_id = p_restaurant_id
    );

    -- Delete direct restaurant dependencies
    DELETE FROM waiter_activity_logs WHERE restaurant_id = p_restaurant_id;
    DELETE FROM restaurant_staff WHERE restaurant_id = p_restaurant_id;
    DELETE FROM restaurant_bonuses WHERE restaurant_id = p_restaurant_id;
    DELETE FROM restaurant_discounts WHERE restaurant_id = p_restaurant_id;
    DELETE FROM orders WHERE restaurant_id = p_restaurant_id;
    DELETE FROM table_sessions WHERE restaurant_id = p_restaurant_id;
    DELETE FROM bookings WHERE restaurant_id = p_restaurant_id;

    -- Delete custom menu dependencies
    DELETE FROM custom_menu_schedules WHERE custom_menu_id IN (
        SELECT id FROM custom_menus WHERE restaurant_id = p_restaurant_id
    );
    DELETE FROM custom_menu_dishes WHERE custom_menu_id IN (
        SELECT id FROM custom_menus WHERE restaurant_id = p_restaurant_id
    );
    DELETE FROM custom_menus WHERE restaurant_id = p_restaurant_id;

    DELETE FROM dishes WHERE restaurant_id = p_restaurant_id;
    DELETE FROM categories WHERE restaurant_id = p_restaurant_id;
    DELETE FROM tables WHERE restaurant_id = p_restaurant_id;
    DELETE FROM rooms WHERE restaurant_id = p_restaurant_id;

    -- Delete archived order items (depends on archived_orders)
    DELETE FROM archived_order_items WHERE order_id IN (
        SELECT id FROM archived_orders WHERE restaurant_id = p_restaurant_id
    );
    DELETE FROM archived_orders WHERE restaurant_id = p_restaurant_id;
    DELETE FROM archived_table_sessions WHERE restaurant_id = p_restaurant_id;

    -- Preserve subscription_payments for stats: set restaurant_id to NULL
    UPDATE subscription_payments SET restaurant_id = NULL WHERE restaurant_id = p_restaurant_id;

    -- Delete the restaurant itself
    DELETE FROM restaurants WHERE id = p_restaurant_id;

    -- Delete the owner user if they exist and are not ADMIN
    IF v_owner_id IS NOT NULL THEN
        DELETE FROM users WHERE id = v_owner_id AND role != 'ADMIN';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_restaurant_admin(uuid) TO anon;
GRANT EXECUTE ON FUNCTION delete_restaurant_admin(uuid) TO authenticated;
