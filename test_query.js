import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const supabaseUrl = 'https://bueovvvrgpwdcpkyocac.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1ZW92dnZyZ3B3ZGNwa3lvY2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDU1MjQsImV4cCI6MjA4ODAyMTUyNH0.lHW63WZhs9tT8q6AkvV_YqNJ3vmJyaqocKqZO4pJomE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function seed() {
  console.log('=== SEEDING ADMIN USER ===')

  const adminId = randomUUID()
  const passwordHash = await bcrypt.hash('minthi2026!', 10)

  const { error } = await supabase.from('users').insert({
    id: adminId,
    name: 'admin.minthi',
    email: 'admin@minthi.it',
    role: 'ADMIN',
    password_hash: passwordHash
  })

  if (error) {
    console.error('ERROR inserting admin:', error.message)
    return
  }

  console.log('Admin user created successfully!')
  console.log('  Username: admin.minthi')
  console.log('  Email: admin@minthi.it')
  console.log('  Role: ADMIN')
  console.log('  ID:', adminId)

  // Verify
  const { data } = await supabase.from('users').select('id, name, email, role').eq('id', adminId)
  console.log('\nVerification:', JSON.stringify(data, null, 2))
}

seed()
