-- Aggiunge TUTTE le colonne mancanti alla tabella restaurants
-- IF NOT EXISTS evita errori se la colonna esiste già

ALTER TABLE "public"."restaurants"
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS all_you_can_eat JSONB,
ADD COLUMN IF NOT EXISTS ayce_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS ayce_max_orders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cover_charge_per_person DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS lunch_time_start TEXT,
ADD COLUMN IF NOT EXISTS lunch_time_end TEXT,
ADD COLUMN IF NOT EXISTS dinner_time_start TEXT,
ADD COLUMN IF NOT EXISTS dinner_time_end TEXT,
ADD COLUMN IF NOT EXISTS enable_course_splitting BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reservation_duration INTEGER DEFAULT 120,
ADD COLUMN IF NOT EXISTS weekly_coperto JSONB,
ADD COLUMN IF NOT EXISTS weekly_ayce JSONB,
ADD COLUMN IF NOT EXISTS weekly_service_hours JSONB,
ADD COLUMN IF NOT EXISTS waiter_password TEXT,
ADD COLUMN IF NOT EXISTS waiter_mode_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_waiter_payments BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS menu_style TEXT DEFAULT 'elegant',
ADD COLUMN IF NOT EXISTS menu_primary_color TEXT DEFAULT '#10b981',
ADD COLUMN IF NOT EXISTS view_only_menu_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_reservation_room_selection BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_public_reservations BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Aggiunge password_hash alla tabella users se mancante
ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS password_hash TEXT;
