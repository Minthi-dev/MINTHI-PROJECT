-- =====================================================================
-- OpenAPI receipts hardening / compatibility migration.
--
-- This migration is intentionally idempotent. It also repairs projects
-- where the first OpenAPI migration was already pushed before the
-- security hardening that moved private fiscal settings out of restaurants.
-- =====================================================================

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

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'restaurants'
          AND column_name = 'openapi_status'
    ) THEN
        EXECUTE $sql$
            INSERT INTO public.restaurant_fiscal_settings (
                restaurant_id,
                tax_code,
                billing_postal_code,
                fiscal_billing_email,
                openapi_fiscal_id,
                openapi_status,
                openapi_configured_at,
                openapi_last_error,
                ade_credentials_set_at,
                ade_credentials_expire_at,
                fiscal_receipts_enabled,
                fiscal_email_to_customer,
                default_vat_rate_code
            )
            SELECT
                id,
                tax_code,
                billing_postal_code,
                fiscal_billing_email,
                openapi_fiscal_id,
                COALESCE(openapi_status, 'not_configured'),
                openapi_configured_at,
                openapi_last_error,
                ade_credentials_set_at,
                ade_credentials_expire_at,
                COALESCE(fiscal_receipts_enabled, false),
                COALESCE(fiscal_email_to_customer, true),
                COALESCE(default_vat_rate_code, '10')
            FROM public.restaurants
            WHERE openapi_status IS NOT NULL
               OR openapi_fiscal_id IS NOT NULL
               OR fiscal_receipts_enabled IS TRUE
            ON CONFLICT (restaurant_id) DO UPDATE SET
                tax_code = EXCLUDED.tax_code,
                billing_postal_code = EXCLUDED.billing_postal_code,
                fiscal_billing_email = EXCLUDED.fiscal_billing_email,
                openapi_fiscal_id = EXCLUDED.openapi_fiscal_id,
                openapi_status = EXCLUDED.openapi_status,
                openapi_configured_at = EXCLUDED.openapi_configured_at,
                openapi_last_error = EXCLUDED.openapi_last_error,
                ade_credentials_set_at = EXCLUDED.ade_credentials_set_at,
                ade_credentials_expire_at = EXCLUDED.ade_credentials_expire_at,
                fiscal_receipts_enabled = EXCLUDED.fiscal_receipts_enabled,
                fiscal_email_to_customer = EXCLUDED.fiscal_email_to_customer,
                default_vat_rate_code = EXCLUDED.default_vat_rate_code
        $sql$;
    END IF;
END $$;

ALTER TABLE public.restaurants
    DROP COLUMN IF EXISTS tax_code,
    DROP COLUMN IF EXISTS billing_postal_code,
    DROP COLUMN IF EXISTS fiscal_billing_email,
    DROP COLUMN IF EXISTS openapi_fiscal_id,
    DROP COLUMN IF EXISTS openapi_status,
    DROP COLUMN IF EXISTS openapi_configured_at,
    DROP COLUMN IF EXISTS openapi_last_error,
    DROP COLUMN IF EXISTS ade_credentials_set_at,
    DROP COLUMN IF EXISTS ade_credentials_expire_at,
    DROP COLUMN IF EXISTS fiscal_receipts_enabled,
    DROP COLUMN IF EXISTS fiscal_email_to_customer,
    DROP COLUMN IF EXISTS default_vat_rate_code;

ALTER TABLE public.fiscal_receipts
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.fiscal_receipts
    DROP CONSTRAINT IF EXISTS fiscal_receipts_total_consistency;

ALTER TABLE public.fiscal_receipts
    ADD CONSTRAINT fiscal_receipts_total_consistency
    CHECK (
        ABS(
            COALESCE(cash_payment_amount, 0)
            + COALESCE(electronic_payment_amount, 0)
            + COALESCE(ticket_restaurant_amount, 0)
            - GREATEST(COALESCE(total_amount, 0) - COALESCE(discount_amount, 0), 0)
        ) <= 0.05
    );

UPDATE public.fiscal_receipts
SET error_log = '[]'::jsonb
WHERE error_log IS NULL;

ALTER TABLE public.fiscal_receipts
    ALTER COLUMN error_log SET DEFAULT '[]'::jsonb,
    ALTER COLUMN error_log SET NOT NULL,
    ALTER COLUMN issued_via SET DEFAULT 'auto_stripe';

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_receipts_idempotency_key_uidx
    ON public.fiscal_receipts (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_receipts_unique_stripe_session_idx
    ON public.fiscal_receipts (restaurant_id, stripe_session_id)
    WHERE stripe_session_id IS NOT NULL AND openapi_status <> 'voided';

DROP POLICY IF EXISTS fiscal_receipts_owner_select ON public.fiscal_receipts;
DROP POLICY IF EXISTS fiscal_receipts_staff_select ON public.fiscal_receipts;

ALTER TABLE public.fiscal_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_receipts FROM anon, authenticated;
GRANT ALL ON public.fiscal_receipts TO service_role;

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
