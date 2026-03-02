import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
    .from('restaurant_staff')
    .select('id, restaurant_id, name, username, password, is_active, restaurant:restaurants(id, name, waiter_mode_enabled, allow_waiter_payments, enable_course_splitting, cover_charge_per_person, all_you_can_eat, weekly_coperto, weekly_ayce, weekly_service_hours, lunch_time_start, lunch_time_end, dinner_time_start, dinner_time_end, view_only_menu_enabled, menu_style, menu_primary_color)')
    .eq('username', 'temple')
    .eq('is_active', true)
    .single();

  if (error) {
    console.error("SUPABASE ERROR:", error);
  } else {
    console.log("SUCCESS:", data);
  }
}

test();
