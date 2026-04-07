-- Add auto_deliver_ready_dishes setting to restaurants
-- When true: dishes marked READY in kitchen are automatically set to SERVED
-- (no waiter notification, no waiter delivery step needed)
ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS auto_deliver_ready_dishes boolean DEFAULT false;
