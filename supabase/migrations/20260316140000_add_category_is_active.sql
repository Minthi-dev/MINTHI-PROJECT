-- Add is_active column to categories (default true so existing categories remain visible)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
