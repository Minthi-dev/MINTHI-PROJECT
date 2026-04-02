-- Add duration column to bookings table (per-reservation duration in minutes)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS duration integer;
