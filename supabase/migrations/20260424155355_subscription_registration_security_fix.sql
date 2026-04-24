-- Fix subscription onboarding and harden public billing/token access.
-- The 20260402125000 cleanup migration removed complete_pending_registration
-- while stripe-webhook still calls it after Checkout completion.

ALTER TABLE public.pending_registrations
  ALTER COLUMN registration_token DROP NOT NULL;

ALTER TABLE public.registration_tokens
  ADD COLUMN IF NOT EXISTS discount_duration_months integer;

DROP FUNCTION IF EXISTS public.complete_pending_registration(uuid, text, text);

CREATE FUNCTION public.complete_pending_registration(
    p_pending_id uuid,
    p_stripe_customer_id text,
    p_stripe_subscription_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    pending public.pending_registrations%ROWTYPE;
    new_restaurant_id uuid;
    new_user_id uuid;
BEGIN
    SELECT * INTO pending
    FROM public.pending_registrations
    WHERE id = p_pending_id AND completed = false
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registrazione pending non trovata o già completata: %', p_pending_id;
    END IF;

    IF pending.expires_at < now() THEN
        RAISE EXCEPTION 'Registrazione pending scaduta: %', p_pending_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.users WHERE lower(username) = lower(pending.username)) THEN
        RAISE EXCEPTION 'Username "%" già in uso. Scegli un username diverso.', pending.username;
    END IF;

    IF EXISTS (SELECT 1 FROM public.restaurants WHERE lower(name) = lower(pending.name)) THEN
        RAISE EXCEPTION 'Il nome ristorante "%" è già in uso. Registrazione annullata.', pending.name;
    END IF;

    INSERT INTO public.users (email, name, username, password_hash, role)
    VALUES (pending.email, pending.username, pending.username, pending.password_hash, 'OWNER')
    RETURNING id INTO new_user_id;

    INSERT INTO public.restaurants (
        name, phone, email, is_active, owner_id,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco,
        stripe_customer_id, stripe_subscription_id, subscription_status
    )
    VALUES (
        pending.name, pending.phone, pending.email, true, new_user_id,
        pending.billing_name, pending.vat_number, pending.billing_address, pending.billing_city,
        pending.billing_cap, pending.billing_province, pending.codice_univoco,
        p_stripe_customer_id, p_stripe_subscription_id, 'active'
    )
    RETURNING id INTO new_restaurant_id;

    IF pending.registration_token IS NOT NULL AND pending.registration_token <> '' THEN
        UPDATE public.registration_tokens
        SET used = true, used_by_restaurant_id = new_restaurant_id
        WHERE token = pending.registration_token;
    END IF;

    UPDATE public.pending_registrations
    SET completed = true
    WHERE id = p_pending_id;

    RETURN jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_pending_registration(uuid, text, text) TO anon, authenticated, service_role;

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
BEGIN
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
        CASE WHEN p_free_months > 0 THEN 'active' ELSE NULL END
    )
    RETURNING id INTO new_restaurant_id;

    IF p_free_months > 0 THEN
        INSERT INTO public.restaurant_bonuses (
            restaurant_id, free_months, reason, granted_by, expires_at, is_active
        )
        VALUES (
            new_restaurant_id,
            p_free_months,
            'Bonus registrazione',
            'Sistema',
            now() + (p_free_months || ' months')::interval,
            true
        );
    END IF;

    IF p_registration_token IS NOT NULL AND p_registration_token <> '' THEN
        UPDATE public.registration_tokens
        SET used = true, used_by_restaurant_id = new_restaurant_id
        WHERE token = p_registration_token;
    END IF;

    RETURN jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_restaurant_secure(
    text, text, text, text, text, text, integer,
    text, text, text, text, text, text, text, text
) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.validate_registration_token(text);

CREATE FUNCTION public.validate_registration_token(p_token text)
RETURNS TABLE (
    token text,
    free_months integer,
    discount_percent integer,
    discount_duration text,
    discount_duration_months integer,
    stripe_coupon_id text,
    expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        rt.token,
        rt.free_months,
        rt.discount_percent,
        rt.discount_duration,
        rt.discount_duration_months,
        rt.stripe_coupon_id,
        rt.expires_at
    FROM public.registration_tokens rt
    WHERE rt.token = p_token
      AND (rt.expires_at IS NULL OR rt.expires_at > now())
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_registration_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_registration_token(text) TO anon, authenticated, service_role;

-- Public clients should validate one token at a time via the RPC above, not
-- read or mutate the whole token table.
DROP POLICY IF EXISTS "Anyone can read registration_tokens" ON public.registration_tokens;
DROP POLICY IF EXISTS "Anyone can update registration_tokens" ON public.registration_tokens;
DROP POLICY IF EXISTS "Authenticated can insert registration_tokens" ON public.registration_tokens;
DROP POLICY IF EXISTS "tokens_update_usage_only" ON public.registration_tokens;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.registration_tokens FROM anon, authenticated;

-- Hide password hashes and user ids from direct table access. Frontend reads
-- the safe view; login and admin mutations use service-role Edge Functions.
DROP POLICY IF EXISTS "users_manage" ON public.users;
DROP POLICY IF EXISTS "users_select" ON public.users;
REVOKE ALL ON public.users FROM anon, authenticated;
GRANT SELECT ON public.users_safe TO anon, authenticated, service_role;

-- Billing/promo tables are still readable by the admin UI, but public clients
-- can no longer mutate them directly with the anon key.
DROP POLICY IF EXISTS "Allow all for subscription_payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Allow all for restaurant_bonuses" ON public.restaurant_bonuses;
DROP POLICY IF EXISTS "allow_all_discounts" ON public.restaurant_discounts;

DROP POLICY IF EXISTS "subscription_payments_public_select" ON public.subscription_payments;
CREATE POLICY "subscription_payments_public_select"
    ON public.subscription_payments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "restaurant_bonuses_public_select" ON public.restaurant_bonuses;
CREATE POLICY "restaurant_bonuses_public_select"
    ON public.restaurant_bonuses FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "restaurant_discounts_public_select" ON public.restaurant_discounts;
CREATE POLICY "restaurant_discounts_public_select"
    ON public.restaurant_discounts FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.subscription_payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_bonuses FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_discounts FROM anon, authenticated;
