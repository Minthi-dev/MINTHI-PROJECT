-- DB optimization: add missing indexes for common query patterns

-- Users table: login lookups by email and username
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

-- Bookings: date range queries
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.bookings (date_time);

-- Table sessions: opened_at for analytics time-range queries
CREATE INDEX IF NOT EXISTS idx_table_sessions_opened_at ON public.table_sessions (opened_at);

-- Subscription payments: created_at for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_subscription_payments_created_at ON public.subscription_payments (created_at DESC);

-- Registration tokens: token lookup
CREATE INDEX IF NOT EXISTS idx_registration_tokens_token ON public.registration_tokens (token);

-- Pending registrations: token + completion status
CREATE INDEX IF NOT EXISTS idx_pending_registrations_token ON public.pending_registrations (registration_token, completed);
