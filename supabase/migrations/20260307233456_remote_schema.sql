


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_to_cart"("p_session_id" "uuid", "p_dish_id" "uuid", "p_quantity" integer DEFAULT 1, "p_notes" "text" DEFAULT NULL::"text", "p_course_number" integer DEFAULT 1) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_cart_id uuid;
BEGIN
    -- Verificare che la sessione sia OPEN
    IF NOT EXISTS (
        SELECT 1 FROM public.table_sessions
        WHERE id = p_session_id AND status = 'OPEN'
    ) THEN
        RAISE EXCEPTION 'Session % is not open', p_session_id;
    END IF;

    -- Cercare item esistente con stessi parametri (con lock per atomicità)
    SELECT id INTO v_cart_id
    FROM public.cart_items
    WHERE session_id = p_session_id
      AND dish_id = p_dish_id
      AND course_number = p_course_number
      AND COALESCE(notes, '') = COALESCE(p_notes, '')
    FOR UPDATE;

    IF v_cart_id IS NOT NULL THEN
        UPDATE public.cart_items
        SET quantity = quantity + p_quantity,
            updated_at = NOW()
        WHERE id = v_cart_id;
        RETURN v_cart_id;
    ELSE
        INSERT INTO public.cart_items (session_id, dish_id, quantity, notes, course_number)
        VALUES (p_session_id, p_dish_id, p_quantity, p_notes, p_course_number)
        RETURNING id INTO v_cart_id;
        RETURN v_cart_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."add_to_cart"("p_session_id" "uuid", "p_dish_id" "uuid", "p_quantity" integer, "p_notes" "text", "p_course_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_restaurant"("p_restaurant_id" "uuid", "p_updates" "jsonb", "p_admin_username" "text", "p_admin_password" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_update_restaurant"("p_restaurant_id" "uuid", "p_updates" "jsonb", "p_admin_username" "text", "p_admin_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_custom_menu"("p_restaurant_id" "uuid", "p_menu_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Tolto il controllo is_restaurant_member perché l'app non usa Supabase Auth (auth.uid() è null)
    IF NOT EXISTS (
        SELECT 1 FROM public.custom_menus cm
        WHERE cm.id = p_menu_id
          AND cm.restaurant_id = p_restaurant_id
    ) THEN
        RAISE EXCEPTION 'Menu % not found for restaurant %', p_menu_id, p_restaurant_id;
    END IF;

    UPDATE public.custom_menus SET is_active = false WHERE restaurant_id = p_restaurant_id;
    UPDATE public.custom_menus SET is_active = true WHERE id = p_menu_id;
    UPDATE public.dishes SET is_active = false WHERE restaurant_id = p_restaurant_id;
    UPDATE public.dishes d SET is_active = true
    FROM public.custom_menu_dishes cmd
    WHERE cmd.custom_menu_id = p_menu_id AND cmd.dish_id = d.id AND d.restaurant_id = p_restaurant_id;
END;
$$;


ALTER FUNCTION "public"."apply_custom_menu"("p_restaurant_id" "uuid", "p_menu_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_old_sessions"("days_old" integer DEFAULT 90) RETURNS TABLE("archived_sessions" integer, "archived_orders" integer, "archived_items" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_sessions INTEGER := 0;
    v_orders INTEGER := 0;
    v_items INTEGER := 0;
BEGIN
    v_cutoff := NOW() - (days_old || ' days')::INTERVAL;

    -- 1. Archivia order_items
    WITH moved AS (
        INSERT INTO public.archived_order_items
        SELECT oi.*
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        JOIN public.table_sessions ts ON ts.id = o.table_session_id
        WHERE ts.status = 'CLOSED' AND ts.closed_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_items FROM moved;

    -- 2. Archivia orders
    WITH moved AS (
        INSERT INTO public.archived_orders
        SELECT o.*
        FROM public.orders o
        JOIN public.table_sessions ts ON ts.id = o.table_session_id
        WHERE ts.status = 'CLOSED' AND ts.closed_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_orders FROM moved;

    -- 3. Archivia sessioni
    WITH moved AS (
        INSERT INTO public.archived_table_sessions
        SELECT *
        FROM public.table_sessions
        WHERE status = 'CLOSED' AND closed_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_sessions FROM moved;

    -- 4. Elimina dai live in ordine corretto (FK constraints)
    DELETE FROM public.order_items
    WHERE order_id IN (
        SELECT o.id FROM public.orders o
        JOIN public.table_sessions ts ON ts.id = o.table_session_id
        WHERE ts.status = 'CLOSED' AND ts.closed_at < v_cutoff
    );

    DELETE FROM public.orders
    WHERE table_session_id IN (
        SELECT id FROM public.table_sessions
        WHERE status = 'CLOSED' AND closed_at < v_cutoff
    );

    DELETE FROM public.table_sessions
    WHERE status = 'CLOSED' AND closed_at < v_cutoff;

    RETURN QUERY SELECT v_sessions, v_orders, v_items;
END;
$$;


ALTER FUNCTION "public"."archive_old_sessions"("days_old" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."archive_old_sessions"("days_old" integer) IS 'Archives closed sessions older than N days to archive tables, then deletes from live. Run weekly via pg_cron.';



CREATE OR REPLACE FUNCTION "public"."complete_pending_registration"("p_pending_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    pending public.pending_registrations%ROWTYPE;
    new_restaurant_id uuid;
    new_user_id uuid;
    result jsonb;
BEGIN
    -- Recupera la registrazione pending (non ancora completata)
    SELECT * INTO pending
    FROM public.pending_registrations
    WHERE id = p_pending_id AND NOT completed;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registrazione pending non trovata o già completata: %', p_pending_id;
    END IF;

    -- Controlla scadenza
    IF pending.expires_at < CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Registrazione pending scaduta: %', p_pending_id;
    END IF;

    -- Crea utente
    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (pending.email, pending.username, pending.username, pending.password_hash, pending.raw_password, 'OWNER')
    RETURNING id INTO new_user_id;

    -- Crea ristorante (attivo subito, pagamento già confermato da Stripe)
    INSERT INTO public.restaurants (
        name, phone, is_active, owner_id,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco,
        stripe_customer_id, stripe_subscription_id, subscription_status
    )
    VALUES (
        pending.name, pending.phone, true, new_user_id,
        pending.billing_name, pending.vat_number, pending.billing_address, pending.billing_city,
        pending.billing_cap, pending.billing_province, pending.codice_univoco,
        p_stripe_customer_id, p_stripe_subscription_id, 'active'
    )
    RETURNING id INTO new_restaurant_id;

    -- Segna il token come usato
    UPDATE public.registration_tokens
    SET used = true, used_by_restaurant_id = new_restaurant_id
    WHERE token = pending.registration_token;

    -- Segna la registrazione pending come completata
    UPDATE public.pending_registrations
    SET completed = true
    WHERE id = p_pending_id;

    result := jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );

    RETURN result;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Esiste già un utente con questi dati: %', SQLERRM;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Errore durante la creazione del ristorante: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."complete_pending_registration"("p_pending_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_average_cooking_time"("p_dish_id" "uuid", "p_restaurant_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    avg_time integer;
BEGIN
    SELECT ROUND(AVG(EXTRACT(EPOCH FROM (oi.ready_at - oi.created_at)) / 60))::integer
    INTO avg_time
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.dish_id = p_dish_id
      AND o.restaurant_id = p_restaurant_id
      AND oi.ready_at IS NOT NULL
      AND oi.created_at IS NOT NULL
      AND oi.ready_at > oi.created_at
    HAVING COUNT(*) >= 3;

    RETURN COALESCE(avg_time, 0);
END;
$$;


ALTER FUNCTION "public"."get_average_cooking_time"("p_dish_id" "uuid", "p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dish_avg_cooking_times"("p_restaurant_id" "uuid") RETURNS TABLE("dish_id" "uuid", "avg_minutes" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    SELECT
        oi.dish_id,
        ROUND(AVG(EXTRACT(EPOCH FROM (oi.ready_at - oi.created_at)) / 60)::NUMERIC, 0) AS avg_minutes
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE
        o.restaurant_id = p_restaurant_id
        AND oi.ready_at IS NOT NULL
        AND oi.created_at > NOW() - INTERVAL '2 months'
        AND EXTRACT(EPOCH FROM (oi.ready_at - oi.created_at)) > 0
    GROUP BY oi.dish_id
    HAVING COUNT(*) >= 3
$$;


ALTER FUNCTION "public"."get_dish_avg_cooking_times"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_table_session"("p_table_id" "uuid", "p_restaurant_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_session_id UUID;
    v_pin TEXT;
BEGIN
    -- Verifica che il tavolo appartenga al ristorante (prevenzione injection)
    IF NOT EXISTS (
        SELECT 1 FROM public.tables
        WHERE id = p_table_id
          AND restaurant_id = p_restaurant_id
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Table % does not belong to restaurant % or is inactive', p_table_id, p_restaurant_id;
    END IF;

    -- Advisory lock per prevenire race condition (2 scan simultanei dello stesso QR)
    PERFORM pg_advisory_xact_lock(hashtext(p_table_id::text));

    -- Cerca sessione OPEN esistente
    SELECT id INTO v_session_id
    FROM public.table_sessions
    WHERE table_id = p_table_id AND status = 'OPEN'
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
        RETURN v_session_id;
    END IF;

    -- Genera PIN a 4 cifre con zero-padding
    v_pin := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- Crea nuova sessione
    INSERT INTO public.table_sessions (table_id, restaurant_id, session_pin, status)
    VALUES (p_table_id, p_restaurant_id, v_pin, 'OPEN')
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$;


ALTER FUNCTION "public"."get_or_create_table_session"("p_table_id" "uuid", "p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_restaurant_for_login"("p_owner_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'id', id,
        'name', name,
        'is_active', is_active
    ) INTO result
    FROM public.restaurants
    WHERE owner_id = p_owner_id
    LIMIT 1;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_restaurant_for_login"("p_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_table_sizes"() RETURNS TABLE("table_name" "text", "row_count" bigint, "total_size" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT
        schemaname || '.' || relname AS table_name,
        n_live_tup AS row_count,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(relid) DESC;
$$;


ALTER FUNCTION "public"."get_table_sizes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_pending_registration"("p_registration_token" "text", "p_name" "text", "p_phone" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text", "p_billing_name" "text" DEFAULT NULL::"text", "p_vat_number" "text" DEFAULT NULL::"text", "p_billing_address" "text" DEFAULT NULL::"text", "p_billing_city" "text" DEFAULT NULL::"text", "p_billing_cap" "text" DEFAULT NULL::"text", "p_billing_province" "text" DEFAULT NULL::"text", "p_codice_univoco" "text" DEFAULT NULL::"text", "p_username" "text" DEFAULT NULL::"text", "p_password_hash" "text" DEFAULT NULL::"text", "p_raw_password" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO public.pending_registrations (
        registration_token, name, phone, email,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco,
        username, password_hash, raw_password
    ) VALUES (
        p_registration_token, p_name, p_phone, p_email,
        p_billing_name, p_vat_number, p_billing_address, p_billing_city,
        p_billing_cap, p_billing_province, p_codice_univoco,
        p_username, p_password_hash, p_raw_password
    ) RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."insert_pending_registration"("p_registration_token" "text", "p_name" "text", "p_phone" "text", "p_email" "text", "p_billing_name" "text", "p_vat_number" "text", "p_billing_address" "text", "p_billing_city" "text", "p_billing_cap" "text", "p_billing_province" "text", "p_codice_univoco" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
    );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = p_restaurant_id
        AND (
            r.owner_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.restaurant_staff rs
                WHERE rs.restaurant_id = r.id   -- FIX: era rs.restaurant_id = rs.restaurant_id
                  AND rs.user_id = auth.uid()
                  AND rs.is_active = true
            )
        )
    );
$$;


ALTER FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_restaurant_staff"("r_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM restaurant_staff
        WHERE user_id = auth.uid()
        AND restaurant_id = r_id
    ) OR EXISTS (
        SELECT 1 FROM restaurants
        WHERE id = r_id
        AND owner_id = auth.uid()
    );
END;
$$;


ALTER FUNCTION "public"."is_restaurant_staff"("r_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_restaurant_secure"("p_name" "text", "p_phone" "text", "p_email" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text", "p_free_months" integer DEFAULT 0, "p_billing_name" "text" DEFAULT NULL::"text", "p_vat_number" "text" DEFAULT NULL::"text", "p_billing_address" "text" DEFAULT NULL::"text", "p_billing_city" "text" DEFAULT NULL::"text", "p_billing_cap" "text" DEFAULT NULL::"text", "p_billing_province" "text" DEFAULT NULL::"text", "p_codice_univoco" "text" DEFAULT NULL::"text", "p_registration_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    new_restaurant_id uuid;
    new_user_id uuid;
    result jsonb;
    v_is_active boolean;
    v_expires_at timestamp with time zone;
BEGIN
    -- Determine initial active state based on bonus
    v_is_active := p_free_months > 0;

    -- 1. Insert into users first to get the owner id
    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (p_email, p_username, p_username, p_password_hash, p_raw_password, 'OWNER')
    RETURNING id INTO new_user_id;

    -- 2. Insert into restaurants with all data including fiscal info
    INSERT INTO public.restaurants (
        name, phone, is_active, owner_id,
        billing_name, vat_number, billing_address, billing_city,
        billing_cap, billing_province, codice_univoco
    )
    VALUES (
        p_name, p_phone, v_is_active, new_user_id,
        p_billing_name, p_vat_number, p_billing_address, p_billing_city,
        p_billing_cap, p_billing_province, p_codice_univoco
    )
    RETURNING id INTO new_restaurant_id;

    -- 3. If they have free months, insert the bonus
    IF p_free_months > 0 THEN
        v_expires_at := CURRENT_TIMESTAMP + (p_free_months || ' months')::interval;

        INSERT INTO public.restaurant_bonuses (
            restaurant_id, free_months, reason, granted_by, granted_at, expires_at, is_active
        )
        VALUES (
            new_restaurant_id, p_free_months, 'Bonus registrazione (Link Invito)',
            NULL, CURRENT_TIMESTAMP, v_expires_at, true
        );
    END IF;

    -- 4. Segna il token come usato (se fornito)
    IF p_registration_token IS NOT NULL AND p_registration_token != '' THEN
        UPDATE public.registration_tokens
        SET used = true, used_by_restaurant_id = new_restaurant_id
        WHERE token = p_registration_token;
    END IF;

    -- 5. Prepare result
    result := jsonb_build_object(
        'restaurant_id', new_restaurant_id,
        'user_id', new_user_id
    );

    RETURN result;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Esiste già un utente o un ristorante con questi dati. Dettagli: %', SQLERRM;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Errore durante la registrazione: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."register_restaurant_secure"("p_name" "text", "p_phone" "text", "p_email" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text", "p_free_months" integer, "p_billing_name" "text", "p_vat_number" "text", "p_billing_address" "text", "p_billing_city" "text", "p_billing_cap" "text", "p_billing_province" "text", "p_codice_univoco" "text", "p_registration_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_to_full_menu"("p_restaurant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Authorization: check that the restaurant exists
    IF NOT EXISTS (
        SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id
    ) THEN
        RAISE EXCEPTION 'Restaurant % does not exist', p_restaurant_id;
    END IF;

    -- 1. Deactivate all custom menus
    UPDATE public.custom_menus
    SET is_active = false
    WHERE restaurant_id = p_restaurant_id;

    -- 2. Show ALL dishes
    UPDATE public.dishes
    SET is_active = true
    WHERE restaurant_id = p_restaurant_id;
END;
$$;


ALTER FUNCTION "public"."reset_to_full_menu"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_order_item_restaurant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NEW.restaurant_id IS NULL THEN
        SELECT restaurant_id INTO NEW.restaurant_id
        FROM public.orders
        WHERE id = NEW.order_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_order_item_restaurant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_session_pin_safe"("p_table_id" "uuid", "p_pin" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_session_id uuid;
    v_attempts integer;
BEGIN
    -- Pulizia tentativi vecchi (> 10 minuti)
    DELETE FROM public.pin_attempts
    WHERE table_id = p_table_id AND attempted_at < NOW() - INTERVAL '10 minutes';

    -- Rate limiting: max 5 tentativi per 10 minuti
    SELECT COUNT(*) INTO v_attempts
    FROM public.pin_attempts
    WHERE table_id = p_table_id
      AND attempted_at > NOW() - INTERVAL '10 minutes';

    IF v_attempts >= 5 THEN
        RAISE EXCEPTION 'Too many PIN attempts for table %. Wait 10 minutes.', p_table_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Log tentativo
    INSERT INTO public.pin_attempts (table_id) VALUES (p_table_id);

    -- Verifica PIN
    SELECT id INTO v_session_id
    FROM public.table_sessions
    WHERE table_id = p_table_id
      AND status = 'OPEN'
      AND TRIM(session_pin::text) = TRIM(p_pin);

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'PIN non valido per il tavolo'
            USING ERRCODE = 'P0001';
    END IF;

    -- PIN corretto: rimuovere i tentativi
    DELETE FROM public.pin_attempts WHERE table_id = p_table_id;

    RETURN v_session_id;
END;
$$;


ALTER FUNCTION "public"."verify_session_pin_safe"("p_table_id" "uuid", "p_pin" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archived_order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "course_number" integer DEFAULT 1,
    "restaurant_id" "uuid",
    "ready_at" timestamp with time zone,
    CONSTRAINT "chk_order_items_quantity" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'IN_PREPARATION'::"text", 'READY'::"text", 'SERVED'::"text"])))
);


ALTER TABLE "public"."archived_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archived_orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "table_session_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "total_amount" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'PAID'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."archived_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archived_table_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    "session_pin" "text",
    "customer_count" integer DEFAULT 1,
    "ayce_enabled" boolean DEFAULT false,
    "coperto_enabled" boolean DEFAULT false,
    CONSTRAINT "table_sessions_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'CLOSED'::"text"])))
);


ALTER TABLE "public"."archived_table_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "date_time" timestamp with time zone NOT NULL,
    "guests" integer NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'CONFIRMED'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "table_id" "uuid",
    CONSTRAINT "chk_bookings_guests" CHECK (("guests" > 0))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "course_number" integer DEFAULT 1,
    CONSTRAINT "chk_cart_items_quantity" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."cart_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_menu_dishes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "custom_menu_id" "uuid" NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."custom_menu_dishes" OWNER TO "postgres";


COMMENT ON TABLE "public"."custom_menu_dishes" IS 'Maps which dishes belong to each custom menu';



CREATE TABLE IF NOT EXISTS "public"."custom_menu_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "custom_menu_id" "uuid" NOT NULL,
    "day_of_week" integer,
    "meal_type" "text",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "custom_menu_schedules_meal_type_check" CHECK (("meal_type" = ANY (ARRAY['lunch'::"text", 'dinner'::"text", 'all'::"text"])))
);


ALTER TABLE "public"."custom_menu_schedules" OWNER TO "postgres";


COMMENT ON TABLE "public"."custom_menu_schedules" IS 'Defines when custom menus should be automatically applied';



CREATE TABLE IF NOT EXISTS "public"."custom_menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."custom_menus" OWNER TO "postgres";


COMMENT ON TABLE "public"."custom_menus" IS 'Stores custom menu templates for restaurants';



CREATE TABLE IF NOT EXISTS "public"."dishes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "vat_rate" numeric(5,2) DEFAULT 0,
    "category_id" "uuid",
    "restaurant_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "exclude_from_all_you_can_eat" boolean DEFAULT false,
    "is_ayce" boolean DEFAULT false,
    "allergens" "text"[] DEFAULT '{}'::"text"[],
    "is_available" boolean DEFAULT true,
    "short_code" "text",
    CONSTRAINT "chk_dishes_price" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."dishes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "course_number" integer DEFAULT 1,
    "restaurant_id" "uuid",
    "ready_at" timestamp with time zone,
    CONSTRAINT "chk_order_items_quantity" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'IN_PREPARATION'::"text", 'READY'::"text", 'SERVED'::"text", 'DELIVERED'::"text", 'PAID'::"text", 'CANCELLED'::"text", 'pending'::"text", 'preparing'::"text", 'ready'::"text", 'served'::"text", 'delivered'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "table_session_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "total_amount" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    "payment_method" "text",
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'PAID'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registration_token" "text" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "billing_name" "text",
    "vat_number" "text",
    "billing_address" "text",
    "billing_city" "text",
    "billing_cap" "text",
    "billing_province" "text",
    "codice_univoco" "text",
    "username" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "raw_password" "text",
    "completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '02:00:00'::interval)
);


ALTER TABLE "public"."pending_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pin_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_id" "uuid" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pin_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registration_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "free_months" integer DEFAULT 0,
    "used" boolean DEFAULT false,
    "used_by_restaurant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "discount_percent" integer DEFAULT 0,
    "discount_duration" "text" DEFAULT 'once'::"text",
    "stripe_coupon_id" "text"
);


ALTER TABLE "public"."registration_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_bonuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "free_months" integer DEFAULT 1 NOT NULL,
    "reason" "text",
    "granted_by" "text",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_bonuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_discounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "stripe_coupon_id" "text",
    "discount_percent" integer NOT NULL,
    "discount_duration" "text" NOT NULL,
    "discount_duration_months" integer,
    "reason" "text",
    "granted_by" "text",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "banner_dismissed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_discounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_staff" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "restaurant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "username" "text",
    "password" "text",
    CONSTRAINT "restaurant_staff_role_check" CHECK (("role" = ANY (ARRAY['OWNER'::"text", 'STAFF'::"text"])))
);


ALTER TABLE "public"."restaurant_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "owner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "phone" "text",
    "email" "text",
    "logo_url" "text",
    "is_active" boolean DEFAULT true,
    "all_you_can_eat" "jsonb" DEFAULT '{"enabled": false, "maxOrders": 3, "pricePerPerson": 25.00}'::"jsonb",
    "cover_charge_per_person" numeric(10,2) DEFAULT 0,
    "hours" "text",
    "waiter_mode_enabled" boolean DEFAULT false NOT NULL,
    "allow_waiter_payments" boolean DEFAULT false NOT NULL,
    "waiter_password" "text" DEFAULT 'waiter123'::"text",
    "enable_reservation_room_selection" boolean DEFAULT false,
    "enable_public_reservations" boolean DEFAULT true,
    "enable_course_splitting" boolean DEFAULT false,
    "view_only_menu_enabled" boolean DEFAULT false,
    "menu_style" "text" DEFAULT 'elegant'::"text",
    "menu_primary_color" "text" DEFAULT '#f59e0b'::"text",
    "weekly_service_hours" "jsonb",
    "weekly_ayce" "jsonb",
    "weekly_coperto" "jsonb",
    "show_cooking_times" boolean DEFAULT false,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "lunch_time_start" "text",
    "lunch_time_end" "text",
    "dinner_time_start" "text",
    "dinner_time_end" "text",
    "cover_image_url" "text",
    "ayce_price" numeric(10,2),
    "ayce_max_orders" integer DEFAULT 0,
    "reservation_duration" integer DEFAULT 120,
    "enable_stripe_payments" boolean DEFAULT false,
    "stripe_price_id" "text",
    "suspension_reason" "text",
    "vat_number" "text",
    "billing_name" "text",
    "stripe_connect_account_id" "text",
    "stripe_connect_enabled" boolean DEFAULT false,
    "subscription_status" "text",
    "billing_city" "text",
    "billing_address" "text",
    "billing_cap" "text",
    "billing_province" "text",
    "codice_univoco" "text",
    "subscription_cancel_at" timestamp with time zone
);


ALTER TABLE "public"."restaurants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "order" integer DEFAULT 0
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "stripe_payment_intent_id" "text",
    "stripe_invoice_id" "text",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'eur'::"text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."table_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    "session_pin" "text",
    "customer_count" integer DEFAULT 1,
    "ayce_enabled" boolean DEFAULT false,
    "coperto_enabled" boolean DEFAULT false,
    "receipt_issued" boolean DEFAULT false,
    "paid_amount" numeric(10,2) DEFAULT 0,
    "notes" "text" DEFAULT ''::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "table_sessions_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'CLOSED'::"text"])))
);


