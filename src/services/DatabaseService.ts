import { supabase } from '../lib/supabase'
import { User, Restaurant, Category, Dish, Table, TableSession, Order, OrderItem, Booking, CartItem } from './types'
import { hashPassword } from '../utils/passwordUtils'

// Helper: get current logged-in user ID from localStorage
function _getCurrentUserId(): string | null {
    try {
        const saved = localStorage.getItem('minthi_user')
        if (saved) return JSON.parse(saved).id
    } catch { /* ignore */ }
    return null
}

export const DatabaseService = {
    // Users
    async getUsers() {
        const { data, error } = await supabase.from('users').select('id, email, name, role, created_at')
        if (error) throw error
        return data as unknown as User[]
    },

    async createUser(user: Partial<User>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-user-manage', {
            body: { userId, action: 'create', data: user }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione utente')
    },

    // Restaurants
    async getRestaurants() {
        const { data, error } = await supabase.from('restaurants').select('*')
        if (error) throw error
        return data.map((r: any) => ({
            ...r,
            isActive: r.is_active,
            allYouCanEat: r.all_you_can_eat,
            coverChargePerPerson: r.cover_charge_per_person,
            waiter_mode_enabled: r.waiter_mode_enabled,
            allow_waiter_payments: r.allow_waiter_payments,
        })) as Restaurant[]
    },

    async createRestaurant(restaurant: Partial<Restaurant>) {
        const payload: any = { ...restaurant }

        // Gestione corretta is_active
        if (restaurant.isActive !== undefined) {
            payload.is_active = restaurant.isActive
        }
        if (restaurant.allYouCanEat !== undefined) {
            payload.all_you_can_eat = restaurant.allYouCanEat
        }
        if (restaurant.all_you_can_eat !== undefined) {
            payload.all_you_can_eat = restaurant.all_you_can_eat
        }
        if (restaurant.coverChargePerPerson !== undefined) {
            payload.cover_charge_per_person = restaurant.coverChargePerPerson
        }
        if (restaurant.waiter_mode_enabled !== undefined) {
            payload.waiter_mode_enabled = restaurant.waiter_mode_enabled
        }
        if (restaurant.allow_waiter_payments !== undefined) {
            payload.allow_waiter_payments = restaurant.allow_waiter_payments
        }
        if (restaurant.cover_charge_per_person !== undefined) {
            payload.cover_charge_per_person = restaurant.cover_charge_per_person
        }

        // Rimuovi campi frontend-only
        delete payload.isActive
        delete payload.hours
        delete payload.coverChargePerPerson
        delete payload.allYouCanEat
        delete payload.waiter_mode_enabled
        delete payload.allow_waiter_payments

        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'create_restaurant', data: payload }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione ristorante')
    },

    async updateRestaurant(restaurant: Partial<Restaurant>) {
        const payload: any = {}

        // Campi permessi per l'aggiornamento
        const allowedFields = [
            'name', 'address', 'phone', 'email', 'logo_url', 'owner_id',
            'all_you_can_eat', 'ayce_price', 'ayce_max_orders', 'cover_charge_per_person',
            'lunch_time_start', 'dinner_time_start', 'enable_course_splitting', 'reservation_duration',
            'weekly_coperto', 'weekly_ayce', 'weekly_service_hours', 'waiter_password',
            'menu_style', 'menu_primary_color', 'view_only_menu_enabled',
            'enable_reservation_room_selection', 'enable_public_reservations',
            'show_cooking_times', 'enable_course_suggestions'
        ]

        // Copia solo i campi presenti nell'oggetto input
        allowedFields.forEach(field => {
            if (field in restaurant) {
                payload[field] = (restaurant as any)[field]
            }
        })

        // Gestione esplicita di isActive -> is_active
        if (restaurant.isActive !== undefined) {
            payload.is_active = restaurant.isActive
        }
        if (restaurant.allYouCanEat !== undefined) {
            payload.all_you_can_eat = restaurant.allYouCanEat
        }
        if (restaurant.coverChargePerPerson !== undefined) {
            payload.cover_charge_per_person = restaurant.coverChargePerPerson
        }
        if (restaurant.waiter_mode_enabled !== undefined) {
            payload.waiter_mode_enabled = restaurant.waiter_mode_enabled
        }
        if (restaurant.allow_waiter_payments !== undefined) {
            payload.allow_waiter_payments = restaurant.allow_waiter_payments
        }

        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-restaurant-update', {
            body: { userId, restaurantId: restaurant.id, data: payload }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento ristorante')
    },

    async adminUpdateRestaurant(restaurantId: string, updates: Partial<any>, adminUser: User) {
        const { data, error } = await supabase.functions.invoke('secure-restaurant-update', {
            body: { userId: adminUser.id, restaurantId, data: updates }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento ristorante')
    },

    // Rooms
    async getRooms(restaurantId: string) {
        const { data, error } = await supabase
            .from('rooms')
            .select('id, restaurant_id, name, is_active, "order", created_at')
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true)
            .order('order', { ascending: true })
        if (error) throw error
        return data as any[]
    },

    async createRoom(room: Partial<any>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-room-manage', {
            body: { userId, restaurantId: room.restaurant_id, action: 'create', data: room }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione sala')
    },

    async updateRoom(roomId: string, updates: Partial<any>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-room-manage', {
            body: { userId, action: 'update', targetId: roomId, data: updates }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento sala')
    },

    async deleteRoom(roomId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-room-manage', {
            body: { userId, action: 'delete', targetId: roomId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione sala')
    },

    async deleteRestaurant(restaurantId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'delete_restaurant', restaurantId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione ristorante')
    },

    async nukeDatabase() {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'nuke_database' }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore nuke database')
    },

    async updateUser(user: Partial<User>) {
        const callerId = _getCurrentUserId()
        if (!callerId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-user-manage', {
            body: { userId: callerId, action: 'update', targetUserId: user.id, data: user }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento utente')
    },

    async deleteUser(targetUserId: string) {
        const callerId = _getCurrentUserId()
        if (!callerId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-user-manage', {
            body: { userId: callerId, action: 'delete', targetUserId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione utente')
    },

    // Staff
    async getStaff(restaurantId: string) {
        try {
            const { data, error } = await supabase
                .from('restaurant_staff')
                .select('id, restaurant_id, name, username, is_active, created_at')
                .eq('restaurant_id', restaurantId)
                .order('created_at', { ascending: true })
            if (error) {
                console.warn('restaurant_staff table not available:', error.message)
                return []
            }
            return data || []
        } catch {
            return []
        }
    },

    async createStaff(staff: Omit<any, 'id' | 'created_at'>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        // Password hashing happens server-side in the edge function
        const { data, error } = await supabase.functions.invoke('secure-staff-manage', {
            body: { userId, restaurantId: staff.restaurant_id, action: 'create', data: staff }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione staff')
    },

    async updateStaff(staffId: string, updates: Partial<any>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        // Password hashing happens server-side in the edge function
        const { data, error } = await supabase.functions.invoke('secure-staff-manage', {
            body: { userId, action: 'update', staffId, data: updates }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento staff')
    },

    async deleteStaff(staffId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-staff-manage', {
            body: { userId, action: 'delete', staffId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione staff')
    },

    // Waiter Activity Logs
    async logWaiterActivity(restaurantId: string, waiterId: string, actionType: string, details?: any) {
        const { error } = await supabase.from('waiter_activity_logs').insert({
            restaurant_id: restaurantId,
            waiter_id: waiterId,
            action_type: actionType,
            details: details || {}
        })
        if (error) {
            console.error('Failed to log waiter activity:', error)
        }
    },

    async getWaiterActivityLogs(restaurantId: string) {
        const { data, error } = await supabase
            .from('waiter_activity_logs')
            .select('id, restaurant_id, waiter_id, action_type, details, created_at')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false })
            .limit(200)
        if (error) throw error
        return data || []
    },

    async getWaiterLogs(restaurantId: string, startDate?: string, endDate?: string) {
        let query = supabase
            .from('waiter_activity_logs')
            .select('id, restaurant_id, waiter_id, action_type, details, created_at, waiter:restaurant_staff(id, name, username)')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false })
            .limit(500)

        if (startDate) query = query.gte('created_at', startDate)
        if (endDate) query = query.lte('created_at', endDate)

        const { data, error } = await query
        if (error) throw error
        return data
    },

    async _compressImage(file: File, maxWidth = 1200, quality = 0.65): Promise<File> {
        return new Promise((resolve) => {
            const img = new Image()
            const canvas = document.createElement('canvas')
            const reader = new FileReader()

            reader.onload = (e) => {
                img.onload = () => {
                    let w = img.width
                    let h = img.height
                    const maxHeight = 1200
                    // Scale down to fit within maxWidth x maxHeight
                    if (w > maxWidth || h > maxHeight) {
                        const ratio = Math.min(maxWidth / w, maxHeight / h)
                        w = Math.round(w * ratio)
                        h = Math.round(h * ratio)
                    }
                    canvas.width = w
                    canvas.height = h
                    const ctx = canvas.getContext('2d')!
                    ctx.drawImage(img, 0, 0, w, h)
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' }))
                        } else {
                            resolve(file)
                        }
                    }, 'image/webp', quality)
                }
                img.src = e.target?.result as string
            }
            reader.readAsDataURL(file)
        })
    },

    // Storage
    _validateUpload(file: File) {
        const MAX_SIZE = 20 * 1024 * 1024 // 20MB — compressione automatica dopo
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
        if (!ALLOWED_TYPES.includes(file.type)) {
            throw new Error('Tipo file non supportato. Usa JPEG, PNG o WebP.')
        }
        if (file.size > MAX_SIZE) {
            throw new Error('File troppo grande. Massimo 5MB.')
        }
    },

    async uploadLogo(file: File) {
        this._validateUpload(file)
        const compressed = await this._compressImage(file)
        const fileName = `${crypto.randomUUID()}.webp`

        const { error: uploadError } = await supabase.storage
            .from('logos')
            .upload(fileName, compressed)

        if (uploadError) throw uploadError

        const { data } = supabase.storage
            .from('logos')
            .getPublicUrl(fileName)

        return data.publicUrl
    },

    async uploadImage(file: File, bucket: string) {
        this._validateUpload(file)
        const compressed = await this._compressImage(file)
        const fileName = `${crypto.randomUUID()}.webp`

        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(fileName, compressed)

        if (uploadError) throw uploadError

        const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(fileName)

        return data.publicUrl
    },

    // Categories
    async getCategories(restaurantId: string) {
        const { data, error } = await supabase
            .from('categories')
            .select('id, name, restaurant_id, "order", created_at')
            .eq('restaurant_id', restaurantId)
            .order('order', { ascending: true })
        if (error) throw error
        return data as Category[]
    },

    async createCategory(category: Partial<Category>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-menu-manage', {
            body: { userId, restaurantId: category.restaurant_id, action: 'create_category', data: category }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione categoria')
        return (data?.data || category) as Category
    },

    async updateCategory(category: Partial<Category>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-menu-manage', {
            body: { userId, action: 'update_category', targetId: category.id, data: category }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento categoria')
    },

    async deleteCategory(categoryId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-menu-manage', {
            body: { userId, action: 'delete_category', targetId: categoryId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione categoria')
    },

    // Dishes
    async getDishes(restaurantId: string) {
        const { data, error } = await supabase
            .from('dishes')
            .select('id, name, description, price, vat_rate, category_id, restaurant_id, is_active, image_url, created_at, exclude_from_all_you_can_eat, is_ayce, allergens')
            .eq('restaurant_id', restaurantId)
        if (error) throw error
        return data.map((d: any) => ({
            ...d,
            excludeFromAllYouCanEat: d.exclude_from_all_you_can_eat
        })) as Dish[]
    },

    async createDish(dish: Partial<Dish>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const payload: any = { ...dish }
        if (dish.excludeFromAllYouCanEat !== undefined) {
            payload.exclude_from_all_you_can_eat = dish.excludeFromAllYouCanEat
        }
        delete payload.excludeFromAllYouCanEat
        const { data, error } = await supabase.functions.invoke('secure-menu-manage', {
            body: { userId, restaurantId: dish.restaurant_id, action: 'create_dish', data: payload }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione piatto')
    },

    async updateDish(dish: Partial<Dish>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const payload: any = { ...dish }
        if (dish.excludeFromAllYouCanEat !== undefined) {
            payload.exclude_from_all_you_can_eat = dish.excludeFromAllYouCanEat
        }
        delete payload.excludeFromAllYouCanEat
        const { data, error } = await supabase.functions.invoke('secure-menu-manage', {
            body: { userId, action: 'update_dish', targetId: dish.id, data: payload }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento piatto')
    },

    async deleteDish(id: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-menu-manage', {
            body: { userId, action: 'delete_dish', targetId: id }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione piatto')
    },

    // Tables
    async updateSession(session: Partial<TableSession> & { id: string }) {
        const userId = _getCurrentUserId()
        if (userId) {
            const { id, ...rest } = session
            const { data, error } = await supabase.functions.invoke('secure-session-manage', {
                body: { userId, action: 'update', sessionId: id, data: rest }
            })
            if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento sessione')
            return
        }
        const { error } = await supabase.from('table_sessions').update(session).eq('id', session.id)
        if (error) throw error
    },

    async getTables(restaurantId: string) {
        const { data, error } = await supabase
            .from('tables')
            .select('id, number, restaurant_id, token, seats, room_id, created_at, is_active, last_assistance_request')
            .eq('restaurant_id', restaurantId)
        if (error) throw error
        return data as Table[]
    },

    async createTable(table: Partial<Table>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-table-manage', {
            body: { userId, restaurantId: table.restaurant_id, action: 'create', data: table }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione tavolo')
        return (data?.data || table) as Table
    },

    async updateTable(tableId: string, updates: Partial<Table>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-table-manage', {
            body: { userId, action: 'update', targetId: tableId, data: updates }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento tavolo')
    },

    async deleteTable(id: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-table-manage', {
            body: { userId, action: 'delete', targetId: id }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione tavolo')
    },

    // Sessions
    async getActiveSession(tableId: string) {
        const { data, error } = await supabase
            .from('table_sessions')
            .select('id, restaurant_id, table_id, status, opened_at, closed_at, session_pin, customer_count, coperto_enabled, ayce_enabled')
            .eq('table_id', tableId)
            .eq('status', 'OPEN')
            .single()

        if (error && error.code !== 'PGRST116') throw error
        return data as TableSession | null
    },

    async createSession(session: Partial<TableSession>) {
        const userId = _getCurrentUserId()
        if (userId) {
            const { data, error } = await supabase.functions.invoke('secure-session-manage', {
                body: { userId, action: 'create', restaurantId: session.restaurant_id, tableId: session.table_id, data: session }
            })
            if (error) throw new Error(data?.error || error?.message || 'Errore creazione sessione')
            return (data?.data || session) as TableSession
        }
        // Customer path (no login) — direct insert scoped to table
        const { data, error } = await supabase.from('table_sessions').insert(session).select().single()
        if (error) throw error
        return data as TableSession
    },

    async closeSession(sessionId: string, closedByName?: string, closedByRole?: string) {
        const userId = _getCurrentUserId()
        if (userId) {
            const { data, error } = await supabase.functions.invoke('secure-session-manage', {
                body: { userId, action: 'close', sessionId, data: { closed_by_name: closedByName, closed_by_role: closedByRole } }
            })
            if (error) throw new Error(data?.error || error?.message || 'Errore chiusura sessione')
            return
        }
        const { error } = await supabase.from('table_sessions').update({
            status: 'CLOSED', closed_at: new Date().toISOString(),
            ...(closedByName ? { closed_by_name: closedByName } : {}),
            ...(closedByRole ? { closed_by_role: closedByRole } : {}),
        }).eq('id', sessionId)
        if (error) throw error
    },

    async closeAllOpenSessionsForTable(tableId: string, closedByName?: string, closedByRole?: string) {
        const userId = _getCurrentUserId()
        if (userId) {
            const { data, error } = await supabase.functions.invoke('secure-session-manage', {
                body: { userId, action: 'close_all_for_table', tableId, data: { closed_by_name: closedByName, closed_by_role: closedByRole } }
            })
            if (error) throw new Error(data?.error || error?.message || 'Errore chiusura sessioni')
            return
        }
        const { error } = await supabase.from('table_sessions').update({
            status: 'CLOSED', closed_at: new Date().toISOString(),
            ...(closedByName ? { closed_by_name: closedByName } : {}),
            ...(closedByRole ? { closed_by_role: closedByRole } : {}),
        }).eq('table_id', tableId).eq('status', 'OPEN')
        if (error) throw error
    },

    async markOrdersPaidForSession(sessionId: string, paymentMethod: string = 'cash') {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-order-manage', {
            body: { userId, action: 'mark_paid_session', sessionId, paymentMethod }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore pagamento ordini')
    },

    async cancelSessionOrders(sessionId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-order-manage', {
            body: { userId, action: 'cancel_session', sessionId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore cancellazione ordini')
    },

    // Orders
    async getOrders(restaurantId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id, payment_method,
                items:order_items(id, order_id, dish_id, quantity, status, note, course_number, created_at, ready_at,
                    dish:dishes(id, name, price, category_id)
                )
            `)
            .eq('restaurant_id', restaurantId)
            .neq('status', 'PAID')
            .neq('status', 'CANCELLED')
        if (error) throw error
        return data as unknown as Order[]
    },

    async getPastOrders(restaurantId: string, limit = 500) {
        // Query live orders
        const { data: liveData, error: liveError } = await supabase
            .from('orders')
            .select(`
                id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id, payment_method,
                items:order_items(id, order_id, dish_id, quantity, status, note, course_number,
                    dish:dishes(id, name, price)
                )
            `)
            .eq('restaurant_id', restaurantId)
            .eq('status', 'PAID')
            .order('created_at', { ascending: false })
            .limit(limit)
        if (liveError) throw liveError

        // Query archived orders (no FK joins — items already archived flat)
        const { data: archivedData, error: archiveError } = await supabase
            .from('archived_orders')
            .select('id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id, payment_method')
            .eq('restaurant_id', restaurantId)
            .eq('status', 'PAID')
            .order('created_at', { ascending: false })
            .limit(limit)
        if (archiveError) throw archiveError

        // Merge, sort, and cap at limit
        const archived = (archivedData || []).map(o => ({ ...o, items: [] }))
        const merged = [...(liveData || []), ...archived]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, limit)
        return merged as unknown as Order[]
    },

    async getAllOrders(options?: { page?: number; pageSize?: number; restaurantId?: string }) {
        const { page = 1, pageSize = 100, restaurantId } = options || {}
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        let query = supabase
            .from('orders')
            .select('id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id, items:order_items(id, order_id, dish_id, quantity, status, note, course_number), restaurant:restaurants(name)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to)

        if (restaurantId) {
            query = query.eq('restaurant_id', restaurantId)
        }

        const { data, error, count } = await query
        if (error) throw error
        return { data: data as unknown as (Order & { restaurant: { name: string } })[], total: count || 0, page, pageSize }
    },

    async getAllTableSessions(restaurantId?: string) {
        let query = supabase
            .from('table_sessions')
            .select('id, restaurant_id, table_id, status, opened_at, closed_at, session_pin, customer_count, coperto_enabled, ayce_enabled, receipt_issued, paid_amount, notes')
            .order('opened_at', { ascending: false })
            .limit(1000)
        if (restaurantId) {
            query = query.eq('restaurant_id', restaurantId)
        }
        const { data, error } = await query
        if (error) throw error
        return data as unknown as TableSession[]
    },

    async updateSessionReceiptIssued(sessionId: string, issued: boolean) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-session-manage', {
            body: { userId, action: 'update_receipt', sessionId, data: { receipt_issued: issued } }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento ricevuta')
    },

    async getSessionOrderCount(sessionId: string) {
        const { error, count } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('table_session_id', sessionId)

        if (error) throw error
        return count || 0
    },

    async createOrder(order: Partial<Order>, items: Partial<OrderItem>[]) {
        const userId = _getCurrentUserId()
        const cleanItems = items.map(item => {
            const { price_at_time, ...rest } = item as any
            return rest
        })
        if (userId) {
            const { data, error } = await supabase.functions.invoke('secure-order-manage', {
                body: { userId, action: 'create_order', data: { order, items: cleanItems } }
            })
            if (error) throw new Error(data?.error || error?.message || 'Errore creazione ordine')
            return data?.data || order
        }
        // Customer path — direct insert
        const { data: orderData, error: orderError } = await supabase.from('orders').insert(order).select().single()
        if (orderError) throw orderError
        if (!orderData) throw new Error('Failed to create order')
        const itemsWithOrderId = cleanItems.map((item: any) => ({ ...item, order_id: orderData.id }))
        const { error: itemsError } = await supabase.from('order_items').insert(itemsWithOrderId)
        if (itemsError) throw itemsError
        return orderData
    },

    async updateOrder(orderId: string, updates: Partial<Order>) {
        const userId = _getCurrentUserId()
        if (userId) {
            const { data, error } = await supabase.functions.invoke('secure-order-manage', {
                body: { userId, action: 'update_order', orderId, data: updates }
            })
            if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento ordine')
            return
        }
        const { error } = await supabase.from('orders').update(updates).eq('id', orderId)
        if (error) throw error
    },

    async updateOrderItem(itemId: string, updates: Partial<OrderItem>) {
        const userId = _getCurrentUserId()
        if (userId) {
            const { data, error } = await supabase.functions.invoke('secure-order-manage', {
                body: { userId, action: 'update_order_item', itemId, data: updates }
            })
            if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento item')
            return
        }
        const { error } = await supabase.from('order_items').update(updates).eq('id', itemId)
        if (error) throw error
    },

    // Bookings
    async getBookings(restaurantId: string) {
        const { data, error } = await supabase
            .from('bookings')
            .select('id, restaurant_id, table_id, name, email, phone, date_time, guests, notes, status, created_at')
            .eq('restaurant_id', restaurantId)
            .order('date_time', { ascending: false })
            .limit(500)
        if (error) throw error
        return data as unknown as Booking[]
    },

    async createBooking(booking: Partial<Booking>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-booking-manage', {
            body: { userId, action: 'create', restaurantId: booking.restaurant_id, data: booking }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione prenotazione')
        return (data?.data || booking) as Booking
    },

    async createPublicBooking(booking: Partial<Booking>) {
        const { data, error } = await supabase.functions.invoke('secure-booking-manage', {
            body: { action: 'create_public', data: booking }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione prenotazione')
        return (data?.data || booking) as Booking
    },

    async updateBooking(booking: Partial<Booking>) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-booking-manage', {
            body: { userId, action: 'update', bookingId: booking.id, data: booking }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento prenotazione')
    },

    async deleteBooking(bookingId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-booking-manage', {
            body: { userId, action: 'delete', bookingId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione prenotazione')
    },

    // Cart (Realtime)
    async getCartItems(sessionId: string) {
        const { data, error } = await supabase
            .from('cart_items')
            .select('id, session_id, dish_id, quantity, notes, created_at, course_number, dish:dishes(id, name, price, category_id, image_url, is_ayce, exclude_from_all_you_can_eat, allergens)')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
        if (error) throw error
        return data as unknown as CartItem[]
    },

    async addToCart(item: { session_id: string, dish_id: string, quantity: number, notes?: string, course_number?: number }) {
        // Usa RPC atomica per prevenire race condition (2 clienti aggiungono lo stesso piatto contemporaneamente)
        const { data, error } = await supabase.rpc('add_to_cart', {
            p_session_id: item.session_id,
            p_dish_id: item.dish_id,
            p_quantity: item.quantity,
            p_notes: item.notes || null,
            p_course_number: item.course_number || 1
        })
        if (error) throw error
        return data as string // cart_item id
    },

    async updateCartItem(itemId: string, updates: { quantity?: number, notes?: string, course_number?: number }) {
        if (updates.quantity !== undefined && updates.quantity <= 0) {
            return this.removeFromCart(itemId)
        }
        const { error } = await supabase
            .from('cart_items')
            .update(updates)
            .eq('id', itemId)
        if (error) throw error
    },

    async removeFromCart(itemId: string) {
        const { error } = await supabase
            .from('cart_items')
            .delete()
            .eq('id', itemId)
        if (error) throw error
    },

    async clearCart(sessionId: string) {
        const { error } = await supabase
            .from('cart_items')
            .delete()
            .eq('session_id', sessionId)
        if (error) throw error
    },

    async verifySessionPin(tableId: string, pin: string): Promise<boolean> {
        try {
            // Usa RPC con rate limiting server-side (max 5 tentativi / 10 minuti)
            const { error } = await supabase.rpc('verify_session_pin_safe', {
                p_table_id: tableId,
                p_pin: pin.trim()
            })
            if (error) {
                if (error.code === 'P0002') {
                    throw new Error('Troppi tentativi. Attendi 10 minuti prima di riprovare.')
                }
                return false
            }
            return true
        } catch (error: any) {
            if (error?.message?.includes('Troppi tentativi')) throw error
            console.error('Error in verifySessionPin:', error)
            return false
        }
    },

    async getSessionOrders(sessionId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id, items:order_items(id, order_id, dish_id, quantity, status, note, course_number, created_at, ready_at, dish:dishes(id, name, price, category_id, image_url))')
            .eq('table_session_id', sessionId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return data as unknown as Order[]
    },
    async getSessionById(sessionId: string) {
        const { data, error } = await supabase
            .from('table_sessions')
            .select('id, restaurant_id, table_id, status, opened_at, closed_at, session_pin, customer_count, coperto_enabled, ayce_enabled, paid_amount, notes')
            .eq('id', sessionId)
            .single()
        if (error) return null
        return data as TableSession
    },

    // Custom Menus
    async getCustomMenus(restaurantId: string) {
        const { data, error } = await supabase
            .from('custom_menus')
            .select('id, restaurant_id, name, description, is_active, created_at, updated_at')
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true)
        if (error) throw error
        return data as any[]
    },

    async getAllCustomMenus(restaurantId: string) {
        const { data, error } = await supabase
            .from('custom_menus')
            .select('id, restaurant_id, name, description, is_active, created_at, updated_at')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return data as any[]
    },

    async getCustomMenuWithDishes(menuId: string) {
        const { data, error } = await supabase
            .from('custom_menus')
            .select('*, dishes:custom_menu_dishes(*, dish:dishes(*))')
            .eq('id', menuId)
            .single()

        if (error) throw error
        return data
    },

    // Stripe - Abbonamento ristorante
    async createStripeSubscriptionCheckout(restaurantId: string, priceId: string) {
        const { data, error } = await supabase.functions.invoke('stripe-checkout', {
            body: {
                restaurantId,
                priceId,
                successUrl: `${window.location.origin}/?payment=success`,
                cancelUrl: `${window.location.origin}/?payment=cancelled`
            }
        });

        if (error) throw new Error(data?.error || error.message || 'Errore durante il checkout');
        return data; // { sessionId: string, url: string }
    },

    // Crea una registrazione pending e avvia il checkout Stripe.
    // Il ristorante viene creato nel DB SOLO quando Stripe conferma il pagamento.
    async createPendingRegistrationCheckout(data: {
        registrationToken: string | null,
        name: string, phone: string, email: string,
        username: string, password: string,
        billingName: string, vatNumber: string, billingAddress: string,
        billingCity: string, billingCap: string, billingProvince: string, codiceUnivoco: string,
        priceId: string,
        couponId?: string | null,
    }) {
        const passwordHash = await hashPassword(data.password)

        // Salva i dati in pending_registrations via RPC (bypassa RLS)
        const { data: pendingId, error: insertError } = await supabase.rpc('insert_pending_registration', {
            p_registration_token: data.registrationToken,
            p_name: data.name,
            p_phone: data.phone || null,
            p_email: data.email || null,
            p_billing_name: data.billingName,
            p_vat_number: data.vatNumber,
            p_billing_address: data.billingAddress,
            p_billing_city: data.billingCity,
            p_billing_cap: data.billingCap,
            p_billing_province: data.billingProvince,
            p_codice_univoco: data.codiceUnivoco,
            p_username: data.username,
            p_password_hash: passwordHash,
            p_raw_password: '',
        })

        if (insertError) throw insertError

        // Crea sessione Stripe con pendingRegistrationId
        const { data: checkout, error: checkoutError } = await supabase.functions.invoke('stripe-checkout', {
            body: {
                pendingRegistrationId: pendingId,
                priceId: data.priceId,
                successUrl: `${window.location.origin}/register-success`,
                cancelUrl: `${window.location.origin}/register?cancelled=true`,
                ...(data.couponId ? { couponId: data.couponId } : {}),
            }
        })

        if (checkoutError) throw new Error(checkout?.error || checkoutError.message || 'Errore durante il checkout')
        return checkout as { sessionId: string, url: string }
    },

    // Stripe - Pagamento cliente dal menu
    async createStripeCustomerPayment(params: {
        restaurantId: string,
        tableSessionId: string,
        orderIds: string[],
        items: { name: string, price: number, quantity: number }[],
        totalAmount: number,
        splitLabel?: string,
        tableId?: string,
        paidOrderItemIds?: string[],
    }) {
        const { data, error } = await supabase.functions.invoke('stripe-customer-payment', {
            body: {
                restaurantId: params.restaurantId,
                tableSessionId: params.tableSessionId,
                orderIds: params.orderIds,
                items: params.items,
                totalAmount: params.totalAmount,
                splitLabel: params.splitLabel || 'Pagamento',
                successUrl: `${window.location.origin}/client/table/${params.tableId || ''}?payment=success`,
                cancelUrl: `${window.location.origin}/client/table/${params.tableId || ''}?payment=cancelled`,
                paidOrderItemIds: params.paidOrderItemIds,
            }
        });

        if (error) {
            let errorMsg = 'Errore durante il pagamento';
            try {
                if (data?.error) {
                    errorMsg = data.error;
                } else if ((error as any).context) {
                    const body = await (error as any).context.json();
                    if (body?.error) errorMsg = body.error;
                } else if (error.message && !error.message.includes('non-2xx')) {
                    errorMsg = error.message;
                }
            } catch { /* ignore parse errors */ }
            throw new Error(errorMsg);
        }
        return data; // { sessionId: string, url: string }
    },

    // Stripe - Toggle pagamenti clienti
    async toggleStripePayments(restaurantId: string, enabled: boolean) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-restaurant-update', {
            body: { userId, restaurantId, data: { enable_stripe_payments: enabled } }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento pagamenti')
    },

    // Stripe - Billing Portal (gestisci abbonamento, scarica fatture, cambia metodo pagamento)
    async createBillingPortalSession(restaurantId: string) {
        const { data, error } = await supabase.functions.invoke('stripe-billing-portal', {
            body: {
                restaurantId,
                returnUrl: `${window.location.origin}/?section=settings`,
            }
        });
        if (error) throw new Error(data?.error || error.message || 'Errore portale di fatturazione');
        return data as { url: string };
    },

    // Stripe Connect - Crea account Express (senza redirect, per embedded onboarding)
    async createStripeConnectOnboarding(restaurantId: string, returnUrl?: string) {
        const { data, error } = await supabase.functions.invoke('stripe-connect-onboarding', {
            body: { restaurantId, returnUrl }
        });
        if (error) {
            let errorMsg = 'Errore connessione Stripe';
            try {
                if (data?.error) {
                    errorMsg = data.error;
                } else if ((error as any).context) {
                    const body = await (error as any).context.json();
                    if (body?.error) errorMsg = body.error;
                } else if (error.message && !error.message.includes('non-2xx')) {
                    errorMsg = error.message;
                }
            } catch { /* ignore parse errors */ }
            throw new Error(errorMsg);
        }
        return data as { accountId: string; url: string };
    },

    // Stripe Connect - Aggiorna lo stato charges_enabled su richiesta
    async refreshStripeConnectStatus(restaurantId: string) {
        const { data, error } = await supabase.functions.invoke('stripe-connect-refresh-status', {
            body: { restaurantId }
        });
        if (error) {
            console.error('Errore refresh stripe connect:', error)
            return false;
        }
        return data as { enabled: boolean };
    },

    // Stripe Connect - Crea Account Session per embedded components
    async createStripeAccountSession(restaurantId: string) {
        const { data, error } = await supabase.functions.invoke('stripe-account-session', {
            body: { restaurantId }
        });
        if (error) {
            let errorMsg = 'Errore sessione account Stripe';
            try {
                if (data?.error) {
                    errorMsg = data.error;
                } else if ((error as any).context) {
                    const body = await (error as any).context.json();
                    if (body?.error) errorMsg = body.error;
                } else if (error.message && !error.message.includes('non-2xx')) {
                    errorMsg = error.message;
                }
            } catch { /* ignore parse errors */ }
            throw new Error(errorMsg);
        }
        return data as { clientSecret: string };
    },

    // Aggiorna dati fiscali del ristorante (P.IVA, ragione sociale)
    async updateRestaurantPaymentInfo(restaurantId: string, info: { vat_number?: string; billing_name?: string }) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-restaurant-update', {
            body: { userId, restaurantId, data: info }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento dati fiscali')
    },

    // Stripe Connect - Open Express Dashboard for payout management
    async openExpressDashboard(restaurantId: string) {
        const { data, error } = await supabase.functions.invoke('stripe-express-dashboard', {
            body: { restaurantId }
        });
        if (error) throw new Error(data?.error || error.message || 'Errore apertura dashboard');
        return data as { url: string };
    },

    // Admin - Subscription payments
    async getSubscriptionPayments(restaurantId?: string) {
        let query = supabase
            .from('subscription_payments')
            .select('*')
            .order('created_at', { ascending: false })
        if (restaurantId) {
            query = query.eq('restaurant_id', restaurantId)
        }
        const { data, error } = await query
        if (error) throw error
        return data
    },

    async updateSubscriptionPayment(paymentId: string, updates: { admin_completed?: boolean }) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'update_subscription_payment', targetId: paymentId, data: updates }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento pagamento')
    },

    async deleteSubscriptionPayment(paymentId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'delete_subscription_payment', targetId: paymentId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore eliminazione pagamento')
    },

    // Admin - Restaurant bonuses
    async getRestaurantBonuses(restaurantId?: string) {
        let query = supabase
            .from('restaurant_bonuses')
            .select('*')
            .order('granted_at', { ascending: false })
        if (restaurantId) {
            query = query.eq('restaurant_id', restaurantId)
        }
        const { data, error } = await query
        if (error) throw error
        return data
    },

    async createRestaurantBonus(bonus: {
        restaurant_id: string,
        free_months: number,
        reason?: string,
        granted_by?: string,
    }) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'create_bonus', data: bonus }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione bonus')
        return data?.data
    },

    async deactivateBonus(bonusId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'deactivate_bonus', targetId: bonusId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore disattivazione bonus')
    },

    async suspendRestaurant(restaurantId: string, reason: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'suspend_restaurant', restaurantId, data: { reason } }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore sospensione ristorante')
    },

    async reactivateRestaurant(restaurantId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'reactivate_restaurant', restaurantId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore riattivazione ristorante')
    },

    // Mark orders as paid via stripe
    async markOrdersPaidStripe(orderIds: string[]) {
        if (orderIds.length === 0) return
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-order-manage', {
            body: { userId, action: 'mark_paid_stripe', orderIds }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore pagamento ordini Stripe')
    },

    // App Config (global settings)
    async getAppConfig(key: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('app_config')
            .select('value')
            .eq('key', key)
            .maybeSingle()
        if (error) { console.warn('app_config read error:', error.message); return null }
        return data?.value || null
    },

    async setAppConfig(key: string, value: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'set_app_config', data: { key, value } }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento config')
    },

    // Registration Tokens (onboarding)
    async createRegistrationToken(
        freeMonths: number = 0,
        discountPercent: number = 0,
        discountDuration: string = 'once',
        discountDurationMonths?: number
    ): Promise<{ token: string, id: string }> {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')

        // Create Stripe coupon first if discount > 0
        let stripeCouponId: string | null = null
        if (discountPercent > 0) {
            const { data: couponData, error: couponError } = await supabase.functions.invoke('stripe-create-coupon', {
                body: {
                    percent_off: discountPercent,
                    duration: discountDuration === 'once' || discountDuration === 'forever'
                        ? discountDuration
                        : 'repeating',
                    duration_in_months: discountDurationMonths
                }
            })
            if (!couponError && couponData?.couponId) {
                stripeCouponId = couponData.couponId
            }
        }

        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: {
                userId, action: 'create_registration_token',
                data: { free_months: freeMonths, discount_percent: discountPercent, discount_duration: discountDuration, stripe_coupon_id: stripeCouponId }
            }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore creazione token')
        return data?.data
    },

    async validateRegistrationToken(token: string) {
        const { data, error } = await supabase
            .from('registration_tokens')
            .select('*')
            .eq('token', token)
            .maybeSingle()
        if (error) throw error
        if (!data) return null
        // Tokens are never invalidated after use - they stay active forever
        if (data.expires_at && new Date(data.expires_at) < new Date()) return null
        return data
    },

    async markTokenUsed(tokenId: string, restaurantId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'mark_token_used', targetId: tokenId, restaurantId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore aggiornamento token')
    },

    async registerRestaurant(data: {
        name: string, phone: string, email: string, username: string, password: string,
        freeMonths?: number,
        registrationToken?: string,
        billingName?: string, vatNumber?: string, billingAddress?: string,
        billingCity?: string, billingCap?: string, billingProvince?: string, codiceUnivoco?: string
    }) {
        const hashedPassword = await hashPassword(data.password)

        const { data: result, error } = await supabase.rpc('register_restaurant_secure', {
            p_name: data.name,
            p_phone: data.phone,
            p_email: data.email,
            p_username: data.username,
            p_password_hash: hashedPassword,
            p_raw_password: '',
            p_free_months: data.freeMonths || 0,
            p_billing_name: data.billingName || null,
            p_vat_number: data.vatNumber || null,
            p_billing_address: data.billingAddress || null,
            p_billing_city: data.billingCity || null,
            p_billing_cap: data.billingCap || null,
            p_billing_province: data.billingProvince || null,
            p_codice_univoco: data.codiceUnivoco || null,
            p_registration_token: data.registrationToken || null,
        });

        if (error) {
            console.error("RPC Error:", error);
            throw error;
        }

        return { id: result.restaurant_id };
    },

    // Stripe price management
    async getStripePriceDetails(): Promise<{ amount: number, currency: string, product_id: string | null, price_id: string | null }> {
        const { data, error } = await supabase.functions.invoke('stripe-manage-price', {
            body: { action: 'get' }
        })
        if (error) {
            // On non-2xx, data may contain the actual error message
            const msg = typeof data === 'object' && data?.error ? data.error : error.message
            console.error('getStripePriceDetails error:', msg, data)
            throw new Error(msg)
        }
        return data ?? { amount: 0, currency: 'eur', product_id: null, price_id: null }
    },

    async createStripePrice(amountCents: number): Promise<{ priceId: string, amount: number }> {
        const { data, error } = await supabase.functions.invoke('stripe-manage-price', {
            body: { action: 'create', amount_cents: amountCents }
        })
        if (error) {
            const msg = typeof data === 'object' && data?.error ? data.error : error.message
            console.error('createStripePrice error:', msg, data)
            throw new Error(msg)
        }
        return data
    },

    // Restaurant discounts
    async getRestaurantDiscounts(restaurantId?: string) {
        let query = supabase
            .from('restaurant_discounts')
            .select('*')
            .order('created_at', { ascending: false })
        if (restaurantId) query = query.eq('restaurant_id', restaurantId)
        const { data, error } = await query
        if (error) throw error
        return data || []
    },

    async applyRestaurantDiscount(params: {
        restaurantId: string,
        discountPercent: number,
        discountDuration: string,
        discountDurationMonths?: number,
        reason?: string,
        grantedBy?: string,
    }) {
        const { data, error } = await supabase.functions.invoke('stripe-apply-discount', {
            body: {
                restaurantId: params.restaurantId,
                discountPercent: params.discountPercent,
                discountDuration: params.discountDuration,
                discountDurationMonths: params.discountDurationMonths,
                reason: params.reason,
                grantedBy: params.grantedBy,
            }
        })
        if (error) throw new Error(data?.error || error.message)
        return data
    },

    async dismissDiscountBanner(discountId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'dismiss_discount_banner', targetId: discountId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore dismiss banner')
    },

    async deactivateRestaurantDiscount(discountId: string) {
        const userId = _getCurrentUserId()
        if (!userId) throw new Error('Non autenticato')
        const { data, error } = await supabase.functions.invoke('secure-admin-action', {
            body: { userId, action: 'deactivate_discount', targetId: discountId }
        })
        if (error) throw new Error(data?.error || error?.message || 'Errore disattivazione sconto')
    },

    // === Auth helpers (used by LoginPage and App.tsx) ===

    // verifyWaiterCredentials removed — login is handled server-side by the login edge function

    async getRestaurantForLogin(ownerId: string) {
        // Use the existing server-side RPC (SECURITY DEFINER, no RLS bypass needed)
        const { data, error } = await supabase.rpc('get_restaurant_for_login', { p_owner_id: ownerId })
        if (error || !data) return null
        return data as { id: string, name: string, is_active: boolean }
    },

    async verifyStaffSession(staffId: string): Promise<boolean> {
        // Use server-side RPC to check if staff member still exists and is active
        const { data, error } = await supabase.rpc('verify_staff_session', { p_staff_id: staffId })
        if (error) return false
        return !!data
    },

    // === Admin aggregation (server-side, no unbounded client queries) ===

    async getSalesByRestaurant(): Promise<Record<string, number>> {
        const { data, error } = await supabase.rpc('get_sales_by_restaurant')
        if (error) {
            console.error('getSalesByRestaurant error:', error)
            return {}
        }
        const sales: Record<string, number> = {}
        ;(data || []).forEach((row: any) => {
            sales[row.restaurant_id] = row.total_sales || 0
        })
        return sales
    },
}