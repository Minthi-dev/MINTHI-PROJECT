-- Migration to add a secure function for fetching a restaurant during login
-- This allows the login page (running as anon) to verify if an owner's restaurant exists
-- and fetch its status, even if is_active is false (which hides it from normal anon queries).

CREATE OR REPLACE FUNCTION public.get_restaurant_for_login(p_owner_id uuid)
RETURNS jsonb AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'id', id,
        'name', name,
        'is_active', is_active
    ) INTO result
    FROM public.restaurants
    WHERE owner_id = p_owner_id
    LIMIT 1;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_restaurant_for_login TO anon, authenticated;
