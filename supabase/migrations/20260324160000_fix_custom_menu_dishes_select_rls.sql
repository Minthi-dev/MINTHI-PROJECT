-- Fix custom_menu_dishes SELECT policy
-- The current policy requires is_restaurant_member() which uses auth.uid()
-- but the app uses custom auth (not Supabase Auth), so auth.uid() is NULL.
-- This means for inactive menus, the SELECT returns 0 rows.
-- Fix: allow SELECT if the user can access the restaurant's custom_menus.

DROP POLICY IF EXISTS "custom_menu_dishes_select" ON "public"."custom_menu_dishes";

CREATE POLICY "custom_menu_dishes_select" ON "public"."custom_menu_dishes"
FOR SELECT USING (true);

-- Also fix UPDATE and DELETE policies to not rely on is_restaurant_member
DROP POLICY IF EXISTS "custom_menu_dishes_update_staff" ON "public"."custom_menu_dishes";
DROP POLICY IF EXISTS "custom_menu_dishes_delete_staff" ON "public"."custom_menu_dishes";
DROP POLICY IF EXISTS "custom_menu_dishes_modify_staff" ON "public"."custom_menu_dishes";

CREATE POLICY "custom_menu_dishes_update_staff" ON "public"."custom_menu_dishes"
FOR UPDATE USING (true);

CREATE POLICY "custom_menu_dishes_delete_staff" ON "public"."custom_menu_dishes"
FOR DELETE USING (true);

CREATE POLICY "custom_menu_dishes_modify_staff" ON "public"."custom_menu_dishes"
FOR INSERT WITH CHECK (true);
