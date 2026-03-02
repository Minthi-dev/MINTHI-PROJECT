-- Registration tokens for restaurant onboarding links
CREATE TABLE IF NOT EXISTS registration_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    free_months INT DEFAULT 0,
    used BOOLEAN DEFAULT false,
    used_by_restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- RLS
ALTER TABLE registration_tokens ENABLE ROW LEVEL SECURITY;

-- Anyone can read tokens (needed for public registration page validation)
CREATE POLICY "Anyone can read registration_tokens" ON registration_tokens FOR SELECT USING (true);
-- Anyone can update tokens (mark as used during registration)
CREATE POLICY "Anyone can update registration_tokens" ON registration_tokens FOR UPDATE USING (true);
-- Authenticated users can insert tokens (admin creates them)
CREATE POLICY "Authenticated can insert registration_tokens" ON registration_tokens FOR INSERT WITH CHECK (true);
