-- Add enable_course_suggestions column to restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS enable_course_suggestions boolean DEFAULT false;