ALTER TABLE "public"."table_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "number" "text" NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "token" "text" DEFAULT ("extensions"."uuid_generate_v4"())::"text",
    "pin" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "status" "text" DEFAULT 'available'::"text",
    "seats" integer DEFAULT 4,
    "room_id" "uuid",
    "is_active" boolean DEFAULT true,
    "last_assistance_request" timestamp with time zone,
    CONSTRAINT "chk_tables_seats" CHECK (("seats" > 0))
);


ALTER TABLE "public"."tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "password_hash" "text",
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "username" "text",
    "raw_password" "text",
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['ADMIN'::"text", 'OWNER'::"text", 'STAFF'::"text", 'CUSTOMER'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."raw_password" IS 'Stores the unhashed password for Admin dashboard visibility. Only accessible to Admins/Superusers via RLS or service role.';



CREATE TABLE IF NOT EXISTS "public"."waiter_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "waiter_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."waiter_activity_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."archived_order_items"
    ADD CONSTRAINT "archived_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archived_orders"
    ADD CONSTRAINT "archived_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archived_table_sessions"
    ADD CONSTRAINT "archived_table_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_menu_dishes"
    ADD CONSTRAINT "custom_menu_dishes_custom_menu_id_dish_id_key" UNIQUE ("custom_menu_id", "dish_id");



ALTER TABLE ONLY "public"."custom_menu_dishes"
    ADD CONSTRAINT "custom_menu_dishes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_menu_schedules"
    ADD CONSTRAINT "custom_menu_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_menus"
    ADD CONSTRAINT "custom_menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dishes"
    ADD CONSTRAINT "dishes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_registrations"
    ADD CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pin_attempts"
    ADD CONSTRAINT "pin_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registration_tokens"
    ADD CONSTRAINT "registration_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registration_tokens"
    ADD CONSTRAINT "registration_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."restaurant_bonuses"
    ADD CONSTRAINT "restaurant_bonuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_discounts"
    ADD CONSTRAINT "restaurant_discounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_staff"
    ADD CONSTRAINT "restaurant_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."waiter_activity_logs"
    ADD CONSTRAINT "waiter_activity_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "archived_order_items_created_at_idx" ON "public"."archived_order_items" USING "btree" ("created_at");



CREATE INDEX "archived_order_items_dish_id_created_at_ready_at_idx" ON "public"."archived_order_items" USING "btree" ("dish_id", "created_at", "ready_at") WHERE ("ready_at" IS NOT NULL);



CREATE INDEX "archived_order_items_dish_id_idx" ON "public"."archived_order_items" USING "btree" ("dish_id");



CREATE INDEX "archived_order_items_order_id_idx" ON "public"."archived_order_items" USING "btree" ("order_id");



CREATE INDEX "archived_order_items_restaurant_id_status_idx" ON "public"."archived_order_items" USING "btree" ("restaurant_id", "status");



CREATE INDEX "archived_orders_restaurant_id_idx" ON "public"."archived_orders" USING "btree" ("restaurant_id");



CREATE INDEX "archived_orders_status_idx" ON "public"."archived_orders" USING "btree" ("status");



CREATE INDEX "archived_orders_table_session_id_idx" ON "public"."archived_orders" USING "btree" ("table_session_id");



CREATE INDEX "archived_table_sessions_restaurant_id_idx" ON "public"."archived_table_sessions" USING "btree" ("restaurant_id");



CREATE UNIQUE INDEX "archived_table_sessions_table_id_idx" ON "public"."archived_table_sessions" USING "btree" ("table_id") WHERE ("status" = 'OPEN'::"text");



CREATE INDEX "archived_table_sessions_table_id_status_idx" ON "public"."archived_table_sessions" USING "btree" ("table_id", "status");



CREATE INDEX "idx_bookings_restaurant_datetime" ON "public"."bookings" USING "btree" ("restaurant_id", "date_time");



CREATE INDEX "idx_bookings_restaurant_id" ON "public"."bookings" USING "btree" ("restaurant_id");



CREATE INDEX "idx_bookings_restaurant_status" ON "public"."bookings" USING "btree" ("restaurant_id", "status");



CREATE INDEX "idx_cart_items_dish_id" ON "public"."cart_items" USING "btree" ("dish_id");



CREATE INDEX "idx_cart_items_session_id" ON "public"."cart_items" USING "btree" ("session_id");



CREATE INDEX "idx_categories_restaurant_id" ON "public"."categories" USING "btree" ("restaurant_id");



CREATE INDEX "idx_custom_menu_dishes_dish" ON "public"."custom_menu_dishes" USING "btree" ("dish_id");



CREATE INDEX "idx_custom_menu_dishes_menu" ON "public"."custom_menu_dishes" USING "btree" ("custom_menu_id");



CREATE INDEX "idx_custom_menu_schedules_day" ON "public"."custom_menu_schedules" USING "btree" ("day_of_week");



CREATE INDEX "idx_custom_menu_schedules_menu" ON "public"."custom_menu_schedules" USING "btree" ("custom_menu_id");



CREATE INDEX "idx_custom_menus_restaurant" ON "public"."custom_menus" USING "btree" ("restaurant_id");



CREATE INDEX "idx_dishes_category_id" ON "public"."dishes" USING "btree" ("category_id");



CREATE INDEX "idx_dishes_restaurant_active" ON "public"."dishes" USING "btree" ("restaurant_id", "is_active");



CREATE INDEX "idx_dishes_restaurant_id" ON "public"."dishes" USING "btree" ("restaurant_id");



CREATE INDEX "idx_order_items_cooking_time" ON "public"."order_items" USING "btree" ("dish_id", "created_at", "ready_at") WHERE ("ready_at" IS NOT NULL);



CREATE INDEX "idx_order_items_created_at" ON "public"."order_items" USING "btree" ("created_at");



CREATE INDEX "idx_order_items_dish_id" ON "public"."order_items" USING "btree" ("dish_id");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_order_status" ON "public"."order_items" USING "btree" ("order_id", "status");



CREATE INDEX "idx_order_items_restaurant_status" ON "public"."order_items" USING "btree" ("restaurant_id", "status");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_payment_method" ON "public"."orders" USING "btree" ("payment_method");



CREATE INDEX "idx_orders_restaurant_id" ON "public"."orders" USING "btree" ("restaurant_id");



CREATE INDEX "idx_orders_restaurant_status" ON "public"."orders" USING "btree" ("restaurant_id", "status");



CREATE INDEX "idx_orders_restaurant_status_created" ON "public"."orders" USING "btree" ("restaurant_id", "status", "created_at");



CREATE INDEX "idx_orders_session_status" ON "public"."orders" USING "btree" ("table_session_id", "status");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_table_session_id" ON "public"."orders" USING "btree" ("table_session_id");



CREATE INDEX "idx_pin_attempts_lookup" ON "public"."pin_attempts" USING "btree" ("table_id", "attempted_at");



CREATE INDEX "idx_restaurant_bonuses_restaurant" ON "public"."restaurant_bonuses" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_discounts_restaurant" ON "public"."restaurant_discounts" USING "btree" ("restaurant_id");



CREATE INDEX "idx_restaurant_staff_restaurant_user" ON "public"."restaurant_staff" USING "btree" ("restaurant_id", "user_id");



CREATE INDEX "idx_restaurant_staff_user_active" ON "public"."restaurant_staff" USING "btree" ("user_id", "is_active");



CREATE INDEX "idx_restaurant_staff_username" ON "public"."restaurant_staff" USING "btree" ("username");



CREATE INDEX "idx_restaurants_owner_id" ON "public"."restaurants" USING "btree" ("owner_id");



CREATE INDEX "idx_restaurants_stripe_connect" ON "public"."restaurants" USING "btree" ("stripe_connect_account_id") WHERE ("stripe_connect_account_id" IS NOT NULL);



CREATE INDEX "idx_restaurants_subscription_status" ON "public"."restaurants" USING "btree" ("subscription_status") WHERE ("subscription_status" IS NOT NULL);



CREATE INDEX "idx_subscription_payments_restaurant" ON "public"."subscription_payments" USING "btree" ("restaurant_id");



CREATE INDEX "idx_subscription_payments_status" ON "public"."subscription_payments" USING "btree" ("status");



CREATE INDEX "idx_table_sessions_restaurant_id" ON "public"."table_sessions" USING "btree" ("restaurant_id");



CREATE INDEX "idx_table_sessions_restaurant_status" ON "public"."table_sessions" USING "btree" ("restaurant_id", "status");



CREATE INDEX "idx_table_sessions_table_status" ON "public"."table_sessions" USING "btree" ("table_id", "status");



CREATE INDEX "idx_tables_restaurant_id" ON "public"."tables" USING "btree" ("restaurant_id");



CREATE INDEX "idx_tables_room_id" ON "public"."tables" USING "btree" ("room_id") WHERE ("room_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_unique_open_session_per_table" ON "public"."table_sessions" USING "btree" ("table_id") WHERE ("status" = 'OPEN'::"text");



CREATE UNIQUE INDEX "idx_unique_table_number_per_restaurant" ON "public"."tables" USING "btree" ("restaurant_id", "number") WHERE ("is_active" = true);



CREATE INDEX "idx_waiter_logs_restaurant_created" ON "public"."waiter_activity_logs" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "set_order_item_restaurant_id_trigger" BEFORE INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_order_item_restaurant_id"();



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_menu_dishes"
    ADD CONSTRAINT "custom_menu_dishes_custom_menu_id_fkey" FOREIGN KEY ("custom_menu_id") REFERENCES "public"."custom_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_menu_dishes"
    ADD CONSTRAINT "custom_menu_dishes_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_menu_schedules"
    ADD CONSTRAINT "custom_menu_schedules_custom_menu_id_fkey" FOREIGN KEY ("custom_menu_id") REFERENCES "public"."custom_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_menus"
    ADD CONSTRAINT "custom_menus_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dishes"
    ADD CONSTRAINT "dishes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dishes"
    ADD CONSTRAINT "dishes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_table_session_id_fkey" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pin_attempts"
    ADD CONSTRAINT "pin_attempts_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registration_tokens"
    ADD CONSTRAINT "registration_tokens_used_by_restaurant_id_fkey" FOREIGN KEY ("used_by_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."restaurant_bonuses"
    ADD CONSTRAINT "restaurant_bonuses_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_discounts"
    ADD CONSTRAINT "restaurant_discounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_staff"
    ADD CONSTRAINT "restaurant_staff_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_staff"
    ADD CONSTRAINT "restaurant_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waiter_activity_logs"
    ADD CONSTRAINT "waiter_activity_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waiter_activity_logs"
    ADD CONSTRAINT "waiter_activity_logs_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "public"."restaurant_staff"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can insert app_config" ON "public"."app_config" FOR INSERT WITH CHECK (true);



CREATE POLICY "Admins can update app_config" ON "public"."app_config" FOR UPDATE USING (true);



CREATE POLICY "Allow all for restaurant_bonuses" ON "public"."restaurant_bonuses" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for subscription_payments" ON "public"."subscription_payments" USING (true) WITH CHECK (true);



CREATE POLICY "Anyone can read app_config" ON "public"."app_config" FOR SELECT USING (true);



CREATE POLICY "Anyone can read registration_tokens" ON "public"."registration_tokens" FOR SELECT USING (true);



CREATE POLICY "Anyone can update registration_tokens" ON "public"."registration_tokens" FOR UPDATE USING (true);



CREATE POLICY "Authenticated can insert registration_tokens" ON "public"."registration_tokens" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can create custom menus for their restaurant" ON "public"."custom_menus" FOR INSERT WITH CHECK (("restaurant_id" IN ( SELECT "restaurants"."id"
   FROM "public"."restaurants"
  WHERE ("restaurants"."id" = "custom_menus"."restaurant_id"))));



