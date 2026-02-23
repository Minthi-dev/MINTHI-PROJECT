-- Add weekly_service_hours column to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS weekly_service_hours JSONB;
