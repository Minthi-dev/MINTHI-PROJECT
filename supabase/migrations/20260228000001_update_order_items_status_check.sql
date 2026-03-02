-- Update the order_items_status_check constraint
ALTER TABLE "public"."order_items" DROP CONSTRAINT IF EXISTS "order_items_status_check";
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_status_check" CHECK ("status" = ANY (ARRAY['PENDING'::text, 'IN_PREPARATION'::text, 'READY'::text, 'SERVED'::text, 'DELIVERED'::text, 'PAID'::text, 'CANCELLED'::text, 'pending'::text, 'preparing'::text, 'ready'::text, 'served'::text, 'delivered'::text, 'paid'::text, 'cancelled'::text]));
