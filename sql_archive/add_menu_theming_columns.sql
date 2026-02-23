
-- Migration to add menu theming columns to restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_style TEXT DEFAULT 'elegant';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_primary_color TEXT DEFAULT '#f59e0b';
