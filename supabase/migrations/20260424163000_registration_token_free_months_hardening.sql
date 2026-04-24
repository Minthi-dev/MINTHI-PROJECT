-- Harden registration RPCs:
-- - completing a paid registration is only for service-role webhooks
-- - free-month registrations must derive the bonus from a valid token, never from the browser payload

REVOKE ALL ON FUNCTION public.complete_pending_registration(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_pending_registration(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pending_registration(uuid, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.register_restaurant_secure(
    text, text, text, text, text, text, integer,
    text, text, text, text, text, text, text, text
);

CREATE FUNCTION public.register_restaurant_secure(
    p_name text,
    p_phone text,
    p_email text,
    p_username text,
    p_password_hash text,
    p_raw_password text DEFAULT '',
    p_free_months integer DEFAULT 0,
    p_billing_name text DEFAULT NULL,
    p_vat_number text DEFAULT NULL,
    p_billing_address text DEFAULT NULL,
    p_billing_city text DEFAULT NULL,
    p_billing_cap text DEFAULT NULL,
    p_billing_province text DEFAULT NULL,
    p_codice_univoco text DEFAULT NULL,
    p_registration_token text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_user_id uuid;
    new_restaurant_id uuid;
    token_record public.registration_tokens%ROWTYPE;
    token_free_months integer := 0;
BEGIN
    IF p_registration_token IS NULL OR trim(p_registration_token) = '' THEN
        RAISE EXCEPTION 'Token registrazione obbligatorio per attivazione gratuita.';
    END IF;

    SELECT * INTO token_record
    FROM public.registration_tokens
    WHERE token = p_registration_token
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token registrazione non valido o scaduto.';
    END IF;

    token_free_months := COALESCE(token_record.free_months, 0);
    IF token_free_months <= 0 THEN
        RAISE EXCEPTION 'Questo token richiede pagamento Stripe.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.users WHERE lower(username) = lower(p_username)) THEN
        RAISE EXCEPTION 'Username "%" già in uso. Scegli un username diverso.', p_username;
    END IF;

    IF EXISTS (SELECT 1 FROM public.restaurants WHERE lower(name) = lower(p_name)) THEN
        RAISE EXCEPTION 'Il nome ristorante "%" è già in uso. Scegli un nome diverso.', p_name;
    END IF;

    INSERT INTO public.users (email, name, username, password_hash, role)
    VALUES (p_email, p_username, p_username, p_password_hash, 'OWNER')
    RETURNING id INTO new_user_id;

    INSERT INTO public.restaurants (
        name, phone, email, owner_id, is_active,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco,
        subscription_status
    )
    VALUES (
        p_name, p_phone, p_email, new_user_id, true,
        p_billing_name, p_vat_number, p_billing_address, p_billing_city,
        p_billing_cap, p_billing_province, p_codice_univoco,
        'active'
    )
    RETURNING id INTO new_restaurant_id;

    INSERT INTO public.restaurant_bonuses (
        restaurant_id, free_months, reason, granted_by, expires_at, is_active
    )
    VALUES (
        new_restaurant_id,
        token_free_months,
        'Bonus registrazione',
        'Sistema',
        now() + (token_free_months || ' months')::interval,
        true
    );

    UPDATE public.registration_tokens
    SET used = true, used_by_restaurant_id = new_restaurant_id
    WHERE id = token_record.id;

    RETURN jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id,
        'free_months', token_free_months
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_restaurant_secure(
    text, text, text, text, text, text, integer,
    text, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_restaurant_secure(
    text, text, text, text, text, text, integer,
    text, text, text, text, text, text, text, text
) TO anon, authenticated, service_role;
