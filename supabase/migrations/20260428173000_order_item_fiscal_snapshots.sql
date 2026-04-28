-- Fiscal line snapshots captured at order time.
-- Final receipts must not depend on menu data that can change later.

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS dish_name_snapshot text,
    ADD COLUMN IF NOT EXISTS unit_price_snapshot numeric(10,2),
    ADD COLUMN IF NOT EXISTS vat_rate_snapshot text;

CREATE INDEX IF NOT EXISTS order_items_fiscal_snapshot_missing_idx
    ON public.order_items (created_at)
    WHERE unit_price_snapshot IS NULL OR dish_name_snapshot IS NULL;
