import { cn } from '@/shared/lib/cn'

/** Logo MINTHI: foglia di menta + wordmark. Un solo logo per tutta l'app. */
export function Logo({ className, withText = true, size = 28 }: { className?: string; withText?: boolean; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M22.5 8.5c-7.5 0-12.5 4.6-12.5 10.6 0 1.5.4 2.9 1 4.1 1.3-4.3 4.4-7.4 8.4-9.1-3.2 2.3-5.4 5.4-6.3 9.4 1 .5 2.1.7 3.3.7 6 0 9.5-5.6 6.1-15.7Z" fill="var(--brand-foreground)" />
      </svg>
      {withText && <span className="text-[1.05em]">minthi</span>}
    </span>
  )
}
