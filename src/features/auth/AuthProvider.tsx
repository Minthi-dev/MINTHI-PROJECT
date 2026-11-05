import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { supabase, type Tables } from '@/shared/lib/supabase'

export type Role = 'owner' | 'manager' | 'waiter' | 'kitchen'

export interface Membership {
  restaurantId: string
  restaurantName: string
  restaurantStatus: string
  logoUrl: string | null
  role: Role
  displayName: string
  canTakePayments: boolean
}

interface AuthState {
  session: Session | null
  loading: boolean
  isAnonymous: boolean
  profile: Tables<'profiles'> | null
  memberships: Membership[]
  isAdmin: boolean
  current: Membership | null
  setCurrentRestaurant: (id: string) => void
  signIn: (identifier: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => void
}

const AuthContext = React.createContext<AuthState | null>(null)
const CURRENT_KEY = 'minthi-current-restaurant'
export const STAFF_DOMAIN = 'staff.minthi.it'

/** Gli account staff entrano con username; i titolari con email. */
export function identifierToEmail(identifier: string) {
  const v = identifier.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${STAFF_DOMAIN}`
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = React.useState<Session | null>(null)
  const [ready, setReady] = React.useState(false)
  const [currentId, setCurrentId] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem(CURRENT_KEY)
    } catch {
      return null
    }
  })

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null
  const isAnonymous = session?.user.is_anonymous === true

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me', userId],
    enabled: !!userId && !isAnonymous,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [profile, memberships] = await Promise.all([
        supabase.from('profiles').select('id, full_name, username, email, is_platform_admin, created_at, updated_at').eq('id', userId!).maybeSingle(),
        supabase.from('memberships').select('restaurant_id, role, display_name, can_take_payments, is_active, restaurants(name, status, logo_url)').eq('user_id', userId!).eq('is_active', true),
      ])
      const list: Membership[] = (memberships.data ?? []).map((m) => ({
        restaurantId: m.restaurant_id,
        restaurantName: m.restaurants?.name ?? 'Ristorante',
        restaurantStatus: m.restaurants?.status ?? 'active',
        logoUrl: m.restaurants?.logo_url ?? null,
        role: m.role as Role,
        displayName: m.display_name,
        canTakePayments: m.role === 'owner' || m.role === 'manager' || m.can_take_payments,
      }))
      // l'admin di piattaforma può aprire qualunque ristorante (supporto): la RLS lo consente già
      if (profile.data?.is_platform_admin) {
        const all = await supabase.from('restaurants').select('id, name, status, logo_url').order('name')
        for (const r of all.data ?? []) {
          if (!list.some((m) => m.restaurantId === r.id)) {
            list.push({ restaurantId: r.id, restaurantName: r.name, restaurantStatus: r.status, logoUrl: r.logo_url, role: 'owner', displayName: 'Admin MINTHI', canTakePayments: true })
          }
        }
      }
      return { profile: profile.data, memberships: list }
    },
  })

  const memberships = data?.memberships ?? []
  const current = memberships.find((m) => m.restaurantId === currentId) ?? memberships[0] ?? null

  const value: AuthState = {
    session,
    loading: !ready || (!!userId && !isAnonymous && isLoading),
    isAnonymous,
    profile: data?.profile ?? null,
    memberships,
    isAdmin: data?.profile?.is_platform_admin === true,
    current,
    setCurrentRestaurant: (id) => {
      try {
        localStorage.setItem(CURRENT_KEY, id)
      } catch { /* ignora */ }
      setCurrentId(id)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'r' })
    },
    signIn: async (identifier, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: identifierToEmail(identifier), password })
      if (error) {
        throw new Error(/invalid/i.test(error.message) ? 'Credenziali non corrette.' : error.message)
      }
    },
    signOut: async () => {
      await supabase.auth.signOut()
      qc.clear()
    },
    refresh: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuori da AuthProvider')
  return ctx
}

/** Ristorante corrente (garantito dentro l'app staff). */
export function useRestaurant() {
  const { current } = useAuth()
  if (!current) throw new Error('Nessun ristorante selezionato')
  const isManager = current.role === 'owner' || current.role === 'manager'
  return {
    ...current,
    id: current.restaurantId,
    isOwner: current.role === 'owner',
    isManager,
    isFloorStaff: isManager || current.role === 'waiter',
  }
}
