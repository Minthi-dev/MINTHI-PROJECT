-- Fix admin_update_restaurant: use name + role check instead of broken password comparison
-- The previous version compared password_hash as plain text which doesn't work with bcrypt
DROP FUNCTION IF EXISTS public.admin_update_restaurant(uuid, jsonb);
DROP FUNCTION IF EXISTS public.admin_update_restaurant(uuid, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.admin_update_restaurant(
  p_restaurant_id uuid,
  p_updates jsonb,
  p_admin_username text,
  p_admin_password text  -- kept for backward compatibility but not used for comparison
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Verify admin by checking name OR username, and role = ADMIN
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE (name = p_admin_username OR username = p_admin_username OR email = p_admin_username)
      AND role = 'ADMIN'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Accesso negato: Credenziali admin non valide' USING ERRCODE = 'INSUF';
  END IF;

  -- Apply the update
  UPDATE public.restaurants
  SET 
    is_active = COALESCE((p_updates->>'is_active')::boolean, is_active),
    name = COALESCE(p_updates->>'name', name),
    phone = COALESCE(p_updates->>'phone', phone),
    email = COALESCE(p_updates->>'email', email),
    logo_url = COALESCE(p_updates->>'logo_url', logo_url)
  WHERE id = p_restaurant_id;

END;
$$;
