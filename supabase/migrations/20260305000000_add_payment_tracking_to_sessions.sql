-- Add payment tracking columns to table_sessions
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
