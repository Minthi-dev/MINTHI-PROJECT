import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

// We need the service role key to bypass RLS easily in a script
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY'

// Re-run the script like this:
// VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=y SUPABASE_SERVICE_ROLE_KEY=z node scripts/seed-dishes.mjs <RESTAURANT_ID>

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
})

const DEFAULT_DISHES = [
    {
        name: 'Spaghetti alla Carbonara',
        description: 'La vera ricetta romana con guanciale croccante, pecorino romano DOP, tuorlo d\'uovo e pepe nero.',
        price: 14.50,
        vat_rate: 10,
        image_url: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?q=80&w=800&auto=format&fit=crop',
        category: 'Primi Piatti',
        allergens: ['Uova', 'Latte', 'Glutine']
    },
    {
        name: 'Pizza Margherita Verace',
        description: 'Impasto a lunga lievitazione, pomodoro San Marzano DOP, mozzarella di bufala campana e basilico fresco.',
        price: 9.00,
        vat_rate: 10,
        image_url: 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?q=80&w=800&auto=format&fit=crop',
        category: 'Pizze',
        allergens: ['Latte', 'Glutine']
    },
    {
        name: 'Tagliata di Manzo',
        description: 'Tagliata di scottona servita su letto di rucola, pomodorini ciliegino e scaglie di Grana Padano DOP con glassa aceto balsamico.',
        price: 22.00,
        vat_rate: 10,
        image_url: 'https://images.unsplash.com/photo-1544025162-8e100fb6d44a?q=80&w=800&auto=format&fit=crop',
        category: 'Secondi Piatti',
        allergens: ['Latte']
    },
    {
        name: 'Tiramisù Classico',
        description: 'Savoiardi inzuppati nel caffè espresso, crema al mascarpone morbida e spolverata di cacao amaro.',
        price: 6.50,
        vat_rate: 10,
        image_url: 'https://images.unsplash.com/photo-1571115177098-24deebfe7e48?q=80&w=800&auto=format&fit=crop',
        category: 'Dolci',
        allergens: ['Uova', 'Latte', 'Glutine']
    },
    {
        name: 'Spritz Aperol',
        description: 'Aperol, Prosecco, Soda e fettina d\'arancia. L\'aperitivo italiano per eccellenza.',
        price: 7.00,
        vat_rate: 22,
        image_url: 'https://images.unsplash.com/photo-1560512823-829485b8bf24?q=80&w=800&auto=format&fit=crop',
        category: 'Bevande',
        allergens: ['Solfiti']
    }
]

async function seed() {
    const restaurantId = process.argv[2]

    if (!restaurantId || restaurantId.length < 10) {
        console.error('Usage: node scripts/seed-dishes.mjs <RESTAURANT_ID>')
        process.exit(1)
    }

    console.log(`\n🍝 Seeding dishes for restaurant: ${restaurantId}...\n`)

    for (const item of DEFAULT_DISHES) {
        // Find or create category
        let { data: catData, error: catErr } = await supabase
            .from('categories')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .ilike('name', item.category)
            .maybeSingle()

        if (catErr) {
            console.error('Error fetching category:', catErr)
            continue
        }

        let categoryId = catData?.id
        console.log(`🔍 Category [${item.category}] -> ID: ${categoryId || 'NOT FOUND'}`)

        if (!categoryId) {
            console.log(`➕ Creating category [${item.category}]...`)
            const { data: newCat, error: newCatErr } = await supabase
                .from('categories')
                .insert({
                    restaurant_id: restaurantId,
                    name: item.category,
                    sort_order: 0
                })
                .select('id')
                .single()

            if (newCatErr) {
                console.error('Error creating category:', newCatErr)
                continue
            }
            categoryId = newCat.id
            console.log(`✅ Category [${item.category}] created: ${categoryId}`)
        }

        // Create Dish
        console.log(`🍕 Inserting dish: ${item.name}...`)
        const { error: dishErr } = await supabase
            .from('dishes')
            .insert({
                restaurant_id: restaurantId,
                category_id: categoryId,
                name: item.name,
                description: item.description,
                price: item.price,
                vat_rate: item.vat_rate,
                image_url: item.image_url,
                allergens: item.allergens,
                is_active: true
            })

        if (dishErr) {
            console.error(`❌ Error inserting dish ${item.name}:`, dishErr)
        } else {
            console.log(`✅ Dish ${item.name} inserted!`)
        }
    }

    console.log('\n🎉 Seeding complete!\n')
    process.exit(0)
}

seed()
