import type { FallbackProps } from 'react-error-boundary'
import { Button } from '@/shared/ui/button'
import { Logo } from '@/shared/ui/logo'

export function ErrorScreen({ error, resetErrorBoundary }: FallbackProps) {
  // dopo un deploy i vecchi chunk spariscono: ricarica una volta
  const chunk = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(String(error?.message))
  if (chunk && !sessionStorage.getItem('minthi-chunk-reload')) {
    sessionStorage.setItem('minthi-chunk-reload', '1')
    window.location.reload()
    return null
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">Si è verificato un errore</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Ricarica la pagina. Se il problema continua, contatta l'assistenza MINTHI.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={resetErrorBoundary}>Riprova</Button>
        <Button onClick={() => window.location.reload()}>Ricarica</Button>
      </div>
    </div>
  )
}
