import { BarChart3, BookOpen, CalendarDays, ChefHat, LayoutGrid, ListChecks, Package, Settings, type LucideIcon } from 'lucide-react'
import type { Role } from '@/features/auth/AuthProvider'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
  feature?: 'takeaway' | 'reservations'
  primary?: boolean // mostrato nella barra in basso su mobile
}

const FLOOR: Role[] = ['owner', 'manager', 'waiter']
const MANAGERS: Role[] = ['owner', 'manager']

export const NAV: NavItem[] = [
  { to: '/app/sala', label: 'Sala', icon: LayoutGrid, roles: FLOOR, primary: true },
  { to: '/app/ordini', label: 'Ordini', icon: ListChecks, roles: FLOOR, primary: true },
  { to: '/app/cucina', label: 'Cucina', icon: ChefHat, roles: ['owner', 'manager', 'waiter', 'kitchen'], primary: true },
  { to: '/app/asporto', label: 'Asporto', icon: Package, roles: ['owner', 'manager', 'waiter', 'kitchen'], feature: 'takeaway', primary: true },
  { to: '/app/prenotazioni', label: 'Prenotazioni', icon: CalendarDays, roles: FLOOR, feature: 'reservations', primary: true },
  { to: '/app/menu', label: 'Menu', icon: BookOpen, roles: MANAGERS },
  { to: '/app/analitiche', label: 'Analitiche', icon: BarChart3, roles: MANAGERS },
  { to: '/app/impostazioni', label: 'Impostazioni', icon: Settings, roles: MANAGERS },
]
