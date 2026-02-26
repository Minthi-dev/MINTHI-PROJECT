--
-- PostgreSQL database dump
--

\restrict cgxQ1yoLOZ0Io622fe56P0GMAjT7YodliCvmvfSEOx7qiEG9aeLQwfk5STWJOUZ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: apply_custom_menu(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_custom_menu(menu_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    restaurant_uuid UUID;
BEGIN
    -- Get restaurant_id from the menu
    SELECT restaurant_id INTO restaurant_uuid FROM custom_menus WHERE id = menu_id;

    -- Deactivate all dishes for this restaurant
    UPDATE dishes SET is_active = false WHERE restaurant_id = restaurant_uuid;

    -- Activate only the dishes in this custom menu
    UPDATE dishes
    SET is_active = true
    WHERE id IN (
        SELECT dish_id FROM custom_menu_dishes WHERE custom_menu_id = menu_id
    );

    -- Mark this menu as active, deactivate others
    UPDATE custom_menus SET is_active = false WHERE restaurant_id = restaurant_uuid;
    UPDATE custom_menus SET is_active = true WHERE id = menu_id;
END;
$$;


--
-- Name: FUNCTION apply_custom_menu(menu_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_custom_menu(menu_id uuid) IS 'Activates a custom menu by enabling only its dishes';


--
-- Name: apply_custom_menu(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_custom_menu(p_restaurant_id uuid, p_menu_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  -- 1. Deactivate all other menus for this restaurant
  update public.custom_menus
  set is_active = false
  where restaurant_id = p_restaurant_id;

  -- 2. Activate the selected menu
  update public.custom_menus
  set is_active = true
  where id = p_menu_id;

  -- 3. Update Dishes Visibility
  -- First, hide ALL dishes for this restaurant
  update public.dishes
  set is_active = false
  where restaurant_id = p_restaurant_id;

  -- Then, show only dishes in the custom menu
  update public.dishes
  set is_active = true
  where id in (
    select dish_id 
    from public.custom_menu_dishes 
    where custom_menu_id = p_menu_id
  );
end;
$$;


--
-- Name: get_average_cooking_time(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_average_cooking_time(p_dish_id bigint, p_restaurant_id bigint) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  avg_minutes INTEGER;
  order_count INTEGER;
BEGIN
  -- Count orders from last 2 months for this dish
  SELECT COUNT(*) INTO order_count
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.dish_id = p_dish_id
  AND o.restaurant_id = p_restaurant_id
  AND oi.ready_at IS NOT NULL
  AND oi.created_at >= NOW() - INTERVAL '2 months';

  -- If less than 3 orders, return null
  IF order_count < 3 THEN
    RETURN NULL;
  END IF;

  -- Calculate average cooking time in minutes
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (oi.ready_at - oi.created_at)) / 60))::INTEGER
  INTO avg_minutes
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.dish_id = p_dish_id
  AND o.restaurant_id = p_restaurant_id
  AND oi.ready_at IS NOT NULL
  AND oi.created_at >= NOW() - INTERVAL '2 months';

  RETURN COALESCE(avg_minutes, NULL);
END;
$$;


--
-- Name: get_dish_avg_cooking_times(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dish_avg_cooking_times(p_restaurant_id uuid) RETURNS TABLE(dish_id uuid, avg_minutes numeric)
    LANGUAGE sql STABLE
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


--
-- Name: get_or_create_table_session(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_table_session(p_table_id uuid, p_restaurant_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: is_restaurant_staff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_restaurant_staff(r_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: reset_to_full_menu(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_to_full_menu(p_restaurant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  -- 1. Deactivate all custom menus
  update public.custom_menus
  set is_active = false
  where restaurant_id = p_restaurant_id;

  -- 2. Show ALL dishes
  update public.dishes
  set is_active = true
  where restaurant_id = p_restaurant_id;
end;
$$;


--
-- Name: set_order_item_restaurant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_order_item_restaurant_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    restaurant_id uuid,
    name text NOT NULL,
    email text,
    phone text,
    date_time timestamp with time zone NOT NULL,
    guests integer NOT NULL,
    notes text,
    status text DEFAULT 'CONFIRMED'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    table_id uuid
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    dish_id uuid,
    quantity integer DEFAULT 1,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    course_number integer DEFAULT 1
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    restaurant_id uuid,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: custom_menu_dishes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_menu_dishes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    custom_menu_id uuid NOT NULL,
    dish_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE custom_menu_dishes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.custom_menu_dishes IS 'Maps which dishes belong to each custom menu';


--
-- Name: custom_menu_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_menu_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    custom_menu_id uuid NOT NULL,
    day_of_week integer,
    meal_type text,
    start_time time without time zone,
    end_time time without time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT custom_menu_schedules_meal_type_check CHECK ((meal_type = ANY (ARRAY['lunch'::text, 'dinner'::text, 'all'::text])))
);


--
-- Name: TABLE custom_menu_schedules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.custom_menu_schedules IS 'Defines when custom menus should be automatically applied';


--
-- Name: custom_menus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE custom_menus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.custom_menus IS 'Stores custom menu templates for restaurants';


--
-- Name: dishes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dishes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    vat_rate numeric(5,2) DEFAULT 0,
    category_id uuid,
    restaurant_id uuid,
    is_active boolean DEFAULT true,
    image_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    exclude_from_all_you_can_eat boolean DEFAULT false,
    is_ayce boolean DEFAULT false,
    allergens text[] DEFAULT '{}'::text[]
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    order_id uuid,
    dish_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    note text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    course_number integer DEFAULT 1,
    restaurant_id uuid,
    ready_at timestamp with time zone,
    CONSTRAINT order_items_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PREPARATION'::text, 'READY'::text, 'SERVED'::text])))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    restaurant_id uuid,
    table_session_id uuid,
    status text DEFAULT 'OPEN'::text NOT NULL,
    total_amount numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at timestamp with time zone,
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'PAID'::text, 'CANCELLED'::text])))
);


--
-- Name: restaurant_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurant_staff (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    restaurant_id uuid,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    username text,
    password text,
    CONSTRAINT restaurant_staff_role_check CHECK ((role = ANY (ARRAY['OWNER'::text, 'STAFF'::text])))
);


--
-- Name: restaurants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    address text,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    phone text,
    email text,
    logo_url text,
    is_active boolean DEFAULT true,
    all_you_can_eat jsonb DEFAULT '{"enabled": false, "maxOrders": 3, "pricePerPerson": 25.00}'::jsonb,
    cover_charge_per_person numeric(10,2) DEFAULT 0,
    hours text,
    waiter_mode_enabled boolean DEFAULT false NOT NULL,
    allow_waiter_payments boolean DEFAULT false NOT NULL,
    waiter_password text DEFAULT 'waiter123'::text,
    enable_reservation_room_selection boolean DEFAULT false,
    enable_public_reservations boolean DEFAULT true,
    enable_course_splitting boolean DEFAULT false,
    view_only_menu_enabled boolean DEFAULT false,
    menu_style text DEFAULT 'elegant'::text,
    menu_primary_color text DEFAULT '#f59e0b'::text,
    weekly_service_hours jsonb,
    weekly_ayce jsonb,
    weekly_coperto jsonb,
    show_cooking_times boolean DEFAULT false
);


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    "order" integer DEFAULT 0
);


--
-- Name: table_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    restaurant_id uuid,
    table_id uuid,
    status text DEFAULT 'OPEN'::text NOT NULL,
    opened_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at timestamp with time zone,
    session_pin text,
    customer_count integer DEFAULT 1,
    ayce_enabled boolean DEFAULT false,
    coperto_enabled boolean DEFAULT false,
    CONSTRAINT table_sessions_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text])))
);