CREATE POLICY "Users can delete their restaurant's custom menus" ON "public"."custom_menus" FOR DELETE USING (("restaurant_id" IN ( SELECT "restaurants"."id"
   FROM "public"."restaurants"
  WHERE ("restaurants"."id" = "custom_menus"."restaurant_id"))));



CREATE POLICY "Users can manage their menu schedules" ON "public"."custom_menu_schedules" USING (("custom_menu_id" IN ( SELECT "custom_menus"."id"
   FROM "public"."custom_menus"
  WHERE ("custom_menus"."restaurant_id" IN ( SELECT "restaurants"."id"
           FROM "public"."restaurants"
          WHERE ("restaurants"."id" = "custom_menus"."restaurant_id"))))));



CREATE POLICY "Users can update their restaurant's custom menus" ON "public"."custom_menus" FOR UPDATE USING (("restaurant_id" IN ( SELECT "restaurants"."id"
   FROM "public"."restaurants"
  WHERE ("restaurants"."id" = "custom_menus"."restaurant_id"))));



CREATE POLICY "Users can view their menu schedules" ON "public"."custom_menu_schedules" FOR SELECT USING (("custom_menu_id" IN ( SELECT "custom_menus"."id"
   FROM "public"."custom_menus"
  WHERE ("custom_menus"."restaurant_id" IN ( SELECT "restaurants"."id"
           FROM "public"."restaurants"
          WHERE ("restaurants"."id" = "custom_menus"."restaurant_id"))))));



