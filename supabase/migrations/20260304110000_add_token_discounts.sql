-- Aggiunge campi sconto ai token di registrazione
ALTER TABLE registration_tokens
  ADD COLUMN IF NOT EXISTS discount_percent INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_duration TEXT DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT;

-- Aggiunge campi prezzo e prodotto a app_config
INSERT INTO app_config (key, value) VALUES ('stripe_price_amount', '0') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_config (key, value) VALUES ('stripe_product_id', '') ON CONFLICT (key) DO NOTHING;

-- Tabella sconti per ristoranti esistenti
CREATE TABLE IF NOT EXISTS restaurant_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  stripe_coupon_id TEXT,
  discount_percent INT NOT NULL,
  discount_duration TEXT NOT NULL,
  discount_duration_months INT,
  reason TEXT,
  granted_by TEXT,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  banner_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE restaurant_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_discounts" ON restaurant_discounts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_restaurant_discounts_restaurant ON restaurant_discounts(restaurant_id);
