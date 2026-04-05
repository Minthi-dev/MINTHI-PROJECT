-- 1. RPC: Aggregate sales per restaurant (replaces unbounded client-side query)
CREATE OR REPLACE FUNCTION get_sales_by_restaurant()
RETURNS TABLE(restaurant_id uuid, total_sales numeric) AS $$
BEGIN
    RETURN QUERY
    SELECT o.restaurant_id, COALESCE(SUM(o.total_amount), 0) AS total_sales
    FROM orders o
    WHERE o.status = 'PAID'
    GROUP BY o.restaurant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RPC: Verify staff session (check if staff member still exists and is active)
CREATE OR REPLACE FUNCTION verify_staff_session(p_staff_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM restaurant_staff
        WHERE id = p_staff_id AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Security: Create a restricted view for restaurants (excludes passwords and stripe secrets)
CREATE OR REPLACE VIEW restaurants_public AS
SELECT
    id, name, phone, address, email, logo_url,
    is_active, created_at, owner_id,
    -- Service config (non-sensitive)
    lunch_time_start, lunch_time_end, dinner_time_start, dinner_time_end,
    cover_charge_per_person, waiter_mode_enabled,
    reservation_duration, weekly_service_hours,
    enable_reservation_room_selection, enable_public_reservations,
    enable_course_splitting, view_only_menu_enabled,
    menu_style, menu_primary_color, show_cooking_times,
    weekly_ayce, weekly_coperto, ayce_price, ayce_max_orders,
    all_you_can_eat, enable_course_suggestions,
    -- Subscription status (non-sensitive, needed for UI)
    subscription_status,
    -- Stripe Connect public flag (non-sensitive)
    stripe_connect_enabled, enable_stripe_payments,
    -- Setup
    demo_completed, setup_completed
    -- EXCLUDED: waiter_password, stripe_customer_id, stripe_subscription_id,
    -- stripe_price_id, stripe_connect_account_id, analytics_password_hash,
    -- vat_number, billing_name, billing_address, billing_city, billing_cap,
    -- billing_province, codice_univoco, suspension_reason
FROM restaurants;

-- Grant access to the view
GRANT SELECT ON restaurants_public TO anon, authenticated, service_role;

-- 4. Security: Restrict users table - hide raw_password and password_hash from anon/authenticated
-- Create a safe view for user lookups (login should use the edge function instead)
DROP VIEW IF EXISTS users_safe;
CREATE VIEW users_safe AS
SELECT
    id, name, email, role, created_at
    -- EXCLUDED: password_hash, raw_password
FROM users;

GRANT SELECT ON users_safe TO anon, authenticated, service_role;
