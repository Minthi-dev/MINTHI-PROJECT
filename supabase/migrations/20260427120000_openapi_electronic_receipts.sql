-- =====================================================================
-- OpenAPI Scontrini Elettronici — multi-tenant integration
--
-- Federico Minthi has ONE OpenAPI account; each restaurant is a separate
-- IT-configuration on OpenAPI's side, identified by its fiscal_id (P.IVA
-- or codice fiscale). Receipts are emitted POST /IT-receipts under the
-- restaurant's fiscal_id.
--
-- This migration adds:
--   1. Columns on `restaurants` for fiscal data + OpenAPI status flags.
--      We DO NOT store AdE credentials (taxCode/password/PIN). They are
--      passed through to OpenAPI when configuring/updating the IT-config
--      and never persisted in our DB. We only track when they were last
--      set / when they expire (AdE rotates every 90 days).
--   2. A `fiscal_receipts` table to log every emission attempt for audit,
--      idempotency and PDF retrieval.
--   3. Indexes + RLS so each restaurant only sees its own receipts.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Restaurants: fiscal & OpenAPI columns (idempotent)
-- ---------------------------------------------------------------------
ALTER TABLE restaurants
    -- Italian fiscal identifier used as OpenAPI's fiscal_id (P.IVA 11 digits
    -- or codice fiscale 16 chars for ditte individuali). We already have
    -- vat_number/billing_name/billing_city etc — we add the missing ones.
    ADD COLUMN IF NOT EXISTS tax_code            TEXT,
    ADD COLUMN IF NOT EXISTS billing_postal_code TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_billing_email TEXT,
    -- OpenAPI integration state
    ADD COLUMN IF NOT EXISTS openapi_fiscal_id              TEXT, -- maps to IT-configurations.fiscal_id
    ADD COLUMN IF NOT EXISTS openapi_status                 TEXT
        CHECK (openapi_status IS NULL OR openapi_status IN
            ('not_configured','pending','active','failed','suspended')),
    ADD COLUMN IF NOT EXISTS openapi_configured_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS openapi_last_error             TEXT,
    -- AdE credentials hygiene — we never store them, only the date they
    -- were last submitted to OpenAPI so we can warn the restaurateur
    -- before the 90-day rotation expires.
    ADD COLUMN IF NOT EXISTS ade_credentials_set_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ade_credentials_expire_at      TIMESTAMPTZ,
    -- Master kill-switch: even if openapi_status='active', the restaurant
    -- can pause auto-emission (e.g. while testing).
    ADD COLUMN IF NOT EXISTS fiscal_receipts_enabled        BOOLEAN DEFAULT FALSE,
    -- Whether to email the PDF to the customer when an email is supplied.
    ADD COLUMN IF NOT EXISTS fiscal_email_to_customer       BOOLEAN DEFAULT TRUE,
    -- Default VAT rate for items without explicit one (Italian standard 22%).
    ADD COLUMN IF NOT EXISTS default_vat_rate_code          TEXT DEFAULT '22';

COMMENT ON COLUMN restaurants.openapi_fiscal_id IS
    'Codice fiscale/P.IVA usato come fiscal_id su OpenAPI IT-configurations.';
COMMENT ON COLUMN restaurants.ade_credentials_expire_at IS
    'Data approssimativa di scadenza credenziali AdE (90 giorni dopo l''ultimo set). Banner di rinnovo in dashboard.';

-- ---------------------------------------------------------------------
-- 1b. Orders: customer fiscal contact fields (used by takeaway checkout)
--     to send the digital receipt PDF and to fill the AdE lottery code /
--     tessera sanitaria CF if the customer wants them on the receipt.
-- ---------------------------------------------------------------------
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_email        TEXT,
    ADD COLUMN IF NOT EXISTS customer_tax_code     TEXT,
    ADD COLUMN IF NOT EXISTS customer_lottery_code TEXT;

