-- Add payment enhancement fields to restaurants table
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS vat_number TEXT,
  ADD COLUMN IF NOT EXISTS billing_name TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT; -- 'active', 'past_due', 'canceled', 'trialing', null

-- Index for Connect account lookups
CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_connect ON restaurants(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

-- Index for subscription_status queries (for dashboard banner)
CREATE INDEX IF NOT EXISTS idx_restaurants_subscription_status ON restaurants(subscription_status)
  WHERE subscription_status IS NOT NULL;
