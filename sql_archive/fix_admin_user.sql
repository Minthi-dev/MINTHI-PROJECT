-- 1. Fix RLS on users table to ensure updates are allowed
alter table public.users enable row level security;

drop policy if exists "Enable all access for all users" on public.users;
create policy "Enable all access for all users" on public.users for all using (true);

DO $$
DECLARE
    v_admin_id uuid;
    v_temple_id uuid;
BEGIN
    -- 1. Find the ID of the target Admin user (email 'admin@example.com')
    SELECT id INTO v_admin_id FROM public.users WHERE email = 'admin@example.com';
    
    -- 2. If 'admin@example.com' does NOT exist, check if we can just rename 'temple'
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_temple_id FROM public.users WHERE name = 'temple' OR email = 'fezzguidotti@gmail.com' LIMIT 1;
        
        IF v_temple_id IS NOT NULL THEN
            -- Rename temple to admin
            UPDATE public.users 
            SET name = 'Admin', email = 'admin@example.com', password_hash = 'admin123', role = 'ADMIN'
            WHERE id = v_temple_id;
            v_admin_id := v_temple_id;
        ELSE
            -- Create new admin if neither exists
            v_admin_id := uuid_generate_v4();
            INSERT INTO public.users (id, name, email, password_hash, role)
            VALUES (v_admin_id, 'Admin', 'admin@example.com', 'admin123', 'ADMIN');
        END IF;
    END IF;

    -- 3. Handle restaurants owned by conflicting users (e.g. old temple)
    -- Instead of assigning them to Admin, we set owner_id to NULL.
    -- This respects the rule: "Admin does not own restaurants".
    -- The Admin can still see and delete these "orphan" restaurants from the dashboard.
    UPDATE public.restaurants 
    SET owner_id = NULL 
    WHERE owner_id IN (
        SELECT id FROM public.users 
        WHERE id != v_admin_id 
        AND (name = 'temple' OR email = 'fezzguidotti@gmail.com' OR role = 'ADMIN')
    );

    -- 4. Now safely delete any other conflicting users
    DELETE FROM public.users 
    WHERE id != v_admin_id 
    AND (name = 'temple' OR email = 'fezzguidotti@gmail.com' OR role = 'ADMIN');
    
END $$;
