-- Add duration field to bookings (in minutes)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS duration integer DEFAULT 120;
