-- SECURITY HARDENING & RPC FUNCTIONS
-- Run this script in the Supabase SQL Editor

-- 1. Enable RLS on Critical Tables
ALTER TABLE dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies for DISHES
-- Allow public read access (menus must be visible to everyone)
CREATE POLICY "Public Read Dishes"
ON dishes FOR SELECT
USING (true);

-- Allow write access ONLY to the Restaurant Owner
-- Assumes 'restaurants' table exists and has 'owner_id'
CREATE POLICY "Owner Write Dishes"
ON dishes FOR ALL
USING (
  exists (
    select 1 from restaurants
    where restaurants.id = dishes.restaurant_id
    and restaurants.owner_id = auth.uid()
  )
)
WITH CHECK (
  exists (
    select 1 from restaurants
    where restaurants.id = dishes.restaurant_id
    and restaurants.owner_id = auth.uid()
  )
);

-- 3. RLS Policies for CATEGORIES
-- Allow public read access
CREATE POLICY "Public Read Categories"
ON categories FOR SELECT
USING (true);

-- Allow write access ONLY to the Restaurant Owner
CREATE POLICY "Owner Write Categories"
ON categories FOR ALL
USING (
  exists (
    select 1 from restaurants
    where restaurants.id = categories.restaurant_id
    and restaurants.owner_id = auth.uid()
  )
)
WITH CHECK (
  exists (
    select 1 from restaurants
    where restaurants.id = categories.restaurant_id
    and restaurants.owner_id = auth.uid()
  )
);

-- 4. RLS for ORDER_ITEMS
-- Anonymous users can only INSERT if they have a valid open session
-- (Assuming 'orders' table links to 'table_sessions')
-- Note: Simplified logic for INSERT, actual validation happens via logic or RPC usually.
-- Here we allow insert if the related order is accessible or public for now, 
-- but ideally we link it to session validation.
-- For now, enforcing quantity constraint is key.

-- 5. Data Integrity Constraints
-- Prevent negative quantity or zero quantity exploits
ALTER TABLE order_items 
ADD CONSTRAINT quantity_positive CHECK (quantity > 0);

-- 6. RPC: Atomic Session Creation
-- Prevents duplicate sessions when multiple users scan the same table QR simultaneously.
CREATE OR REPLACE FUNCTION get_or_create_table_session(
  p_table_id UUID,
  p_restaurant_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
  v_session_id UUID;
  v_pin TEXT;
BEGIN
  -- Lock the table row to serialize access for this specific table
  -- This prevents race conditions where two transactions try to create a session at the same time
  PERFORM 1 FROM tables WHERE id = p_table_id FOR UPDATE;

  -- 1. Check for existing OPEN session
  SELECT id INTO v_session_id
  FROM table_sessions
  WHERE table_id = p_table_id
    AND status = 'OPEN'
  LIMIT 1;

  -- 2. If valid session exists, return it
  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  -- 3. Generate a 4-digit PIN (1000-9999)
  v_pin := floor(random() * (9999 - 1000 + 1) + 1000)::text;

  -- 4. Create NEW session
  INSERT INTO table_sessions (restaurant_id, table_id, status, customer_count, session_pin)
  VALUES (p_restaurant_id, p_table_id, 'OPEN', 1, v_pin)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
