-- =====================================================================
-- OpenAPI Scontrini Elettronici — multi-tenant integration
--
-- IMPORTANT:
-- The app uses custom app_sessions, not Supabase Auth. For that reason
-- fiscal data must NOT be exposed through public RLS policies that depend
-- on auth.uid(). All reads/writes for these tables go through Edge
-- Functions using the service role after app-session verification.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Per-restaurant fiscal/OpenAPI settings.
--    Kept outside restaurants because restaurants is public-readable in
--    this app and these fields include operational fiscal configuration.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_fiscal_settings (
    restaurant_id UUID PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,

    tax_code TEXT,
    billing_postal_code TEXT,
    fiscal_billing_email TEXT,

    openapi_fiscal_id TEXT,
    openapi_status TEXT NOT NULL DEFAULT 'not_configured'
        CHECK (openapi_status IN ('not_configured','pending','active','failed','suspended')),
    openapi_configured_at TIMESTAMPTZ,
    openapi_last_error TEXT,

    ade_credentials_set_at TIMESTAMPTZ,
    ade_credentials_expire_at TIMESTAMPTZ,

    fiscal_receipts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    fiscal_email_to_customer BOOLEAN NOT NULL DEFAULT TRUE,
    default_vat_rate_code TEXT NOT NULL DEFAULT '10'
        CHECK (default_vat_rate_code IN (
            '4','4.00','5','5.00','10','10.00','22','22.00',
            'N1','N2','N3','N4','N5','N6'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.restaurant_fiscal_settings IS
    'Private fiscal/OpenAPI settings. Access only through Edge Functions.';
COMMENT ON COLUMN public.restaurant_fiscal_settings.openapi_fiscal_id IS
    'Fiscal identifier used as fiscal_id on OpenAPI IT-configurations.';
COMMENT ON COLUMN public.restaurant_fiscal_settings.ade_credentials_expire_at IS
    'Approximate AdE credentials expiration date. Credentials are never stored in Minthi DB.';

CREATE OR REPLACE FUNCTION public.restaurant_fiscal_settings_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurant_fiscal_settings_updated_at ON public.restaurant_fiscal_settings;
CREATE TRIGGER restaurant_fiscal_settings_updated_at
    BEFORE UPDATE ON public.restaurant_fiscal_settings
    FOR EACH ROW EXECUTE FUNCTION public.restaurant_fiscal_settings_set_updated_at();

ALTER TABLE public.restaurant_fiscal_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_fiscal_settings FROM anon, authenticated;
GRANT ALL ON public.restaurant_fiscal_settings TO service_role;

-- ---------------------------------------------------------------------
-- 2. Orders: customer fiscal contact fields used by takeaway checkout.
-- ---------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_email TEXT,
    ADD COLUMN IF NOT EXISTS customer_tax_code TEXT,
    ADD COLUMN IF NOT EXISTS customer_lottery_code TEXT;

CREATE INDEX IF NOT EXISTS orders_customer_email_idx
    ON public.orders (customer_email)
    WHERE customer_email IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. fiscal_receipts: audit log of every receipt emission.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,

    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    table_session_id UUID REFERENCES public.table_sessions(id) ON DELETE SET NULL,

    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    idempotency_key TEXT UNIQUE,

    openapi_receipt_id TEXT UNIQUE,
    openapi_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (openapi_status IN ('pending','submitted','ready','failed','voided','retry')),
    openapi_response JSONB,
    error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    retry_count INT NOT NULL DEFAULT 0,

    items JSONB NOT NULL,
    cash_payment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    electronic_payment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    ticket_restaurant_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    ticket_restaurant_quantity INT NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL,

    customer_email TEXT,
    customer_tax_code TEXT,
    customer_lottery_code TEXT,

    pdf_url TEXT,
    customer_email_sent_at TIMESTAMPTZ,
    customer_email_error TEXT,

    issued_by_user_id UUID,
    issued_via TEXT NOT NULL DEFAULT 'auto_stripe'
        CHECK (issued_via IN ('auto_stripe','auto_takeaway_stripe','manual_cashier','manual_retry')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,

    CONSTRAINT fiscal_receipts_total_consistency
        CHECK (
            ABS(
                COALESCE(cash_payment_amount, 0)
                + COALESCE(electronic_payment_amount, 0)
                + COALESCE(ticket_restaurant_amount, 0)
                - GREATEST(COALESCE(total_amount, 0) - COALESCE(discount_amount, 0), 0)
            ) <= 0.05
        ),
    CONSTRAINT fiscal_receipts_lottery_format
        CHECK (customer_lottery_code IS NULL OR customer_lottery_code ~ '^[A-Z0-9]{8}$'),
    CONSTRAINT fiscal_receipts_email_format
        CHECK (customer_email IS NULL OR customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

CREATE INDEX IF NOT EXISTS fiscal_receipts_restaurant_created_idx
    ON public.fiscal_receipts (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_receipts_order_idx
    ON public.fiscal_receipts (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiscal_receipts_session_idx
    ON public.fiscal_receipts (table_session_id) WHERE table_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiscal_receipts_pending_idx
    ON public.fiscal_receipts (restaurant_id, openapi_status)
    WHERE openapi_status IN ('pending','submitted','retry','failed');
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_receipts_unique_stripe_session_idx
    ON public.fiscal_receipts (restaurant_id, stripe_session_id)
    WHERE stripe_session_id IS NOT NULL AND openapi_status <> 'voided';

CREATE OR REPLACE FUNCTION public.fiscal_receipts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fiscal_receipts_updated_at ON public.fiscal_receipts;
CREATE TRIGGER fiscal_receipts_updated_at
    BEFORE UPDATE ON public.fiscal_receipts
    FOR EACH ROW EXECUTE FUNCTION public.fiscal_receipts_set_updated_at();

ALTER TABLE public.fiscal_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_receipts FROM anon, authenticated;
GRANT ALL ON public.fiscal_receipts TO service_role;

-- ---------------------------------------------------------------------
-- 4. Helper view: stats of last 30 days per restaurant.
--    Queried only from Edge Functions, not directly by the browser.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.fiscal_receipts_stats_30d AS
SELECT
    restaurant_id,
    COUNT(*) FILTER (WHERE openapi_status = 'ready') AS sent_count,
    COUNT(*) FILTER (WHERE openapi_status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE openapi_status = 'voided') AS voided_count,
    COALESCE(SUM(total_amount) FILTER (WHERE openapi_status = 'ready'), 0) AS revenue_total
FROM public.fiscal_receipts
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY restaurant_id;

REVOKE ALL ON public.fiscal_receipts_stats_30d FROM anon, authenticated;
GRANT SELECT ON public.fiscal_receipts_stats_30d TO service_role;
