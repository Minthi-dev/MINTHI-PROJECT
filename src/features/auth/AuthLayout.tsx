import { Link } from 'react-router-dom'
import { Logo } from '@/shared/ui/logo'

export function AuthLayout({ title, description, children, footer }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklch,var(--brand)_16%,transparent),transparent)]" />
      <div className="relative w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center"><Logo size={34} /></Link>
        <div className="rounded-2xl border bg-surface p-6 shadow-md sm:p-7">
          <div className="mb-6 grid gap-1.5 text-center">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  )
}
