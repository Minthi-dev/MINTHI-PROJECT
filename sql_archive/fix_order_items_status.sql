-- Drop the existing constraint
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;

-- Re-create the constraint with 'PAID' included
ALTER TABLE public.order_items ADD CONSTRAINT order_items_status_check 
CHECK (status IN ('PENDING', 'IN_PREPARATION', 'READY', 'SERVED', 'DELIVERED', 'pending', 'preparing', 'ready', 'served', 'delivered', 'PAID', 'CANCELLED'));
