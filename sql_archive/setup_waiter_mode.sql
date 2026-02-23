-- Create restaurant_staff table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."restaurant_staff" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "restaurant_id" uuid NOT NULL REFERENCES "public"."restaurants"("id") ON DELETE CASCADE,
    "user_id" uuid REFERENCES "auth"."users"("id") ON DELETE SET NULL, -- Link to auth user if they have a login
    "name" text NOT NULL,
    "role" text DEFAULT 'waiter'::text NOT NULL, -- 'waiter', 'manager', 'chef'
    "pin_code" text -- Simple PIN for quick access if needed
);

-- RLS Policies for restaurant_staff
ALTER TABLE "public"."restaurant_staff" ENABLE ROW LEVEL SECURITY;

-- Allow admins (owners) to manage their staff
DROP POLICY IF EXISTS "Owners can manage staff" ON "public"."restaurant_staff";
CREATE POLICY "Owners can manage staff" ON "public"."restaurant_staff"
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM restaurants
    WHERE restaurants.id = restaurant_staff.restaurant_id
    AND restaurants.owner_id = auth.uid()
  )
);

-- Allow staff to view themselves (if linked to user)
DROP POLICY IF EXISTS "Staff can view themselves" ON "public"."restaurant_staff";
CREATE POLICY "Staff can view themselves" ON "public"."restaurant_staff"
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
);

-- Allow staff to view tables, orders, etc.
-- We need to update tables/orders policies to allow staff access.
-- For simplicity in this iteration, we assume the 'authenticated' role with a valid staff record 
-- should have access. But RLS checks are complex.
-- A common pattern is:
-- CREATE POLICY "Staff can view tables" ON "public"."tables"
-- FOR SELECT TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM restaurant_staff
--     WHERE restaurant_staff.restaurant_id = tables.restaurant_id
--     AND restaurant_staff.user_id = auth.uid()
--   )
-- );

-- However, for now, let's ensure the table exists.