CREATE POLICY "Users can view their restaurant's custom menus" ON "public"."custom_menus" FOR SELECT USING (("restaurant_id" IN ( SELECT "restaurants"."id"
   FROM "public"."restaurants"
  WHERE ("restaurants"."id" = "custom_menus"."restaurant_id"))));



CREATE POLICY "activity_logs_insert_staff" ON "public"."waiter_activity_logs" FOR INSERT WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "activity_logs_select_staff" ON "public"."waiter_activity_logs" FOR SELECT USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "allow_all_discounts" ON "public"."restaurant_discounts" USING (true) WITH CHECK (true);



CREATE POLICY "anon insert pending_registrations" ON "public"."pending_registrations" FOR INSERT TO "anon" WITH CHECK (true);



ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated insert pending_registrations" ON "public"."pending_registrations" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_delete_staff" ON "public"."bookings" FOR DELETE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "bookings_insert_public" ON "public"."bookings" FOR INSERT WITH CHECK (true);



CREATE POLICY "bookings_manage" ON "public"."bookings" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "bookings_select" ON "public"."bookings" FOR SELECT USING (true);



CREATE POLICY "bookings_select_staff" ON "public"."bookings" FOR SELECT USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "bookings_update_staff" ON "public"."bookings" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."cart_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cart_items_delete_session" ON "public"."cart_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."table_sessions" "ts"
  WHERE (("ts"."id" = "cart_items"."session_id") AND ("ts"."status" = 'OPEN'::"text")))));



