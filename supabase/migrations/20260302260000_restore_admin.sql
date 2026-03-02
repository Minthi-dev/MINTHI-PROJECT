-- Restore admin users from auth.users into public.users
-- Since we truncated the public.users table, any existing admin accounts in Supabase Auth need a corresponding profile in public.users to access the system.

INSERT INTO public.users (id, email, name, username, password_hash, raw_password, role)
SELECT 
    id, 
    email, 
    'Amministratore', 
    split_part(email, '@', 1), 
    'HASHPASSWORD', 
    'UNKNOWN', 
    'ADMIN'
FROM auth.users
WHERE email ILIKE '%admin%' OR email ILIKE '%minthi.it%'
ON CONFLICT (id) DO UPDATE SET role = 'ADMIN';

-- If there are other auth.users that we accidentally orphaned (like restaurant owners), they will recreate their restaurants when they register again using the same email (since we dropped the unique constraint!)
-- But for admins, they need their role restored immediately.
