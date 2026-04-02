-- Add admin_completed flag to subscription_payments for invoice tracking
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS admin_completed BOOLEAN DEFAULT FALSE;