--
-- Name: tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tables (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    number text NOT NULL,
    restaurant_id uuid,
    token text DEFAULT (extensions.uuid_generate_v4())::text,
    pin text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status text DEFAULT 'available'::text,
    seats integer DEFAULT 4,
    room_id uuid,
    is_active boolean DEFAULT true,
    last_assistance_request timestamp with time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    name text,
    password_hash text,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    username text,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'OWNER'::text, 'STAFF'::text, 'CUSTOMER'::text])))
);


--
-- Name: waiter_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waiter_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    waiter_id uuid NOT NULL,
    action_type text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: custom_menu_dishes custom_menu_dishes_custom_menu_id_dish_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_menu_dishes
    ADD CONSTRAINT custom_menu_dishes_custom_menu_id_dish_id_key UNIQUE (custom_menu_id, dish_id);


--
-- Name: custom_menu_dishes custom_menu_dishes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_menu_dishes
    ADD CONSTRAINT custom_menu_dishes_pkey PRIMARY KEY (id);


--
-- Name: custom_menu_schedules custom_menu_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_menu_schedules
    ADD CONSTRAINT custom_menu_schedules_pkey PRIMARY KEY (id);


--
-- Name: custom_menus custom_menus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_menus
    ADD CONSTRAINT custom_menus_pkey PRIMARY KEY (id);


