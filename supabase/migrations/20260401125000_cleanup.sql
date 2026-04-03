-- ============================================================
-- CLEANUP MIGRATION: Remove unused columns, functions, fix constraints
-- Date: 2026-04-01
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. REMOVE UNUSED COLUMNS
-- ════════════════════════════════════════════════════════════

-- restaurants.hours — replaced by weekly_service_hours, never used
ALTER TABLE public.restaurants DROP COLUMN IF EXISTS hours;

-- restaurants.cover_image_url — defined in types but never rendered in any component
ALTER TABLE public.restaurants DROP COLUMN IF EXISTS cover_image_url;

-- tables.pin — legacy column, all PIN auth uses table_sessions.session_pin
ALTER TABLE public.tables DROP COLUMN IF EXISTS pin;

-- ════════════════════════════════════════════════════════════
-- 2. REMOVE UNUSED RPC FUNCTIONS
-- ════════════════════════════════════════════════════════════

-- admin_update_restaurant: never called from frontend, admin uses direct table updates
DROP FUNCTION IF EXISTS public.admin_update_restaurant(uuid, jsonb, text, text);

-- get_table_sizes: debug/admin function never called from frontend
DROP FUNCTION IF EXISTS public.get_table_sizes();

-- get_average_cooking_time: duplicate, frontend only uses get_dish_avg_cooking_times
DROP FUNCTION IF EXISTS public.get_average_cooking_time(uuid, uuid);

-- ════════════════════════════════════════════════════════════
-- 3. FIX order_items.status CONSTRAINT
--    Remove lowercase duplicates (pending, preparing, ready, etc.)
--    Frontend only uses UPPERCASE + DELIVERED/PAID/CANCELLED
-- ════════════════════════════════════════════════════════════

-- First: update any existing lowercase values to UPPERCASE (safety)
UPDATE public.order_items SET status = 'PENDING' WHERE status = 'pending';
UPDATE public.order_items SET status = 'IN_PREPARATION' WHERE status = 'preparing';
UPDATE public.order_items SET status = 'READY' WHERE status = 'ready';
UPDATE public.order_items SET status = 'SERVED' WHERE status = 'served';
UPDATE public.order_items SET status = 'DELIVERED' WHERE status = 'delivered';
UPDATE public.order_items SET status = 'PAID' WHERE status = 'paid';
UPDATE public.order_items SET status = 'CANCELLED' WHERE status = 'cancelled';

-- Drop old constraint and create clean one
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_status_check
    CHECK (status IN ('PENDING', 'IN_PREPARATION', 'READY', 'SERVED', 'DELIVERED', 'PAID', 'CANCELLED'));

-- Also fix archived_order_items constraint to match
ALTER TABLE public.archived_order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE public.archived_order_items DROP CONSTRAINT IF EXISTS archived_order_items_status_check;
ALTER TABLE public.archived_order_items ADD CONSTRAINT archived_order_items_status_check
    CHECK (status IN ('PENDING', 'IN_PREPARATION', 'READY', 'SERVED', 'DELIVERED', 'PAID', 'CANCELLED'));
