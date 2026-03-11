-- Fix per apply_custom_menu (Problema 24 del Piano di Ottimizzazione)
-- Questo script rimuove la versione ambigua della funzione e definisce quella corretta con i parametri esatti.

-- 1. Rimuovere la versione vecchia a singolo parametro che potrebbe causare conflitti
DROP FUNCTION IF EXISTS public.apply_custom_menu(uuid);

-- 2. Definire la versione corretta con due parametri (restaurant_id e menu_id)
CREATE OR REPLACE FUNCTION public.apply_custom_menu(p_restaurant_id uuid, p_menu_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Disattiva tutti i piatti del ristorante
  UPDATE dishes SET is_active = false WHERE restaurant_id = p_restaurant_id;

  -- Attiva solo i piatti inclusi nel menu selezionato
  UPDATE dishes SET is_active = true
  WHERE id IN (SELECT dish_id FROM custom_menu_dishes WHERE custom_menu_id = p_menu_id);

  -- Disattiva tutti i menu custom attivi, poi attiva quello selezionato
  UPDATE custom_menus SET is_active = false WHERE restaurant_id = p_restaurant_id;
  UPDATE custom_menus SET is_active = true WHERE id = p_menu_id;
END;
$$;
