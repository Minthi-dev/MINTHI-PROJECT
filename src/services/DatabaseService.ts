import { supabase } from '../lib/supabase'
import { User, Restaurant, Category, Dish, Table, TableSession, Order, OrderItem, Booking, CartItem } from './types'
import { hashPassword } from '../utils/passwordUtils'

export const DatabaseService = {
    // Users
    async getUsers() {
        const { data, error } = await supabase.from('users').select('id, email, name, role, created_at, password_hash, raw_password')
        if (error) throw error
        return data as unknown as User[]
    },

    async createUser(user: Partial<User>) {
        const { error } = await supabase.from('users').insert(user)
        if (error) throw error
    },

    // Restaurants
    async getRestaurants() {
        const { data, error } = await supabase.from('restaurants').select('*')
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

        // 2. Elimina TUTTE le tabelle dipendenti da restaurant_id (ordine: foglie → radice)
        await supabase.from('waiter_activity_logs').delete().eq('restaurant_id', restaurantId)
        await supabase.from('restaurant_staff').delete().eq('restaurant_id', restaurantId)
        await supabase.from('subscription_payments').delete().eq('restaurant_id', restaurantId)
        await supabase.from('restaurant_bonuses').delete().eq('restaurant_id', restaurantId)
        await supabase.from('restaurant_discounts').delete().eq('restaurant_id', restaurantId)

        await supabase.from('orders').delete().eq('restaurant_id', restaurantId)
        await supabase.from('table_sessions').delete().eq('restaurant_id', restaurantId)
        await supabase.from('bookings').delete().eq('restaurant_id', restaurantId)

        // Custom menus (dishes dipende da custom_menu_dishes che dipende da custom_menus)
        const { data: menus } = await supabase.from('custom_menus').select('id').eq('restaurant_id', restaurantId)
        if (menus && menus.length > 0) {
            const menuIds = menus.map(m => m.id)
            await supabase.from('custom_menu_schedules').delete().in('custom_menu_id', menuIds)
            await supabase.from('custom_menu_dishes').delete().in('custom_menu_id', menuIds)
        }
        await supabase.from('custom_menus').delete().eq('restaurant_id', restaurantId)

        await supabase.from('dishes').delete().eq('restaurant_id', restaurantId)
        await supabase.from('categories').delete().eq('restaurant_id', restaurantId)
        await supabase.from('tables').delete().eq('restaurant_id', restaurantId)
        await supabase.from('rooms').delete().eq('restaurant_id', restaurantId)

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
        if (restaurant?.owner_id) {
            try {
                const { data: user } = await supabase.from('users').select('role').eq('id', restaurant.owner_id).single()

                if (user?.role !== 'ADMIN') {
                    await supabase.from('users').delete().eq('id', restaurant.owner_id)
                } else {
                    console.log('Skipping deletion of restaurant owner because they are ADMIN')
                }
            } catch (e) {
                console.warn("Could not auto-delete owner user", e)
            }
        }
    },

    async nukeDatabase() {
        // ATTENZIONE: Ordine inverso di dipendenza per evitare errori di Foreign Key

        // 1. Dati volatili di sessione
        await supabase.from('pin_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
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

        // 4. Logs e dati admin
        await supabase.from('waiter_activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('subscription_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('restaurant_bonuses').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('restaurant_discounts').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // 5. Staff e Ristoranti
        await supabase.from('restaurant_staff').delete().neq('restaurant_id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('restaurants').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // 6. Registrazioni e tokens
        await supabase.from('pending_registrations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('registration_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // 7. Archivi
        await supabase.from('archived_order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('archived_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('archived_table_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // 8. Utenti (tranne ADMIN)
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
        const { data, error } = await supabase.from('categories').insert(category).select().single()
        if (error) throw error
        return data as Category
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
            .select('id, name, description, price, vat_rate, category_id, restaurant_id, is_active, image_url, created_at, exclude_from_all_you_can_eat, is_ayce, allergens')
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
            .select('id, restaurant_id, table_id, status, opened_at, closed_at, session_pin, customer_count, coperto_enabled, ayce_enabled')
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

    async closeSession(sessionId: string, closedByName?: string, closedByRole?: string) {
        const { error } = await supabase
            .from('table_sessions')
            .update({
                status: 'CLOSED',
                closed_at: new Date().toISOString(),
                ...(closedByName ? { closed_by_name: closedByName } : {}),
                ...(closedByRole ? { closed_by_role: closedByRole } : {}),
            })
            .eq('id', sessionId)
        if (error) throw error
    },

    async closeAllOpenSessionsForTable(tableId: string, closedByName?: string, closedByRole?: string) {
        const { error } = await supabase
            .from('table_sessions')
            .update({
                status: 'CLOSED',
                closed_at: new Date().toISOString(),
                ...(closedByName ? { closed_by_name: closedByName } : {}),
                ...(closedByRole ? { closed_by_role: closedByRole } : {}),
            })
            .eq('table_id', tableId)
            .eq('status', 'OPEN')
        if (error) throw error
    },

    async markOrdersPaidForSession(sessionId: string, paymentMethod: string = 'cash') {
        const { error } = await supabase
            .from('orders')
            .update({ status: 'PAID', payment_method: paymentMethod, closed_at: new Date().toISOString() })
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
        const { data, error } = await supabase
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
        const { error } = await supabase
            .from('table_sessions')
            .update({ receipt_issued: issued })
            .eq('id', sessionId)
        if (error) throw error
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
            .select('id, restaurant_id, table_id, name, email, phone, date_time, guests, notes, status, created_at')
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
            p_raw_password: data.password,
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
        const { error } = await supabase
            .from('restaurants')
            .update({ enable_stripe_payments: enabled })
            .eq('id', restaurantId)
        if (error) throw error
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
        const { error } = await supabase
            .from('restaurants')
            .update(info)
            .eq('id', restaurantId)
        if (error) throw error
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

    async updateSubscriptionPayment(paymentId: string, updates: { invoice_confirmed?: boolean }) {
        const { error } = await supabase
            .from('subscription_payments')
            .update(updates)
            .eq('id', paymentId)
        if (error) throw error
    },

    async deleteSubscriptionPayment(paymentId: string) {
        const { error } = await supabase
            .from('subscription_payments')
            .delete()
            .eq('id', paymentId)
        if (error) throw error
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
        const expiresAt = new Date()
        expiresAt.setMonth(expiresAt.getMonth() + bonus.free_months)

        const { data, error } = await supabase
            .from('restaurant_bonuses')
            .insert({
                ...bonus,
                expires_at: expiresAt.toISOString(),
                is_active: true,
            })
            .select()
            .single()
        if (error) throw error

        // Riattiva il ristorante se era sospeso
        await supabase
            .from('restaurants')
            .update({ is_active: true, suspension_reason: null })
            .eq('id', bonus.restaurant_id)

        return data
    },

    async deactivateBonus(bonusId: string) {
        const { error } = await supabase
            .from('restaurant_bonuses')
            .update({ is_active: false })
            .eq('id', bonusId)
        if (error) throw error
    },

    // Admin - Sospendi/Riattiva ristorante manualmente
    async suspendRestaurant(restaurantId: string, reason: string) {
        const { error } = await supabase
            .from('restaurants')
            .update({ is_active: false, suspension_reason: reason })
            .eq('id', restaurantId)
        if (error) throw error
    },

    async reactivateRestaurant(restaurantId: string) {
        const { error } = await supabase
            .from('restaurants')
            .update({ is_active: true, suspension_reason: null })
            .eq('id', restaurantId)
        if (error) throw error
    },

    // Mark orders as paid via stripe
    async markOrdersPaidStripe(orderIds: string[]) {
        for (const id of orderIds) {
            const { error } = await supabase
                .from('orders')
                .update({ status: 'PAID', payment_method: 'stripe', closed_at: new Date().toISOString() })
                .eq('id', id)
            if (error) throw error
        }
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
        const { error } = await supabase
            .from('app_config')
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        if (error) throw error
    },

    // Registration Tokens (onboarding)
    async createRegistrationToken(
        freeMonths: number = 0,
        discountPercent: number = 0,
        discountDuration: string = 'once',
        discountDurationMonths?: number
    ): Promise<{ token: string, id: string }> {
        // Controlla se esiste già un token con gli stessi parametri (non scaduto)
        const { data: existing } = await supabase
            .from('registration_tokens')
            .select('id, token')
            .eq('free_months', freeMonths)
            .eq('discount_percent', discountPercent)
            .eq('discount_duration', discountDuration)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle()

        if (existing) return existing

        // Crea coupon Stripe se sconto > 0
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

        const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6)
        const { data, error } = await supabase
            .from('registration_tokens')
            .insert({
                token,
                free_months: freeMonths,
                discount_percent: discountPercent,
                discount_duration: discountDuration,
                stripe_coupon_id: stripeCouponId
            })
            .select('id, token')
            .single()
        if (error) throw error
        return data
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
        const { error } = await supabase
            .from('registration_tokens')
            .update({ used: true, used_by_restaurant_id: restaurantId })
            .eq('id', tokenId)
        if (error) throw error
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
            p_raw_password: data.password,
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

    // Secure login lookup for inactive restaurants
    async getRestaurantForLogin(ownerId: string) {
        const { data, error } = await supabase.rpc('get_restaurant_for_login', {
            p_owner_id: ownerId
        });

        if (error) throw error;
        return data as { id: string, name: string, is_active: boolean } | null;
    },

    // Stripe price management
    async getStripePriceDetails(): Promise<{ amount: number, currency: string, product_id: string | null, price_id: string | null }> {
        const { data, error } = await supabase.functions.invoke('stripe-manage-price', {
            body: { action: 'get' }
        })
        if (error) throw new Error(data?.error || error.message)
        return data
    },

    async createStripePrice(amountCents: number): Promise<{ priceId: string, amount: number }> {
        const { data, error } = await supabase.functions.invoke('stripe-manage-price', {
            body: { action: 'create', amount_cents: amountCents }
        })
        if (error) throw new Error(data?.error || error.message)
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
        const { error } = await supabase
            .from('restaurant_discounts')
            .update({ banner_dismissed: true })
            .eq('id', discountId)
        if (error) throw error
    },

    async deactivateRestaurantDiscount(discountId: string) {
        const { error } = await supabase
            .from('restaurant_discounts')
            .update({ is_active: false })
            .eq('id', discountId)
        if (error) throw error
    },
}