CREATE POLICY "cart_items_insert_session" ON "public"."cart_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."table_sessions" "ts"
  WHERE (("ts"."id" = "cart_items"."session_id") AND ("ts"."status" = 'OPEN'::"text")))));



CREATE POLICY "cart_items_manage" ON "public"."cart_items" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "cart_items_select" ON "public"."cart_items" FOR SELECT USING (true);



CREATE POLICY "cart_items_select_session" ON "public"."cart_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."table_sessions" "ts"
  WHERE (("ts"."id" = "cart_items"."session_id") AND ("ts"."status" = 'OPEN'::"text")))));



CREATE POLICY "cart_items_update_session" ON "public"."cart_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."table_sessions" "ts"
  WHERE (("ts"."id" = "cart_items"."session_id") AND ("ts"."status" = 'OPEN'::"text")))));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete_staff" ON "public"."categories" FOR DELETE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "categories_manage" ON "public"."categories" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "categories_modify_staff" ON "public"."categories" FOR INSERT WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "categories_select_public" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "categories_update_staff" ON "public"."categories" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."custom_menu_dishes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_menu_dishes_delete_staff" ON "public"."custom_menu_dishes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."custom_menus" "cm"
  WHERE (("cm"."id" = "custom_menu_dishes"."custom_menu_id") AND "public"."is_restaurant_member"("cm"."restaurant_id")))));



