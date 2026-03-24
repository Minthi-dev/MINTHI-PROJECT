-- Add analytics password to restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS analytics_password_hash TEXT DEFAULT NULL;

-- Add closed_by fields to table_sessions
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS closed_by_name TEXT DEFAULT NULL;
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS closed_by_role TEXT DEFAULT NULL;
