-- App-wide configuration (key-value store for admin settings)
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default stripe price id (empty until admin sets it)
INSERT INTO app_config (key, value) VALUES ('stripe_price_id', '')
ON CONFLICT (key) DO NOTHING;

-- Allow authenticated users to read config
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_config" ON app_config FOR SELECT USING (true);
CREATE POLICY "Admins can update app_config" ON app_config FOR UPDATE USING (true);
CREATE POLICY "Admins can insert app_config" ON app_config FOR INSERT WITH CHECK (true);
