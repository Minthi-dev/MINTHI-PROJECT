import { ChevronsUpDown, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSettings, useTakeawaySettings } from '@/features/settings/queries'
import { cn } from '@/shared/lib/cn'
import { Logo } from '@/shared/ui/logo'
import { Menu, MenuContent, MenuItem, MenuTrigger, Sheet } from '@/shared/ui/overlay'
import { NAV, type NavItem } from './nav'
import { UserMenu } from './UserMenu'

function useVisibleNav(): NavItem[] {
  const { current } = useAuth()
  const { data: settings } = useSettings()
  const { data: takeaway } = useTakeawaySettings()
  return NAV.filter((item) => {
    if (!current || !item.roles.includes(current.role)) return false
    if (item.feature === 'takeaway') return takeaway?.enabled === true
    if (item.feature === 'reservations') return settings?.reservations_enabled !== false
    return true
  })
}

function RestaurantSwitcher() {
  const { memberships, current, setCurrentRestaurant } = useAuth()
  const label = (
    <span className="flex min-w-0 items-center gap-2.5">
      {current?.logoUrl ? (
        <img src={current.logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">{current?.restaurantName[0]}</span>
      )}
      <span className="truncate text-sm font-semibold">{current?.restaurantName}</span>
    </span>
  )
  if (memberships.length < 2) return <div className="px-1.5 py-1">{label}</div>
  return (
    <Menu>
      <MenuTrigger className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-muted">
        {label}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        {memberships.map((m) => (
          <MenuItem key={m.restaurantId} onSelect={() => setCurrentRestaurant(m.restaurantId)}>{m.restaurantName}</MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

export function AppShell() {
  const nav = useVisibleNav()
  const { current } = useAuth()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const primary = nav.filter((n) => n.primary).slice(0, 4)
  const secondary = nav.filter((n) => !primary.includes(n))
  const suspended = current?.restaurantStatus === 'suspended'

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-surface lg:flex">
        <div className="flex h-14 items-center px-5"><Logo /></div>
        <div className="px-3 pb-2"><RestaurantSwitcher /></div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3"><UserMenu /></div>
      </aside>

      {/* header mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-surface/90 px-4 backdrop-blur pt-safe lg:hidden">
        <div className="min-w-0 flex-1"><RestaurantSwitcher /></div>
        <UserMenu compact />
      </header>

      {suspended && (
        <div className="bg-danger px-4 py-2 text-center text-sm font-medium text-danger-foreground">
          Account sospeso: i clienti non possono ordinare. Contatta l'assistenza MINTHI.
        </div>
      )}

      <main className="mx-auto w-full max-w-[1400px] px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
        <Outlet />
      </main>

      {/* barra in basso mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 backdrop-blur pb-safe lg:hidden">
        <div className="mx-auto flex max-w-lg">
          {primary.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          ))}
          {secondary.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              className={cn('flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium', secondary.some((s) => location.pathname.startsWith(s.to)) ? 'text-primary' : 'text-muted-foreground')}
            >
              <MoreHorizontal className="size-5" />
              Altro
            </button>
          )}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="Altro">
        <div className="grid gap-1 p-3">
          {secondary.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 font-medium hover:bg-muted">
              <item.icon className="size-5 text-muted-foreground" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
