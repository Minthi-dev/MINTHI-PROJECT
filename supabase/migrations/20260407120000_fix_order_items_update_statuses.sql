-- Fix order_items_update_safe policy: status list must match DB constraint
-- DB constraint allows: PENDING, IN_PREPARATION, READY, SERVED, DELIVERED, PAID, CANCELLED
-- Old policy had: PREPARING (wrong), missing SERVED and IN_PREPARATION

DROP POLICY IF EXISTS "order_items_update_safe" ON public.order_items;
CREATE POLICY "order_items_update_safe" ON public.order_items
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (
        status IS NOT NULL
        AND status IN ('PENDING', 'IN_PREPARATION', 'READY', 'SERVED', 'DELIVERED', 'PAID', 'CANCELLED')
    );
