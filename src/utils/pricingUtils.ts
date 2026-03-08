import type { Restaurant, WeeklyCopertoSchedule, WeeklyAyceSchedule, DaySchedule } from '@/services/types'

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
type DayKey = typeof DAY_KEYS[number]

/**
 * Determines the current meal period based on time
 */
function getCurrentMealPeriod(lunchStart: string, dinnerStart: string): 'lunch' | 'dinner' | null {
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const [lunchH, lunchM] = lunchStart.split(':').map(Number)
    const [dinnerH, dinnerM] = dinnerStart.split(':').map(Number)

    const lunchStartMinutes = lunchH * 60 + lunchM
    const dinnerStartMinutes = dinnerH * 60 + dinnerM

    // Assume lunch ends at dinner start, dinner ends at midnight or next day
    if (currentMinutes >= lunchStartMinutes && currentMinutes < dinnerStartMinutes) {
        return 'lunch'
    } else if (currentMinutes >= dinnerStartMinutes) {
        return 'dinner'
    }

    return null // Before lunch time
}

/**
 * Get current day key
 */
function getCurrentDayKey(): DayKey {
    const dayIndex = new Date().getDay() // 0 = Sunday
    return DAY_KEYS[dayIndex]
}

/**
 * Get current Coperto price based on day and meal
 */
export function getCurrentCopertoPrice(
    restaurant: Restaurant,
    lunchStart: string = '12:00',
    dinnerStart: string = '19:00'
): { enabled: boolean; price: number } {
    const schedule = restaurant.weekly_coperto

    // If no schedule configured, fall back to legacy cover_charge_per_person
    if (!schedule) {
        const legacyPrice = restaurant.cover_charge_per_person || 0
        return { enabled: legacyPrice > 0, price: legacyPrice }
    }

    // If globally disabled
    if (!schedule.enabled) {
        return { enabled: false, price: 0 }
    }

    // If not using weekly schedule, return default
    if (!schedule.useWeeklySchedule) {
        return { enabled: true, price: schedule.defaultPrice }
    }

    // Get current day and meal
    const dayKey = getCurrentDayKey()
    const mealPeriod = getCurrentMealPeriod(lunchStart, dinnerStart)

    if (!mealPeriod) {
        // Before service hours - use default
        return { enabled: true, price: schedule.defaultPrice }
    }

    const daySchedule = schedule.schedule[dayKey as keyof typeof schedule.schedule]
    if (!daySchedule) {
        return { enabled: true, price: schedule.defaultPrice }
    }

    const mealConfig = daySchedule[mealPeriod]
    if (!mealConfig) {
        return { enabled: true, price: schedule.defaultPrice }
    }

    return { enabled: mealConfig.enabled, price: mealConfig.price }
}

/**
 * Get current AYCE settings based on day and meal
 */
export function getCurrentAyceSettings(
    restaurant: Restaurant,
    lunchStart: string = '12:00',
    dinnerStart: string = '19:00'
): { enabled: boolean; price: number; maxOrders: number } {
    const schedule = restaurant.weekly_ayce

    // If no schedule configured, fall back to legacy all_you_can_eat
    if (!schedule) {
        const legacy = restaurant.all_you_can_eat
        if (!legacy || typeof legacy === 'boolean') {
            return { enabled: !!legacy, price: 0, maxOrders: 0 }
        }
        return {
            enabled: legacy.enabled,
            price: legacy.pricePerPerson || 0,
            maxOrders: legacy.maxOrders || 0
        }
    }

    // If globally disabled
    if (!schedule.enabled) {
        return { enabled: false, price: 0, maxOrders: 0 }
    }

    // If not using weekly schedule, return defaults
    if (!schedule.useWeeklySchedule) {
        return {
            enabled: true,
            price: schedule.defaultPrice,
            maxOrders: schedule.defaultMaxOrders
        }
    }

    // Get current day and meal
    const dayKey = getCurrentDayKey()
    const mealPeriod = getCurrentMealPeriod(lunchStart, dinnerStart)

    if (!mealPeriod) {
        return {
            enabled: true,
            price: schedule.defaultPrice,
            maxOrders: schedule.defaultMaxOrders
        }
    }

    const daySchedule = schedule.schedule[dayKey as keyof typeof schedule.schedule]
    if (!daySchedule) {
        return {
            enabled: true,
            price: schedule.defaultPrice,
            maxOrders: schedule.defaultMaxOrders
        }
    }

    const mealConfig = daySchedule[mealPeriod]
    if (!mealConfig) {
        return {
            enabled: true,
            price: schedule.defaultPrice,
            maxOrders: schedule.defaultMaxOrders
        }
    }

    return {
        enabled: mealConfig.enabled,
        price: mealConfig.price,
        maxOrders: (daySchedule as any).maxOrders ?? schedule.defaultMaxOrders
    }
}

/**
 * Create default Coperto schedule
 */
export function createDefaultCopertoSchedule(price: number = 2): WeeklyCopertoSchedule {
    return {
        enabled: price > 0,
        defaultPrice: price,
        useWeeklySchedule: false,
        schedule: {}
    }
}

/**
 * Create default AYCE schedule
 */
export function createDefaultAyceSchedule(price: number = 0, maxOrders: number = 0): WeeklyAyceSchedule {
    return {
        enabled: false,
        defaultPrice: price,
        defaultMaxOrders: maxOrders,
        defaultOrderInterval: 0,
        useWeeklySchedule: false,
        schedule: {}
    }
}
