-- ============================================
-- Migration: Add weekly_coperto and weekly_ayce columns
-- Run this in Supabase SQL Editor
-- ============================================

-- Add weekly_coperto column (JSONB for weekly coperto schedule)
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS weekly_coperto JSONB DEFAULT NULL;

-- Add weekly_ayce column (JSONB for weekly all-you-can-eat schedule)
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS weekly_ayce JSONB DEFAULT NULL;

-- Add allow_waiter_payments column if missing
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS allow_waiter_payments BOOLEAN DEFAULT TRUE;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND column_name IN ('weekly_coperto', 'weekly_ayce', 'allow_waiter_payments');
