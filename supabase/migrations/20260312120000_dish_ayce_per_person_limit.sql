-- Add per-person order limit for individual dishes in AYCE mode
ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS ayce_max_orders_per_person integer DEFAULT NULL;
