-- Delete all rows from tables.
-- We use DELETE instead of TRUNCATE to respect foreign keys simply if TRUNCATE CASCADE is too aggressive.
-- Or better, TRUNCATE cascade is perfect to wipe clean.

TRUNCATE TABLE public.users CASCADE;
TRUNCATE TABLE public.restaurants CASCADE;

-- Categories and dishes should be cascaded by restaurants.
-- Bookings, tables, orders, should be cascaded.
-- It will wipe out all user data and everything associated with it, leaving the app completely blank ready for a fresh start.

-- For good measure, any tokens
TRUNCATE TABLE public.registration_tokens CASCADE;
