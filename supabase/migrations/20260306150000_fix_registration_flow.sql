-- Fix 1: RPC per inserire in pending_registrations (bypassa RLS)
-- Il .insert().select('id') falliva perché non c'era una policy SELECT per anon/authenticated
CREATE OR REPLACE FUNCTION public.insert_pending_registration(
    p_registration_token TEXT,
    p_name TEXT,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_billing_name TEXT DEFAULT NULL,
    p_vat_number TEXT DEFAULT NULL,
    p_billing_address TEXT DEFAULT NULL,
    p_billing_city TEXT DEFAULT NULL,
    p_billing_cap TEXT DEFAULT NULL,
    p_billing_province TEXT DEFAULT NULL,
    p_codice_univoco TEXT DEFAULT NULL,
    p_username TEXT DEFAULT NULL,
    p_password_hash TEXT DEFAULT NULL,
    p_raw_password TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO public.pending_registrations (
        registration_token, name, phone, email,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco,
        username, password_hash, raw_password
    ) VALUES (
        p_registration_token, p_name, p_phone, p_email,
        p_billing_name, p_vat_number, p_billing_address, p_billing_city,
        p_billing_cap, p_billing_province, p_codice_univoco,
        p_username, p_password_hash, p_raw_password
    ) RETURNING id INTO new_id;

    RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.insert_pending_registration TO anon, authenticated;

-- Fix 2: Aggiorna register_restaurant_secure per accettare il token e segnarlo come usato
-- Precedentemente il path "mesi gratis" non segnava il token come usato, permettendo riutilizzo
DROP FUNCTION IF EXISTS public.register_restaurant_secure(text, text, text, text, text, text, int, text, text, text, text, text, text, text);

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
    p_codice_univoco text DEFAULT NULL,
    p_registration_token text DEFAULT NULL
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

    -- 4. Segna il token come usato (se fornito)
    IF p_registration_token IS NOT NULL AND p_registration_token != '' THEN
        UPDATE public.registration_tokens
        SET used = true, used_by_restaurant_id = new_restaurant_id
        WHERE token = p_registration_token;
    END IF;

    -- 5. Prepare result
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
