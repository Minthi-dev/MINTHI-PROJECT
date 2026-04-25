-- TAKEAWAY AUTO PICKUP SETTING
-- Optional flow for high-volume service: after a takeaway order is marked ready,
-- paid orders can be archived automatically after a short pickup window.

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS takeaway_auto_pickup_enabled boolean NOT NULL DEFAULT false;
