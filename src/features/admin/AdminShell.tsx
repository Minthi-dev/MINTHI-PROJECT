import { ArrowLeft, Building2, LayoutDashboard, QrCode, Settings, Ticket } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { UserMenu } from '@/features/shell/UserMenu'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/display'
import { Logo } from '@/shared/ui/logo'

const NAV = [
  { to: '/admin', end: true, label: 'Panoramica', icon: LayoutDashboard },
  { to: '/admin/ristoranti', label: 'Ristoranti', icon: Building2 },
  { to: '/admin/inviti', label: 'Inviti', icon: Ticket },
  { to: '/admin/qr', label: 'QR fisici', icon: QrCode },
  { to: '/admin/configurazione', label: 'Configurazione', icon: Settings },
]

export function AdminShell() {
  const { memberships } = useAuth()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-surface/90 backdrop-blur pt-safe">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <Badge tone="solid">Admin</Badge>
          <nav className="ml-4 hidden gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium', isActive ? 'bg-muted' : 'text-muted-foreground hover:text-foreground')}>
                <n.icon className="size-4" />{n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {memberships.length > 0 && <Link to="/app" className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:flex"><ArrowLeft className="size-4" />App ristorante</Link>}
            <UserMenu compact />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden scrollbar-none">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium', isActive ? 'bg-muted' : 'text-muted-foreground')}>{n.label}</NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"><Outlet /></main>
    </div>
  )
}
