-- Add users and restaurants to the realtime publication
-- This ensures the admin dashboard receives live updates when new restaurants
-- register via invite link (without needing a manual page refresh).
-- The RPC inserts the user FIRST then the restaurant, so by the time the
-- restaurant INSERT event fires on the client, the user is already in state.

ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurants;
