
-- Update `restaurants` table with missing JSONB columns
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS weekly_coperto JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS weekly_ayce JSONB DEFAULT NULL;

-- Ensure RLS is permissive or updated if needed (though adding columns doesn't usually break RLS unless explicit SELECT lists are used in policies)
-- Just in case, grant usage if needed, but existing policies should suffice.
