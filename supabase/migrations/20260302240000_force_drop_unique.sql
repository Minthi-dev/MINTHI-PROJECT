-- Force drop the constraints if they still exist.
-- Sometimes DO $$ blocks can fail or miss alternate names. We'll be super explicit.

DO $$
DECLARE
    row record;
BEGIN
    FOR row IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.users'::regclass 
        AND contype = 'u' 
        AND conname LIKE '%email%'
    LOOP
        EXECUTE 'ALTER TABLE public.users DROP CONSTRAINT ' || quote_ident(row.conname);
    END LOOP;

    FOR row IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.restaurants'::regclass 
        AND contype = 'u' 
        AND (conname LIKE '%email%' OR conname LIKE '%phone%')
    LOOP
        EXECUTE 'ALTER TABLE public.restaurants DROP CONSTRAINT ' || quote_ident(row.conname);
    END LOOP;

    -- Also drop indexes that might be acting as unique constraints
    FOR row IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'users' AND indexname LIKE '%email%'
    LOOP
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(row.indexname);
    END LOOP;

    FOR row IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'restaurants' AND (indexname LIKE '%email%' OR indexname LIKE '%phone%')
    LOOP
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(row.indexname);
    END LOOP;
END $$;
