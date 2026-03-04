export type UserRole = 'ADMIN' | 'OWNER' | 'STAFF' | 'CUSTOMER'
export type RestaurantStaffRole = 'OWNER' | 'STAFF'
export type SessionStatus = 'OPEN' | 'CLOSED'
export type OrderStatus = 'OPEN' | 'PAID' | 'CANCELLED' | 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'delivered'
export type OrderItemStatus = 'PENDING' | 'IN_PREPARATION' | 'READY' | 'SERVED' | 'DELIVERED' | 'pending' | 'preparing' | 'ready' | 'served' | 'delivered' | 'PAID' | 'CANCELLED'

export interface User {
    id: string
    email: string
    name?: string
    username?: string
    password_hash?: string
    raw_password?: string
    role: UserRole
    created_at?: string
    restaurant_id?: string
}

export interface Restaurant {
    id: string
    name: string
    address?: string
    phone?: string
    email?: string
    logo_url?: string
    owner_id: string
    created_at?: string
    cover_image_url?: string
    // Frontend helpers
    isActive?: boolean
    hours?: string
    coverChargePerPerson?: number
    allYouCanEat?: {
        enabled: boolean
        pricePerPerson: number
        maxOrders: number
    }
    // Mapped from DB
    all_you_can_eat?: {
        enabled: boolean
        pricePerPerson: number
        maxOrders: number
    }
    cover_charge_per_person?: number
    waiter_mode_enabled?: boolean
    allow_waiter_payments?: boolean
    enable_reservation_room_selection?: boolean
    enable_public_reservations?: boolean

    waiter_password?: string
    // Schedule Configuration
    lunch_time_start?: string
    lunch_time_end?: string
    dinner_time_start?: string
    dinner_time_end?: string
    enable_course_splitting?: boolean
    reservation_duration?: number
    // Weekly scheduling for Coperto, AYCE, and Service Hours
    weekly_coperto?: WeeklyCopertoSchedule
    weekly_ayce?: WeeklyAyceSchedule
    weekly_service_hours?: WeeklyServiceSchedule
    view_only_menu_enabled?: boolean
    menu_style?: 'elegant' | 'friendly' | 'minimal' | 'bold'
    menu_primary_color?: string
    // Stripe Subscription
    stripe_customer_id?: string
    stripe_subscription_id?: string
    stripe_price_id?: string
    enable_stripe_payments?: boolean
    suspension_reason?: string
    subscription_status?: 'active' | 'past_due' | 'canceled' | 'trialing' | null
    // Stripe Connect (ricevi pagamenti dai clienti)
    stripe_connect_account_id?: string
    stripe_connect_enabled?: boolean
    // Dati fiscali
    vat_number?: string
    billing_name?: string
    billing_city?: string
    billing_address?: string
    billing_cap?: string
    billing_province?: string
    codice_univoco?: string
}

export interface DayMealConfig {
    enabled: boolean
    price: number
}

export interface DaySchedule {
    lunch?: DayMealConfig
    dinner?: DayMealConfig
}

export interface WeeklyCopertoSchedule {
    enabled: boolean
    defaultPrice: number
    useWeeklySchedule: boolean // If false, use defaultPrice always
    schedule: {
        monday?: DaySchedule
        tuesday?: DaySchedule
        wednesday?: DaySchedule
        thursday?: DaySchedule
        friday?: DaySchedule
        saturday?: DaySchedule
        sunday?: DaySchedule
    }
}

export interface WeeklyAyceSchedule {
    enabled: boolean
    defaultPrice: number
    defaultMaxOrders: number
    useWeeklySchedule: boolean
    schedule: {
        monday?: DaySchedule & { maxOrders?: number }
        tuesday?: DaySchedule & { maxOrders?: number }
        wednesday?: DaySchedule & { maxOrders?: number }
        thursday?: DaySchedule & { maxOrders?: number }
        friday?: DaySchedule & { maxOrders?: number }
        saturday?: DaySchedule & { maxOrders?: number }
        sunday?: DaySchedule & { maxOrders?: number }
    }
}

export interface WeeklyServiceSchedule {
    enabled: boolean
    useWeeklySchedule: boolean // If false, fallback to legacy lunch/dinner strings
    schedule: {
        monday?: { lunch?: { enabled: boolean; start: string; end: string }; dinner?: { enabled: boolean; start: string; end: string } }
        tuesday?: { lunch?: { enabled: boolean; start: string; end: string }; dinner?: { enabled: boolean; start: string; end: string } }
        wednesday?: { lunch?: { enabled: boolean; start: string; end: string }; dinner?: { enabled: boolean; start: string; end: string } }
        thursday?: { lunch?: { enabled: boolean; start: string; end: string }; dinner?: { enabled: boolean; start: string; end: string } }
        friday?: { lunch?: { enabled: boolean; start: string; end: string }; dinner?: { enabled: boolean; start: string; end: string } }
        saturday?: { lunch?: { enabled: boolean; start: string; end: string }; dinner?: { enabled: boolean; start: string; end: string } }
        sunday?: { lunch?: { enabled: boolean; start: string; end: string }; dinner?: { enabled: boolean; start: string; end: string } }
    }
}

