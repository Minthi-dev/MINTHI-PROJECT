// Rigenera src/types/database.ts dal progetto Supabase.
// Uso: SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run db:types
import { writeFileSync } from 'node:fs'

const ref = process.env.SUPABASE_PROJECT_REF ?? 'bueovvvrgpwdcpkyocac'
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN ?? ''}` },
})
if (!res.ok) throw new Error(`Errore ${res.status}: ${await res.text()}`)
const { types } = await res.json()
writeFileSync(new URL('../src/types/database.ts', import.meta.url), types)
console.log('src/types/database.ts aggiornato')