--
-- Name: dishes dishes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dishes
    ADD CONSTRAINT dishes_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: restaurant_staff restaurant_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_staff
    ADD CONSTRAINT restaurant_staff_pkey PRIMARY KEY (id);


--
-- Name: restaurants restaurants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: table_sessions table_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT table_sessions_pkey PRIMARY KEY (id);


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_pkey PRIMARY KEY (id);


--
-- Name: tables tables_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_token_key UNIQUE (token);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: waiter_activity_logs waiter_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_activity_logs
    ADD CONSTRAINT waiter_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_bookings_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_restaurant_id ON public.bookings USING btree (restaurant_id);


--
-- Name: idx_categories_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_restaurant_id ON public.categories USING btree (restaurant_id);


--
-- Name: idx_custom_menu_dishes_dish; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_menu_dishes_dish ON public.custom_menu_dishes USING btree (dish_id);


--
-- Name: idx_custom_menu_dishes_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_menu_dishes_menu ON public.custom_menu_dishes USING btree (custom_menu_id);


--
-- Name: idx_custom_menu_schedules_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_menu_schedules_day ON public.custom_menu_schedules USING btree (day_of_week);


--
-- Name: idx_custom_menu_schedules_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_menu_schedules_menu ON public.custom_menu_schedules USING btree (custom_menu_id);


--
-- Name: idx_custom_menus_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_menus_restaurant ON public.custom_menus USING btree (restaurant_id);


--
-- Name: idx_dishes_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dishes_restaurant_id ON public.dishes USING btree (restaurant_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_restaurant_id ON public.orders USING btree (restaurant_id);


--
-- Name: idx_table_sessions_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_sessions_restaurant_id ON public.table_sessions USING btree (restaurant_id);


--
-- Name: idx_tables_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_restaurant_id ON public.tables USING btree (restaurant_id);


--
-- Name: order_items set_order_item_restaurant_id_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_order_item_restaurant_id_trigger BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.set_order_item_restaurant_id();


--
-- Name: bookings bookings_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id);