CREATE INDEX IF NOT EXISTS orders_customer_email_idx
    ON orders (customer_email)
    WHERE customer_email IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. fiscal_receipts: audit log of every receipt emission
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fiscal_receipts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

    -- Source: either a dine_in order (table_session) or a takeaway order
    order_id            UUID REFERENCES orders(id)         ON DELETE SET NULL,
    table_session_id    UUID REFERENCES table_sessions(id) ON DELETE SET NULL,

    -- Stripe cross-reference for idempotency from webhook
    stripe_session_id   TEXT,            -- cs_xxx
    stripe_payment_intent_id TEXT,       -- pi_xxx

    -- OpenAPI side
    openapi_receipt_id  TEXT UNIQUE,     -- id returned by POST /IT-receipts
    openapi_status      TEXT NOT NULL DEFAULT 'pending'
        CHECK (openapi_status IN
            ('pending','submitted','ready','failed','voided','retry')),
    openapi_response    JSONB,           -- last raw response (for debugging)
    error_log           JSONB DEFAULT '[]'::jsonb,
    retry_count         INT NOT NULL DEFAULT 0,

    -- Receipt content (snapshot — never mutates after emission)
    items               JSONB NOT NULL,  -- [{ description, quantity, unit_price, vat_rate_code, discount? }]
    cash_payment_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
    electronic_payment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    ticket_restaurant_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
    ticket_restaurant_quantity INT NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(10,2) NOT NULL,

    -- Customer fields (optional)
    customer_email      TEXT,
    customer_tax_code   TEXT,            -- CF cliente per Tessera Sanitaria
    customer_lottery_code TEXT,          -- 8-char lottery code

    -- Delivery to customer (PDF email)
    pdf_url             TEXT,            -- signed URL or storage path
    customer_email_sent_at TIMESTAMPTZ,
    customer_email_error TEXT,

    -- Audit
    issued_by_user_id   UUID,            -- when emitted manually by cashier
    issued_via          TEXT NOT NULL DEFAULT 'auto'
        CHECK (issued_via IN ('auto_stripe','auto_takeaway_stripe','manual_cashier','manual_retry')),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at        TIMESTAMPTZ,
    ready_at            TIMESTAMPTZ,
    voided_at           TIMESTAMPTZ,

    -- Coherence: payment amounts must roughly equal total
    CONSTRAINT fiscal_receipts_total_consistency
        CHECK (
            ABS(
                COALESCE(cash_payment_amount, 0)
                + COALESCE(electronic_payment_amount, 0)
                + COALESCE(ticket_restaurant_amount, 0)
                - COALESCE(total_amount, 0)
            ) <= 0.05
        )
);

CREATE INDEX IF NOT EXISTS fiscal_receipts_restaurant_created_idx
    ON fiscal_receipts (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_receipts_order_idx
    ON fiscal_receipts (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiscal_receipts_session_idx
    ON fiscal_receipts (table_session_id) WHERE table_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiscal_receipts_stripe_session_idx
    ON fiscal_receipts (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiscal_receipts_pending_idx
    ON fiscal_receipts (restaurant_id, openapi_status)
    WHERE openapi_status IN ('pending','submitted','retry','failed');

-- updated_at trigger
CREATE OR REPLACE FUNCTION fiscal_receipts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fiscal_receipts_updated_at ON fiscal_receipts;
CREATE TRIGGER fiscal_receipts_updated_at
    BEFORE UPDATE ON fiscal_receipts
    FOR EACH ROW EXECUTE FUNCTION fiscal_receipts_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. RLS — owners and staff see only their restaurant's receipts.
--    Service role (edge functions) bypasses RLS.
-- ---------------------------------------------------------------------
ALTER TABLE fiscal_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_receipts_owner_select ON fiscal_receipts;
CREATE POLICY fiscal_receipts_owner_select
    ON fiscal_receipts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurants r
            WHERE r.id = fiscal_receipts.restaurant_id
              AND r.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS fiscal_receipts_staff_select ON fiscal_receipts;
CREATE POLICY fiscal_receipts_staff_select
    ON fiscal_receipts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff s
            WHERE s.id = auth.uid()
              AND s.is_active
              AND s.restaurant_id = fiscal_receipts.restaurant_id
        )
    );

-- All writes go through edge functions (service role) — no client INSERT/UPDATE/DELETE.

-- ---------------------------------------------------------------------
-- 4. Helper view: stats of last 30 days per restaurant
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW fiscal_receipts_stats_30d AS
SELECT
    restaurant_id,
    COUNT(*) FILTER (WHERE openapi_status = 'ready')   AS sent_count,
    COUNT(*) FILTER (WHERE openapi_status = 'failed')  AS failed_count,
    COUNT(*) FILTER (WHERE openapi_status = 'voided')  AS voided_count,
    COALESCE(SUM(total_amount) FILTER (WHERE openapi_status = 'ready'), 0) AS revenue_total
FROM fiscal_receipts
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY restaurant_id;

GRANT SELECT ON fiscal_receipts_stats_30d TO authenticated;
