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
    'order_items',
    'orders',
    'cart_items',
    'dishes',
    'categories',
    'custom_menus',
    'table_sessions',
    'bookings',
    'tables',
    'rooms',
    'restaurant_bonuses',
    'waiter_activity_logs',
    'restaurant_staff',
    'restaurants',
    'registration_tokens',
    'users'
];

async function wipeDatabase() {
    console.log("🧹 Starting database wipe...\n");
    for (const table of tablesToWipe) {
        console.log(`Deleting data from ${table}...`);
        const { error } = await supabase
            .from(table)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

        // Some tables might not have 'id' column or might fail if empty, let's catch it softly just in case
        if (error) {
            console.error(`❌ Failed to clear ${table}:`, error.message);
        } else {
            console.log(`✅ Cleared ${table}`);
        }
    }
    console.log("\n🎉 Database wiped successfully!");
}

wipeDatabase();