CREATE POLICY "custom_menu_dishes_modify_staff" ON "public"."custom_menu_dishes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."custom_menus" "cm"
  WHERE (("cm"."id" = "custom_menu_dishes"."custom_menu_id") AND "public"."is_restaurant_member"("cm"."restaurant_id")))));



CREATE POLICY "custom_menu_dishes_select" ON "public"."custom_menu_dishes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."custom_menus" "cm"
  WHERE (("cm"."id" = "custom_menu_dishes"."custom_menu_id") AND ("public"."is_restaurant_member"("cm"."restaurant_id") OR ("cm"."is_active" = true))))));



CREATE POLICY "custom_menu_dishes_update_staff" ON "public"."custom_menu_dishes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."custom_menus" "cm"
  WHERE (("cm"."id" = "custom_menu_dishes"."custom_menu_id") AND "public"."is_restaurant_member"("cm"."restaurant_id")))));



ALTER TABLE "public"."custom_menu_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_menus" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_menus_delete_staff" ON "public"."custom_menus" FOR DELETE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "custom_menus_modify_staff" ON "public"."custom_menus" FOR INSERT WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "custom_menus_select_staff" ON "public"."custom_menus" FOR SELECT USING (("public"."is_restaurant_member"("restaurant_id") OR ("is_active" = true)));



CREATE POLICY "custom_menus_update_staff" ON "public"."custom_menus" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."dishes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dishes_delete_staff" ON "public"."dishes" FOR DELETE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "dishes_manage" ON "public"."dishes" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "dishes_modify_staff" ON "public"."dishes" FOR INSERT WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "dishes_select_public" ON "public"."dishes" FOR SELECT USING (("is_active" = true));



CREATE POLICY "dishes_select_staff" ON "public"."dishes" FOR SELECT USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "dishes_update_staff" ON "public"."dishes" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "order-items-anon-insert" ON "public"."order_items" FOR INSERT TO "anon" WITH CHECK ((("order_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."table_sessions" "ts" ON (("ts"."id" = "o"."table_session_id")))
  WHERE (("o"."id" = "order_items"."order_id") AND ("ts"."status" = 'OPEN'::"text"))))));



CREATE POLICY "order-items-staff-rw" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."restaurants" "r" ON (("r"."id" = "o"."restaurant_id")))
  WHERE (("o"."id" = "order_items"."order_id") AND (("r"."owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."restaurant_staff" "rs"
          WHERE (("rs"."restaurant_id" = "o"."restaurant_id") AND ("rs"."user_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_cancel_customer" ON "public"."order_items" FOR UPDATE USING ((("status" = 'PENDING'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."table_sessions" "ts" ON (("ts"."id" = "o"."table_session_id")))
  WHERE (("o"."id" = "order_items"."order_id") AND ("ts"."status" = 'OPEN'::"text"))))));



CREATE POLICY "order_items_insert" ON "public"."order_items" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "order_items_insert_customer" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."table_sessions" "ts" ON (("ts"."id" = "o"."table_session_id")))
  WHERE (("o"."id" = "order_items"."order_id") AND ("ts"."status" = 'OPEN'::"text")))));



