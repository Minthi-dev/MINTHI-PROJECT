-- Migration to add optional free months to register_restaurant_secure
-- This allows newly registered restaurants using a bonus to be immediately active

-- Drop the old internal function explicitly to allow signature changes
DROP FUNCTION IF EXISTS public.register_restaurant_secure(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.register_restaurant_secure(
    p_name text,
    p_phone text,
    p_email text,
    p_username text,
    p_password_hash text,
    p_raw_password text,
    p_free_months int DEFAULT 0
) RETURNS jsonb AS $$
DECLARE
    new_restaurant_id uuid;
    new_user_id uuid;
    result jsonb;
    v_is_active boolean;
    v_expires_at timestamp with time zone;
BEGIN
    -- Determine initial active state based on bonus
    v_is_active := p_free_months > 0;

    -- 1. Insert into users first to get the owner id
    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (p_email, p_username, p_username, p_password_hash, p_raw_password, 'OWNER')
    RETURNING id INTO new_user_id;

    -- 2. Insert into restaurants with the owner_id and calculated is_active state
    INSERT INTO public.restaurants (name, phone, is_active, owner_id)
    VALUES (p_name, p_phone, v_is_active, new_user_id)
    RETURNING id INTO new_restaurant_id;

    -- 3. If they have free months, insert the bonus
    IF p_free_months > 0 THEN
        v_expires_at := CURRENT_TIMESTAMP + (p_free_months || ' months')::interval;
        
        INSERT INTO public.restaurant_bonuses (
            restaurant_id, 
            free_months, 
            reason, 
            granted_by, 
            granted_at, 
            expires_at, 
            is_active
        )
        VALUES (
            new_restaurant_id, 
            p_free_months, 
            'Bonus registrazione (Link Invito)', 
            NULL, 
            CURRENT_TIMESTAMP, 
            v_expires_at, 
            true
        );
    END IF;

    -- 4. Prepare result
    result := jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );

    RETURN result;
EXCEPTION
    WHEN unique_violation THEN
        -- Handle unique constraints (e.g., email or username exists)
        RAISE EXCEPTION 'Esiste già un utente o un ristorante con questi dati. Dettagli: %', SQLERRM;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Errore durante la registrazione: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.register_restaurant_secure TO anon, authenticated;
