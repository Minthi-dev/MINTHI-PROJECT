
-- Migration to add view_only_menu_enabled to restaurants
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS view_only_menu_enabled BOOLEAN DEFAULT FALSE;
