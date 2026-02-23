-- Add is_active column to tables for temporary deactivation
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update existing tables to be active by default if null
UPDATE public.tables SET is_active = true WHERE is_active IS NULL;
