-- Fix: order_items_update_safe policy was missing 'SERVED' and 'IN_PREPARATION'
-- which are actually used by the app. This caused RLS violations when the waiter
-- tried to mark items as delivered or the kitchen marked items as in preparation.

DROP POLICY IF EXISTS "order_items_update_safe" ON public.order_items;
CREATE POLICY "order_items_update_safe" ON public.order_items
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (
        status IS NOT NULL
        AND status IN ('PENDING', 'PREPARING', 'IN_PREPARATION', 'READY', 'SERVED', 'DELIVERED', 'PAID', 'CANCELLED')
    );
