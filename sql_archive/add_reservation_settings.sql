-- Add reservation settings columns to restaurants table

ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS enable_reservation_room_selection boolean DEFAULT false;

ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS enable_public_reservations boolean DEFAULT true;

-- Update existing rows to have defaults if needed (defaults handle it for new inserts)
UPDATE public.restaurants SET enable_public_reservations = true WHERE enable_public_reservations IS NULL;
UPDATE public.restaurants SET enable_reservation_room_selection = false WHERE enable_reservation_room_selection IS NULL;
