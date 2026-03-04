ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS receipt_issued BOOLEAN DEFAULT false;
