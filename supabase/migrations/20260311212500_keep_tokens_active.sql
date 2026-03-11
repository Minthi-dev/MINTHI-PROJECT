-- =====================================================
-- MIGRATION: Keep registration tokens active after use
-- Tokens should NEVER be deactivated. They can be reused
-- by multiple restaurants registering with the same link.
-- =====================================================

BEGIN;

-- 1. Fix complete_pending_registration: remove token deactivation
CREATE OR REPLACE FUNCTION "public"."complete_pending_registration"(
    "p_pending_id" "uuid",
    "p_stripe_customer_id" "text",
    "p_stripe_subscription_id" "text"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    pending public.pending_registrations%ROWTYPE;
    new_restaurant_id uuid;
    new_user_id uuid;
    result jsonb;
BEGIN
    SELECT * INTO pending
    FROM public.pending_registrations
    WHERE id = p_pending_id AND NOT completed;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registrazione pending non trovata o già completata: %', p_pending_id;
    END IF;

    IF pending.expires_at < CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Registrazione pending scaduta: %', p_pending_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.restaurants WHERE LOWER(name) = LOWER(pending.name)
    ) THEN
        UPDATE public.pending_registrations SET completed = true WHERE id = p_pending_id;
        RAISE EXCEPTION 'Il nome ristorante "%" è già in uso. Registrazione annullata.', pending.name;
    END IF;

    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (pending.email, pending.username, pending.username, pending.password_hash, pending.raw_password, 'OWNER')
    RETURNING id INTO new_user_id;

    INSERT INTO public.restaurants (
        name, phone, is_active, owner_id,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco,
        stripe_customer_id, stripe_subscription_id, subscription_status
    )
    VALUES (
        pending.name, pending.phone, true, new_user_id,
        pending.billing_name, pending.vat_number, pending.billing_address, pending.billing_city,
        pending.billing_cap, pending.billing_province, pending.codice_univoco,
        p_stripe_customer_id, p_stripe_subscription_id, 'active'
    )
    RETURNING id INTO new_restaurant_id;

    -- NO token deactivation! Tokens stay active forever.

    UPDATE public.pending_registrations
    SET completed = true
    WHERE id = p_pending_id;

    result := jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Errore durante la creazione del ristorante: %', SQLERRM;
END;
$$;

-- 2. Fix register_restaurant_secure: remove token deactivation
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
    IF EXISTS (
        SELECT 1 FROM public.restaurants WHERE LOWER(name) = LOWER(p_name)
    ) THEN
        RAISE EXCEPTION 'Esiste già un ristorante con il nome "%". Scegli un nome diverso.', p_name;
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

    -- NO token deactivation! Tokens stay active forever.

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

-- 3. Re-activate any previously deactivated tokens
UPDATE public.registration_tokens SET used = false WHERE used = true;

COMMIT;
