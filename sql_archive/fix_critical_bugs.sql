-- Fix RLS Policies for Orders

-- 1. Allow anonymous users (customers) to INSERT orders if they have a valid table_session_id
DROP POLICY IF EXISTS "Enable insert for customers with valid session" ON orders;
CREATE POLICY "Enable insert for customers with valid session" ON orders
    FOR INSERT
    WITH CHECK (
        table_session_id IS NOT NULL
        -- Optionally verify that the session exists and is active, but RLS on table_sessions handles that
    );

-- 2. Allow restaurant staff to SELECT orders based on restaurant_id
DROP POLICY IF EXISTS "Enable select for restaurant staff" ON orders;
CREATE POLICY "Enable select for restaurant staff" ON orders
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff
            WHERE restaurant_staff.user_id = auth.uid()
            AND restaurant_staff.restaurant_id = orders.restaurant_id
        )
    );

-- 3. Ensure restaurant staff can also UPDATE orders (e.g. mark as paid, change status)
DROP POLICY IF EXISTS "Enable update for restaurant staff" ON orders;
CREATE POLICY "Enable update for restaurant staff" ON orders
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff
            WHERE restaurant_staff.user_id = auth.uid()
            AND restaurant_staff.restaurant_id = orders.restaurant_id
        )
    );

-- 4. Same for order_items
DROP POLICY IF EXISTS "Enable insert for customers" ON order_items;
CREATE POLICY "Enable insert for customers" ON order_items
    FOR INSERT
    WITH CHECK (true); -- Assuming parent order check is sufficient, or add more logic if needed

DROP POLICY IF EXISTS "Enable select for restaurant staff" ON order_items;
CREATE POLICY "Enable select for restaurant staff" ON order_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders
            JOIN restaurant_staff ON restaurant_staff.restaurant_id = orders.restaurant_id
            WHERE orders.id = order_items.order_id
            AND restaurant_staff.user_id = auth.uid()
        )
    );
