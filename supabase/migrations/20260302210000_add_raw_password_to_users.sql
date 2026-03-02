-- Migration to add raw_password column to users table

ALTER TABLE public.users
ADD COLUMN raw_password text;

-- Add a comment explaining its purpose
COMMENT ON COLUMN public.users.raw_password IS 'Stores the unhashed password for Admin dashboard visibility. Only accessible to Admins/Superusers via RLS or service role.';
