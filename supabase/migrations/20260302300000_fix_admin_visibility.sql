-- Fix admin dashboard visibility issues
--
-- Problem 1: is_admin() uses auth.uid() which is NULL for the custom-auth admin.
--   The only SELECT policy for anon is restaurants_select_public (is_active=true),
--   so inactive restaurants (pre-payment) are invisible to the admin dashboard.
--   Fix: allow anon to SELECT all restaurants (consistent with existing anon UPDATE/DELETE/INSERT policies).
--
-- Problem 2: subscription_payments and restaurant_bonuses are not in the realtime
--   publication, so the admin's payment list never updates live.
--   Fix: add them to the publication.

-- 1. Allow anon to select ALL restaurants (not just active ones)
DROP POLICY IF EXISTS "restaurants_select_anon_all" ON public.restaurants;
CREATE POLICY "restaurants_select_anon_all" ON public.restaurants
    FOR SELECT TO anon USING (true);

-- 2. Add subscription_payments, restaurant_bonuses, users, restaurants to realtime
--    (users and restaurants were already added in migration 280000 - use IF NOT EXISTS equivalent)
DO $$
BEGIN
    -- subscription_payments
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'subscription_payments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_payments;
    END IF;

    -- restaurant_bonuses
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'restaurant_bonuses'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_bonuses;
    END IF;

    -- users (may already be added by migration 280000)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'users'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;

    -- restaurants (may already be added by migration 280000)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'restaurants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurants;
    END IF;
END;
$$;
