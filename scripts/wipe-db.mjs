import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY'

if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey === 'YOUR_SERVICE_ROLE_KEY') {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
})

// Tables ordered to respect foreign keys (leaves to root)
const tablesToWipe = [
    // 1. Dati volatili
    'pin_attempts',
    'cart_items',
    'order_items',
    'orders',
    'table_sessions',
    'bookings',
    // 2. Menu personalizzati
    'custom_menu_schedules',
    'custom_menu_dishes',
    'custom_menus',
    // 3. Struttura menu e locale
    'dishes',
    'categories',
    'tables',
    'rooms',
    // 4. Logs e admin
    'waiter_activity_logs',
    'subscription_payments',
    'restaurant_bonuses',
    'restaurant_discounts',
    // 5. Staff e ristoranti
    'restaurant_staff',
    'restaurants',
    // 6. Registrazioni
    'pending_registrations',
    'registration_tokens',
    // 7. Archivi
    'archived_order_items',
    'archived_orders',
    'archived_table_sessions',
    // 8. Utenti (tranne admin, gestito separatamente)
    'users',
];

async function wipeDatabase() {
    console.log("🧹 Starting database wipe...\n");
    for (const table of tablesToWipe) {
        console.log(`Deleting data from ${table}...`);
        
        let query;
        if (table === 'users') {
            // Mantieni l'utente ADMIN
            query = supabase.from(table).delete().neq('role', 'ADMIN');
        } else if (table === 'restaurant_staff') {
            query = supabase.from(table).delete().neq('restaurant_id', '00000000-0000-0000-0000-000000000000');
        } else {
            query = supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }

        const { error } = await query;
        if (error) {
            console.error(`❌ Failed to clear ${table}:`, error.message);
        } else {
            console.log(`✅ Cleared ${table}`);
        }
    }
    console.log("\n🎉 Database wiped successfully!");
}

wipeDatabase();
