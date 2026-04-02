import { DatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'
import { Category, Dish, Table, Room, TableSession, Order, OrderItem, Booking } from './types'
import { subDays, addDays, setHours, setMinutes } from 'date-fns'

export const populateRestaurantData = async (restaurantId: string) => {

    // 1. Create Rooms
    const roomsData = [
        { name: 'Sala Interna', order: 1 },
        { name: 'Terrazza Vista Mare', order: 2 }
    ]
    const createdRooms: Room[] = []
    for (const r of roomsData) {
        const id = uuidv4()
        const room: Room = { id, restaurant_id: restaurantId, name: r.name, is_active: true, order: r.order }
        await DatabaseService.createRoom(room)
        createdRooms.push(room)
    }

    // 2. Create Categories
    const categoriesData = [
        { name: 'Antipasti', order: 1 },
        { name: 'Primi Piatti', order: 2 },
        { name: 'Secondi di Carne', order: 3 },
        { name: 'Secondi di Pesce', order: 4 },
        { name: 'Pizze Gourmet', order: 5 },
        { name: 'Dolci Artigianali', order: 6 },
        { name: 'Cantina & Bevande', order: 7 }
    ]
    const createdCategories: Record<string, string> = {}
    for (const cat of categoriesData) {
        const id = uuidv4()
        await DatabaseService.createCategory({ id, name: cat.name, restaurant_id: restaurantId, order: cat.order })
        createdCategories[cat.name] = id
    }

    // 3. Create Tables
    const createdTables: Table[] = []
    // Room 1: 15 tables
    for (let i = 1; i <= 15; i++) {
        const table = await DatabaseService.createTable({
            id: uuidv4(),
            number: `${i}`,
            restaurant_id: restaurantId,
            room_id: createdRooms[0].id,
            seats: i % 2 === 0 ? 4 : 2,
            token: uuidv4(),
            pin: Math.floor(1000 + Math.random() * 9000).toString()
        })
        createdTables.push(table)
    }
    // Room 2: 10 tables
    for (let i = 16; i <= 25; i++) {
        const table = await DatabaseService.createTable({
            id: uuidv4(),
            number: `${i}`,
            restaurant_id: restaurantId,
            room_id: createdRooms[1].id,
            seats: 4,
            token: uuidv4(),
            pin: Math.floor(1000 + Math.random() * 9000).toString()
        })
        createdTables.push(table)
    }

    // 4. Create Dishes (Extended)
    const reliableImages = [
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
        'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80',
        'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&q=80',
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80',
        'https://images.unsplash.com/photo-1482049142915-d912423377dc?w=600&q=80',
        'https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?w=600&q=80',
        'https://images.unsplash.com/photo-1414235077428-33898bd12284?w=600&q=80',
        'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=600&q=80',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80',
        'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=600&q=80'
    ]

    const dishesRaw = [
        { name: 'Tagliere Imperiale', price: 18, cat: 'Antipasti' },
        { name: 'Tartare di Tonno', price: 16, cat: 'Antipasti' },
        { name: 'Fiori di Zucca', price: 10, cat: 'Antipasti' },
        { name: 'Spaghetti alle Vongole', price: 15, cat: 'Primi Piatti' },
        { name: 'Paccheri al Ragu di Polpo', price: 16, cat: 'Primi Piatti' },
        { name: 'Carbonara Tartufata', price: 14, cat: 'Primi Piatti' },
        { name: 'Gnocchi alla Sorrentina', price: 12, cat: 'Primi Piatti' },
        { name: 'Filetto al Pepe Verde', price: 24, cat: 'Secondi di Carne' },
        { name: 'Tagliata con Porcini', price: 22, cat: 'Secondi di Carne' },
        { name: 'Grigliata Mista di Pesce', price: 28, cat: 'Secondi di Pesce' },
        { name: 'Frittura di Paranza', price: 18, cat: 'Secondi di Pesce' },
        { name: 'Margherita DOP', price: 8, cat: 'Pizze Gourmet' },
        { name: 'Pistacchiosa', price: 14, cat: 'Pizze Gourmet' },
        { name: 'Diavola Special', price: 10, cat: 'Pizze Gourmet' },
        { name: 'Tiramisù della Casa', price: 7, cat: 'Dolci Artigianali' },
        { name: 'Cheesecake Frutti di Bosco', price: 7, cat: 'Dolci Artigianali' },
        { name: 'Cannolo Scomposto', price: 6, cat: 'Dolci Artigianali' },
        { name: 'Vino Rosso - Calice', price: 6, cat: 'Cantina & Bevande' },
        { name: 'Birra Artigianale 0.5L', price: 7, cat: 'Cantina & Bevande' },
        { name: 'Acqua Minerale 0.75L', price: 3, cat: 'Cantina & Bevande' }
    ].map((d, i) => ({ ...d, img: reliableImages[i % reliableImages.length] }))
    const createdDishes: Dish[] = []
    for (const d of dishesRaw) {
        const dish: Dish = {
            id: uuidv4(),
            restaurant_id: restaurantId,
            category_id: createdCategories[d.cat],
            name: d.name,
            price: d.price,
            vat_rate: 10,
            is_active: true,
            image_url: (d as any).img
        }
        await DatabaseService.createDish(dish)
        createdDishes.push(dish)
    }

    // 5. Create Historical Data (50 Orders)
    for (let i = 0; i < 50; i++) {
        const randomTable = createdTables[Math.floor(Math.random() * createdTables.length)]
        const randomDate = subDays(new Date(), Math.floor(Math.random() * 30))
        randomDate.setHours(12 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60))

        const session = await DatabaseService.createSession({
            id: uuidv4(),
            restaurant_id: restaurantId,
            table_id: randomTable.id,
            status: 'CLOSED',
            opened_at: randomDate.toISOString(),
            closed_at: randomDate.toISOString(), // Same day for historical
            customer_count: 2 + Math.floor(Math.random() * 4)
        })

        const orderItemsCount = 2 + Math.floor(Math.random() * 5)
        let total = 0
        const itemsToInsert: Partial<OrderItem>[] = []
        for (let j = 0; j < orderItemsCount; j++) {
            const dish = createdDishes[Math.floor(Math.random() * createdDishes.length)]
            total += dish.price
            itemsToInsert.push({
                id: uuidv4(),
                dish_id: dish.id,
                quantity: 1,
                status: 'SERVED',
                created_at: randomDate.toISOString()
            })
        }

        await DatabaseService.createOrder({
            id: uuidv4(),
            restaurant_id: restaurantId,
            table_session_id: session.id,
            status: 'PAID',
            total_amount: total,
            created_at: randomDate.toISOString()
        }, itemsToInsert)
    }

    // 6. Create Active Data (5 Sessions)
    for (let i = 0; i < 5; i++) {
        const table = createdTables[i] // Use first few tables
        const session = await DatabaseService.createSession({
            id: uuidv4(),
            restaurant_id: restaurantId,
            table_id: table.id,
            status: 'OPEN',
            opened_at: new Date().toISOString(),
            customer_count: 2
        })
        const dish = createdDishes[Math.floor(Math.random() * createdDishes.length)]
        await DatabaseService.createOrder({
            id: uuidv4(),
            restaurant_id: restaurantId,
            table_session_id: session.id,
            status: 'OPEN',
            total_amount: dish.price,
            created_at: new Date().toISOString()
        }, [{ id: uuidv4(), dish_id: dish.id, quantity: 1, status: 'PENDING' }])
    }

    // 7. Create Bookings (20)
    const names = ['Marco Rossi', 'Giulia Bianchi', 'Luca Verdi', 'Elena Neri', 'Alessandro Fonti', 'Chiara Gallo', 'Roberto Esposito', 'Anna Romano']
    for (let i = 0; i < 20; i++) {
        const offset = Math.floor(Math.random() * 5) - 2 // -2 to +2 days
        const date = addDays(new Date(), offset)
        date.setHours(19 + (i % 3), (i % 4) * 15)

        await DatabaseService.createBooking({
            id: uuidv4(),
            restaurant_id: restaurantId,
            name: names[i % names.length],
            phone: '3331234567',
            guests: 2 + (i % 6),
            date_time: date.toISOString(),
            status: 'CONFIRMED',
            notes: i % 5 === 0 ? 'Tavolo vicino alla finestra' : undefined
        })
    }

}
