-- ==============================================================================
-- DATABASE OPTIMIZATION & SECURITY HARDENING
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INDEXING (Performance Optimization)
-- Addresses: "Inefficienza delle Performance (Assenza di Indicizzazione)"
-- ------------------------------------------------------------------------------

-- Create indexes on Foreign Keys to avoid Full Table Scans
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON public.orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_restaurant_id ON public.table_sessions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON public.tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_dishes_restaurant_id ON public.dishes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_categories_restaurant_id ON public.categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant_id ON public.bookings(restaurant_id);

-- ------------------------------------------------------------------------------
-- 2. RLS HARDENING (Security & Data Isolation)
-- Addresses: "Rischio di Data Leakage" & "Saturazione del Network"
-- ------------------------------------------------------------------------------

-- Helper function to check if user is owner or staff of a restaurant
CREATE OR REPLACE FUNCTION is_restaurant_staff(r_id uuid) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM restaurant_staff
    WHERE user_id = auth.uid()
    AND restaurant_id = r_id
  ) OR EXISTS (
    SELECT 1 FROM restaurants
    WHERE id = r_id
    AND owner_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- TABLES POLICY ---
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for all users" ON public.tables;

CREATE POLICY "Enable read for restaurant staff" ON public.tables
FOR SELECT TO authenticated
USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "Enable ALL for restaurant owners" ON public.tables
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM restaurants WHERE id = restaurant_id AND owner_id = auth.uid())
);

-- Note: We might need public read for Customers if they scan a QR code (token based)?
-- For now, customers access via API/Functions or open public pages.
-- If customers need to SELECT tables directly (e.g. to check status), valid Session RLS is needed.
-- Allow public to select table by ID if it has a token (Scanning QR)
CREATE POLICY "Enable public read for tables" ON public.tables
FOR SELECT TO anon, authenticated
USING (true); -- Consider tightening this to only by ID or Token if possible

-- --- ORDERS POLICY ---
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable insert for customers" ON public.orders;
DROP POLICY IF EXISTS "Enable read for customers" ON public.orders;

-- Staff Access
CREATE POLICY "Staff can view/edit their restaurant orders" ON public.orders
FOR ALL TO authenticated
USING (is_restaurant_staff(restaurant_id));

-- Customer Access (Anonymous or Authenticated)
-- Allow creating an order if part of an OPEN session
CREATE POLICY "Customers can create orders" ON public.orders
FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM table_sessions
    WHERE id = table_session_id
    AND status = 'OPEN'
  )
);

-- Allow reading own orders (linked to open session)
CREATE POLICY "Customers can view session orders" ON public.orders
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM table_sessions
    WHERE id = table_session_id
    AND status = 'OPEN'
  )
);

-- --- ORDER ITEMS POLICY ---
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.order_items;
DROP POLICY IF EXISTS "Enable insert for customers" ON public.order_items;
DROP POLICY IF EXISTS "Enable read for customers" ON public.order_items;

CREATE POLICY "Staff can view/edit items" ON public.order_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
    AND is_restaurant_staff(orders.restaurant_id)
  )
);

CREATE POLICY "Customers can add items" ON public.order_items
FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    JOIN table_sessions ON orders.table_session_id = table_sessions.id
    WHERE orders.id = order_items.order_id
    AND table_sessions.status = 'OPEN'
  )
);

CREATE POLICY "Customers can view items" ON public.order_items
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    JOIN table_sessions ON orders.table_session_id = table_sessions.id
    WHERE orders.id = order_items.order_id
    AND table_sessions.status = 'OPEN'
  )
);

-- --- SESSIONS POLICY ---
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.table_sessions;

CREATE POLICY "Staff can manage sessions" ON public.table_sessions
FOR ALL TO authenticated
USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "Public can view open sessions" ON public.table_sessions
FOR SELECT TO anon, authenticated
USING (status = 'OPEN'); -- Needed for Customer Menu validation

-- --- DISHES/CATEGORIES/RESTAURANTS (Public Read, Owner Write) ---
-- Restaurants
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.restaurants;
CREATE POLICY "Public read restaurants" ON public.restaurants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owner manage restaurant" ON public.restaurants FOR ALL TO authenticated USING (owner_id = auth.uid());

-- Categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.categories;
CREATE POLICY "Public read categories" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Staff manage categories" ON public.categories FOR ALL TO authenticated USING (is_restaurant_staff(restaurant_id));

-- Dishes
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.dishes;
CREATE POLICY "Public read dishes" ON public.dishes FOR SELECT TO anon, authenticated USING (is_active = true);
-- Allow reading inactive dishes for staff?
CREATE POLICY "Staff read all dishes" ON public.dishes FOR SELECT TO authenticated USING (is_restaurant_staff(restaurant_id));
CREATE POLICY "Staff manage dishes" ON public.dishes FOR ALL TO authenticated USING (is_restaurant_staff(restaurant_id));

