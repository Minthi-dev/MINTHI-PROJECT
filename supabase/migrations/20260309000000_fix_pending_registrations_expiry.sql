-- Fix: pending_registrations.expires_at default was only 2 hours, causing registrations
-- to expire before the user completes the Stripe payment (Stripe checkout sessions last 24h).
-- Changed to 24 hours to match Stripe's checkout session expiry.

ALTER TABLE public.pending_registrations
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '24 hours');
