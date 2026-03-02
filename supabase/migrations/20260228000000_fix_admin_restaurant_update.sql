-- Drop any previous version
DROP FUNCTION IF EXISTS public.admin_update_restaurant(uuid, jsonb);
DROP FUNCTION IF EXISTS public.admin_update_restaurant(uuid, jsonb, text, text);

-- Funzione RPC per admin per aggiornare i ristoranti bypassando RLS
-- Prende username e password hash per validare l'identita' dell'admin
CREATE OR REPLACE FUNCTION public.admin_update_restaurant(
  p_restaurant_id uuid,
  p_updates jsonb,
  p_admin_username text,
  p_admin_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Permette di bypassare RLS
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- 1. Verifica manuale delle credenziali admin (visto che auth.uid() non e' usato)
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE username = p_admin_username 
      AND password_hash = p_admin_password 
      AND role = 'ADMIN'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Accesso negato: Credenziali admin non valide' USING ERRCODE = 'INSUF';
  END IF;

  -- 2. Applica l'aggiornamento
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
