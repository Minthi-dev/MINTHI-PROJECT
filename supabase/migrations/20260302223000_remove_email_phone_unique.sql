DO $$ 
BEGIN
  -- Drop users email uniqueness
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key' OR conname = 'users_email_unique') THEN
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_unique;
  END IF;

  -- Drop restaurants email uniqueness
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_email_key' OR conname = 'restaurants_email_unique') THEN
    ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_email_key;
    ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_email_unique;
  END IF;

  -- Drop restaurants phone uniqueness
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_phone_key' OR conname = 'restaurants_phone_unique') THEN
    ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_phone_key;
    ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_phone_unique;
  END IF;

  -- Drop any unique indexes not covered by constraints
  DROP INDEX IF EXISTS users_email_key;
  DROP INDEX IF EXISTS restaurants_email_key;
  DROP INDEX IF EXISTS restaurants_phone_key;
  DROP INDEX IF EXISTS users_email_idx;
END $$;
