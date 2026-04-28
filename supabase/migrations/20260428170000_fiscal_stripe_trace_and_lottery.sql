-- Persist Stripe payment traces separately from the customer lottery code.
-- The lottery code must be supplied by the customer; Stripe IDs are kept only
-- as payment audit references.

ALTER TABLE public.fiscal_receipts
    ADD COLUMN IF NOT EXISTS stripe_payment_trace jsonb;

ALTER TABLE public.table_sessions
    ADD COLUMN IF NOT EXISTS customer_email text,
    ADD COLUMN IF NOT EXISTS customer_tax_code text,
    ADD COLUMN IF NOT EXISTS customer_lottery_code text;

ALTER TABLE public.table_sessions
    DROP CONSTRAINT IF EXISTS table_sessions_customer_lottery_format;
ALTER TABLE public.table_sessions
    ADD CONSTRAINT table_sessions_customer_lottery_format
    CHECK (customer_lottery_code IS NULL OR customer_lottery_code ~ '^[A-Z0-9]{8}$');

CREATE TABLE IF NOT EXISTS public.table_session_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_session_id uuid NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'stripe',
    status text NOT NULL DEFAULT 'succeeded',
    amount numeric(10,2) NOT NULL,
    currency text NOT NULL DEFAULT 'eur',
    stripe_session_id text,
    stripe_payment_intent_id text,
    stripe_charge_id text,
    stripe_receipt_url text,
    payment_method_type text,
    raw_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT table_session_payments_provider_check CHECK (provider IN ('stripe')),
    CONSTRAINT table_session_payments_status_check CHECK (status IN ('succeeded','refunded','voided')),
    CONSTRAINT table_session_payments_amount_check CHECK (amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS table_session_payments_stripe_session_idx
    ON public.table_session_payments (stripe_session_id);

CREATE INDEX IF NOT EXISTS table_session_payments_session_idx
    ON public.table_session_payments (table_session_id, created_at);

CREATE OR REPLACE FUNCTION public.table_session_payments_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS table_session_payments_updated_at ON public.table_session_payments;
CREATE TRIGGER table_session_payments_updated_at
    BEFORE UPDATE ON public.table_session_payments
    FOR EACH ROW EXECUTE FUNCTION public.table_session_payments_set_updated_at();

ALTER TABLE public.table_session_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_session_payments FROM anon, authenticated;
GRANT ALL ON public.table_session_payments TO service_role;