CREATE POLICY "order_items_select" ON "public"."order_items" FOR SELECT USING (true);



CREATE POLICY "order_items_select_customer" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."table_sessions" "ts" ON (("ts"."id" = "o"."table_session_id")))
  WHERE (("o"."id" = "order_items"."order_id") AND ("ts"."status" = 'OPEN'::"text")))));



CREATE POLICY "order_items_select_staff" ON "public"."order_items" FOR SELECT USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "order_items_update" ON "public"."order_items" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "order_items_update_staff" ON "public"."order_items" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders-anon-insert" ON "public"."orders" FOR INSERT TO "anon" WITH CHECK ((("table_session_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."table_sessions" "ts"
     JOIN "public"."tables" "t" ON (("t"."id" = "ts"."table_id")))
  WHERE (("ts"."id" = "orders"."table_session_id") AND ("ts"."status" = 'OPEN'::"text"))))));



CREATE POLICY "orders_cancel_customer" ON "public"."orders" FOR UPDATE USING ((("status" = 'OPEN'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."table_sessions" "ts"
  WHERE (("ts"."id" = "orders"."table_session_id") AND ("ts"."status" = 'OPEN'::"text"))))));



CREATE POLICY "orders_delete" ON "public"."orders" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "orders_insert" ON "public"."orders" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "orders_insert_customer" ON "public"."orders" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."table_sessions" "ts"
  WHERE (("ts"."id" = "orders"."table_session_id") AND ("ts"."status" = 'OPEN'::"text")))));



CREATE POLICY "orders_select" ON "public"."orders" FOR SELECT USING (true);



CREATE POLICY "orders_select_customer" ON "public"."orders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."table_sessions" "ts"
  WHERE (("ts"."id" = "orders"."table_session_id") AND ("ts"."status" = 'OPEN'::"text")))));



CREATE POLICY "orders_select_staff" ON "public"."orders" FOR SELECT USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "orders_update" ON "public"."orders" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "orders_update_staff" ON "public"."orders" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."pending_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pin_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pin_attempts_no_direct_access" ON "public"."pin_attempts" USING (false);



ALTER TABLE "public"."registration_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_bonuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_discounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restaurants_all_authenticated" ON "public"."restaurants" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "restaurants_delete_admin" ON "public"."restaurants" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "restaurants_delete_anon" ON "public"."restaurants" FOR DELETE TO "anon" USING (true);



CREATE POLICY "restaurants_insert_admin" ON "public"."restaurants" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "restaurants_insert_anon" ON "public"."restaurants" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "restaurants_select_anon_all" ON "public"."restaurants" FOR SELECT TO "anon" USING (true);



CREATE POLICY "restaurants_select_member" ON "public"."restaurants" FOR SELECT USING (("public"."is_restaurant_member"("id") OR "public"."is_admin"()));



CREATE POLICY "restaurants_select_public" ON "public"."restaurants" FOR SELECT USING (("is_active" = true));



CREATE POLICY "restaurants_update_anon" ON "public"."restaurants" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "restaurants_update_owner" ON "public"."restaurants" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rooms_delete_staff" ON "public"."rooms" FOR DELETE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "rooms_manage" ON "public"."rooms" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "rooms_modify_staff" ON "public"."rooms" FOR INSERT WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "rooms_select_public" ON "public"."rooms" FOR SELECT USING (("is_active" = true));



CREATE POLICY "rooms_select_staff" ON "public"."rooms" FOR SELECT USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "rooms_update_staff" ON "public"."rooms" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "service_role all pending_registrations" ON "public"."pending_registrations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "sessions_insert_rpc" ON "public"."table_sessions" FOR INSERT WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "sessions_manage" ON "public"."table_sessions" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "sessions_select_open" ON "public"."table_sessions" FOR SELECT USING (("status" = 'OPEN'::"text"));



CREATE POLICY "sessions_select_public" ON "public"."table_sessions" FOR SELECT USING (true);



CREATE POLICY "sessions_select_staff" ON "public"."table_sessions" FOR SELECT USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "sessions_update_staff" ON "public"."table_sessions" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "staff_delete_owner" ON "public"."restaurant_staff" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."restaurants" "r"
  WHERE (("r"."id" = "restaurant_staff"."restaurant_id") AND ("r"."owner_id" = "auth"."uid"())))) OR "public"."is_admin"()));



CREATE POLICY "staff_insert_owner" ON "public"."restaurant_staff" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."restaurants" "r"
  WHERE (("r"."id" = "restaurant_staff"."restaurant_id") AND ("r"."owner_id" = "auth"."uid"())))) OR "public"."is_admin"()));



CREATE POLICY "staff_manage" ON "public"."restaurant_staff" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "staff_select" ON "public"."restaurant_staff" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "staff_select_owner" ON "public"."restaurant_staff" FOR SELECT USING (("public"."is_restaurant_member"("restaurant_id") OR ("user_id" = "auth"."uid"())));



CREATE POLICY "staff_update_owner" ON "public"."restaurant_staff" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."restaurants" "r"
  WHERE (("r"."id" = "restaurant_staff"."restaurant_id") AND ("r"."owner_id" = "auth"."uid"())))) OR "public"."is_admin"()));



ALTER TABLE "public"."subscription_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."table_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tables_delete_staff" ON "public"."tables" FOR DELETE USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "tables_manage" ON "public"."tables" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "tables_modify_staff" ON "public"."tables" FOR INSERT WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "tables_select_public" ON "public"."tables" FOR SELECT USING (("is_active" = true));



