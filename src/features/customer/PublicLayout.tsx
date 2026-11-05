import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/** Contenitore delle pagine cliente: applica il colore del ristorante e l'intestazione. */
export function PublicLayout({ accent, name, logoUrl, subtitle, actions, children, className }: {
  accent?: string
  name?: string
  logoUrl?: string | null
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const style = accent ? ({ '--brand': accent, '--brand-foreground': '#fff' } as CSSProperties) : undefined
  return (
    <div style={style} className={cn('min-h-dvh bg-background', className)}>
      {name && (
        <header className="sticky top-0 z-20 border-b bg-surface/90 backdrop-blur pt-safe">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
            {logoUrl ? <img src={logoUrl} alt="" className="size-9 rounded-lg object-cover" /> : <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">{name[0]}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold leading-tight">{name}</p>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            {actions}
          </div>
        </header>
      )}
      {children}
    </div>
  )
}

export function PublicMessage({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-20 text-center">
      {icon && <span className="flex size-14 items-center justify-center rounded-full bg-muted">{icon}</span>}
      <h1 className="text-xl font-semibold">{title}</h1>
      {children && <div className="text-muted-foreground">{children}</div>}
    </div>
  )
}