--
-- Name: cart_items cart_items_dish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_dish_id_fkey FOREIGN KEY (dish_id) REFERENCES public.dishes(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.table_sessions(id) ON DELETE CASCADE;


--
-- Name: categories categories_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: custom_menu_dishes custom_menu_dishes_custom_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_menu_dishes
    ADD CONSTRAINT custom_menu_dishes_custom_menu_id_fkey FOREIGN KEY (custom_menu_id) REFERENCES public.custom_menus(id) ON DELETE CASCADE;


--
-- Name: custom_menu_dishes custom_menu_dishes_dish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_menu_dishes
    ADD CONSTRAINT custom_menu_dishes_dish_id_fkey FOREIGN KEY (dish_id) REFERENCES public.dishes(id) ON DELETE CASCADE;


--
-- Name: custom_menu_schedules custom_menu_schedules_custom_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_menu_schedules
    ADD CONSTRAINT custom_menu_schedules_custom_menu_id_fkey FOREIGN KEY (custom_menu_id) REFERENCES public.custom_menus(id) ON DELETE CASCADE;


--
-- Name: custom_menus custom_menus_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_menus
    ADD CONSTRAINT custom_menus_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: dishes dishes_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dishes
    ADD CONSTRAINT dishes_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: dishes dishes_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dishes
    ADD CONSTRAINT dishes_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_dish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_dish_id_fkey FOREIGN KEY (dish_id) REFERENCES public.dishes(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id);


--
-- Name: orders orders_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: orders orders_table_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_table_session_id_fkey FOREIGN KEY (table_session_id) REFERENCES public.table_sessions(id) ON DELETE CASCADE;


--
-- Name: restaurant_staff restaurant_staff_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_staff
    ADD CONSTRAINT restaurant_staff_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: restaurant_staff restaurant_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_staff
    ADD CONSTRAINT restaurant_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: restaurants restaurants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: rooms rooms_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: table_sessions table_sessions_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT table_sessions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: table_sessions table_sessions_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT table_sessions_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: tables tables_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: tables tables_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;


--
-- Name: waiter_activity_logs waiter_activity_logs_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_activity_logs
    ADD CONSTRAINT waiter_activity_logs_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: waiter_activity_logs waiter_activity_logs_waiter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_activity_logs
    ADD CONSTRAINT waiter_activity_logs_waiter_id_fkey FOREIGN KEY (waiter_id) REFERENCES public.restaurant_staff(id) ON DELETE CASCADE;


--
-- Name: bookings Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.bookings TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: cart_items Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.cart_items TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: categories Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.categories TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: custom_menus Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.custom_menus TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: dishes Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.dishes TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: order_items Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.order_items TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: orders Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.orders TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: restaurant_staff Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.restaurant_staff TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: restaurants Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.restaurants TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: rooms Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.rooms TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: table_sessions Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.table_sessions TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: tables Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.tables TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: users Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.users TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: rooms Enable all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all for authenticated users" ON public.rooms USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: restaurant_staff Enable delete access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete access for all users" ON public.restaurant_staff FOR DELETE USING (true);


--
-- Name: waiter_activity_logs Enable delete access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete access for all users" ON public.waiter_activity_logs FOR DELETE USING (true);


--
-- Name: restaurant_staff Enable insert access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert access for all users" ON public.restaurant_staff FOR INSERT WITH CHECK (true);


--
-- Name: waiter_activity_logs Enable insert access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert access for all users" ON public.waiter_activity_logs FOR INSERT WITH CHECK (true);


--
-- Name: order_items Enable insert for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users" ON public.order_items FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) OR (auth.role() = 'anon'::text)));


--
-- Name: orders Enable insert for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users" ON public.orders FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) OR (auth.role() = 'anon'::text)));


--
-- Name: orders Enable insert for customers with valid session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for customers with valid session" ON public.orders FOR INSERT WITH CHECK ((table_session_id IS NOT NULL));


--
-- Name: restaurant_staff Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.restaurant_staff FOR SELECT USING (true);


--
-- Name: waiter_activity_logs Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.waiter_activity_logs FOR SELECT USING (true);


--
-- Name: order_items Enable select for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable select for all users" ON public.order_items FOR SELECT USING (true);


--
-- Name: orders Enable select for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable select for all users" ON public.orders FOR SELECT USING (true);


--
-- Name: order_items Enable select for restaurant staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable select for restaurant staff" ON public.order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.orders
     JOIN public.restaurant_staff ON ((restaurant_staff.restaurant_id = orders.restaurant_id)))
  WHERE ((orders.id = order_items.order_id) AND (restaurant_staff.user_id = auth.uid())))));


