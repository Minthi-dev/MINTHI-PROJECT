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

-- =============================================================================
-- NOTE: The base tables (users, orders, restaurants, dishes, etc.) are already
-- created in the Supabase cloud database. This file only contains incremental
-- schema modifications and custom functions.
--
-- For the full base schema, see the Supabase dashboard:
-- https://app.supabase.com/project/iqilquhkwjrbwxydsphr/sql/editor
-- =============================================================================
