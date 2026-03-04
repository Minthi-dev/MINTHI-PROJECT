-- Tabella per le registrazioni in attesa di pagamento Stripe
-- I dati vengono scritti qui PRIMA del pagamento.
-- Il ristorante reale viene creato SOLO al successo del webhook Stripe.

CREATE TABLE IF NOT EXISTS public.pending_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_token TEXT NOT NULL,
    -- Dati ristorante
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    -- Dati fiscali
    billing_name TEXT,
    vat_number TEXT,
    billing_address TEXT,
    billing_city TEXT,
    billing_cap TEXT,
    billing_province TEXT,
    codice_univoco TEXT,
    -- Credenziali (password già hashata)
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    raw_password TEXT,
    -- Stato
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours')
);

-- RLS
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- Chiunque può inserire (registrazione pubblica tramite link invito)
CREATE POLICY "anon insert pending_registrations"
    ON public.pending_registrations FOR INSERT TO anon WITH CHECK (true);

-- Solo service_role può leggere/aggiornare (webhook)
CREATE POLICY "service_role all pending_registrations"
    ON public.pending_registrations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC chiamata dal webhook: legge pending, crea utente + ristorante, marca come completato
CREATE OR REPLACE FUNCTION public.complete_pending_registration(
    p_pending_id UUID,
    p_stripe_customer_id TEXT,
    p_stripe_subscription_id TEXT
) RETURNS jsonb AS $$
DECLARE
    pending public.pending_registrations%ROWTYPE;
    new_restaurant_id uuid;
    new_user_id uuid;
    result jsonb;
BEGIN
    -- Recupera la registrazione pending (non ancora completata)
    SELECT * INTO pending
    FROM public.pending_registrations
    WHERE id = p_pending_id AND NOT completed;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registrazione pending non trovata o già completata: %', p_pending_id;
    END IF;

    -- Controlla scadenza
    IF pending.expires_at < CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Registrazione pending scaduta: %', p_pending_id;
    END IF;

    -- Crea utente
    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (pending.email, pending.username, pending.username, pending.password_hash, pending.raw_password, 'OWNER')
    RETURNING id INTO new_user_id;

    -- Crea ristorante (attivo subito, pagamento già confermato da Stripe)
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

    -- Segna il token come usato
    UPDATE public.registration_tokens
    SET used = true, used_by_restaurant_id = new_restaurant_id
    WHERE token = pending.registration_token;

    -- Segna la registrazione pending come completata
    UPDATE public.pending_registrations
    SET completed = true
    WHERE id = p_pending_id;

    result := jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );

    RETURN result;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Esiste già un utente con questi dati: %', SQLERRM;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Errore durante la creazione del ristorante: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.complete_pending_registration TO service_role;
