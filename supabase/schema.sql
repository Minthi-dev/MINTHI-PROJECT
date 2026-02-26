-- =============================================================================
-- EASYFOOD Database Schema
-- =============================================================================
-- This file contains the complete database schema for the EASYFOOD application.
-- Update this file whenever you make schema changes and push to Supabase.
--
-- To apply changes to Supabase:
--   1. Make changes to this file
--   2. Run: npx supabase db push
--
-- =============================================================================

-- ========================================
-- CUSTOM MENUS SCHEMA
-- ========================================

-- Custom Menus Table
CREATE TABLE IF NOT EXISTS public.custom_menus (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Custom Menu Dishes (Join Table)
CREATE TABLE IF NOT EXISTS public.custom_menu_dishes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  custom_menu_id uuid REFERENCES public.custom_menus(id) ON DELETE CASCADE NOT NULL,
  dish_id uuid REFERENCES public.dishes(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(custom_menu_id, dish_id)
);

-- Custom Menu Schedules
CREATE TABLE IF NOT EXISTS public.custom_menu_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  custom_menu_id uuid REFERENCES public.custom_menus(id) ON DELETE CASCADE NOT NULL,
  day_of_week integer, -- 0-6 (Sun-Sat), null = every day
  meal_type text CHECK (meal_type IN ('lunch', 'dinner', 'all')),
  start_time time,
  end_time time,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for custom menus tables
ALTER TABLE public.custom_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_menu_dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_menu_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_menus
CREATE POLICY "Users can view custom menus for their restaurant"
  ON public.custom_menus FOR SELECT
  USING (true);

CREATE POLICY "Users can insert custom menus for their restaurant"
  ON public.custom_menus FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update custom menus for their restaurant"
  ON public.custom_menus FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete custom menus for their restaurant"
  ON public.custom_menus FOR DELETE
  USING (true);

-- RLS Policies for custom_menu_dishes
CREATE POLICY "Users can view custom menu dishes"
  ON public.custom_menu_dishes FOR SELECT
  USING (true);

CREATE POLICY "Users can insert custom menu dishes"
  ON public.custom_menu_dishes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete custom menu dishes"
  ON public.custom_menu_dishes FOR DELETE
  USING (true);

-- RLS Policies for custom_menu_schedules
CREATE POLICY "Users can view custom menu schedules"
  ON public.custom_menu_schedules FOR SELECT
  USING (true);

CREATE POLICY "Users can insert custom menu schedules"
  ON public.custom_menu_schedules FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update custom menu schedules"
  ON public.custom_menu_schedules FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete custom menu schedules"
  ON public.custom_menu_schedules FOR DELETE
  USING (true);

-- ========================================
-- MODIFICATIONS & ENHANCEMENTS
-- ========================================

-- Add ready_at column to order_items table (if not already exists)
-- This tracks when a dish becomes ready in the kitchen
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'ready_at'
  ) THEN
    ALTER TABLE order_items ADD COLUMN ready_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Add show_cooking_times column to restaurants table (if not already exists)
-- This boolean enables/disables the display of average cooking times per dish
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurants' AND column_name = 'show_cooking_times'
  ) THEN
    ALTER TABLE restaurants ADD COLUMN show_cooking_times BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- ========================================
-- RPC FUNCTIONS
-- ========================================

-- Get average cooking time per dish (last 2 months, minimum 3 orders)
-- Used to display expected prep time in customer menu and waiter dashboard
--
-- Parameters:
--   p_dish_id: The ID of the dish
--   p_restaurant_id: The ID of the restaurant
--
-- Returns: Average cooking time in minutes (NULL if less than 3 orders)
CREATE OR REPLACE FUNCTION get_average_cooking_time(p_dish_id BIGINT, p_restaurant_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  avg_minutes INTEGER;
  order_count INTEGER;
BEGIN
  -- Count orders from last 2 months for this dish
  SELECT COUNT(*) INTO order_count
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.dish_id = p_dish_id
  AND o.restaurant_id = p_restaurant_id
  AND oi.ready_at IS NOT NULL
  AND oi.created_at >= NOW() - INTERVAL '2 months';

  -- If less than 3 orders, return null
  IF order_count < 3 THEN
    RETURN NULL;
  END IF;

  -- Calculate average cooking time in minutes
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (oi.ready_at - oi.created_at)) / 60))::INTEGER
  INTO avg_minutes
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.dish_id = p_dish_id
  AND o.restaurant_id = p_restaurant_id
  AND oi.ready_at IS NOT NULL
  AND oi.created_at >= NOW() - INTERVAL '2 months';

  RETURN COALESCE(avg_minutes, NULL);
END;
$$ LANGUAGE plpgsql STABLE;

-- Apply Custom Menu
-- Sets the selected menu as active, and updates all dishes is_active state based on inclusion in the menu.
DROP FUNCTION IF EXISTS public.apply_custom_menu(uuid, uuid);

CREATE OR REPLACE FUNCTION public.apply_custom_menu(p_restaurant_id uuid, p_menu_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Deactivate all other menus for this restaurant
  UPDATE public.custom_menus
  SET is_active = false
  WHERE restaurant_id = p_restaurant_id;

  -- 2. Activate the selected menu
  UPDATE public.custom_menus
  SET is_active = true
  WHERE id = p_menu_id;

  -- 3. Update Dishes Visibility
  -- First, hide ALL dishes for this restaurant
  UPDATE public.dishes
  SET is_active = false
  WHERE restaurant_id = p_restaurant_id;

  -- Then, show only dishes in the custom menu
  UPDATE public.dishes
  SET is_active = true
  WHERE id IN (
    SELECT dish_id
    FROM public.custom_menu_dishes
    WHERE custom_menu_id = p_menu_id
  );
END;
$$;

-- Reset to Full Menu
-- Deactivates all custom menus and shows ALL dishes.
DROP FUNCTION IF EXISTS public.reset_to_full_menu(uuid);

CREATE OR REPLACE FUNCTION public.reset_to_full_menu(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Deactivate all custom menus
  UPDATE public.custom_menus
  SET is_active = false
  WHERE restaurant_id = p_restaurant_id;

  -- 2. Show ALL dishes
  UPDATE public.dishes
  SET is_active = true
  WHERE restaurant_id = p_restaurant_id;
END;
$$;

-- =============================================================================
-- NOTE: The base tables (users, orders, restaurants, dishes, etc.) are already
-- created in the Supabase cloud database. This file only contains incremental
-- schema modifications and custom functions.
--
-- For the full base schema, see the Supabase dashboard:
-- https://app.supabase.com/project/iqilquhkwjrbwxydsphr/sql/editor
-- =============================================================================
