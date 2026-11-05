import { Logo } from '@/shared/ui/logo'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
        <Logo size={40} withText={false} className="animate-pulse" />
        <span className="sr-only">Caricamento…</span>
      </div>
    </div>
  )
}
