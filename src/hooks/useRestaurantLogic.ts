import { DatabaseService } from '../services/DatabaseService'
import { Order, OrderItem } from '../services/types'

// Utility pura — nessuna subscription realtime, nessun useSupabaseData
// Evita 4 subscription duplicate (orders, tables, dishes, categories) che già esistono in RestaurantDashboard
export function useRestaurantActions() {
    const updateOrderStatus = async (orderId: string, status: Order['status']) => {
        await DatabaseService.updateOrder(orderId, { status })
    }

    const updateOrderItemStatus = async (_orderId: string, itemId: string, status: OrderItem['status']) => {
        const updates: any = { status }
        if (status === 'READY') {
            updates.ready_at = new Date().toISOString()
        }
        await DatabaseService.updateOrderItem(itemId, updates)
    }

    return {
        updateOrderStatus,
        updateOrderItemStatus,
    }
}
