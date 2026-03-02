import { supabase } from '../lib/supabase'
import { User, Restaurant, Category, Dish, Table, TableSession, Order, OrderItem, Booking, CartItem } from './types'
import { hashPassword } from '../utils/passwordUtils'

export const DatabaseService = {
    // Users
    async getUsers() {
        const { data, error } = await supabase.from('users').select('id, email, name, role, created_at, password_hash')
        if (error) throw error
        return data as unknown as User[]
    },

    async createUser(user: Partial<User>) {
        const { error } = await supabase.from('users').insert(user)
        if (error) throw error
    },

    // Restaurants
    async getRestaurants() {
        const { data, error } = await supabase.from('restaurants').select('id, name, address, phone, email, logo_url, cover_image_url, owner_id, created_at, is_active, all_you_can_eat, ayce_price, ayce_max_orders, cover_charge_per_person, lunch_time_start, dinner_time_start, enable_course_splitting, reservation_duration, weekly_coperto, weekly_ayce, weekly_service_hours, waiter_password, waiter_mode_enabled, allow_waiter_payments, menu_style, menu_primary_color, view_only_menu_enabled, enable_reservation_room_selection, enable_public_reservations')
        if (error) throw error
        return data.map((r: any) => ({
            ...r,
            isActive: r.is_active, // Mappa is_active (DB) a isActive (Frontend)
            allYouCanEat: r.all_you_can_eat,
            coverChargePerPerson: r.cover_charge_per_person,
            waiter_mode_enabled: r.waiter_mode_enabled,
            allow_waiter_payments: r.allow_waiter_payments,
            waiter_password: r.waiter_password
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

        const { error } = await supabase.from('restaurants').insert(payload)
        if (error) throw error
    },

    async updateRestaurant(restaurant: Partial<Restaurant>) {
        const payload: any = {}

        // Campi permessi per l'aggiornamento
        const allowedFields = [
            'name', 'address', 'phone', 'email', 'logo_url', 'cover_image_url', 'owner_id',
            'all_you_can_eat', 'ayce_price', 'ayce_max_orders', 'cover_charge_per_person',
            'lunch_time_start', 'dinner_time_start', 'enable_course_splitting', 'reservation_duration',
            'weekly_coperto', 'weekly_ayce', 'weekly_service_hours', 'waiter_password',
            'menu_style', 'menu_primary_color', 'view_only_menu_enabled',
            'enable_reservation_room_selection', 'enable_public_reservations'
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

        const { error } = await supabase
            .from('restaurants')
            .update(payload)
            .eq('id', restaurant.id)

        if (error) throw error
    },

    async adminUpdateRestaurant(restaurantId: string, updates: Partial<any>, _adminUser: User) {
        // Direct update - admin is already authenticated in the frontend
        const { error } = await supabase
            .from('restaurants')
            .update(updates)
            .eq('id', restaurantId)

        if (error) throw error;
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
        const { error } = await supabase.from('rooms').insert(room)
        if (error) throw error
    },

    async updateRoom(roomId: string, updates: Partial<any>) {
        const { error } = await supabase
            .from('rooms')
            .update(updates)
            .eq('id', roomId)
        if (error) throw error
    },

    async deleteRoom(roomId: string) {
        const { error } = await supabase
            .from('rooms')
            .update({ is_active: false })
            .eq('id', roomId)
        if (error) throw error
    },

    async deleteRestaurant(restaurantId: string) {
        // 0. Recupera info ristorante per eliminare il logo e l'owner
        const { data: restaurant } = await supabase
            .from('restaurants')
            .select('logo_url, owner_id')
            .eq('id', restaurantId)
            .single()

        // 1. Elimina dipendenze complesse (Order Items)
        const { data: orders } = await supabase
            .from('orders')
            .select('id')
            .eq('restaurant_id', restaurantId)

        if (orders && orders.length > 0) {
            const orderIds = orders.map(o => o.id)
            await supabase.from('order_items').delete().in('order_id', orderIds)
        }

        // 2. Elimina Tabelle dipendenti direttamente da restaurant_id (Ordine Strict)
        // IMPORTANTE: Elimina restaurant_staff PRIMA di tutto il resto per liberare referenze agli utenti
        await supabase.from('restaurant_staff').delete().eq('restaurant_id', restaurantId)

        await supabase.from('orders').delete().eq('restaurant_id', restaurantId)
        await supabase.from('table_sessions').delete().eq('restaurant_id', restaurantId)
        await supabase.from('bookings').delete().eq('restaurant_id', restaurantId)
        await supabase.from('dishes').delete().eq('restaurant_id', restaurantId)
        await supabase.from('categories').delete().eq('restaurant_id', restaurantId)
        await supabase.from('tables').delete().eq('restaurant_id', restaurantId)

        // 3. Elimina logo dallo Storage se esiste
        if (restaurant?.logo_url) {
            try {
                const urlParts = restaurant.logo_url.split('/')
                const fileName = urlParts[urlParts.length - 1]

                if (fileName) {
                    await supabase.storage
                        .from('logos')
                        .remove([fileName])
                }
            } catch (e) {
                console.warn("Could not delete logo file", e)
            }
        }

        // 4. Infine elimina il ristorante
        const { error } = await supabase
            .from('restaurants')
            .delete()
            .eq('id', restaurantId)

        if (error) throw error

        // 5. Tenta di eliminare l'utente proprietario (se esiste), MA NON SE È ADMIN
        // Questo va fatto DOPO aver eliminato il ristorante e lo staff
        if (restaurant?.owner_id) {
            try {
                // Check if user is ADMIN first
                const { data: user } = await supabase.from('users').select('role').eq('id', restaurant.owner_id).single()

                if (user?.role !== 'ADMIN') {
                    await supabase.from('users').delete().eq('id', restaurant.owner_id)
                } else {
                    console.log('Skipping deletion of restaurant owner because they are ADMIN')
                }
            } catch (e) {
                console.warn("Could not auto-delete owner user", e)
                // Non lanciamo errore qui per non bloccare l'operazione se il ristorante è già andato
            }
        }
    },

    async nukeDatabase() {
        // ATTENZIONE: Ordine inverso di dipendenza per evitare errori di Foreign Key

        // 1. Dati volatili di sessione
        await supabase.from('cart_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('table_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // 2. Sistema Menu Personalizzati
        await supabase.from('custom_menu_schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('custom_menu_dishes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('custom_menus').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // 3. Struttura Menu e Locale
        await supabase.from('dishes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('tables').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('rooms').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // 4. Staff e Ristoranti
        await supabase.from('restaurant_staff').delete().neq('restaurant_id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('restaurants').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // 5. Utenti (tranne ADMIN)
        await supabase.from('users').delete().neq('role', 'ADMIN')
    },

    async updateUser(user: Partial<User>) {
        const { error } = await supabase
            .from('users')
            .update(user)
            .eq('id', user.id)
        if (error) throw error
    },

    async deleteUser(userId: string) {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId)
        if (error) throw error
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

    async verifyWaiterCredentials(username: string, _password: string): Promise<any> {
        // Fetch by username only - password verification happens in JS via verifyPassword()
        const { data, error } = await supabase
            .from('restaurant_staff')
            .select('id, restaurant_id, name, username, password, is_active, restaurant:restaurants(id, name, waiter_mode_enabled, allow_waiter_payments, enable_course_splitting, cover_charge_per_person, all_you_can_eat, weekly_coperto, weekly_ayce, weekly_service_hours, lunch_time_start, lunch_time_end, dinner_time_start, dinner_time_end, view_only_menu_enabled, menu_style, menu_primary_color)')
            .eq('username', username)
            .eq('is_active', true)
            .maybeSingle()

        if (error) return null
        return data
    },

    async createStaff(staff: Omit<any, 'id' | 'created_at'>) {
        const payload = { ...staff }
        if (payload.password) {
            payload.password = await hashPassword(payload.password)
        }
        const { error } = await supabase.from('restaurant_staff').insert(payload)
        if (error) throw error
    },

    async updateStaff(staffId: string, updates: Partial<any>) {
        const payload = { ...updates }
        if (payload.password) {
            payload.password = await hashPassword(payload.password)
        }
        const { error } = await supabase
            .from('restaurant_staff')
            .update(payload)
            .eq('id', staffId)
        if (error) throw error
    },

    async deleteStaff(staffId: string) {
        const { error } = await supabase
            .from('restaurant_staff')
            .delete()
            .eq('id', staffId)
        if (error) throw error
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

    // Storage
    _validateUpload(file: File) {
        const MAX_SIZE = 5 * 1024 * 1024 // 5MB
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
        const fileExt = file.name.split('.').pop()
        const fileName = `${crypto.randomUUID()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from('logos')
            .upload(fileName, file)

        if (uploadError) throw uploadError

        const { data } = supabase.storage
            .from('logos')
            .getPublicUrl(fileName)

        return data.publicUrl
    },

    async uploadImage(file: File, bucket: string) {
        this._validateUpload(file)
        const fileExt = file.name.split('.').pop()
        const fileName = `${crypto.randomUUID()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(fileName, file)

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
        const { error } = await supabase.from('categories').insert(category)
        if (error) throw error
    },

    async updateCategory(category: Partial<Category>) {
        const { error } = await supabase
            .from('categories')
            .update(category)
            .eq('id', category.id)
        if (error) throw error
    },

    async deleteCategory(categoryId: string) {
        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', categoryId)
        if (error) throw error
    },

    // Dishes
    async getDishes(restaurantId: string) {
        const { data, error } = await supabase
            .from('dishes')
            .select('id, name, description, price, vat_rate, category_id, restaurant_id, is_active, image_url, created_at, is_available, short_code, exclude_from_all_you_can_eat, is_ayce, allergens')
            .eq('restaurant_id', restaurantId)
        if (error) throw error
        return data.map((d: any) => ({
            ...d,
            excludeFromAllYouCanEat: d.exclude_from_all_you_can_eat
        })) as Dish[]
    },

    async createDish(dish: Partial<Dish>) {
        const payload: any = { ...dish }
        if (dish.excludeFromAllYouCanEat !== undefined) {
            payload.exclude_from_all_you_can_eat = dish.excludeFromAllYouCanEat
        }
        delete payload.excludeFromAllYouCanEat

        const { error } = await supabase.from('dishes').insert(payload)
        if (error) throw error
    },

    async updateDish(dish: Partial<Dish>) {
        const payload: any = { ...dish }
        if (dish.excludeFromAllYouCanEat !== undefined) {
            payload.exclude_from_all_you_can_eat = dish.excludeFromAllYouCanEat
        }
        delete payload.excludeFromAllYouCanEat

        const { error } = await supabase
            .from('dishes')
            .update(payload)
            .eq('id', dish.id)
        if (error) throw error
    },

    async deleteDish(id: string) {
        const { error } = await supabase
            .from('dishes')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // Tables
    async updateSession(session: Partial<TableSession> & { id: string }) {
        const { error } = await supabase
            .from('table_sessions')
            .update(session)
            .eq('id', session.id)

        if (error) throw error
    },

    async getTables(restaurantId: string) {
        const { data, error } = await supabase
            .from('tables')
            .select('id, number, restaurant_id, token, pin, seats, room_id, created_at, is_active, last_assistance_request')
            .eq('restaurant_id', restaurantId)
        if (error) throw error
        return data as Table[]
    },

    async createTable(table: Partial<Table>) {
        const { data, error } = await supabase.from('tables').insert(table).select().single()
        if (error) throw error
        return data as Table
    },

    async updateTable(tableId: string, updates: Partial<Table>) {
        const { error } = await supabase
            .from('tables')
            .update(updates)
            .eq('id', tableId)
        if (error) throw error
    },

    async deleteTable(id: string) {
        const { error } = await supabase
            .from('tables')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // Sessions
    async getActiveSession(tableId: string) {
        const { data, error } = await supabase
            .from('table_sessions')
            .select('id, restaurant_id, table_id, status, opened_at, closed_at, session_pin, customer_count, created_at, coperto, coperto_enabled, ayce_enabled')
            .eq('table_id', tableId)
            .eq('status', 'OPEN')
            .single()

        if (error && error.code !== 'PGRST116') throw error
        return data as TableSession | null
    },

    async createSession(session: Partial<TableSession>) {
        const { data, error } = await supabase
            .from('table_sessions')
            .insert(session)
            .select()
            .single()
        if (error) throw error
        return data as TableSession
    },

    async closeSession(sessionId: string) {
        const { error } = await supabase
            .from('table_sessions')
            .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
            .eq('id', sessionId)
        if (error) throw error
    },

    async markOrdersPaidForSession(sessionId: string) {
        const { error } = await supabase
            .from('orders')
            .update({ status: 'PAID', closed_at: new Date().toISOString() })
            .eq('table_session_id', sessionId)
            .neq('status', 'PAID')
        if (error) throw error
    },

    async cancelSessionOrders(sessionId: string) {
        const { error } = await supabase
            .from('orders')
            .update({ status: 'CANCELLED', closed_at: new Date().toISOString() })
            .eq('table_session_id', sessionId)
            .neq('status', 'PAID') // Don't cancel already paid orders
            .neq('status', 'COMPLETED') // Optional: decide if completed orders should be cancelled. User said "annullarsi", so likely yes if they are still "active" in some way, but usually COMPLETED means served. 
        // However, "Active Orders" usually implies PENDING/IN_PREPARATION/READY/SERVED. 
        // If we "Empty Table", we assume everything is wiped.
        // Let's cancel everything that isn't PAID.
        if (error) throw error
    },

    // Orders
    async getOrders(restaurantId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id,
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
        const { data, error } = await supabase
            .from('orders')
            .select(`
                id, status, total_amount, created_at, closed_at, table_session_id, restaurant_id,
                items:order_items(id, order_id, dish_id, quantity, status, note, course_number,
                    dish:dishes(id, name, price)
                )
            `)
            .eq('restaurant_id', restaurantId)
            .eq('status', 'PAID')
            .order('created_at', { ascending: false })
            .limit(limit)
        if (error) throw error
        return data as unknown as Order[]
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
            .select('id, restaurant_id, table_id, status, opened_at, closed_at, session_pin, customer_count, created_at, coperto, coperto_enabled, ayce_enabled')
            .order('created_at', { ascending: false })
            .limit(1000)
        if (restaurantId) {
            query = query.eq('restaurant_id', restaurantId)
        }
        const { data, error } = await query
        if (error) throw error
        return data as unknown as TableSession[]
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
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert(order)
            .select()
            .single()

        if (orderError) throw orderError
        if (!orderData) throw new Error('Failed to create order')

        const itemsWithOrderId = items.map(item => {
            // Remove price_at_time if present, as it doesn't exist in the DB
            const { price_at_time, ...rest } = item as any
            return {
                ...rest,
                order_id: orderData.id
            }
        })

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(itemsWithOrderId)

        if (itemsError) throw itemsError

        return orderData
    },

    async updateOrder(orderId: string, updates: Partial<Order>) {
        const { error } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', orderId)
        if (error) throw error
    },

    async updateOrderItem(itemId: string, updates: Partial<OrderItem>) {
        const { error } = await supabase
            .from('order_items')
            .update(updates)
            .eq('id', itemId)
        if (error) throw error
    },

    // Bookings
    async getBookings(restaurantId: string) {
        const { data, error } = await supabase
            .from('bookings')
            .select('id, restaurant_id, table_id, name, email, phone, date_time, guests, duration, notes, status, created_at')
            .eq('restaurant_id', restaurantId)
            .order('date_time', { ascending: false })
            .limit(500)
        if (error) throw error
        return data as unknown as Booking[]
    },

    async createBooking(booking: Partial<Booking>) {
        const { data, error } = await supabase
            .from('bookings')
            .insert(booking)
            .select()
            .single()

        if (error) throw error
        return data as Booking
    },

    async updateBooking(booking: Partial<Booking>) {
        const { error } = await supabase
            .from('bookings')
            .update(booking)
            .eq('id', booking.id)
        if (error) throw error
    },

    async deleteBooking(bookingId: string) {
        const { error } = await supabase
            .from('bookings')
            .delete()
            .eq('id', bookingId)
        if (error) throw error
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
            .select('id, restaurant_id, table_id, status, opened_at, closed_at, session_pin, customer_count, created_at, coperto, coperto_enabled, ayce_enabled')
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

    // Stripe
    async createStripeSubscriptionCheckout(restaurantId: string, priceId: string) {
        const { data, error } = await supabase.functions.invoke('stripe-checkout', {
            body: {
                restaurantId,
                priceId,
                successUrl: `${window.location.origin}/dashboard?payment=success`,
                cancelUrl: `${window.location.origin}/dashboard?payment=cancelled`
            }
        });

        if (error) throw error;
        return data; // { sessionId: string, url: string }
    }
}