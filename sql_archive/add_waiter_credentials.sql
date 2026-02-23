-- Create restaurant_staff table
CREATE TABLE IF NOT EXISTS public.restaurant_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on RLS for restaurant_staff
ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;

-- Allow reading all staff
CREATE POLICY "Enable read access for all users" ON public.restaurant_staff FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.restaurant_staff FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.restaurant_staff FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.restaurant_staff FOR DELETE USING (true);


-- Create waiter_activity_logs table
CREATE TABLE IF NOT EXISTS public.waiter_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    waiter_id UUID NOT NULL REFERENCES public.restaurant_staff(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- e.g., 'DISH_DELIVERED', 'BELL_RESOLVED'
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on RLS for waiter_activity_logs
ALTER TABLE public.waiter_activity_logs ENABLE ROW LEVEL SECURITY;

-- Allow reading all logs
CREATE POLICY "Enable read access for all users" ON public.waiter_activity_logs FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.waiter_activity_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.waiter_activity_logs FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.waiter_activity_logs FOR DELETE USING (true);
