import { useEffect } from 'react'
import { DatabaseService } from './DatabaseService'
import { User, Restaurant, Category, Dish, Table } from './types'
import { v4 as uuidv4 } from 'uuid'

export function DataInitializer() {
    useEffect(() => {
        const initializeData = async () => {
            try {

                // 1. Check/Create Admin User FIRST (needed for restaurant owner_id)
                let adminUserId: string
                const users = await DatabaseService.getUsers()
                const existingAdmin = users?.find(u => u.role === 'ADMIN' || u.email === 'admin@example.com')

                if (existingAdmin) {
                    adminUserId = existingAdmin.id

                    // Admin exists, do not force reset credentials.
                    // This allows the user to change their password/name without it being reverted.
                } else {
                    adminUserId = uuidv4()
                    const adminUser: User = {
                        id: adminUserId,
                        email: 'admin@example.com',
                        name: 'Admin',
                        password_hash: 'admin123',
                        role: 'ADMIN',
                        created_at: new Date().toISOString()
                    }
                    try {
                        await DatabaseService.createUser(adminUser)
                    } catch (e) {
                        console.error('Error creating admin user', e)
                        const retryUsers = await DatabaseService.getUsers()
                        const retryAdmin = retryUsers?.find(u => u.role === 'ADMIN')
                        if (retryAdmin) adminUserId = retryAdmin.id
                        else return
                    }
                }

                // 2. Check/Create Restaurant (linked to Admin)
                let restaurantId: string
                const restaurants = await DatabaseService.getRestaurants()

                if (restaurants && restaurants.length > 0) {
                    restaurantId = restaurants[0].id
                } else {
                    restaurantId = uuidv4()
                    const restaurant: Restaurant = {
                        id: restaurantId,
                        name: 'Il Mio Ristorante',
                        address: 'Via Roma 123',
                        owner_id: adminUserId, // Link to valid user
                        created_at: new Date().toISOString()
                    }
                    try {
                        await DatabaseService.createRestaurant(restaurant)
                    } catch (e) {
                        console.error('Error creating restaurant', e)
                        return
                    }
                }

                // 3. Check/Create Categories
                const categories = await DatabaseService.getCategories(restaurantId)
                let categoryId: string

                if (categories && categories.length > 0) {
                    categoryId = categories[0].id
                } else {
                    categoryId = uuidv4()
                    await DatabaseService.createCategory({
                        id: categoryId,
                        name: 'Antipasti',
                        restaurant_id: restaurantId,
                        order: 1
                    })
                }

                // 4. Check/Create Dishes
                const dishes = await DatabaseService.getDishes(restaurantId)
                if (!dishes || dishes.length === 0) {
                    await DatabaseService.createDish({
                        id: uuidv4(),
                        name: 'Bruschetta Classica',
                        description: 'Pane tostato con pomodoro fresco, basilico e olio EVO',
                        price: 6.00,
                        vat_rate: 10,
                        category_id: categoryId,
                        restaurant_id: restaurantId,
                        is_active: true,
                        image_url: 'https://images.unsplash.com/photo-1572695157363-bc31c5d53162?auto=format&fit=crop&w=800&q=80'
                    })
                }

                // 5. Check/Create Tables
                const tables = await DatabaseService.getTables(restaurantId)
                if (!tables || tables.length === 0) {
                    await DatabaseService.createTable({
                        id: uuidv4(),
                        number: 'Tavolo 1',
                        restaurant_id: restaurantId,
                        token: uuidv4(),
                        pin: '1234'
                    })
                }


                // Only reload if we actually created something new (simple heuristic: if we reached here without error)
                // But to avoid loops, maybe don't reload automatically, or check a flag.
                // For now, let's remove the                // Reload removed to prevent infinite loops
                // 

            } catch (error) {
                console.error('Error initializing data:', error)
            }
        }

        initializeData()
    }, [])

    return null
}
