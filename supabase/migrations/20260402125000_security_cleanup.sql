-- ============================================================
-- Security cleanup migration
-- ============================================================

-- 1. Remove raw_password columns (plaintext passwords should never be stored)
ALTER TABLE public.users DROP COLUMN IF EXISTS raw_password;
ALTER TABLE public.pending_registrations DROP COLUMN IF EXISTS raw_password;

-- 2. Recreate register_restaurant_secure without raw_password storage
-- Must DROP first because parameter defaults changed
DROP FUNCTION IF EXISTS public.register_restaurant_secure(text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text);

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
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    new_user_id uuid;
    new_restaurant_id uuid;
BEGIN
    -- p_raw_password is accepted for backwards compatibility but ignored
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
        CASE WHEN p_free_months > 0 THEN 'active' ELSE NULL END
    )
    RETURNING id INTO new_restaurant_id;

    IF p_registration_token IS NOT NULL AND p_registration_token != '' THEN
        UPDATE public.registration_tokens
        SET is_used = true, used_by_restaurant_id = new_restaurant_id, used_at = now()
        WHERE token = p_registration_token AND is_used = false;
    END IF;

    RETURN new_restaurant_id;
END;
$$;

-- Grant permissions (same as original)
GRANT ALL ON FUNCTION public.register_restaurant_secure(text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.register_restaurant_secure(text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.register_restaurant_secure(text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text) TO service_role;

-- 3. Recreate insert_pending_registration without raw_password storage
DROP FUNCTION IF EXISTS public.insert_pending_registration(text, text, text, text, text, text, text, text, text, text, text, text, text, text);

CREATE FUNCTION public.insert_pending_registration(
    p_registration_token text,
    p_name text,
    p_phone text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_billing_name text DEFAULT NULL,
    p_vat_number text DEFAULT NULL,
    p_billing_address text DEFAULT NULL,
    p_billing_city text DEFAULT NULL,
    p_billing_cap text DEFAULT NULL,
    p_billing_province text DEFAULT NULL,
    p_codice_univoco text DEFAULT NULL,
    p_username text DEFAULT NULL,
    p_password_hash text DEFAULT NULL,
    p_raw_password text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    new_id uuid;
BEGIN
    -- p_raw_password is accepted for backwards compatibility but ignored
    INSERT INTO public.pending_registrations (
        registration_token, name, phone, email,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco,
        username, password_hash
    )
    VALUES (
        p_registration_token, p_name, p_phone, p_email,
        p_billing_name, p_vat_number, p_billing_address, p_billing_city,
        p_billing_cap, p_billing_province, p_codice_univoco,
        p_username, p_password_hash
    ) RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- Grant permissions (same as original)
GRANT ALL ON FUNCTION public.insert_pending_registration(text, text, text, text, text, text, text, text, text, text, text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.insert_pending_registration(text, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.insert_pending_registration(text, text, text, text, text, text, text, text, text, text, text, text, text, text) TO service_role;

-- 4. Drop unused SQL functions (excluding trigger-bound ones)
DROP FUNCTION IF EXISTS public.archive_old_sessions(integer);
DROP FUNCTION IF EXISTS public.complete_pending_registration(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_or_create_table_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_restaurant_staff(uuid);
