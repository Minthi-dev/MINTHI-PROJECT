-- Keep public pickup numbers compact for high-volume festival service.
-- The pickup_code remains globally unique; pickup_number is the daily visual counter.
CREATE OR REPLACE FUNCTION public.next_pickup_number(
    p_restaurant_id uuid,
    p_tz text DEFAULT 'Europe/Rome'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_day date := (timezone(p_tz, now()))::date;
    v_num integer;
BEGIN
    INSERT INTO public.pickup_counters(restaurant_id, day, last_number, updated_at)
    VALUES (p_restaurant_id, v_day, 1, now())
    ON CONFLICT (restaurant_id, day)
    DO UPDATE SET
        last_number = CASE
            WHEN public.pickup_counters.last_number >= 999 THEN 1
            ELSE public.pickup_counters.last_number + 1
        END,
        updated_at = now()
    RETURNING last_number INTO v_num;

    RETURN v_num;
END;
$$;

REVOKE ALL ON FUNCTION public.next_pickup_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_pickup_number(uuid, text) TO service_role;
