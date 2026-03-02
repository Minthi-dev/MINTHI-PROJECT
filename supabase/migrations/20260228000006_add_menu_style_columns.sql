ALTER TABLE "public"."restaurants"
ADD COLUMN IF NOT EXISTS menu_style TEXT DEFAULT 'elegant',
ADD COLUMN IF NOT EXISTS menu_primary_color TEXT DEFAULT '#10b981',
ADD COLUMN IF NOT EXISTS view_only_menu_enabled BOOLEAN DEFAULT false;
