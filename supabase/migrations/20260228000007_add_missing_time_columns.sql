ALTER TABLE "public"."restaurants"
ADD COLUMN IF NOT EXISTS lunch_time_start TEXT,
ADD COLUMN IF NOT EXISTS lunch_time_end TEXT,
ADD COLUMN IF NOT EXISTS dinner_time_start TEXT,
ADD COLUMN IF NOT EXISTS dinner_time_end TEXT,
ADD COLUMN IF NOT EXISTS weekly_service_hours JSONB,
ADD COLUMN IF NOT EXISTS weekly_coperto JSONB,
ADD COLUMN IF NOT EXISTS weekly_ayce JSONB,
ADD COLUMN IF NOT EXISTS all_you_can_eat JSONB,
ADD COLUMN IF NOT EXISTS cover_charge_per_person DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS enable_course_splitting BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_waiter_payments BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS waiter_mode_enabled BOOLEAN DEFAULT false;
