-- Add course_number to cart_items table
ALTER TABLE cart_items 
ADD COLUMN IF NOT EXISTS course_number INTEGER DEFAULT 1;

-- Update RLS policies if needed (usually 'all using (true)' covers updates, but checking anyway)
-- (No change needed if policy is "Enable all access for all users" as seen in previous checks)

DO $$
BEGIN
    RAISE NOTICE 'Column course_number added to cart_items';
END $$;
