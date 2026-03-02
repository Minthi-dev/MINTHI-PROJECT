import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bueovvvrgpwdcpkyocac.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1ZW92dnZyZ3B3ZGNwa3lvY2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDU1MjQsImV4cCI6MjA4ODAyMTUyNH0.lHW63WZhs9tT8q6AkvV_YqNJ3vmJyaqocKqZO4pJomE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  // 1. Check what the admin user looks like in DB
  const { data: users } = await supabase.from('users').select('id, name, username, email, role')
  console.log('Users in DB:', JSON.stringify(users, null, 2))

  // 2. Try calling the RPC with name
  console.log('\n--- Testing RPC with name "admin.minthi" ---')
  const { error: err1 } = await supabase.rpc('admin_update_restaurant', {
    p_restaurant_id: '00000000-0000-0000-0000-000000000001',
    p_updates: { is_active: true },
    p_admin_username: 'admin.minthi',
    p_admin_password: 'dummy'
  })
  console.log('Result:', err1 ? err1.message : 'SUCCESS')

  // 3. Try with email
  console.log('\n--- Testing RPC with email "admin@minthi.it" ---')
  const { error: err2 } = await supabase.rpc('admin_update_restaurant', {
    p_restaurant_id: '00000000-0000-0000-0000-000000000001',
    p_updates: { is_active: true },
    p_admin_username: 'admin@minthi.it',
    p_admin_password: 'dummy'
  })
  console.log('Result:', err2 ? err2.message : 'SUCCESS')

  // 4. Check if the function definition is updated
  const { data: funcDef, error: funcErr } = await supabase.rpc('admin_update_restaurant', {
    p_restaurant_id: '00000000-0000-0000-0000-000000000000',
    p_updates: {},
    p_admin_username: 'admin.minthi',
    p_admin_password: ''
  })
  console.log('\n--- Testing with admin.minthi and empty restaurant ---')
  console.log('Result:', funcErr ? funcErr.message : 'SUCCESS')
}

test()