CREATE POLICY "tables_select_staff" ON "public"."tables" FOR SELECT USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "tables_update_staff" ON "public"."tables" FOR UPDATE USING ("public"."is_restaurant_member"("restaurant_id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_delete_admin" ON "public"."users" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "users_insert_admin" ON "public"."users" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "users_manage" ON "public"."users" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "users_select" ON "public"."users" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "users_select_self" ON "public"."users" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "users_update_self" ON "public"."users" FOR UPDATE USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."waiter_activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waiter_logs_manage" ON "public"."waiter_activity_logs" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "waiter_logs_select" ON "public"."waiter_activity_logs" FOR SELECT TO "authenticated", "anon" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cart_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."restaurant_bonuses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."restaurants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."subscription_payments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."table_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tables";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_to_cart"("p_session_id" "uuid", "p_dish_id" "uuid", "p_quantity" integer, "p_notes" "text", "p_course_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."add_to_cart"("p_session_id" "uuid", "p_dish_id" "uuid", "p_quantity" integer, "p_notes" "text", "p_course_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_to_cart"("p_session_id" "uuid", "p_dish_id" "uuid", "p_quantity" integer, "p_notes" "text", "p_course_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_restaurant"("p_restaurant_id" "uuid", "p_updates" "jsonb", "p_admin_username" "text", "p_admin_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_restaurant"("p_restaurant_id" "uuid", "p_updates" "jsonb", "p_admin_username" "text", "p_admin_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_restaurant"("p_restaurant_id" "uuid", "p_updates" "jsonb", "p_admin_username" "text", "p_admin_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_custom_menu"("p_restaurant_id" "uuid", "p_menu_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_custom_menu"("p_restaurant_id" "uuid", "p_menu_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_custom_menu"("p_restaurant_id" "uuid", "p_menu_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_old_sessions"("days_old" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."archive_old_sessions"("days_old" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_old_sessions"("days_old" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_pending_registration"("p_pending_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_pending_registration"("p_pending_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_pending_registration"("p_pending_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_average_cooking_time"("p_dish_id" "uuid", "p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_average_cooking_time"("p_dish_id" "uuid", "p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_average_cooking_time"("p_dish_id" "uuid", "p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dish_avg_cooking_times"("p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dish_avg_cooking_times"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dish_avg_cooking_times"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_table_session"("p_table_id" "uuid", "p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_table_session"("p_table_id" "uuid", "p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_table_session"("p_table_id" "uuid", "p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_restaurant_for_login"("p_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_restaurant_for_login"("p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_restaurant_for_login"("p_owner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_table_sizes"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_table_sizes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_table_sizes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_pending_registration"("p_registration_token" "text", "p_name" "text", "p_phone" "text", "p_email" "text", "p_billing_name" "text", "p_vat_number" "text", "p_billing_address" "text", "p_billing_city" "text", "p_billing_cap" "text", "p_billing_province" "text", "p_codice_univoco" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_pending_registration"("p_registration_token" "text", "p_name" "text", "p_phone" "text", "p_email" "text", "p_billing_name" "text", "p_vat_number" "text", "p_billing_address" "text", "p_billing_city" "text", "p_billing_cap" "text", "p_billing_province" "text", "p_codice_univoco" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_pending_registration"("p_registration_token" "text", "p_name" "text", "p_phone" "text", "p_email" "text", "p_billing_name" "text", "p_vat_number" "text", "p_billing_address" "text", "p_billing_city" "text", "p_billing_cap" "text", "p_billing_province" "text", "p_codice_univoco" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_restaurant_staff"("r_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_restaurant_staff"("r_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_staff"("r_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."register_restaurant_secure"("p_name" "text", "p_phone" "text", "p_email" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text", "p_free_months" integer, "p_billing_name" "text", "p_vat_number" "text", "p_billing_address" "text", "p_billing_city" "text", "p_billing_cap" "text", "p_billing_province" "text", "p_codice_univoco" "text", "p_registration_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_restaurant_secure"("p_name" "text", "p_phone" "text", "p_email" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text", "p_free_months" integer, "p_billing_name" "text", "p_vat_number" "text", "p_billing_address" "text", "p_billing_city" "text", "p_billing_cap" "text", "p_billing_province" "text", "p_codice_univoco" "text", "p_registration_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_restaurant_secure"("p_name" "text", "p_phone" "text", "p_email" "text", "p_username" "text", "p_password_hash" "text", "p_raw_password" "text", "p_free_months" integer, "p_billing_name" "text", "p_vat_number" "text", "p_billing_address" "text", "p_billing_city" "text", "p_billing_cap" "text", "p_billing_province" "text", "p_codice_univoco" "text", "p_registration_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_to_full_menu"("p_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_to_full_menu"("p_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_to_full_menu"("p_restaurant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_order_item_restaurant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_order_item_restaurant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_order_item_restaurant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_session_pin_safe"("p_table_id" "uuid", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_session_pin_safe"("p_table_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_session_pin_safe"("p_table_id" "uuid", "p_pin" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."archived_order_items" TO "anon";
GRANT ALL ON TABLE "public"."archived_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."archived_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."archived_orders" TO "anon";
GRANT ALL ON TABLE "public"."archived_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."archived_orders" TO "service_role";



GRANT ALL ON TABLE "public"."archived_table_sessions" TO "anon";
GRANT ALL ON TABLE "public"."archived_table_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."archived_table_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."cart_items" TO "anon";
GRANT ALL ON TABLE "public"."cart_items" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_items" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."custom_menu_dishes" TO "anon";
GRANT ALL ON TABLE "public"."custom_menu_dishes" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_menu_dishes" TO "service_role";



GRANT ALL ON TABLE "public"."custom_menu_schedules" TO "anon";
GRANT ALL ON TABLE "public"."custom_menu_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_menu_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."custom_menus" TO "anon";
GRANT ALL ON TABLE "public"."custom_menus" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_menus" TO "service_role";



GRANT ALL ON TABLE "public"."dishes" TO "anon";
GRANT ALL ON TABLE "public"."dishes" TO "authenticated";
GRANT ALL ON TABLE "public"."dishes" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."pending_registrations" TO "anon";
GRANT ALL ON TABLE "public"."pending_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."pin_attempts" TO "anon";
GRANT ALL ON TABLE "public"."pin_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."pin_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."registration_tokens" TO "anon";
GRANT ALL ON TABLE "public"."registration_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."registration_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_bonuses" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_bonuses" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_bonuses" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_discounts" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_discounts" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_staff" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_staff" TO "service_role";



GRANT ALL ON TABLE "public"."restaurants" TO "anon";
GRANT ALL ON TABLE "public"."restaurants" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurants" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_payments" TO "anon";
GRANT ALL ON TABLE "public"."subscription_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_payments" TO "service_role";



GRANT ALL ON TABLE "public"."table_sessions" TO "anon";
GRANT ALL ON TABLE "public"."table_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."table_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."waiter_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."waiter_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."waiter_activity_logs" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

drop policy "bookings_manage" on "public"."bookings";

drop policy "cart_items_manage" on "public"."cart_items";

drop policy "categories_manage" on "public"."categories";

drop policy "dishes_manage" on "public"."dishes";

drop policy "order_items_insert" on "public"."order_items";

drop policy "order_items_update" on "public"."order_items";

drop policy "orders_delete" on "public"."orders";

drop policy "orders_insert" on "public"."orders";

drop policy "orders_update" on "public"."orders";

drop policy "staff_manage" on "public"."restaurant_staff";

drop policy "staff_select" on "public"."restaurant_staff";

drop policy "rooms_manage" on "public"."rooms";

drop policy "sessions_manage" on "public"."table_sessions";

drop policy "tables_manage" on "public"."tables";

drop policy "users_manage" on "public"."users";

drop policy "users_select" on "public"."users";

drop policy "waiter_logs_manage" on "public"."waiter_activity_logs";

drop policy "waiter_logs_select" on "public"."waiter_activity_logs";


  create policy "bookings_manage"
  on "public"."bookings"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "cart_items_manage"
  on "public"."cart_items"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "categories_manage"
  on "public"."categories"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "dishes_manage"
  on "public"."dishes"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "order_items_insert"
  on "public"."order_items"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "order_items_update"
  on "public"."order_items"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



  create policy "orders_delete"
  on "public"."orders"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "orders_insert"
  on "public"."orders"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "orders_update"
  on "public"."orders"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



  create policy "staff_manage"
  on "public"."restaurant_staff"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "staff_select"
  on "public"."restaurant_staff"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "rooms_manage"
  on "public"."rooms"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "sessions_manage"
  on "public"."table_sessions"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "tables_manage"
  on "public"."tables"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "users_manage"
  on "public"."users"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "users_select"
  on "public"."users"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "waiter_logs_manage"
  on "public"."waiter_activity_logs"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "waiter_logs_select"
  on "public"."waiter_activity_logs"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Allow anon uploads to dishes"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'dishes'::text));



  create policy "Authenticated Delete Dishes"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'dishes'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated Update Dishes"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'dishes'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated Upload Dishes"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'dishes'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated Upload"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'logos'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Public Access Dishes"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'dishes'::text));



  create policy "Public Access"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'logos'::text));



