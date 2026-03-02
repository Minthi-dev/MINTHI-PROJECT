-- Add enable_stripe_payments flag for customer-facing Stripe payments
ALTER TABLE "public"."restaurants"
ADD COLUMN IF NOT EXISTS enable_stripe_payments BOOLEAN DEFAULT false;

-- Add payment_method to orders to track how each order was paid
ALTER TABLE "public"."orders"
ADD COLUMN IF NOT EXISTS payment_method TEXT; -- 'cash', 'stripe', null

-- Create subscription_payments table to track all Stripe subscription payments
CREATE TABLE IF NOT EXISTS "public"."subscription_payments" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES "public"."restaurants"(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT,
    stripe_invoice_id TEXT,
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT DEFAULT 'eur',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'refunded'
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create restaurant_bonuses table for free months / custom bonuses
CREATE TABLE IF NOT EXISTS "public"."restaurant_bonuses" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES "public"."restaurants"(id) ON DELETE CASCADE,
    free_months INTEGER NOT NULL DEFAULT 1,
    reason TEXT,
    granted_by TEXT, -- admin user ID or name
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- when the bonus period ends
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add stripe_price_id to restaurants so we don't need to prompt
ALTER TABLE "public"."restaurants"
ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- Add suspension_reason for when restaurants are suspended
ALTER TABLE "public"."restaurants"
ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscription_payments_restaurant ON "public"."subscription_payments"(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status ON "public"."subscription_payments"(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_bonuses_restaurant ON "public"."restaurant_bonuses"(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON "public"."orders"(payment_method);

-- Enable RLS
ALTER TABLE "public"."subscription_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."restaurant_bonuses" ENABLE ROW LEVEL SECURITY;

-- RLS policies for subscription_payments
CREATE POLICY "Allow all for subscription_payments" ON "public"."subscription_payments"
    FOR ALL USING (true) WITH CHECK (true);

-- RLS policies for restaurant_bonuses
CREATE POLICY "Allow all for restaurant_bonuses" ON "public"."restaurant_bonuses"
    FOR ALL USING (true) WITH CHECK (true);
