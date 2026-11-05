import { Navigate, useLocation } from 'react-router-dom'
import { FullScreenLoader } from '@/app/FullScreenLoader'
import { Button } from '@/shared/ui/button'
import { Logo } from '@/shared/ui/logo'
import { useAuth } from './AuthProvider'

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { session, loading, isAnonymous, memberships, isAdmin, signOut } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!session || isAnonymous) return <Navigate to={`/accedi?da=${encodeURIComponent(location.pathname)}`} replace />
  if (memberships.length === 0) {
    if (isAdmin) return <Navigate to="/admin" replace />
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo />
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Nessun ristorante associato</h1>
          <p className="max-w-sm text-sm text-muted-foreground">Il tuo account non è collegato a nessun locale attivo. Chiedi al titolare di verificare il tuo accesso.</p>
        </div>
        <Button variant="outline" onClick={signOut}>Esci</Button>
      </div>
    )
  }
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, loading, isAdmin, isAnonymous } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!session || isAnonymous) return <Navigate to="/accedi?da=/admin" replace />
  if (!isAdmin) return <Navigate to="/app" replace />
  return <>{children}</>
}

/** Pagina iniziale in base al ruolo. */
export function StaffHome() {
  const { current } = useAuth()
  return <Navigate to={current?.role === 'kitchen' ? '/app/cucina' : '/app/sala'} replace />
}