--
-- Name: orders Enable select for restaurant staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable select for restaurant staff" ON public.orders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.restaurant_staff
  WHERE ((restaurant_staff.user_id = auth.uid()) AND (restaurant_staff.restaurant_id = orders.restaurant_id)))));


--
-- Name: restaurant_staff Enable update access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update access for all users" ON public.restaurant_staff FOR UPDATE USING (true);


--
-- Name: waiter_activity_logs Enable update access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update access for all users" ON public.waiter_activity_logs FOR UPDATE USING (true);


--
-- Name: order_items Enable update for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for all users" ON public.order_items FOR UPDATE USING (true);


--
-- Name: orders Enable update for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for all users" ON public.orders FOR UPDATE USING (true);


--
-- Name: orders Enable update for restaurant staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for restaurant staff" ON public.orders FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.restaurant_staff
  WHERE ((restaurant_staff.user_id = auth.uid()) AND (restaurant_staff.restaurant_id = orders.restaurant_id)))));


--
-- Name: restaurant_staff Owners can manage staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage staff" ON public.restaurant_staff TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.restaurants
  WHERE ((restaurants.id = restaurant_staff.restaurant_id) AND (restaurants.owner_id = auth.uid())))));


--
-- Name: restaurant_staff Staff can view themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view themselves" ON public.restaurant_staff FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: order_items Staff view restaurant items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view restaurant items" ON public.order_items FOR SELECT TO authenticated USING (((restaurant_id IN ( SELECT restaurant_staff.restaurant_id
   FROM public.restaurant_staff
  WHERE (restaurant_staff.user_id = auth.uid()))) OR (restaurant_id IN ( SELECT restaurants.id
   FROM public.restaurants
  WHERE (restaurants.owner_id = auth.uid())))));


--
-- Name: custom_menus Users can create custom menus for their restaurant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create custom menus for their restaurant" ON public.custom_menus FOR INSERT WITH CHECK ((restaurant_id IN ( SELECT restaurants.id
   FROM public.restaurants
  WHERE (restaurants.id = custom_menus.restaurant_id))));


--
-- Name: custom_menus Users can delete their restaurant's custom menus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their restaurant's custom menus" ON public.custom_menus FOR DELETE USING ((restaurant_id IN ( SELECT restaurants.id
   FROM public.restaurants
  WHERE (restaurants.id = custom_menus.restaurant_id))));


--
-- Name: custom_menu_dishes Users can manage their menu dishes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their menu dishes" ON public.custom_menu_dishes USING ((custom_menu_id IN ( SELECT custom_menus.id
   FROM public.custom_menus
  WHERE (custom_menus.restaurant_id IN ( SELECT restaurants.id
           FROM public.restaurants
          WHERE (restaurants.id = custom_menus.restaurant_id))))));


--
-- Name: custom_menu_schedules Users can manage their menu schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their menu schedules" ON public.custom_menu_schedules USING ((custom_menu_id IN ( SELECT custom_menus.id
   FROM public.custom_menus
  WHERE (custom_menus.restaurant_id IN ( SELECT restaurants.id
           FROM public.restaurants
          WHERE (restaurants.id = custom_menus.restaurant_id))))));


--
-- Name: custom_menus Users can update their restaurant's custom menus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their restaurant's custom menus" ON public.custom_menus FOR UPDATE USING ((restaurant_id IN ( SELECT restaurants.id
   FROM public.restaurants
  WHERE (restaurants.id = custom_menus.restaurant_id))));


