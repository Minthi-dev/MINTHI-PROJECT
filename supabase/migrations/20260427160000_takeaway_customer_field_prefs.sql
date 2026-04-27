-- =====================================================================
-- Takeaway: per-restaurant customer field preferences
--
-- Each restaurant decides which fields the customer must compile during
-- the takeaway checkout. Defaults preserve the previous behaviour
-- (name + phone required, email optional, no last name).
-- =====================================================================

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS takeaway_collect_first_name BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS takeaway_first_name_required BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS takeaway_collect_last_name  BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS takeaway_last_name_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS takeaway_collect_phone      BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS takeaway_phone_required     BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS takeaway_collect_email      BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS takeaway_email_required     BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.restaurants.takeaway_collect_first_name IS
    'Mostra campo nome al cliente in checkout asporto.';
COMMENT ON COLUMN public.restaurants.takeaway_first_name_required IS
    'Quando il campo nome è mostrato, richiedilo come obbligatorio.';
COMMENT ON COLUMN public.restaurants.takeaway_email_required IS
    'Email obbligatoria per ricevere lo scontrino fiscale digitale.';

-- Extend the public takeaway info RPC so the customer menu sees the new
-- field preferences without an extra round-trip.
-- DROP first because Postgres refuses to change return type via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.get_takeaway_restaurant_info(uuid);

CREATE OR REPLACE FUNCTION public.get_takeaway_restaurant_info(p_restaurant_id uuid)
RETURNS TABLE(
    id uuid,
    name text,
    logo_url text,
    address text,
    menu_style text,
    menu_primary_color text,
    takeaway_enabled boolean,
    takeaway_require_stripe boolean,
    takeaway_estimated_minutes integer,
    takeaway_pickup_notice text,
    enable_stripe_payments boolean,
    stripe_connect_enabled boolean,
    takeaway_collect_first_name boolean,
    takeaway_first_name_required boolean,
    takeaway_collect_last_name boolean,
    takeaway_last_name_required boolean,
    takeaway_collect_phone boolean,
    takeaway_phone_required boolean,
    takeaway_collect_email boolean,
    takeaway_email_required boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT id, name, logo_url, address, menu_style, menu_primary_color,
           takeaway_enabled, takeaway_require_stripe,
           public.get_takeaway_restaurant_prep_estimate(p_restaurant_id) AS takeaway_estimated_minutes,
           takeaway_pickup_notice, enable_stripe_payments, stripe_connect_enabled,
           COALESCE(takeaway_collect_first_name, true)  AS takeaway_collect_first_name,
           COALESCE(takeaway_first_name_required, true) AS takeaway_first_name_required,
           COALESCE(takeaway_collect_last_name, false)  AS takeaway_collect_last_name,
           COALESCE(takeaway_last_name_required, false) AS takeaway_last_name_required,
           COALESCE(takeaway_collect_phone, true)       AS takeaway_collect_phone,
           COALESCE(takeaway_phone_required, true)      AS takeaway_phone_required,
           COALESCE(takeaway_collect_email, true)       AS takeaway_collect_email,
           COALESCE(takeaway_email_required, false)     AS takeaway_email_required
    FROM public.restaurants
    WHERE id = p_restaurant_id
      AND COALESCE(is_active, true) = true;
$$;

REVOKE ALL ON FUNCTION public.get_takeaway_restaurant_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_takeaway_restaurant_info(uuid) TO anon, authenticated, service_role;
