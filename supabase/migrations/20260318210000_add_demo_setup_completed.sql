-- Add demo_completed and setup_completed flags to restaurants
-- These persist across devices (unlike localStorage)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS demo_completed boolean DEFAULT false;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS setup_completed boolean DEFAULT false;
