-- FIX A: Table Creation (Admin)
-- Allow authenticated users (Admin/Owner) to INSERT into tables if they own the restaurant
DROP POLICY IF EXISTS "Enable insert for owners" ON "public"."tables";
CREATE POLICY "Enable insert for owners" ON "public"."tables"
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM restaurants
    WHERE restaurants.id = tables.restaurant_id
    AND restaurants.owner_id = auth.uid()
  )
);

-- FIX B: Order Submission (Anon/Customer)
-- Allow anonymous users to INSERT into orders if they have a valid table_session_id
DROP POLICY IF EXISTS "Enable insert for customers" ON "public"."orders";
CREATE POLICY "Enable insert for customers" ON "public"."orders"
FOR INSERT TO anon, authenticated
WITH CHECK (
  -- Basic check: ensure table_session_id exists and is OPEN
  EXISTS (
    SELECT 1 FROM table_sessions
    WHERE table_sessions.id = orders.table_session_id
    AND table_sessions.status = 'OPEN'
  )
);

-- Allow anonymous users to INSERT into order_items if the related order belongs to an open session
DROP POLICY IF EXISTS "Enable insert for customers" ON "public"."order_items";
CREATE POLICY "Enable insert for customers" ON "public"."order_items"
FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    JOIN table_sessions ON orders.table_session_id = table_sessions.id
    WHERE orders.id = order_items.order_id
    AND table_sessions.status = 'OPEN'
  )
);

-- Ensure 'anon' can SELECT their own orders (for confirmation/status)
-- This is tricky for anon without a user ID. Usually we rely on the session ID or local storage.
-- For now, let's allow reading orders linked to the current session (if we could filter by it).
-- Since RLS for anon is hard without a claim, we might need to allow SELECT on orders for the specific table_session.
-- But anon user doesn't "own" the session in a way Supabase knows easily unless we use a token.
-- For simplicity in this "Priority Zero" fix, we might allow public read for orders of open sessions, 
-- or rely on the fact that the client gets the order back immediately after insert.

-- Let's ensure the INSERT returns data (which requires SELECT policy or specific setup).
-- If we want `select().single()` to work after insert, we need a SELECT policy.
DROP POLICY IF EXISTS "Enable read for customers" ON "public"."orders";
CREATE POLICY "Enable read for customers" ON "public"."orders"
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM table_sessions
    WHERE table_sessions.id = orders.table_session_id
    AND table_sessions.status = 'OPEN'
  )
);

DROP POLICY IF EXISTS "Enable read for customers" ON "public"."order_items";
CREATE POLICY "Enable read for customers" ON "public"."order_items"
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    JOIN table_sessions ON orders.table_session_id = table_sessions.id
    WHERE orders.id = order_items.order_id
    AND table_sessions.status = 'OPEN'
  )
);
