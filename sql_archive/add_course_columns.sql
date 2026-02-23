-- Add enable_course_splitting to restaurants table
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS enable_course_splitting BOOLEAN DEFAULT FALSE;

-- Add course_number to order_items table
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS course_number INTEGER DEFAULT NULL;

-- Notify that the columns were added
DO $$
BEGIN
    RAISE NOTICE 'Columns added successfully: enable_course_splitting to restaurants, course_number to order_items';
END $$;
