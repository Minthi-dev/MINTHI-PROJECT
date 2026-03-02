-- ============================================================
-- Migrazione: Indici di performance per scalabilità 50-100 ristoranti
-- Data: 2026-03-01
-- ============================================================

-- 1. Bookings: query frequenti per stato + date range
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant_status
    ON bookings (restaurant_id, status);

-- 2. Cart Items: FK dish_id usata per lookup piatto nel carrello
CREATE INDEX IF NOT EXISTS idx_cart_items_dish_id
    ON cart_items (dish_id);

-- 3. Waiter Activity Logs: query ordinate per created_at DESC con filtro restaurant
CREATE INDEX IF NOT EXISTS idx_waiter_logs_restaurant_created
    ON waiter_activity_logs (restaurant_id, created_at DESC);

-- 4. Restaurant Staff: login per username (nessun indice esistente)
CREATE INDEX IF NOT EXISTS idx_restaurant_staff_username
    ON restaurant_staff (username);

-- 5. Dishes: FK category_id per rendering menu raggruppato per categoria
CREATE INDEX IF NOT EXISTS idx_dishes_category_id
    ON dishes (category_id);

-- 6. Tables: FK room_id per raggruppamento tavoli per sala
CREATE INDEX IF NOT EXISTS idx_tables_room_id
    ON tables (room_id) WHERE room_id IS NOT NULL;

-- 7. Order Items: query cucina per stato specifico di un ordine
CREATE INDEX IF NOT EXISTS idx_order_items_order_status
    ON order_items (order_id, status);

-- 8. Orders: query report/analytics per ristorante + stato + data
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created
    ON orders (restaurant_id, status, created_at);

-- 9. Cleanup automatico pin_attempts vecchi (> 30 minuti) per evitare accumulo
DELETE FROM pin_attempts WHERE attempted_at < NOW() - INTERVAL '30 minutes';
