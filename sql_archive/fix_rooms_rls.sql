-- Fix RLS policies for rooms table
-- The app uses a custom auth system (not Supabase Auth), so auth.uid() is NULL.
-- This script creates permissive policies that allow any client to manage rooms.

-- Drop ALL existing policies on rooms
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON rooms;
DROP POLICY IF EXISTS "Rooms are insertable by restaurant owners" ON rooms;
DROP POLICY IF EXISTS "Rooms are updatable by restaurant owners" ON rooms;
DROP POLICY IF EXISTS "Rooms are deletable by restaurant owners" ON rooms;
DROP POLICY IF EXISTS "Enable insert for owners" ON rooms;
DROP POLICY IF EXISTS "Enable update for owners" ON rooms;
DROP POLICY IF EXISTS "Enable delete for owners" ON rooms;
DROP POLICY IF EXISTS "Enable read for all" ON rooms;
DROP POLICY IF EXISTS "rooms_select_policy" ON rooms;
DROP POLICY IF EXISTS "rooms_insert_policy" ON rooms;
DROP POLICY IF EXISTS "rooms_update_policy" ON rooms;
DROP POLICY IF EXISTS "rooms_delete_policy" ON rooms;

-- Create new PERMISSIVE policies (since we don't use Supabase Auth)

-- SELECT: Anyone can view rooms
CREATE POLICY "rooms_select_all" ON rooms
FOR SELECT USING (true);

-- INSERT: Allow all inserts (app handles auth via custom users table)
CREATE POLICY "rooms_insert_all" ON rooms
FOR INSERT WITH CHECK (true);

-- UPDATE: Allow all updates
CREATE POLICY "rooms_update_all" ON rooms
FOR UPDATE USING (true);

-- DELETE: Allow all deletes
CREATE POLICY "rooms_delete_all" ON rooms
FOR DELETE USING (true);

-- Ensure RLS is enabled (policies above will be permissive)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
