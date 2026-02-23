-- Add restaurant_id to order_items for better filtering and RLS
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id);

-- Backfill restaurant_id from orders
UPDATE public.order_items
SET restaurant_id = orders.restaurant_id
FROM public.orders
WHERE order_items.order_id = orders.id
AND order_items.restaurant_id IS NULL;

-- Enable RLS on order_items (ensure it is on)
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Policy for Staff/Waiters to View All Items in their Restaurant
-- This allows authenticated users (waiters/admins) to see all items belonging to the restaurant they work for or own.
DROP POLICY IF EXISTS "Staff view restaurant items" ON public.order_items;
CREATE POLICY "Staff view restaurant items" ON public.order_items
FOR SELECT TO authenticated
USING (
  restaurant_id IN (
    SELECT restaurant_id FROM public.restaurant_staff WHERE user_id = auth.uid()
  )
  OR
  restaurant_id IN (
    SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
  )
);

-- Trigger to automatically set restaurant_id on insert if null
-- This ensures that even if the frontend doesn't send it, it gets populated from the parent order.
CREATE OR REPLACE FUNCTION public.set_order_item_restaurant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.restaurant_id IS NULL THEN
    SELECT restaurant_id INTO NEW.restaurant_id
    FROM public.orders
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_order_item_restaurant_id_trigger ON public.order_items;
CREATE TRIGGER set_order_item_restaurant_id_trigger
BEFORE INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.set_order_item_restaurant_id();
