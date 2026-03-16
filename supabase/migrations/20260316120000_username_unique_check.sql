-- =====================================================
-- Add username uniqueness check to registration functions
-- Username must be unique across all users
-- =====================================================

-- 1. Add username uniqueness check to insert_pending_registration
CREATE OR REPLACE FUNCTION "public"."insert_pending_registration"(
    "p_registration_token" "text",
    "p_name" "text",
    "p_phone" "text" DEFAULT NULL::"text",
    "p_email" "text" DEFAULT NULL::"text",
    "p_billing_name" "text" DEFAULT NULL::"text",
    "p_vat_number" "text" DEFAULT NULL::"text",
    "p_billing_address" "text" DEFAULT NULL::"text",
    "p_billing_city" "text" DEFAULT NULL::"text",
    "p_billing_cap" "text" DEFAULT NULL::"text",
    "p_billing_province" "text" DEFAULT NULL::"text",
    "p_codice_univoco" "text" DEFAULT NULL::"text",
    "p_username" "text" DEFAULT NULL::"text",
    "p_password_hash" "text" DEFAULT NULL::"text",
    "p_raw_password" "text" DEFAULT NULL::"text"
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Controllo: username deve essere unico
    IF p_username IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.users WHERE LOWER(username) = LOWER(p_username)
    ) THEN
        RAISE EXCEPTION 'Username "%" già in uso. Scegli un username diverso.', p_username;
    END IF;

    -- Controlla username anche nelle pending non completate
    IF p_username IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.pending_registrations
        WHERE LOWER(username) = LOWER(p_username) AND completed = false
    ) THEN
        RAISE EXCEPTION 'Username "%" già in uso. Scegli un username diverso.', p_username;
    END IF;

    -- Controllo preventivo: il NOME del ristorante deve essere unico
    IF EXISTS (
        SELECT 1 FROM public.restaurants WHERE LOWER(name) = LOWER(p_name)
    ) THEN
        RAISE EXCEPTION 'Esiste già un ristorante con il nome "%". Scegli un nome diverso.', p_name;
    END IF;

    -- Controlla anche nelle pending non completate
    IF EXISTS (
        SELECT 1 FROM public.pending_registrations
        WHERE LOWER(name) = LOWER(p_name) AND completed = false
    ) THEN
        RAISE EXCEPTION 'Esiste già una registrazione in sospeso con il nome "%". Attendi o scegli un nome diverso.', p_name;
    END IF;

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
$$;


-- 2. Add username uniqueness check to register_restaurant_secure
CREATE OR REPLACE FUNCTION "public"."register_restaurant_secure"(
    "p_name" "text",
    "p_phone" "text",
    "p_email" "text",
    "p_username" "text",
    "p_password_hash" "text",
    "p_raw_password" "text",
    "p_free_months" integer DEFAULT 0,
    "p_billing_name" "text" DEFAULT NULL::"text",
    "p_vat_number" "text" DEFAULT NULL::"text",
    "p_billing_address" "text" DEFAULT NULL::"text",
    "p_billing_city" "text" DEFAULT NULL::"text",
    "p_billing_cap" "text" DEFAULT NULL::"text",
    "p_billing_province" "text" DEFAULT NULL::"text",
    "p_codice_univoco" "text" DEFAULT NULL::"text",
    "p_registration_token" "text" DEFAULT NULL::"text"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    new_restaurant_id uuid;
    new_user_id uuid;
    result jsonb;
    v_is_active boolean;
    v_expires_at timestamp with time zone;
BEGIN
    -- Controlla che il nome ristorante sia unico
    IF EXISTS (
        SELECT 1 FROM public.restaurants WHERE LOWER(name) = LOWER(p_name)
    ) THEN
        RAISE EXCEPTION 'Esiste già un ristorante con il nome "%". Scegli un nome diverso.', p_name;
    END IF;

    -- Controlla che lo username sia unico
    IF EXISTS (
        SELECT 1 FROM public.users WHERE LOWER(username) = LOWER(p_username)
    ) THEN
        RAISE EXCEPTION 'Username "%" già in uso. Scegli un username diverso.', p_username;
    END IF;

    v_is_active := p_free_months > 0;

    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (p_email, p_username, p_username, p_password_hash, p_raw_password, 'OWNER')
    RETURNING id INTO new_user_id;

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

    IF p_registration_token IS NOT NULL AND p_registration_token != '' THEN
        UPDATE public.registration_tokens
        SET used = true, used_by_restaurant_id = new_restaurant_id
        WHERE token = p_registration_token;
    END IF;

    result := jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Errore durante la registrazione: %', SQLERRM;
END;
$$;
