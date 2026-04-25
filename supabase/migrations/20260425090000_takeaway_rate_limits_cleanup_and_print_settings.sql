-- =====================================================================
-- TAKEAWAY HARDENING: PUBLIC RATE LIMITS, PENDING CLEANUP, PRINT SETTINGS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.takeaway_rate_limits (
    key text PRIMARY KEY,
    action text NOT NULL,
    restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
    ip_hash text NOT NULL,
    window_start timestamptz NOT NULL,
    count integer NOT NULL DEFAULT 1,
    expires_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_takeaway_rate_limits_expires_at
    ON public.takeaway_rate_limits(expires_at);

ALTER TABLE public.takeaway_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'takeaway_rate_limits'
          AND policyname = 'takeaway_rate_limits_service_role_only'
    ) THEN
        CREATE POLICY takeaway_rate_limits_service_role_only
            ON public.takeaway_rate_limits
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.check_takeaway_rate_limit(
    p_action text,
    p_restaurant_id uuid,
    p_ip text,
    p_window_seconds integer,
    p_max_attempts integer
)
RETURNS TABLE(
    allowed boolean,
    current_count integer,
    max_attempts integer,
    retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_now timestamptz := now();
    v_window_seconds integer := GREATEST(10, COALESCE(p_window_seconds, 60));
    v_max_attempts integer := GREATEST(1, COALESCE(p_max_attempts, 10));
    v_window_start timestamptz;
    v_ip_hash text;
    v_key text;
    v_count integer;
BEGIN
    IF p_action IS NULL OR p_action = '' OR p_restaurant_id IS NULL THEN
        RETURN QUERY SELECT false, 0, v_max_attempts, v_window_seconds;
        RETURN;
    END IF;

    v_window_start := to_timestamp(floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds);
    v_ip_hash := encode(digest(COALESCE(NULLIF(p_ip, ''), 'unknown'), 'sha256'), 'hex');
    v_key := p_action || ':' || p_restaurant_id::text || ':' || v_ip_hash || ':' || extract(epoch from v_window_start)::bigint::text;

    DELETE FROM public.takeaway_rate_limits
    WHERE expires_at < v_now
      AND random() < 0.03;

    INSERT INTO public.takeaway_rate_limits(key, action, restaurant_id, ip_hash, window_start, count, expires_at)
    VALUES (v_key, p_action, p_restaurant_id, v_ip_hash, v_window_start, 1, v_window_start + make_interval(secs => v_window_seconds * 2))
    ON CONFLICT (key) DO UPDATE
        SET count = public.takeaway_rate_limits.count + 1,
            updated_at = v_now,
            expires_at = v_window_start + make_interval(secs => v_window_seconds * 2)
    RETURNING count INTO v_count;

    RETURN QUERY SELECT
        v_count <= v_max_attempts,
        v_count,
        v_max_attempts,
        GREATEST(1, CEIL(EXTRACT(epoch FROM (v_window_start + make_interval(secs => v_window_seconds) - v_now)))::integer);
END;
$$;

REVOKE ALL ON FUNCTION public.check_takeaway_rate_limit(text, uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_takeaway_rate_limit(text, uuid, text, integer, integer) TO service_role;

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS takeaway_auto_print boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS takeaway_max_orders_per_hour integer;

ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS chk_takeaway_max_orders_per_hour;
ALTER TABLE public.restaurants
    ADD CONSTRAINT chk_takeaway_max_orders_per_hour
    CHECK (takeaway_max_orders_per_hour IS NULL OR takeaway_max_orders_per_hour BETWEEN 1 AND 500);

CREATE OR REPLACE FUNCTION public.cleanup_expired_takeaway_orders(p_older_than interval DEFAULT interval '4 hours')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    WITH expired AS (
        UPDATE public.orders
        SET status = 'CANCELLED',
            closed_at = now(),
            customer_notes = trim(both E'\n' from concat_ws(E'\n', NULLIF(customer_notes, ''), '[Sistema] Checkout Stripe scaduto: ordine annullato automaticamente.'))
        WHERE order_type = 'takeaway'
          AND status = 'PENDING'
          AND COALESCE(paid_amount, 0) < 0.01
          AND created_at < now() - COALESCE(p_older_than, interval '4 hours')
        RETURNING id
    ),
    cancelled_items AS (
        UPDATE public.order_items
        SET status = 'CANCELLED'
        WHERE order_id IN (SELECT id FROM expired)
          AND status <> 'CANCELLED'
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM expired;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_takeaway_orders(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_takeaway_orders(interval) TO service_role;

CREATE OR REPLACE FUNCTION public.anonymize_old_takeaway_customer_data(p_older_than interval DEFAULT interval '30 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    WITH anonymized AS (
        UPDATE public.orders
        SET customer_name = 'Cliente',
            customer_phone = NULL,
            customer_notes = NULL
        WHERE order_type = 'takeaway'
          AND created_at < now() - COALESCE(p_older_than, interval '30 days')
          AND (
              COALESCE(customer_name, '') <> 'Cliente'
              OR customer_phone IS NOT NULL
              OR customer_notes IS NOT NULL
          )
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM anonymized;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_old_takeaway_customer_data(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_old_takeaway_customer_data(interval) TO service_role;

-- Public status lookup must go through the rate-limited Edge Function.
REVOKE EXECUTE ON FUNCTION public.get_takeaway_order_status(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_takeaway_order_status(uuid, text) TO service_role;

-- Best-effort DB cron when pg_cron is enabled on the project.
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
    EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
        RAISE NOTICE 'pg_cron extension not available; schedule takeaway cleanup from Supabase scheduled functions if needed.';
    END;

    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-takeaway-orders') THEN
            PERFORM cron.unschedule('cleanup-expired-takeaway-orders');
        END IF;
        PERFORM cron.schedule(
            'cleanup-expired-takeaway-orders',
            '*/15 * * * *',
            $SQL$SELECT public.cleanup_expired_takeaway_orders(interval '4 hours');$SQL$
        );
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'anonymize-old-takeaway-customers') THEN
            PERFORM cron.unschedule('anonymize-old-takeaway-customers');
        END IF;
        PERFORM cron.schedule(
            'anonymize-old-takeaway-customers',
            '17 3 * * *',
            $SQL$SELECT public.anonymize_old_takeaway_customer_data(interval '30 days');$SQL$
        );
    END IF;
END $$;
