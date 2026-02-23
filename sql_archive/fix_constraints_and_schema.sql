-- Fix orders_status_check to allow 'pending' and other statuses
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
CHECK (status IN ('OPEN', 'PAID', 'CANCELLED', 'pending', 'preparing', 'ready', 'served', 'completed', 'delivered', 'ARCHIVED'));

-- Fix order_items_status_check to allow 'PAID' and others
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_status_check 
CHECK (status IN ('PENDING', 'IN_PREPARATION', 'READY', 'SERVED', 'DELIVERED', 'pending', 'preparing', 'ready', 'served', 'delivered', 'PAID', 'CANCELLED'));

-- Verify/Grant permissions if needed (though usually implied)
-- GRANT ALL ON public.orders TO authenticated;
-- GRANT ALL ON public.order_items TO authenticated;
