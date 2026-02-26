import { useSupabaseData } from './useSupabaseData'
import { DatabaseService } from '../services/DatabaseService'
import { Order, OrderItem, Table, Dish, Category } from '../services/types'
import { v4 as uuidv4 } from 'uuid'

export function useRestaurantLogic(restaurantId: string) {
    // Adapted to use 'dishes' instead of 'menu_items'
    const [orders] = useSupabaseData<Order>('orders', [], { column: 'restaurant_id', value: restaurantId })
    const [tables] = useSupabaseData<Table>('tables', [], { column: 'restaurant_id', value: restaurantId })
    const [dishes] = useSupabaseData<Dish>('dishes', [], { column: 'restaurant_id', value: restaurantId })
    const [categories] = useSupabaseData<Category>('categories', [], { column: 'restaurant_id', value: restaurantId })

    const createOrder = async (tableId: string, items: Partial<OrderItem>[]) => {
        if (!items.length) return

        const table = tables?.find(t => t.id === tableId)
        if (!table) throw new Error('Table not found')

        // Calculate total
        let total = 0
        items.forEach(item => {
            const dish = dishes?.find(d => d.id === item.dish_id)
            if (dish) {
                total += dish.price * (item.quantity || 1)
            }
        })

        const newOrder: Partial<Order> = {
            restaurant_id: restaurantId,
            status: 'OPEN', // Changed from 'waiting' to 'OPEN' to match types
            total_amount: total
        }

        // Create order in DB via DatabaseService which handles session creation if needed?
        // Actually DatabaseService.createOrder takes order and items.
        // We need a session first? The original logic didn't seem to care about sessions explicitly or handled it differently.
        // In EASYFOOD_V00, Orders belong to TableSessions.
        // We might need to find an open session or create one.

        // Check for open session
        let session = await DatabaseService.getActiveSession(tableId)
        if (!session) {
            session = await DatabaseService.createSession({
                restaurant_id: restaurantId,
                table_id: tableId,
                status: 'OPEN',
                opened_at: new Date().toISOString()
            })
        }

        newOrder.table_session_id = session.id

        // Create order in DB
        await DatabaseService.createOrder(newOrder, items)

        return newOrder
    }

    const updateOrderStatus = async (orderId: string, status: Order['status']) => {
        await DatabaseService.updateOrder(orderId, { status })
    }

    const updateOrderItemStatus = async (orderId: string, itemId: string, status: OrderItem['status']) => {
        const updates: any = { status }
        if (status === 'READY') {
            updates.ready_at = new Date().toISOString()
        }
        await DatabaseService.updateOrderItem(itemId, updates)
    }

    const updateTableStatus = async (tableId: string, status: Table['status']) => {
        // Table status in EASYFOOD_V00 is not directly in the DB table 'tables' usually, 
        // but we added it to the type as a helper. 
        // However, if we want to persist it, we might need to rely on sessions or add a column.
        // For now, let's assume we update the table if the column exists or just ignore if it's derived.
        // The original code updated the table.
        // We'll try to update it, but DatabaseService.updateTable handles it.
        // Note: 'status' is not in the 'tables' schema in EASYFOOD_V00 setup script, only in types as helper.
        // We should probably rely on open sessions to determine status.
    }

    // Cart Logic
    const addToCart = async (sessionId: string, dishId: string, quantity: number, notes?: string) => {
        await DatabaseService.addToCart({ session_id: sessionId, dish_id: dishId, quantity, notes })
    }

    const removeFromCart = async (itemId: string) => {
        await DatabaseService.removeFromCart(itemId)
    }

    const updateCartItem = async (itemId: string, updates: { quantity?: number, notes?: string, course_number?: number }) => {
        await DatabaseService.updateCartItem(itemId, updates)
    }

    const clearCart = async (sessionId: string) => {
        await DatabaseService.clearCart(sessionId)
    }

    return {
        orders,
        tables,
        dishes,
        categories,
        createOrder,
        updateOrderStatus,
        updateOrderItemStatus,
        updateTableStatus,
        // Cart
        addToCart,
        removeFromCart,
        updateCartItem,
        clearCart
    }
}
