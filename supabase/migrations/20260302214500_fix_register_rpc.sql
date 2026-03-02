-- Migration to fix the secure RPC function for registering restaurants
-- The 'users' table does NOT have a 'restaurant_id' column in this schema.
-- Instead, the 'restaurants' table has an 'owner_id' column pointing to the user.

CREATE OR REPLACE FUNCTION public.register_restaurant_secure(
    p_name text,
    p_phone text,
    p_email text,
    p_username text,
    p_password_hash text,
    p_raw_password text
) RETURNS jsonb AS $$
DECLARE
    new_restaurant_id uuid;
    new_user_id uuid;
    result jsonb;
BEGIN
    -- 1. Insert into users first to get the owner id
    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (p_email, p_username, p_username, p_password_hash, p_raw_password, 'OWNER')
    RETURNING id INTO new_user_id;

    -- 2. Insert into restaurants with the owner_id
    INSERT INTO public.restaurants (name, phone, is_active, owner_id)
    VALUES (p_name, p_phone, false, new_user_id)
    RETURNING id INTO new_restaurant_id;

    -- 3. Prepare result
    result := jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );

    RETURN result;
EXCEPTION
    WHEN unique_violation THEN
        -- Handle unique constraints (e.g., email or username exists)
        RAISE EXCEPTION 'Esiste già un utente o un ristorante con questi dati.';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Errore durante la registrazione: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.register_restaurant_secure TO anon, authenticated;
