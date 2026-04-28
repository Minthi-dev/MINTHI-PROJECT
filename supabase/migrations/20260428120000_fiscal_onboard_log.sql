-- =====================================================================
-- Fiscal onboard log + status index
--
-- Adds structured onboarding log field for audit trail and an index
-- to quickly find restaurants with fiscal configuration problems.
-- =====================================================================

-- Campo per log strutturato dell'ultimo onboarding
ALTER TABLE public.restaurant_fiscal_settings
    ADD COLUMN IF NOT EXISTS openapi_onboard_log JSONB;

COMMENT ON COLUMN public.restaurant_fiscal_settings.openapi_onboard_log IS
    'Structured log of the last onboarding attempt (GET/PATCH/DELETE/CREATE/VERIFY steps).';

-- Indice per trovare rapidamente ristoranti con problemi fiscali
CREATE INDEX IF NOT EXISTS fiscal_settings_status_idx
    ON public.restaurant_fiscal_settings (openapi_status)
    WHERE openapi_status IN ('failed', 'suspended');