--
-- Name: custom_menu_dishes Users can view their menu dishes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their menu dishes" ON public.custom_menu_dishes FOR SELECT USING ((custom_menu_id IN ( SELECT custom_menus.id
   FROM public.custom_menus
  WHERE (custom_menus.restaurant_id IN ( SELECT restaurants.id
           FROM public.restaurants
          WHERE (restaurants.id = custom_menus.restaurant_id))))));


--
-- Name: custom_menu_schedules Users can view their menu schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their menu schedules" ON public.custom_menu_schedules FOR SELECT USING ((custom_menu_id IN ( SELECT custom_menus.id
   FROM public.custom_menus
  WHERE (custom_menus.restaurant_id IN ( SELECT restaurants.id
           FROM public.restaurants
          WHERE (restaurants.id = custom_menus.restaurant_id))))));


--
-- Name: custom_menus Users can view their restaurant's custom menus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their restaurant's custom menus" ON public.custom_menus FOR SELECT USING ((restaurant_id IN ( SELECT restaurants.id
   FROM public.restaurants
  WHERE (restaurants.id = custom_menus.restaurant_id))));


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_menu_dishes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_menu_dishes ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_menu_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_menu_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_menus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_menus ENABLE ROW LEVEL SECURITY;

--
-- Name: dishes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order-items-anon-insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order-items-anon-insert" ON public.order_items FOR INSERT TO anon WITH CHECK (((order_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.orders o
     JOIN public.table_sessions ts ON ((ts.id = o.table_session_id)))
  WHERE ((o.id = order_items.order_id) AND (ts.status = 'OPEN'::text))))));


--
-- Name: order_items order-items-staff-rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order-items-staff-rw" ON public.order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.orders o
     JOIN public.restaurants r ON ((r.id = o.restaurant_id)))
  WHERE ((o.id = order_items.order_id) AND ((r.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.restaurant_staff rs
          WHERE ((rs.restaurant_id = o.restaurant_id) AND (rs.user_id = auth.uid())))))))));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders-anon-insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders-anon-insert" ON public.orders FOR INSERT TO anon WITH CHECK (((table_session_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.table_sessions ts
     JOIN public.tables t ON ((t.id = ts.table_id)))
  WHERE ((ts.id = orders.table_session_id) AND (ts.status = 'OPEN'::text))))));


--
-- Name: orders orders-staff-rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders-staff-rw" ON public.orders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.restaurants r
  WHERE ((r.id = orders.restaurant_id) AND ((r.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.restaurant_staff rs
          WHERE ((rs.restaurant_id = rs.restaurant_id) AND (rs.user_id = auth.uid())))))))));


--
-- Name: orders orders-staff-update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders-staff-update" ON public.orders FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.restaurants r
  WHERE ((r.id = orders.restaurant_id) AND ((r.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.restaurant_staff rs
          WHERE ((rs.restaurant_id = rs.restaurant_id) AND (rs.user_id = auth.uid()))))))))) WITH CHECK (true);


--
-- Name: restaurant_staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms rooms_delete_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rooms_delete_all ON public.rooms FOR DELETE USING (true);


--
-- Name: rooms rooms_insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rooms_insert_all ON public.rooms FOR INSERT WITH CHECK (true);


--
-- Name: rooms rooms_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rooms_select_all ON public.rooms FOR SELECT USING (true);


--
-- Name: rooms rooms_update_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rooms_update_all ON public.rooms FOR UPDATE USING (true);


--
-- Name: table_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

--
-- Name: tables tables-insert-staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tables-insert-staff" ON public.tables FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.restaurants r
  WHERE ((r.id = tables.restaurant_id) AND (r.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.restaurant_staff rs
  WHERE ((rs.restaurant_id = rs.restaurant_id) AND (rs.user_id = auth.uid()))))));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: waiter_activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waiter_activity_logs ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict cgxQ1yoLOZ0Io622fe56P0GMAjT7YodliCvmvfSEOx7qiEG9aeLQwfk5STWJOUZ

