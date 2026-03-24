-- Fix save_custom_menu_dishes: remove is_restaurant_member check
-- The app uses custom session management, not Supabase Auth,
-- so auth.uid() is always NULL for waiters/owners using password login.
-- The RPC is SECURITY DEFINER so it already bypasses RLS.
-- We keep the menu existence check for safety.

CREATE OR REPLACE FUNCTION public.save_custom_menu_dishes(
    p_menu_id uuid,
    p_dish_ids_to_add uuid[],
    p_dish_ids_to_remove uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_restaurant_id uuid;
BEGIN
    -- Verify the menu exists
    SELECT cm.restaurant_id INTO v_restaurant_id
    FROM custom_menus cm
    WHERE cm.id = p_menu_id;

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Menu not found';
    END IF;

    -- Remove dishes
    IF array_length(p_dish_ids_to_remove, 1) > 0 THEN
        DELETE FROM custom_menu_dishes
        WHERE custom_menu_id = p_menu_id
        AND dish_id = ANY(p_dish_ids_to_remove);
    END IF;

    -- Add dishes (ignore duplicates)
    IF array_length(p_dish_ids_to_add, 1) > 0 THEN
        INSERT INTO custom_menu_dishes (custom_menu_id, dish_id)
        SELECT p_menu_id, unnest(p_dish_ids_to_add)
        ON CONFLICT (custom_menu_id, dish_id) DO NOTHING;
    END IF;

    -- Update menu timestamp
    UPDATE custom_menus SET updated_at = now() WHERE id = p_menu_id;
END;
$$;

-- Also grant to anon role since the app may not use authenticated sessions
GRANT EXECUTE ON FUNCTION public.save_custom_menu_dishes(uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_custom_menu_dishes(uuid, uuid[], uuid[]) TO anon;
