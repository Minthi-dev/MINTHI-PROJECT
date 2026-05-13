-- =====================================================================
-- Allow refund / void issued_via values + linked_receipt_id reference
--
-- When a Stripe payment is refunded, we issue an Italian "documento
-- commerciale per reso/annullo" via OpenAPI's linked_receipt mechanism.
-- The new receipt references the original one (linked_receipt_id) so the
-- UI can show "scontrino annullato da #..." and stay consistent with AdE.
-- =====================================================================

-- Drop and re-add the issued_via CHECK to include the new values
ALTER TABLE public.fiscal_receipts
    DROP CONSTRAINT IF EXISTS fiscal_receipts_issued_via_check;

-- The original constraint was inline; we re-create it via a named one so we
-- can keep extending it cleanly in the future.
ALTER TABLE public.fiscal_receipts
    ADD CONSTRAINT fiscal_receipts_issued_via_check
    CHECK (issued_via IN (
        'auto_stripe',
        'auto_takeaway_stripe',
        'manual_cashier',
        'manual_retry',
        'refund_stripe',
        'refund_manual'
    ));

-- Reference to the original receipt that this one cancels/refunds.
ALTER TABLE public.fiscal_receipts
    ADD COLUMN IF NOT EXISTS linked_receipt_id UUID
    REFERENCES public.fiscal_receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fiscal_receipts_linked_receipt_idx
    ON public.fiscal_receipts (linked_receipt_id)
    WHERE linked_receipt_id IS NOT NULL;

-- The negative-amount consistency check used to assume total_amount >= 0.
-- Refund receipts carry negative amounts. Relax the check to allow that.
ALTER TABLE public.fiscal_receipts
    DROP CONSTRAINT IF EXISTS fiscal_receipts_total_consistency;

ALTER TABLE public.fiscal_receipts
    ADD CONSTRAINT fiscal_receipts_total_consistency
    CHECK (
        ABS(
            COALESCE(cash_payment_amount, 0)
            + COALESCE(electronic_payment_amount, 0)
            + COALESCE(ticket_restaurant_amount, 0)
            - (COALESCE(total_amount, 0) - COALESCE(discount_amount, 0))
        ) <= 0.05
    );

COMMENT ON COLUMN public.fiscal_receipts.linked_receipt_id IS
    'When this receipt is a refund/void of another receipt, points to the original. Drives "annullato" UI and ensures fiscal pairing.';
