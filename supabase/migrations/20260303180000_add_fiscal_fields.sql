-- Add extended fiscal data columns to restaurants
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS billing_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_cap TEXT,
  ADD COLUMN IF NOT EXISTS billing_province TEXT,
  ADD COLUMN IF NOT EXISTS codice_univoco TEXT;

-- Drop old function signatures to allow parameter changes
DROP FUNCTION IF EXISTS public.register_restaurant_secure(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.register_restaurant_secure(text, text, text, text, text, text, int);

-- Recreate RPC with fiscal data parameters
CREATE OR REPLACE FUNCTION public.register_restaurant_secure(
    p_name text,
    p_phone text,
    p_email text,
    p_username text,
    p_password_hash text,
    p_raw_password text,
    p_free_months int DEFAULT 0,
    p_billing_name text DEFAULT NULL,
    p_vat_number text DEFAULT NULL,
    p_billing_address text DEFAULT NULL,
    p_billing_city text DEFAULT NULL,
    p_billing_cap text DEFAULT NULL,
    p_billing_province text DEFAULT NULL,
    p_codice_univoco text DEFAULT NULL
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

    -- 2. Insert into restaurants with all data including fiscal info
    INSERT INTO public.restaurants (
        name, phone, is_active, owner_id,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco
    )
    VALUES (
        p_name, p_phone, v_is_active, new_user_id,
        p_billing_name, p_vat_number, p_billing_address, p_billing_city,
        p_billing_cap, p_billing_province, p_codice_univoco
    )
    RETURNING id INTO new_restaurant_id;

    -- 3. If they have free months, insert the bonus
    IF p_free_months > 0 THEN
        v_expires_at := CURRENT_TIMESTAMP + (p_free_months || ' months')::interval;

        INSERT INTO public.restaurant_bonuses (
            restaurant_id, free_months, reason, granted_by, granted_at, expires_at, is_active
        )
        VALUES (
            new_restaurant_id, p_free_months, 'Bonus registrazione (Link Invito)',
            NULL, CURRENT_TIMESTAMP, v_expires_at, true
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
        RAISE EXCEPTION 'Esiste già un utente o un ristorante con questi dati. Dettagli: %', SQLERRM;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Errore durante la registrazione: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.register_restaurant_secure TO anon, authenticated;
