import { Check, LogOut, Monitor, Moon, Shield, Sun, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useTheme } from '@/shared/hooks/useTheme'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/shared/ui/overlay'

export function UserMenu({ compact }: { compact?: boolean }) {
  const { profile, current, isAdmin, signOut, session } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const name = current?.displayName || profile?.full_name || session?.user.email || 'Account'
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <Menu>
      <MenuTrigger className="flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-muted">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials}</span>
        {!compact && (
          <span className="grid min-w-0">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{roleLabel(current?.role)}</span>
          </span>
        )}
      </MenuTrigger>
      <MenuContent className="w-56">
        <MenuItem onSelect={() => navigate('/app/account')}><UserRound />Il mio account</MenuItem>
        {isAdmin && <MenuItem onSelect={() => navigate('/admin')}><Shield />Amministrazione</MenuItem>}
        <MenuSeparator />
        {([['light', 'Chiaro', Sun], ['dark', 'Scuro', Moon], ['system', 'Automatico', Monitor]] as const).map(([v, label, Icon]) => (
          <MenuItem key={v} onSelect={(e) => { e.preventDefault(); setTheme(v) }}>
            <Icon />{label}{theme === v && <Check className="ml-auto !text-primary" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem danger onSelect={() => signOut().then(() => navigate('/accedi'))}><LogOut />Esci</MenuItem>
      </MenuContent>
    </Menu>
  )
}

export function roleLabel(role?: string) {
  return { owner: 'Titolare', manager: 'Responsabile', waiter: 'Sala', kitchen: 'Cucina' }[role ?? ''] ?? ''
}