export interface Category {
    id: string
    name: string
    restaurant_id: string
    order: number
    created_at?: string
}

export interface Dish {
    id: string
    name: string
    description?: string
    price: number
    vat_rate: number
    category_id: string
    restaurant_id: string
    is_active: boolean
    image_url?: string
    created_at?: string
    is_available?: boolean // Added for temporary availability toggle
    short_code?: string // Added for quick search
    excludeFromAllYouCanEat?: boolean
    // Mapped from DB
    exclude_from_all_you_can_eat?: boolean
    is_ayce?: boolean
    allergens?: string[]
}

export interface Table {
    id: string
    number: string
    restaurant_id: string
    token: string
    pin?: string
    seats?: number
    room_id?: string
    created_at?: string
    // Frontend helper properties
    status?: 'available' | 'occupied'
    current_session_id?: string
    is_active?: boolean
    isActive?: boolean // For frontend compatibility
    name?: string // Alias for number
    remainingOrders?: number
    customerCount?: number
    last_assistance_request?: string // TIMESTAMPTZ for call waiter feature
}

export interface TableSession {
    id: string
    restaurant_id: string
    table_id: string
    status: SessionStatus
    opened_at: string
    closed_at?: string
    session_pin?: string
    customer_count?: number
    created_at: string
    coperto?: number
    coperto_enabled?: boolean
    ayce_enabled?: boolean
    receipt_issued?: boolean
}

export interface Room {
    id: string
    restaurant_id: string
    name: string
    is_active: boolean
    order?: number
    created_at?: string
}

export interface Order {
    id: string
    restaurant_id: string
    table_session_id: string
    status: OrderStatus
    total_amount: number
    created_at: string
    updated_at?: string
    closed_at?: string
    payment_method?: 'cash' | 'stripe' | null
    // Frontend helper
    items?: OrderItem[]
    table_id?: string // Helper
}

export interface OrderItem {
    id: string
    order_id: string
    dish_id: string
    quantity: number
    note?: string
    status: OrderItemStatus
    created_at?: string
    course_number?: number // Numero della portata (1 = prima portata, 2 = seconda, ecc.)
    // Frontend helper
    dish?: Dish
}

export interface Booking {
    id: string
    restaurant_id: string
    table_id?: string
    name: string
    email?: string
    phone?: string
    date_time: string
    guests: number
    duration?: number
    notes?: string
    status: string
    created_at?: string
}

export interface CartItem {
    id: string
    session_id: string
    dish_id: string
    quantity: number
    notes?: string
    created_at?: string
    course_number?: number // Numero della portata
    // Frontend helper
    dish?: Dish
}

// Settings per il ristorante (reservation duration, etc.)
export interface RestaurantSettings {
    default_reservation_duration?: number // Durata in minuti (default 120)
}

// Custom Menus System
export type MealType = 'lunch' | 'dinner' | 'all'

export interface CustomMenu {
    id: string
    restaurant_id: string
    name: string
    description?: string
    is_active: boolean
    created_at?: string
    updated_at?: string
}

export interface CustomMenuDish {
    id: string
    custom_menu_id: string
    dish_id: string
    created_at?: string
}

export interface CustomMenuSchedule {
    id: string
    custom_menu_id: string
    day_of_week?: number // 0=Sunday, 1=Monday, ..., 6=Saturday, null=any day
    meal_type: MealType
    start_time?: string
    end_time?: string
    is_active: boolean
    created_at?: string
}

export interface RestaurantStaff {
    id: string
    restaurant_id: string
    name: string
    username: string
    password?: string // Omitted in frontend queries usually, but needed for creation
    is_active: boolean
    created_at?: string
}

export interface SubscriptionPayment {
    id: string
    restaurant_id: string
    stripe_payment_intent_id?: string
    stripe_invoice_id?: string
    amount: number
    currency: string
    status: 'pending' | 'paid' | 'failed' | 'refunded'
    period_start?: string
    period_end?: string
    created_at?: string
}

export interface RestaurantBonus {
    id: string
    restaurant_id: string
    free_months: number
    reason?: string
    granted_by?: string
    granted_at?: string
    expires_at?: string
    is_active: boolean
    created_at?: string
}

export type WaiterActionType = 'DISH_DELIVERED' | 'BELL_RESOLVED'

export interface WaiterActivityLog {
    id: string
    restaurant_id: string
    waiter_id: string
    action_type: WaiterActionType
    details?: any
    created_at?: string
}
