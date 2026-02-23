-- 1. Drop existing function to be sure
DROP FUNCTION IF EXISTS public.get_or_create_table_session(UUID, UUID);

-- 2. Re-create the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_or_create_table_session(
    p_table_id UUID,
    p_restaurant_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Execute as admin to bypass RLS issues for anon users
AS $$
DECLARE
    v_session_id UUID;
    v_pin TEXT;
BEGIN
    -- Check for existing active session
    SELECT id INTO v_session_id
    FROM public.table_sessions
    WHERE table_id = p_table_id 
      AND status = 'OPEN'
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
        RETURN v_session_id;
    END IF;

    -- Generate new PIN (e.g. 4721)
    v_pin := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- Create new session
    INSERT INTO public.table_sessions (table_id, restaurant_id, session_pin, status)
    VALUES (p_table_id, p_restaurant_id, v_pin, 'OPEN')
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$;

-- 3. Grant permissions specifically to 'anon' (unauthenticated users)
GRANT EXECUTE ON FUNCTION public.get_or_create_table_session TO anon, authenticated, service_role;
